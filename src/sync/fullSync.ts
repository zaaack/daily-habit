import { getClient, normalizeDir, type WebDavConfig } from './webdav'
import { mergeProjectFile, type ProjectFile } from './merge'
import type { Repo } from '@/db/repo/Repo'
import type { Project, Checkin } from '@/db/types'
import { makeRemotePath } from '@/db/schema'

const SYNC_CONFIG_KEY = 'webdav.config'

export async function getSyncConfig(repo: Repo): Promise<WebDavConfig | null> {
  const v = await repo.getKV<WebDavConfig>(SYNC_CONFIG_KEY)
  if (!v || !v.url || !v.username) return null
  return { ...v, remoteDir: normalizeDir(v.remoteDir || '/dailies') }
}

export async function setSyncConfig(repo: Repo, cfg: WebDavConfig): Promise<void> {
  await repo.setKV(SYNC_CONFIG_KEY, { ...cfg, remoteDir: normalizeDir(cfg.remoteDir) })
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
  const cfg = await getSyncConfig(repo)
  if (!cfg) return
  const client = getClient(cfg)

  // 1. 列出远端
  let remoteFiles: { filename: string; etag: string | null }[] = []
  try {
    const list = await client.getDirectoryContents(cfg.remoteDir) as { data?: { filename?: string; etag?: string | null }[] }
    const data = (list?.data ?? []) as { filename?: string; etag?: string | null; type?: string }[]
    remoteFiles = data
      .filter(f => f.type !== 'directory' && f.filename?.endsWith('.json'))
      .map(f => ({ filename: f.filename!, etag: f.etag ?? null }))
  } catch (e) {
    // 远端目录不存在 → 创建
    try { await client.createDirectory(cfg.remoteDir, { recursive: true }) } catch { /* ignore */ }
  }

  const localProjects = await repo.listProjects(true)
  const remoteByPath = new Map(remoteFiles.map(f => [f.filename, f.etag]))

  let changed = false
  const refreshedProjects: Project[] = []

  for (const p of localProjects) {
    const filename = p.remotePath.split('/').pop()!
    const remoteEtag = remoteByPath.get(filename) ?? null

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
    const file = await fetchRemoteFile(client, path, null)
    if (!file) continue
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
  const cfg = await getSyncConfig(repo)
  if (!cfg) return
  const p = await repo.getProject(projectId)
  if (!p) return
  const client = getClient(cfg)
  const localCheckins = await repo.getCheckins(p.id)

  const remoteEtag = await getDirEntryEtag(client, p.remotePath)
  if (remoteEtag && remoteEtag === p.remoteEtag) {
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
    } catch { /* 412 等留待下次 */ }
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
    } catch { /* 412 等 */ }
  }
}

async function getDirEntryEtag(client: ReturnType<typeof getClient>, path: string): Promise<string | null> {
  try {
    const dir = path.split('/').slice(0, -1).join('/') || '/'
    const list = await client.getDirectoryContents(dir) as { data?: { filename?: string; etag?: string | null; type?: string }[] }
    const name = path.split('/').pop()!
    const entry = (list?.data ?? []).find(f => f.filename === name)
    return entry?.etag ?? null
  } catch {
    return null
  }
}

async function fetchRemoteFile(client: ReturnType<typeof getClient>, path: string, ifNoneMatch: string | null): Promise<ProjectFile | null> {
  try {
    const headers: Record<string, string> = {}
    if (ifNoneMatch) headers['If-None-Match'] = ifNoneMatch
    const data = await client.getFileContents(path, { format: 'text' })
    return JSON.parse(data as string) as ProjectFile
  } catch (e: any) {
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

export { makeRemotePath }
