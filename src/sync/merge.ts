import type { Project, Checkin, CheckStatus, ConflictItem } from '@/db/types'

export interface ProjectFile {
  version: number
  project: Omit<Project, 'remoteEtag'>
  checkins: [string, CheckStatus, number | null, string | null, number][]
}

export interface MergeResult {
  project: Omit<Project, 'remoteEtag'>
  checkins: Checkin[]
  conflicts: ConflictItem[]
  changed: boolean
}

export function emptyMergeResult(project: Omit<Project, 'remoteEtag'>, checkins: Checkin[] = []): MergeResult {
  return { project, checkins, conflicts: [], changed: false }
}

/**
 * Field-level LWW merge.
 * - project 字段按 project.updatedAt 整体取较新者
 * - checkins 按 (projectId, date) 联合：每条取 updatedAt 大者；
 *   同 date 两端都被改过且 status/value/note 任一不同 → 冲突
 */
export function mergeProjectFile(
  local: Omit<Project, 'remoteEtag'>,
  localCheckins: Checkin[],
  remote: ProjectFile,
): MergeResult {
  const remoteCheckins: Checkin[] = remote.checkins.map(t => ({
    projectId: remote.project.id,
    date: t[0],
    status: t[1],
    value: t[2],
    note: t[3],
    updatedAt: t[4],
  }))
  const conflicts: ConflictItem[] = []
  let project = local
  let projectChanged = false

  if (remote.project.updatedAt > local.updatedAt) {
    project = { ...remote.project }
    projectChanged = true
  } else if (remote.project.updatedAt === local.updatedAt) {
    const sameMeta = remote.project.name === local.name
      && remote.project.unit === local.unit
      && remote.project.emoji === local.emoji
      && remote.project.color === local.color
      && remote.project.deleted === local.deleted
    if (!sameMeta) {
      // 视为冲突；用项目维度冲突标记
      conflicts.push({
        date: '__project__',
        field: 'note',
        local: JSON.stringify({ name: local.name, unit: local.unit, emoji: local.emoji, color: local.color, deleted: !!local.deleted }),
        remote: JSON.stringify({ name: remote.project.name, unit: remote.project.unit, emoji: remote.project.emoji, color: remote.project.color, deleted: !!remote.project.deleted }),
      })
    }
  }

  const map = new Map<string, Checkin>()
  for (const c of localCheckins) map.set(c.date, c)
  const merged: Checkin[] = []
  const seenDates = new Set<string>()

  for (const rc of remoteCheckins) {
    seenDates.add(rc.date)
    const lc = map.get(rc.date)
    if (!lc) {
      merged.push(rc)
      continue
    }
    if (lc.updatedAt === rc.updatedAt) {
      const same = lc.status === rc.status
        && (lc.value ?? null) === (rc.value ?? null)
        && (lc.note ?? null) === (rc.note ?? null)
      merged.push(same ? lc : lc)
      continue
    }
    const winner = lc.updatedAt > rc.updatedAt ? lc : rc
    if (lc.status !== rc.status || (lc.value ?? null) !== (rc.value ?? null) || (lc.note ?? null) !== (rc.note ?? null)) {
      conflicts.push({
        date: rc.date,
        field: lc.status !== rc.status ? 'status' : (lc.value !== rc.value ? 'value' : 'note'),
        local: pickField(lc, lc.status !== rc.status ? 'status' : (lc.value !== rc.value ? 'value' : 'note')),
        remote: pickField(rc, lc.status !== rc.status ? 'status' : (lc.value !== rc.value ? 'value' : 'note')),
      })
    }
    merged.push(winner)
  }

  for (const lc of localCheckins) {
    if (!seenDates.has(lc.date)) merged.push(lc)
  }

  merged.sort((a, b) => a.date.localeCompare(b.date))
  const changed = projectChanged || merged.length !== localCheckins.length
    || merged.some((c, i) => c.updatedAt !== localCheckins[i]?.updatedAt)
  return { project, checkins: merged, conflicts, changed }
}

function pickField(c: Checkin, f: 'status' | 'value' | 'note'): string | number | null {
  if (f === 'status') return c.status
  if (f === 'value') return c.value
  return c.note
}
