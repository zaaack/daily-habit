import { getClient, normalizeDir, type WebDavConfig } from './webdav'
import {
  mergeProjectFile,
  checkinToCompact,
  compactToCheckin,
  fingerprint,
  projectFileFingerprint,
  dateStrToEpochDay,
  type ProjectFile,
} from './merge'
import type { Repo } from '@/db/repo/Repo'
import type { Project, Checkin } from '@/db/types'
import type { WebDAVClient } from 'webdav'
import { makeRemotePath } from '@/db/schema'

const SYNC_CONFIG_KEY = 'webdav.config'

type ProjectMeta = Omit<Project, 'remoteEtag' | 'remotePath'>

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
  hooks: { onConflict: (projectId: string, items: import('@/db/types').ConflictItem[]) => void; onProjectsChange: (projects: Project[]) => void } = { onConflict: () => {}, onProjectsChange: () => {} },
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
      const filename = p.remotePath.split('/').pop()!
      const onRemote = remoteByName.has(filename)
      const remoteEtag = remoteByName.get(filename) ?? null
      remoteByName.delete(filename)

      if (!onRemote) {
        // 远端确实没有该文件 → 上传本地
        const localCheckins = await repo.getCheckinsAll(p.id)
        if (await uploadFile(client, repo, p, buildFile(p, localCheckins))) changed = true
        continue
      }

      const fetched = await fetchRemoteFile(client, p.remotePath)
      if (!fetched.ok) {
        if (!fetched.notFound) {
          // 读不到远端内容（网络/权限/解析失败）→ 保留本地，下次重试，绝不上传覆盖
          continue
        }
        // 列表里有、实际取不到：文件刚被删 → 用本地内容重建
        const localCheckins = await repo.getCheckinsAll(p.id)
        if (await uploadFile(client, repo, p, buildFile(p, localCheckins))) changed = true
        continue
      }
      const remoteFile = fetched.file

      const localCheckins = await repo.getCheckinsAll(p.id)
      const merged = mergeProjectFile(stripProject(p), localCheckins, remoteFile)
      if (merged.conflicts.length > 0) hooks.onConflict(p.id, merged.conflicts)

      const localState = fingerprint(stripProject(p), localCheckins)
      const mergedState = fingerprint(merged.project, merged.checkinsAll)
      const mergedProject: Project = { ...p, ...merged.project, remoteEtag }

      if (localState !== mergedState) {
        await repo.upsertProject(mergedProject)
        for (const c of merged.checkinsAll) await repo.upsertCheckin(c)
        changed = true
      }

      // 关键：与「远端内容」比较决定是否上传，而不是与本地比较。
      // 否则当远端只是本地的子集时（例如手机刚打了卡、远端还没这个记录），
      // 合并结果等于本地，就会误判为「无需上传」，打卡永远同步不出去。
      if (mergedState !== projectFileFingerprint(remoteFile)) {
        if (await uploadFile(client, repo, mergedProject, buildFile(mergedProject, merged.checkinsAll))) {
          changed = true
        }
      } else if (p.remoteEtag !== remoteEtag) {
        await repo.upsertProject({ ...mergedProject, remoteEtag })
      }
    }

    // 远端有 / 本地无 → 下载
    for (const [filename, etag] of remoteByName) {
      const path = `${cfg.remoteDir}/${filename}`
      const fetched = await fetchRemoteFile(client, path)
      if (!fetched.ok) continue
      const projectId = filename.replace(/\.json$/, '')
      const existing = await repo.getProject(projectId)
      if (existing) {
        const localCheckins = await repo.getCheckinsAll(projectId)
        const merged = mergeProjectFile(stripProject(existing), localCheckins, fetched.file)
        if (merged.conflicts.length > 0) hooks.onConflict(projectId, merged.conflicts)
        await repo.upsertProject({
          ...existing,
          ...merged.project,
          remotePath: path,
          remoteEtag: etag,
        })
        for (const c of merged.checkinsAll) await repo.upsertCheckin(c)
      } else {
        const newProject: Project = {
          ...fetched.file.project,
          sort: fetched.file.project.sort ?? 0,
          remotePath: path,
          remoteEtag: etag,
          deleted: 0,
        } as Project
        await repo.upsertProject(newProject)
        for (const c of fetched.file.checkins) await repo.upsertCheckin(compactToCheckin(fetched.file.project.id, c))
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
  const localCheckins = await repo.getCheckinsAll(p.id)

  const fetched = await fetchRemoteFile(client, p.remotePath)
  if (!fetched.ok) {
    if (!fetched.notFound) return
    // 远端没有该文件 → 直接上传
    await uploadFile(client, repo, p, buildFile(p, localCheckins))
    return
  }

  const merged = mergeProjectFile(stripProject(p), localCheckins, fetched.file)
  const mergedProject: Project = { ...p, ...merged.project }
  const localState = fingerprint(stripProject(p), localCheckins)
  const mergedState = fingerprint(merged.project, merged.checkinsAll)

  if (localState !== mergedState) {
    await repo.upsertProject(mergedProject)
    for (const c of merged.checkinsAll) await repo.upsertCheckin(c)
  }

  if (merged.conflicts.length > 0) {
    const { useAppStore } = await import('@/state/useAppStore')
    useAppStore.setState((s) => ({ conflicts: { ...s.conflicts, [p.id]: merged.conflicts } }))
    // 冲突交给用户决定，解决后会触发全量同步
    return
  }

  if (mergedState !== projectFileFingerprint(fetched.file)) {
    await uploadFile(client, repo, mergedProject, buildFile(mergedProject, merged.checkinsAll))
  }
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

/**
 * 上传单个项目文件并记录新 etag。
 * 不做任何「是否值得上传」的判断 —— 由调用方比较本地/合并结果与远端内容后决定。
 */
async function uploadFile(
  client: WebDAVClient,
  repo: Repo,
  p: Project,
  file: ProjectFile,
): Promise<boolean> {
  try {
    await client.putFileContents(p.remotePath, JSON.stringify(file, null, 2), {
      contentLength: false,
    })
    const newEtag = await getDirEntryEtag(client, p.remotePath)
    await repo.upsertProject({ ...p, remoteEtag: newEtag })
    return true
  } catch (e) {
    console.warn('[sync] upload failed:', p.remotePath, e)
    /* 留待下次同步重试 */
    return false
  }
}

type FetchResult =
  | { ok: true; file: ProjectFile }
  | { ok: false; notFound: boolean }

/**
 * 读取远端项目文件。
 * 显式不使用 If-None-Match：etag 在处理链路上并不可靠（部分服务端不返回、
 * 或内容变化后 etag 不变），缓存协商可能导致漏拉取。
 */
async function fetchRemoteFile(client: WebDAVClient, path: string): Promise<FetchResult> {
  try {
    const data = await client.getFileContents(path, { format: 'text' })
    return { ok: true, file: normalizeProjectFile(JSON.parse(data as string)) }
  } catch (e: any) {
    const status = e?.status
    if (status !== 404) console.warn('[sync] fetchRemoteFile failed:', path, status ?? e?.message ?? e)
    return { ok: false, notFound: status === 404 }
  }
}

/** 把旧格式 (version 1) 和新格式 (version 2) 统一为 compact 格式 */
function normalizeProjectFile(raw: any): ProjectFile {
  if (raw?.version === 2) return raw as ProjectFile
  // version 1 (old): d=string, s='success'|'fail', project may include remotePath
  const { remotePath: _rp, ...proj } = raw?.project ?? {}
  return {
    version: 2,
    project: proj,
    checkins: (raw?.checkins ?? []).map((c: any) => ({
      d: typeof c.d === 'number' ? c.d : dateStrToEpochDay(c.d),
      s: c.s === 'success' || c.s === 1 ? 1 : 0,
      v: c.v ?? null,
      n: c.n ?? null,
      u: c.u,
    })),
  }
}

function buildFile(p: Project | ProjectMeta, checkins: Checkin[]): ProjectFile {
  return {
    version: 2,
    project: stripProject(p),
    checkins: checkins.map(checkinToCompact),
  }
}

function stripProject(p: Project | ProjectMeta): ProjectMeta {
  const { remoteEtag: _, remotePath: _rp, ...rest } = p as Project
  return rest
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

    if (await uploadFile(client, repo, p, buildFile(p, []))) cleaned++
  }

  return { cleaned }
}

/** 导入数据后直接上传到远端，设置 remoteEtag，避免后续 sync 走 merge 覆盖 */
export async function uploadImportedProject(
  project: Project,
  checkins: Checkin[],
): Promise<string | null> {
  const cfg = getSyncConfig()
  if (!cfg) return null
  const client = await getClient(cfg)
  const file: ProjectFile = {
    version: 2,
    project: stripProject(project),
    checkins: checkins.map(checkinToCompact),
  }
  try {
    await client.putFileContents(project.remotePath, JSON.stringify(file, null, 2), {
      contentLength: false,
    })
    return await getDirEntryEtag(client, project.remotePath)
  } catch (e) {
    console.warn('[sync] uploadImportedProject failed:', e)
    return null
  }
}

export { makeRemotePath }
