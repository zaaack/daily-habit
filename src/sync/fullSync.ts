import { getClient, normalizeDir, type WebDavConfig } from './webdav'
import {
  mergeProjectMeta,
  mergeCheckinLists,
  checkinToCompact,
  compactToCheckin,
  fingerprint,
  projectFingerprint,
  checkinsHash,
  groupCheckinsByQuarter,
  quarterHashes,
  dedupeCheckins,
  dateStrToEpochDay,
  type ProjectMeta,
  type ProjectMetaFile,
  type QuarterFile,
} from './merge'
import type { Repo } from '@/db/repo/Repo'
import type { Project, Checkin, ConflictItem } from '@/db/types'
import type { WebDAVClient } from 'webdav'
import { makeRemotePath } from '@/db/schema'

const SYNC_CONFIG_KEY = 'webdav.config'
const QUARTER_FILE_RE = /^(\d{4})-Q([1-4])\.json$/
const QUARTER_KEY_RE = /^\d{4}-Q[1-4]$/

/** 防止并发 runFullSync */
export let _fullSyncInProgress = false

export function getSyncConfig(): WebDavConfig | null {
  try {
    const raw = localStorage.getItem(SYNC_CONFIG_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as WebDavConfig
    if (!v || !v.url || !v.username) return null
    return { ...v, remoteDir: normalizeDir(v.remoteDir || '/dailies') }
  } catch {
    return null
  }
}

export function setSyncConfig(cfg: WebDavConfig): void {
  try {
    localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify({ ...cfg, remoteDir: normalizeDir(cfg.remoteDir) }))
  } catch { /* noop */ }
}

