import { getClient, normalizeDir, type WebDavConfig } from './webdav'
import { mergeProjectFile, type ProjectFile } from './merge'
import type { Repo } from '@/db/repo/Repo'
import type { Project, Checkin } from '@/db/types'
import { makeRemotePath } from '@/db/schema'

const SYNC_CONFIG_KEY = 'webdav.config'

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
    const client = getClient(cfg)
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
  const client = getClient(cfg)
  console.log('[sync] runFullSync start, remoteDir:', cfg.remoteDir)

  // 1. 列出远端
  let remoteFiles: { filename: string; etag: string | null }[] = []
  try {
    const list = await client.getDirectoryContents(cfg.remoteDir)
    const items = Array.isArray(list) ? list : ((list as any)?.data ?? [])
    console.log('[sync] getDirectoryContents raw:', JSON.stringify(list, null, 2).slice(0, 2000))
    console.log('[sync] getDirectoryContents items:', JSON.stringify(items, null, 2).slice(0, 2000))
    remoteFiles = items
      .filter((f: any) => f.type !== 'directory' && f.filename?.endsWith('.json'))
      .map((f: any) => ({ filename: f.basename!, etag: f.etag ?? null }))
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
      const file = await buildFile(p, await repo.getCheckins(p.id))
      try {
        const newEtag = await client.putFileContents(p.remotePath, JSON.stringify(file, null, 2), {
          contentLength: false,
        })
        const newEtagStr = await getDirEntryEtag(client, p.remotePath)
        const next: Project = { ...p, remoteEtag: newEtagStr ?? String(newEtag) }
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
      refreshedProjects.push(p)
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
    const localCheckins = await repo.getCheckins(p.id)
    const { project, checkins, conflicts, changed: merged } = mergeProjectFile(
      stripProject(p), localCheckins, file,
    )

    if (conflicts.length > 0) {
      hooks.onConflict(p.id, conflicts)
    }

    if (merged) {
      // 写回本地
      const nextProject: Omit<Project, 'remoteEtag'> = { ...project, remotePath: p.remotePath }
      await repo.upsertProject({ ...p, ...nextProject, remoteEtag })
      for (const c of checkins) await repo.upsertCheckin(c)
      changed = true
    }
    refreshedProjects.push({ ...p, remoteEtag })
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
      const localCheckins = await repo.getCheckins(projectId)
      const { project, checkins, conflicts } = mergeProjectFile(
        stripProject(existing), localCheckins, file,
      )
      if (conflicts.length) hooks.onConflict(projectId, conflicts)
      await repo.upsertProject({ ...existing, ...project, remotePath: path })
      for (const c of checkins) await repo.upsertCheckin(c)
    } else {
      const newProject: Project = {
        ...file.project,
        sort: file.project.sort ?? 0,
        remotePath: path,
        remoteEtag: remoteByPath.get(filename),
        deleted: 0,
      } as Project
      await repo.upsertProject(newProject)
      for (const c of file.checkins) await repo.upsertCheckin({ projectId: file.project.id, date: c.d, status: c.s, value: c.v, note: c.n, updatedAt: c.u })
    }
    changed = true
  }

  if (changed) {
    const list = await repo.listProjects()
    hooks.onProjectsChange(list)
  }
}

export async function syncOneProject(projectId: string): Promise<void> {
  const { getRepo } = await import('@/db')
  const repo = await getRepo()
  const cfg = getSyncConfig()
  if (!cfg) return
  const p = await repo.getProject(projectId)
  if (!p) return
  const client = getClient(cfg)
  const localCheckins = await repo.getCheckins(p.id)
  console.log('[sync] syncOneProject', p.name, 'remotePath:', p.remotePath, 'localEtag:', p.remoteEtag)

  const remoteEtag = await getDirEntryEtag(client, p.remotePath)
  console.log('[sync] syncOneProject remoteEtag:', remoteEtag)
  if (remoteEtag && remoteEtag === p.remoteEtag) {
    console.log('[sync] syncOneProject etag match, skip')
    return
  }

  if (!remoteEtag) {
    const file = await buildFile(p, localCheckins)
    try {
      const res = await client.putFileContents(p.remotePath, JSON.stringify(file, null, 2), {
        contentLength: false,
      })
      const newEtag = await getDirEntryEtag(client, p.remotePath) ?? String(res)
      await repo.upsertProject({ ...p, remoteEtag: newEtag })
    } catch (e) {
      console.warn('[sync] syncOneProject upload failed:', e)
      /* 留待 runFullSync 重试 */
    }
    return
  }

  const remote = await fetchRemoteFile(client, p.remotePath, p.remoteEtag)
  if (!remote) return
  const { project, checkins, conflicts } = mergeProjectFile(stripProject(p), localCheckins, remote)
  if (conflicts.length) {
    const { useAppStore } = await import('@/state/useAppStore')
    useAppStore.setState(s => ({ conflicts: { ...s.conflicts, [p.id]: conflicts } }))
  }
  if (conflicts.length === 0) {
    await repo.upsertProject({ ...p, ...project, remoteEtag })
    for (const c of checkins) await repo.upsertCheckin(c)
    try {
      const file = await buildFile({ ...p, ...project }, checkins)
      const res = await client.putFileContents(p.remotePath, JSON.stringify(file, null, 2), {
        contentLength: false,
      })
      const newEtag = await getDirEntryEtag(client, p.remotePath) ?? String(res)
      await repo.upsertProject({ ...p, ...project, remoteEtag: newEtag })
    } catch (e) {
      console.warn('[sync] syncOneProject merge upload failed:', e)
      /* 412 等 — 留待 runFullSync 重试 */
    }
  }
}

async function getDirEntryEtag(client: ReturnType<typeof getClient>, path: string): Promise<string | null> {
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
    return entry?.etag ?? null
  } catch (e) {
    console.warn('[sync] getDirEntryEtag error:', e)
    return null
  }
}

async function fetchRemoteFile(client: ReturnType<typeof getClient>, path: string, ifNoneMatch: string | null): Promise<ProjectFile | null> {
  try {
    const headers: Record<string, string> = {}
    if (ifNoneMatch) headers['If-None-Match'] = ifNoneMatch
    console.log('[sync] fetchRemoteFile path:', path, 'ifNoneMatch:', ifNoneMatch)
    const data = await client.getFileContents(path, { format: 'text' })
    console.log('[sync] fetchRemoteFile success, data type:', typeof data, 'length:', String(data).length)
    return JSON.parse(data as string) as ProjectFile
  } catch (e: any) {
    console.warn('[sync] fetchRemoteFile error:', e?.status, e?.message || e)
    if (e?.status === 304) return null
    return null
  }
}

async function buildFile(p: Project, checkins: Checkin[]): Promise<ProjectFile> {
  return {
    version: 1,
    project: stripProject(p),
    checkins: checkins.map(c => ({ d: c.date, s: c.status, v: c.value, n: c.note, u: c.updatedAt })),
  }
}

function stripProject(p: Project): Omit<Project, 'remoteEtag'> {
  const { remoteEtag: _, ...rest } = p
  return rest
}

export async function cleanupDeletedProjects(): Promise<{ cleaned: number } | null> {
  const cfg = getSyncConfig()
  if (!cfg) return null
  const client = getClient(cfg)
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
      const newEtag = await getDirEntryEtag(client, p.remotePath) ?? String(res)
      await repo.upsertProject({ ...p, remoteEtag: newEtag })
      cleaned++
    } catch (e) {
      console.warn('[sync] cleanupDeletedProjects failed for', p.name, e)
    }
  }

  return { cleaned }
}

export { makeRemotePath }
