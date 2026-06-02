import { getClient, normalizeDir, type WebDavConfig } from './webdav'
import { mergeProjectFile, checkinToCompact, compactToCheckin, dateStrToEpochDay, type ProjectFile } from './merge'
import type { Repo } from '@/db/repo/Repo'
import type { Project, Checkin } from '@/db/types'
import type { WebDAVClient } from 'webdav'
import { makeRemotePath } from '@/db/schema'

const SYNC_CONFIG_KEY = 'webdav.config'

/** 防止并发 runFullSync */
let _fullSyncInProgress = false

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
    console.log('[sync] runFullSync start, remoteDir:', cfg.remoteDir)

    // 读取上一次完整同步时间，据此判断本地是否有新变更
    const lastSyncAt = await repo.getKV<number>('sync.lastAt')

  // 1. 列出远端
  let remoteFiles: { filename: string; etag: string | null }[] = []
  try {
    const list = await client.getDirectoryContents(cfg.remoteDir)
    const items = Array.isArray(list) ? list : ((list as any)?.data ?? [])
    console.log('[sync] getDirectoryContents raw:', JSON.stringify(list, null, 2).slice(0, 2000))
    console.log('[sync] getDirectoryContents items:', JSON.stringify(items, null, 2).slice(0, 2000))
    remoteFiles = items
      .filter((f: any) => f.type !== 'directory' && f.filename?.endsWith('.json'))
      .map((f: any) => ({ filename: f.basename!, etag: normalizeEtag(f.etag) ?? null }))
    console.log('[sync] remoteFiles (after filter):', JSON.stringify(remoteFiles))
  } catch (e) {
    console.warn('[sync] getDirectoryContents failed:', e)
    // 远端目录不存在 → 创建
    try { await client.createDirectory(cfg.remoteDir, { recursive: true }) } catch { /* ignore */ }
  }
  console.log('[sync] remoteFiles final:', JSON.stringify(remoteFiles))

  const localProjects = await repo.listProjects(true)
  console.log('[sync] localProjects count:', localProjects.length)
  const remoteByPath = new Map(remoteFiles.map(f => [f.filename, f.etag]))
  console.log('[sync] remoteByPath keys:', [...remoteByPath.keys()])
  console.log('[sync] remoteByPath entries:', [...remoteByPath.entries()])

  let changed = false
  const refreshedProjects: Project[] = []

  for (const p of localProjects) {
    const filename = p.remotePath.split('/').pop()!
    const remoteEtag = remoteByPath.get(filename) ?? null
    console.log('[sync] check local project', p.name, 'filename:', filename, 'remoteEtag:', remoteEtag)

    if (remoteEtag === null) {
      // 本地有 / 远端无 → 上传
      const file = await buildFile(p, await repo.getCheckinsAll(p.id))
      try {
        const newEtag = await client.putFileContents(p.remotePath, JSON.stringify(file, null, 2), {
          contentLength: false,
        })
        const newEtagStr = await getDirEntryEtag(client, p.remotePath)
        const next: Project = { ...p, remoteEtag: newEtagStr ?? normalizeEtag(String(newEtag)) }
        await repo.upsertProject(next)
        refreshedProjects.push(next)
        changed = true
      } catch (e) {
        // 412/409 等并发：保留本地，等下次再试
        refreshedProjects.push(p)
      }
      remoteByPath.delete(filename)
      continue
    }

    if (p.remoteEtag === remoteEtag) {
      // etag 匹配 → 检查本地是否有新变更，有则上传
      if (lastSyncAt && p.updatedAt <= lastSyncAt) {
        // 本地无新变更，无需上传
        refreshedProjects.push(p)
      } else {
        const file = await buildFile(p, await repo.getCheckinsAll(p.id))
        try {
          const newEtag = await client.putFileContents(p.remotePath, JSON.stringify(file, null, 2), {
            contentLength: false,
          })
          const newEtagStr = await getDirEntryEtag(client, p.remotePath)
          const next: Project = { ...p, remoteEtag: newEtagStr ?? normalizeEtag(String(newEtag)) }
          await repo.upsertProject(next)
          refreshedProjects.push(next)
          changed = true
        } catch (e) {
          refreshedProjects.push(p)
        }
      }
      remoteByPath.delete(filename)
      continue
    }

    // etag 变化 → 拉远端合并
    const file = await fetchRemoteFile(client, p.remotePath, p.remoteEtag)
    if (!file) {
      refreshedProjects.push(p)
      remoteByPath.delete(filename)
      continue
    }
    // 重新读取本地最新数据（防止并发导入等修改导致使用过期快照）
    const freshProject = await repo.getProject(p.id) ?? p
    const localCheckins = await repo.getCheckinsAll(p.id)
    const { project, checkinsAll: mergedAll, conflicts, changed: merged } = mergeProjectFile(
      stripProject(freshProject), localCheckins, file,
    )

    if (conflicts.length > 0) {
      hooks.onConflict(p.id, conflicts)
    }

    if (merged) {
      const nextProject: Omit<Project, 'remoteEtag'> = { ...project, remotePath: p.remotePath }
      await repo.upsertProject({ ...freshProject, ...nextProject, remoteEtag })

      // 合并: merge 结果(含 tombstone) + 本地-only
      const mergedDates = new Set(mergedAll.map(c => c.date))
      for (const c of localCheckins) {
        if (!mergedDates.has(c.date)) mergedAll.push(c)
      }
      for (const c of mergedAll) await repo.upsertCheckin(c)

      // 重新上传完整文件 (mergedAll 已含 tombstone + 本地-only)
      try {
        const uploadFile = await buildFile({ ...freshProject, ...nextProject }, mergedAll)
        await client.putFileContents(p.remotePath, JSON.stringify(uploadFile, null, 2), { contentLength: false })
        const newEtag = await getDirEntryEtag(client, p.remotePath)
        if (newEtag) await repo.upsertProject({ ...freshProject, ...nextProject, remoteEtag: newEtag })
      } catch { /* 留待下次重试 */ }
      changed = true
    }
    refreshedProjects.push({ ...freshProject, remoteEtag })
    remoteByPath.delete(filename)
  }

  // 远端有 / 本地无 → 下载
  for (const [filename] of remoteByPath) {
    const path = `${cfg.remoteDir}/${filename}`
    console.log('[sync] download remote project, filename:', filename, 'path:', path)
    const file = await fetchRemoteFile(client, path, null)
    if (!file) {
      console.warn('[sync] fetchRemoteFile returned null for path:', path)
      continue
    }
    console.log('[sync] download success, project id:', file.project?.id, 'name:', file.project?.name)
    const projectId = filename.replace(/\.json$/, '')
    const existing = await repo.getProject(projectId)
    if (existing) {
      const localCheckins = await repo.getCheckinsAll(projectId)
      const { project, checkinsAll, conflicts } = mergeProjectFile(
        stripProject(existing), localCheckins, file,
      )
      if (conflicts.length) hooks.onConflict(projectId, conflicts)
      await repo.upsertProject({ ...existing, ...project, remotePath: path })
      for (const c of checkinsAll) await repo.upsertCheckin(c)
    } else {
      const newProject: Project = {
        ...file.project,
        sort: file.project.sort ?? 0,
        remotePath: path,
        remoteEtag: remoteByPath.get(filename),
        deleted: 0,
      } as Project
      await repo.upsertProject(newProject)
      for (const c of file.checkins) await repo.upsertCheckin(compactToCheckin(file.project.id, c))
    }
    changed = true
  }

  if (changed) {
    const list = await repo.listProjects()
    hooks.onProjectsChange(list)
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
  console.log('[sync] syncOneProject', p.name, 'remotePath:', p.remotePath, 'localEtag:', p.remoteEtag)

  const remoteEtag = await getDirEntryEtag(client, p.remotePath)
  console.log('[sync] syncOneProject remoteEtag:', remoteEtag)
  if (remoteEtag && remoteEtag === p.remoteEtag) {
    // etag 匹配 → 本地数据可能已变更，直接上传
    console.log('[sync] syncOneProject etag match, uploading local changes')
    const file = await buildFile(p, localCheckins)
    try {
      const res = await client.putFileContents(p.remotePath, JSON.stringify(file, null, 2), {
        contentLength: false,
      })
      const newEtag = await getDirEntryEtag(client, p.remotePath) ?? normalizeEtag(String(res))
      await repo.upsertProject({ ...p, remoteEtag: newEtag })
    } catch (e) {
      console.warn('[sync] syncOneProject upload after etag match failed:', e)
    }
    return
  }

  if (!remoteEtag) {
    const file = await buildFile(p, localCheckins)
    try {
      const res = await client.putFileContents(p.remotePath, JSON.stringify(file, null, 2), {
        contentLength: false,
      })
      const newEtag = await getDirEntryEtag(client, p.remotePath) ?? normalizeEtag(String(res))
      await repo.upsertProject({ ...p, remoteEtag: newEtag })
    } catch (e) {
      console.warn('[sync] syncOneProject upload failed:', e)
      /* 留待 runFullSync 重试 */
    }
    return
  }

  const remote = await fetchRemoteFile(client, p.remotePath, null)
  if (!remote) {
    // 304/错误：无法获取远端内容，直接上传本地变更
    const file = await buildFile(p, localCheckins)
    try {
      const res = await client.putFileContents(p.remotePath, JSON.stringify(file, null, 2), {
        contentLength: false,
      })
      const newEtag = await getDirEntryEtag(client, p.remotePath) ?? normalizeEtag(String(res))
      await repo.upsertProject({ ...p, remoteEtag: newEtag })
    } catch (e) {
      console.warn('[sync] syncOneProject fallback upload failed:', e)
    }
    return
  }
  // 重新读取本地最新数据（防止并发导入等修改导致使用过期快照）
  const freshP = await repo.getProject(p.id) ?? p
  const freshCheckins = await repo.getCheckinsAll(p.id)
  const { project, checkinsAll: mergedAll, conflicts } = mergeProjectFile(stripProject(freshP), freshCheckins, remote)
  if (conflicts.length) {
    const { useAppStore } = await import('@/state/useAppStore')
    useAppStore.setState(s => ({ conflicts: { ...s.conflicts, [p.id]: conflicts } }))
  }
  if (conflicts.length === 0) {
    await repo.upsertProject({ ...freshP, ...project, remoteEtag })

    // 合并: merge 结果(含 tombstone) + 本地-only
    const mergedDates = new Set(mergedAll.map(c => c.date))
    for (const c of freshCheckins) {
      if (!mergedDates.has(c.date)) mergedAll.push(c)
    }
    for (const c of mergedAll) await repo.upsertCheckin(c)

    try {
      const file = await buildFile({ ...freshP, ...project }, mergedAll)
      const res = await client.putFileContents(p.remotePath, JSON.stringify(file, null, 2), {
        contentLength: false,
      })
      const newEtag = await getDirEntryEtag(client, p.remotePath) ?? normalizeEtag(String(res))
      await repo.upsertProject({ ...freshP, ...project, remoteEtag: newEtag })
    } catch (e) {
      console.warn('[sync] syncOneProject merge upload failed:', e)
      /* 412 等 — 留待 runFullSync 重试 */
    }
  }
}