export async function testConnection(cfg: WebDavConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const client = await getClient(cfg)
    const exists = await client.exists(cfg.remoteDir)
    if (!exists) {
      await client.createDirectory(cfg.remoteDir, { recursive: true })
    }
    return { ok: true, message: '连接成功' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

export async function runFullSync(
  repo: Repo,
  hooks: { onConflict: (projectId: string, items: ConflictItem[]) => void; onProjectsChange: (projects: Project[]) => void } = { onConflict: () => {}, onProjectsChange: () => {} },
): Promise<void> {
  const cfg = getSyncConfig()
  if (!cfg) return

  if (_fullSyncInProgress) {
    console.log('[sync] runFullSync skipped: already in progress')
    return
  }
  _fullSyncInProgress = true
  try {
    const client = await getClient(cfg)
    const remote = await listRemote(client, cfg.remoteDir)
    if (!remote.ok) {
      // 连远端目录都读不到：本轮不动任何数据，也绝不用本地快照覆盖远端
      throw new Error('无法读取远端目录，请检查网络或 WebDAV 配置')
    }

    const localProjects = await repo.listProjects(true)
    const remoteByName = new Map(remote.files.map((f) => [f.filename, f.etag]))
    let changed = false

    for (const p0 of localProjects) {
      // 每次迭代重新读取本地最新数据，防止并发导入/修改导致使用过期快照
      const p = (await repo.getProject(p0.id)) ?? p0
      const filename = basenameOf(p.remotePath)
      const onRemote = remoteByName.has(filename)
      const remoteEtag = remoteByName.get(filename) ?? null
      remoteByName.delete(filename)

      if (!onRemote) {
        // 远端确实没有该文件 → 上传本地（元数据 + 按季度拆分的打卡文件）
        const localCheckins = await repo.getCheckinsAll(p.id)
        if (await uploadProject(client, repo, p, localCheckins)) changed = true
        continue
      }

      const fetched = await fetchProjectMeta(client, p.remotePath, p.id)
      if (!fetched.ok) {
        if (!fetched.notFound) {
          // 读不到远端内容（网络/权限/解析失败）→ 保留本地，下次重试，绝不上传覆盖
          continue
        }
        // 列表里有、实际取不到：文件刚被删 → 用本地内容重建
        const localCheckins = await repo.getCheckinsAll(p.id)
        if (await uploadProject(client, repo, p, localCheckins)) changed = true
        continue
      }

      const result = await syncProject(
        client,
        repo,
        p,
        remoteEtag,
        fetched.meta.project,
        fetched.meta.quarters,
        fetched.meta.legacyCheckins,
        true,
      )
      if (result.conflicts.length > 0) hooks.onConflict(p.id, result.conflicts)
      if (result.changed) changed = true
    }

    // 远端有 / 本地无 → 下载
    for (const [filename, etag] of remoteByName) {
      const path = `${cfg.remoteDir}/${filename}`
      const projectId = filename.replace(/\.json$/, '')
      const fetched = await fetchProjectMeta(client, path, projectId)
      if (!fetched.ok) continue

      const existing = await repo.getProject(projectId)
      if (existing) {
        const project = { ...existing, remotePath: path }
        const result = await syncProject(
          client,
          repo,
          project,
          etag,
          fetched.meta.project,
          fetched.meta.quarters,
          fetched.meta.legacyCheckins,
          true,
        )
        if (result.conflicts.length > 0) {
          hooks.onConflict(projectId, result.conflicts)
        }
        if (result.changed) changed = true
        continue
      }

      const remoteData = await fetchRemoteProjectData(
        client,
        projectId,
        path,
        fetched.meta.legacyCheckins,
        fetched.meta.quarters,
        {},
      )
      if (!remoteData.ok) continue

      const newProject: Project = {
        ...fetched.meta.project,
        sort: fetched.meta.project.sort ?? 0,
        remotePath: path,
        remoteEtag: etag,
      }
      await repo.upsertProject(newProject)
      if (remoteData.checkins.length > 0) {
        await repo.bulkUpsertCheckins(remoteData.checkins)
      }
      if (fetched.meta.legacyCheckins !== null) {
        // 顺手把旧版单文件迁移为元数据 + 季度文件
        const etag = await writeProjectFiles(client, newProject, remoteData.checkins)
        if (etag !== null) {
          newProject.remoteEtag = etag
          await repo.upsertProject(newProject)
        }
      }
      changed = true
    }

    if (changed) {
      hooks.onProjectsChange(await repo.listProjects())
    }
  } finally {
    _fullSyncInProgress = false
  }
}

export async function syncOneProject(projectId: string): Promise<void> {
  const { getRepo } = await import('@/db')
  const repo = await getRepo()
  const cfg = getSyncConfig()
  if (!cfg) return
  const p = await repo.getProject(projectId)
  if (!p) return
  const client = await getClient(cfg)

  const fetched = await fetchProjectMeta(client, p.remotePath, p.id)
  if (!fetched.ok) {
    if (!fetched.notFound) return
    // 远端没有该文件 → 直接上传
    const localCheckins = await repo.getCheckinsAll(p.id)
    await uploadProject(client, repo, p, localCheckins)
    return
  }

  const result = await syncProject(
    client,
    repo,
    p,
    p.remoteEtag,
    fetched.meta.project,
    fetched.meta.quarters,
    fetched.meta.legacyCheckins,
    false,
  )
  if (!result.ok) return
  if (result.conflicts.length > 0) {
    const { useAppStore } = await import('@/state/useAppStore')
    useAppStore.setState((s) => ({
      conflicts: { ...s.conflicts, [p.id]: result.conflicts },
    }))
    // 冲突交给用户决定，解决后会触发全量同步
  }
}

interface ProjectSyncResult {
  ok: boolean
  changed: boolean
  conflicts: ConflictItem[]
}

/**
 * 合并项目元数据与所有季度打卡文件，按需写回本地和远端。
 * ok=false 表示远端数据读不全，本轮不能做上传决策。
 */
async function syncProject(
  client: WebDAVClient,
  repo: Repo,
  p: Project,
  remoteEtag: string | null,
  remoteMeta: ProjectMeta,
  remoteQuarters: Record<string, string> | null,
  legacyCheckins: Checkin[] | null,
  uploadOnConflict: boolean,
): Promise<ProjectSyncResult> {
  const localCheckins = await repo.getCheckinsAll(p.id)
  const metaMerge = mergeProjectMeta(stripProject(p), remoteMeta)
  const mergedProject: Project = { ...p, ...metaMerge.project, remoteEtag }
  const localHashes = quarterHashes(localCheckins)

  const remoteData = await fetchRemoteProjectData(
    client,
    p.id,
    p.remotePath,
    legacyCheckins,
    remoteQuarters,
    localHashes,
  )
  if (!remoteData.ok) return { ok: false, changed: false, conflicts: [] }

  const mergedCheckins = mergeCheckinLists(localCheckins, remoteData.checkins)
  const conflicts = [...metaMerge.conflicts, ...mergedCheckins.conflicts]

  const localState = fingerprint(stripProject(p), localCheckins)
  const mergedState = fingerprint(mergedProject, mergedCheckins.checkinsAll)
  const localChanged = localState !== mergedState
  let changed = false

  if (localChanged) {
    await repo.upsertProject(mergedProject)
    if (mergedCheckins.checkinsAll.length > 0) {
      await repo.bulkUpsertCheckins(mergedCheckins.checkinsAll)
    }
    changed = true
  }

  if (conflicts.length > 0 && !uploadOnConflict) {
    return { ok: true, changed, conflicts }
  }

  const mergedGroups = groupCheckinsByQuarter(mergedCheckins.checkinsAll)
  const quarterDir = quarterDirOf(p.remotePath)
  const manifest: Record<string, string> = {}
  const quartersToUpload: [string, Checkin[]][] = []
  for (const quarter of new Set([...remoteData.hashes.keys(), ...mergedGroups.keys()])) {
    const merged = mergedGroups.get(quarter) ?? []
    const mergedHash = checkinsHash(merged)
    manifest[quarter] = mergedHash
    if (remoteData.hashes.get(quarter) !== mergedHash) {
      quartersToUpload.push([quarter, merged])
    }
  }

  if (quartersToUpload.length > 0) {
    await ensureDirectory(client, quarterDir)
    for (const [quarter, checkins] of quartersToUpload) {
      if (!(await writeQuarterFile(client, p.id, quarterDir, quarter, checkins))) {
        // 季度文件写失败时保留旧元数据，避免远端进入半迁移状态
        return { ok: true, changed, conflicts }
      }
    }
  }

  const metaChanged =
    projectFingerprint(stripProject(mergedProject)) !== projectFingerprint(remoteMeta) ||
    legacyCheckins !== null ||
    !sameManifest(remoteQuarters, manifest)
  if (metaChanged) {
    const etag = await writeProjectMeta(client, mergedProject, manifest)
    if (etag !== null) {
      await repo.upsertProject({ ...mergedProject, remoteEtag: etag })
    }
  } else if (!localChanged && p.remoteEtag !== remoteEtag) {
    await repo.upsertProject({ ...mergedProject, remoteEtag })
  }

  return { ok: true, changed, conflicts }
}

function sameManifest(
  a: Record<string, string> | null,
  b: Record<string, string>,
): boolean {
  if (!a) return false
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((key) => a[key] === b[key])
}

interface RemoteMeta {
  project: ProjectMeta
  /** v3 元数据中的季度摘要；旧格式或缺失时为 null */
  quarters: Record<string, string> | null
  /** 旧版单文件内的打卡；v3 元数据文件为 null */
  legacyCheckins: Checkin[] | null
}

type MetaFetchResult =
  | { ok: true; meta: RemoteMeta }
  | { ok: false; notFound: boolean }

async function fetchProjectMeta(
  client: WebDAVClient,
  path: string,
  fallbackId: string,
): Promise<MetaFetchResult> {
  try {
    const data = await client.getFileContents(path, { format: 'text' })
    const raw: any = JSON.parse(data as string)
    const project = normalizeProjectMeta(raw?.project, fallbackId)
    const isV3 = raw?.version === 3
    const legacyCheckins = isV3 ? null : normalizeLegacyCheckins(raw, project.id)
    const quarters = isV3 ? normalizeQuarterManifest(raw?.quarters) : null
    return { ok: true, meta: { project, quarters, legacyCheckins } }
  } catch (e: any) {
    const status = e?.status ?? e?.response?.status
    if (status !== 404) {
      console.warn('[sync] fetchProjectMeta failed:', path, status ?? e?.message ?? e)
    }
    return { ok: false, notFound: status === 404 }
  }
}

/** 把旧格式 (version 1/2) 的打卡统一转成 Checkin */
function normalizeLegacyCheckins(raw: any, projectId: string): Checkin[] {
  const list = Array.isArray(raw?.checkins) ? raw.checkins : []
  const out: Checkin[] = []
  for (const c of list) {
    if (typeof c?.date === 'string') {
      out.push({
        projectId,
        date: c.date,
        status:
          c.status === 'success'
            ? 'success'
            : c.status === 'deleted'
              ? 'deleted'
              : 'fail',
        value: c.value ?? null,
        note: c.note ?? null,
        updatedAt: Number(c.updatedAt ?? 0),
      })
      continue
    }
    if (typeof c?.d !== 'number' && typeof c?.d !== 'string') continue
    out.push(
      compactToCheckin(projectId, {
        d: typeof c.d === 'number' ? c.d : dateStrToEpochDay(c.d),
        s:
          c.s === 1 || c.s === 'success'
            ? 1
            : c.s === -1 || c.s === 'deleted'
              ? -1
              : 0,
        v: c.v ?? null,
        n: c.n ?? null,
        u: Number(c.u ?? 0),
      }),
    )
  }
  return out
}

function normalizeQuarterManifest(raw: any): Record<string, string> | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (QUARTER_KEY_RE.test(key) && typeof value === 'string') out[key] = value
  }
  return out
}

function normalizeProjectMeta(raw: any, fallbackId: string): ProjectMeta {
  return {
    id: String(raw?.id ?? fallbackId),
    name: String(raw?.name ?? ''),
    description: String(raw?.description ?? ''),
    unit: raw?.unit ?? null,
    emoji: String(raw?.emoji ?? '📌'),
    color: String(raw?.color ?? '#22c55e'),
    sort: Number(raw?.sort ?? 0),
    createdAt: Number(raw?.createdAt ?? 0),
    updatedAt: Number(raw?.updatedAt ?? 0),
    deleted: raw?.deleted ? 1 : 0,
    archived: raw?.archived ? 1 : 0,
  }
}

type RemoteDataResult =
  | { ok: true; hashes: Map<string, string>; checkins: Checkin[] }
  | { ok: false }

/**
 * 读取项目的季度文件。元数据里有摘要且与本地一致的季度不再下载，
 * 只拉取可能发生变化的季度；旧单文件中的打卡一并纳入。
 */
async function fetchRemoteProjectData(
  client: WebDAVClient,
  projectId: string,
  metaPath: string,
  legacyCheckins: Checkin[] | null,
  manifest: Record<string, string> | null,
  localHashes: Record<string, string>,
): Promise<RemoteDataResult> {
  const dir = quarterDirOf(metaPath)
  const listed = await listQuarterFiles(client, dir)
  if (!listed.ok && !listed.notFound) return { ok: false }

  const entries = listed.ok ? listed.files : []
  const remoteNames = new Set(entries.map((entry) => entry.quarter))
  const hashes = new Map<string, string>()
  const all: Checkin[] = [...(legacyCheckins ?? [])]

  for (const entry of entries) {
    const localHash = localHashes[entry.quarter] ?? checkinsHash([])
    const knownHash = manifest?.[entry.quarter]
    if (knownHash !== undefined && knownHash === localHash) {
      hashes.set(entry.quarter, knownHash)
      continue
    }
    const data = await fetchQuarterFile(client, entry.path, projectId)
    if (!data.ok) return { ok: false }
    hashes.set(entry.quarter, checkinsHash(data.checkins))
    all.push(...data.checkins)
  }

  for (const quarter of Object.keys(manifest ?? {})) {
    if (!remoteNames.has(quarter)) hashes.set(quarter, checkinsHash([]))
  }

  return { ok: true, hashes, checkins: dedupeCheckins(all) }
}