/** 统一 etag 格式：去掉外层引号和 weak 标记（如 W/"abc" → abc） */
function normalizeEtag(etag: string | null): string | null {
  if (!etag) return null
  return etag.replace(/^(?:W\/)?"(.*)"$/, '$1').trim() || null
}

async function getDirEntryEtag(client: WebDAVClient, path: string): Promise<string | null> {
  try {
    const dir = path.split('/').slice(0, -1).join('/') || '/'
    const name = path.split('/').pop()!
    const list = await client.getDirectoryContents(dir)
    const items = Array.isArray(list) ? list : ((list as any)?.data ?? [])
    console.log('[sync] getDirEntryEtag dir:', dir, 'name:', name, 'items count:', items.length)
    const entry = items.find((f: any) => f.basename === name)
    if (!entry) {
      console.log('[sync] getDirEntryEtag NO MATCH for name:', name, 'available basenames:', items.map((f: any) => f.basename))
    } else {
      console.log('[sync] getDirEntryEtag match:', entry.basename, 'etag:', entry.etag)
    }
    return normalizeEtag(entry?.etag ?? null)
  } catch (e) {
    console.warn('[sync] getDirEntryEtag error:', e)
    return null
  }
}

async function fetchRemoteFile(client: WebDAVClient, path: string, ifNoneMatch: string | null): Promise<ProjectFile | null> {
  try {
    const headers: Record<string, string> = {}
    if (ifNoneMatch) headers['If-None-Match'] = ifNoneMatch
    console.log('[sync] fetchRemoteFile path:', path, 'ifNoneMatch:', ifNoneMatch)
    const data = await client.getFileContents(path, { format: 'text', headers })
    console.log('[sync] fetchRemoteFile success, data type:', typeof data, 'length:', String(data).length)
    return normalizeProjectFile(JSON.parse(data as string))
  } catch (e: any) {
    console.warn('[sync] fetchRemoteFile error:', e?.status, e?.message || e)
    if (e?.status === 304) return null
    return null
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

async function buildFile(p: Project, checkins: Checkin[]): Promise<ProjectFile> {
  return {
    version: 2,
    project: stripProject(p),
    checkins: checkins.map(checkinToCompact),
  }
}

function stripProject(p: Project): Omit<Project, 'remoteEtag' | 'remotePath'> {
  const { remoteEtag: _, remotePath: _rp, ...rest } = p
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

    const file = await buildFile(p, [])
    try {
      const res = await client.putFileContents(p.remotePath, JSON.stringify(file, null, 2), {
        contentLength: false,
      })
      const newEtag = await getDirEntryEtag(client, p.remotePath) ?? normalizeEtag(String(res))
      await repo.upsertProject({ ...p, remoteEtag: newEtag })
      cleaned++
    } catch (e) {
      console.warn('[sync] cleanupDeletedProjects failed for', p.name, e)
    }
  }

  return { cleaned }
}

export { makeRemotePath }