async function fetchQuarterFile(
  client: WebDAVClient,
  path: string,
  projectId: string,
): Promise<{ ok: true; checkins: Checkin[] } | { ok: false }> {
  try {
    const data = await client.getFileContents(path, { format: 'text' })
    const raw: any = JSON.parse(data as string)
    const list = Array.isArray(raw?.checkins) ? raw.checkins : []
    return {
      ok: true,
      checkins: list.map((c: any) => compactToCheckin(projectId, c)),
    }
  } catch (e) {
    console.warn('[sync] fetchQuarterFile failed:', path, e)
    return { ok: false }
  }
}

interface QuarterEntry {
  quarter: string
  path: string
}

type QuarterListResult =
  | { ok: true; files: QuarterEntry[] }
  | { ok: false; notFound: boolean }

async function listQuarterFiles(
  client: WebDAVClient,
  dir: string,
): Promise<QuarterListResult> {
  try {
    const list = await client.getDirectoryContents(dir)
    const items = Array.isArray(list) ? list : ((list as any)?.data ?? [])
    const files: QuarterEntry[] = []
    for (const f of items) {
      if (f?.type === 'directory') continue
      const name = f?.basename ?? (typeof f?.filename === 'string' ? f.filename.split('/').pop() : '')
      const m = typeof name === 'string' ? QUARTER_FILE_RE.exec(name) : null
      if (!m) continue
      files.push({ quarter: `${m[1]}-Q${m[2]}`, path: `${dir}/${name}` })
    }
    return { ok: true, files }
  } catch (e: any) {
    const status = e?.status ?? e?.response?.status
    return { ok: false, notFound: status === 404 }
  }
}

async function writeQuarterFile(
  client: WebDAVClient,
  projectId: string,
  dir: string,
  quarter: string,
  checkins: Checkin[],
): Promise<boolean> {
  const file: QuarterFile = {
    version: 1,
    projectId,
    quarter,
    checkins: checkins.map(checkinToCompact),
  }
  try {
    await client.putFileContents(`${dir}/${quarter}.json`, JSON.stringify(file, null, 2), {
      contentLength: false,
    })
    return true
  } catch (e) {
    console.warn('[sync] writeQuarterFile failed:', quarter, e)
    return false
  }
}

async function ensureDirectory(client: WebDAVClient, dir: string): Promise<void> {
  try {
    await client.createDirectory(dir, { recursive: true })
  } catch { /* 目录已存在 */ }
}

async function writeProjectMeta(
  client: WebDAVClient,
  p: Project,
  quarters: Record<string, string>,
): Promise<string | null> {
  const file: ProjectMetaFile = {
    version: 3,
    project: stripProject(p),
    quarters: sortManifest(quarters),
  }
  try {
    await client.putFileContents(p.remotePath, JSON.stringify(file, null, 2), {
      contentLength: false,
    })
    return await getDirEntryEtag(client, p.remotePath)
  } catch (e) {
    console.warn('[sync] writeProjectMeta failed:', p.remotePath, e)
    return null
  }
}

/** 上传项目元数据与全部季度打卡文件，返回元数据文件的新 etag */
async function writeProjectFiles(
  client: WebDAVClient,
  p: Project,
  checkins: Checkin[],
): Promise<string | null> {
  const groups = groupCheckinsByQuarter(dedupeCheckins(checkins))
  const manifest: Record<string, string> = {}
  if (groups.size > 0) {
    const dir = quarterDirOf(p.remotePath)
    await ensureDirectory(client, dir)
    for (const [quarter, cs] of groups) {
      if (!(await writeQuarterFile(client, p.id, dir, quarter, cs))) return null
      manifest[quarter] = checkinsHash(cs)
    }
  }
  return writeProjectMeta(client, p, manifest)
}

function sortManifest(manifest: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)),
  )
}

/**
 * 上传单个项目并记录新 etag。
 * 不做任何「是否值得上传」的判断 —— 由调用方比较本地/合并结果与远端内容后决定。
 */
async function uploadProject(
  client: WebDAVClient,
  repo: Repo,
  p: Project,
  checkins: Checkin[],
): Promise<boolean> {
  const etag = await writeProjectFiles(client, p, checkins)
  if (etag === null) return false
  await repo.upsertProject({ ...p, remoteEtag: etag })
  return true
}

/** 统一 etag 格式：去掉外层引号和 weak 标记（如 W/"abc" → abc） */
function normalizeEtag(etag: string | null | undefined): string | null {
  if (!etag) return null
  return etag.replace(/^(?:W\/)?"(.*)"$/, '$1').trim() || null
}

interface RemoteEntry {
  filename: string
  etag: string | null
}

async function listRemote(
  client: WebDAVClient,
  dir: string,
): Promise<{ ok: boolean; files: RemoteEntry[] }> {
  const parse = (list: unknown): RemoteEntry[] => {
    const items = Array.isArray(list) ? list : ((list as any)?.data ?? [])
    return items
      .filter((f: any) => f.type !== 'directory' && typeof f.filename === 'string' && f.filename.endsWith('.json'))
      .map((f: any) => ({
        filename: f.basename ?? f.filename.split('/').pop(),
        etag: normalizeEtag(f.etag),
      }))
  }
  try {
    return { ok: true, files: parse(await client.getDirectoryContents(dir)) }
  } catch { /* 目录不存在或无权限，下面创建后重试 */ }
  try {
    await client.createDirectory(dir, { recursive: true })
  } catch { /* 可能已存在 */ }
  try {
    return { ok: true, files: parse(await client.getDirectoryContents(dir)) }
  } catch (e) {
    console.warn('[sync] getDirectoryContents failed:', e)
    return { ok: false, files: [] }
  }
}

async function getDirEntryEtag(client: WebDAVClient, path: string): Promise<string | null> {
  try {
    const dir = path.split('/').slice(0, -1).join('/') || '/'
    const name = path.split('/').pop()!
    const list = await client.getDirectoryContents(dir)
    const items = Array.isArray(list) ? list : ((list as any)?.data ?? [])
    const entry = items.find((f: any) => f.basename === name)
    return normalizeEtag(entry?.etag)
  } catch (e) {
    console.warn('[sync] getDirEntryEtag error:', e)
    return null
  }
}

export async function cleanupDeletedProjects(): Promise<{ cleaned: number } | null> {
  const cfg = getSyncConfig()
  if (!cfg) return null
  const client = await getClient(cfg)
  const { getRepo } = await import('@/db')
  const repo = await getRepo()

  const projects = await repo.listProjects(true)
  const now = Date.now()
  const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000
  let cleaned = 0

  for (const p of projects) {
    if (p.deleted !== 1) continue
    if (now - p.updatedAt < NINETY_DAYS) continue

    const etag = await writeProjectMeta(client, p, {})
    if (etag === null) continue
    await repo.upsertProject({ ...p, remoteEtag: etag })
    await deleteQuarterFiles(client, quarterDirOf(p.remotePath))
    cleaned++
  }

  return { cleaned }
}

async function deleteQuarterFiles(
  client: WebDAVClient,
  dir: string,
): Promise<void> {
  const listed = await listQuarterFiles(client, dir)
  if (!listed.ok) return
  for (const file of listed.files) {
    try {
      await client.deleteFile(file.path)
    } catch (e) {
      console.warn('[sync] deleteQuarterFile failed:', file.path, e)
    }
  }
}

/** 导入数据后直接上传到远端，设置 remoteEtag，避免后续 sync 走 merge 覆盖 */
export async function uploadImportedProject(
  project: Project,
  checkins: Checkin[],
): Promise<string | null> {
  const cfg = getSyncConfig()
  if (!cfg) return null
  const client = await getClient(cfg)
  return writeProjectFiles(client, project, checkins)
}

function basenameOf(path: string): string {
  return path.split('/').pop()!
}

/** `/dir/{projectId}.json` → `/dir/{projectId}` */
function quarterDirOf(remotePath: string): string {
  return remotePath.replace(/\.json$/i, '')
}

function stripProject(p: Project | ProjectMeta): ProjectMeta {
  const { remoteEtag: _, remotePath: _rp, ...rest } = p as Project
  return rest
}

export { makeRemotePath }
