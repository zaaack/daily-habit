import { useCallback } from 'react'
import { useKysely, useQuery } from 'sqlite-remote-sync/react'
import {
  rowToProject,
  rowToCheckin,
  projectToRow,
  checkinToRow,
  makeProjectId,
  nowMs,
  type DB,
} from '@/db'
import type { Project, Checkin, CheckStatus } from '@/db/types'
import { withWrite } from '@/sync/engine'

export interface Range {
  from?: string
  to?: string
}

function sortProjects(list: Project[]): Project[] {
  return [...list].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || b.updatedAt - a.updatedAt)
}

/** All projects (deleted included), sorted. Auto-refreshes on any change. */
export function useProjects(): {
  projects: Project[]
  isLoading: boolean
  refresh: () => void
} {
  const { data, isLoading, refresh } = useQuery<Project[], DB>((db) =>
    db.selectFrom('projects').selectAll().orderBy('sort', 'asc').orderBy('updated_at', 'desc').execute()
      .then((rows) => rows.map(rowToProject)),
  )
  return { projects: sortProjects(data ?? []), isLoading, refresh }
}

export function useCheckins(
  projectId: string,
  range?: Range,
): { checkins: Checkin[]; refresh: () => void } {
  const from = range?.from
  const to = range?.to
  const { data, refresh } = useQuery<Checkin[], DB>(
    (db) => {
      let q = db.selectFrom('checkins').selectAll().where('project_id', '=', projectId)
      if (from) q = q.where('date', '>=', from)
      if (to) q = q.where('date', '<=', to)
      return q.orderBy('date', 'asc').execute().then((rows) => rows.map(rowToCheckin))
    },
    [projectId, from, to],
  )
  return { checkins: data ?? [], refresh }
}

/** All checkins across all projects (for the History route). */
export function useAllCheckins(): { checkins: Checkin[]; refresh: () => void } {
  const { data, refresh } = useQuery<Checkin[], DB>((db) =>
    db.selectFrom('checkins').selectAll().orderBy('date', 'desc').execute()
      .then((rows) => rows.map(rowToCheckin)),
  )
  return { checkins: data ?? [], refresh }
}

/** All mutations route through the live Kysely instance + engine lock. */
export function useHabitActions() {
  const db = useKysely<DB>()

  const addProject = useCallback(
    async (input: { name: string; description: string; unit: string | null; emoji: string; color: string }): Promise<Project> => {
      const now = nowMs()
      const p: Project = {
        id: makeProjectId(),
        name: input.name.trim(),
        description: input.description.trim(),
        unit: input.unit?.trim() || null,
        emoji: input.emoji,
        color: input.color,
        sort: 0,
        createdAt: now,
        updatedAt: now,
        deleted: 0,
        archived: 0,
      }
      await withWrite(() => db.insertInto('projects').values(projectToRow(p)).execute())
      return p
    },
    [db],
  )

  const updateProject = useCallback(
    async (id: string, patch: Partial<Pick<Project, 'name' | 'description' | 'unit' | 'emoji' | 'color'>>) => {
      await withWrite(() =>
        db.updateTable('projects')
          .set({ ...patch, unit: patch.unit?.trim() || null, updated_at: nowMs() })
          .where('id', '=', id)
          .execute(),
      )
    },
    [db],
  )

  const deleteProject = useCallback(async (id: string) => {
    await withWrite(() => db.updateTable('projects').set({ deleted: 1, updated_at: nowMs() }).where('id', '=', id).execute())
  }, [db])

  const restoreProject = useCallback(async (id: string) => {
    await withWrite(() => db.updateTable('projects').set({ deleted: 0, updated_at: nowMs() }).where('id', '=', id).execute())
  }, [db])

  const archiveProject = useCallback(async (id: string) => {
    await withWrite(() => db.updateTable('projects').set({ archived: 1, updated_at: nowMs() }).where('id', '=', id).execute())
  }, [db])

  const unarchiveProject = useCallback(async (id: string) => {
    await withWrite(() => db.updateTable('projects').set({ archived: 0, updated_at: nowMs() }).where('id', '=', id).execute())
  }, [db])

  const reorderProjects = useCallback(async (orderedIds: string[]) => {
    const now = nowMs()
    await withWrite(async () => {
      for (const [i, id] of orderedIds.entries()) {
        await db.updateTable('projects').set({ sort: i, updated_at: now }).where('id', '=', id).execute()
      }
    })
  }, [db])

  const cycleCheckin = useCallback(async (projectId: string, date: string) => {
    await withWrite(async () => {
      const cur = await db.selectFrom('checkins').selectAll()
        .where('project_id', '=', projectId).where('date', '=', date).executeTakeFirst()
      const c = cur ? rowToCheckin(cur) : undefined
      const now = nowMs()
      if (!c || c.status === 'deleted') {
        await db.insertInto('checkins').values(checkinToRow({
          projectId, date, status: 'success', value: null, note: null, updatedAt: now,
        })).onConflict((oc) => oc.columns(['project_id', 'date']).doUpdateSet({
          status: 'success', value: null, note: null, updated_at: now,
        })).execute()
      } else if (c.status === 'success') {
        await db.updateTable('checkins').set({ status: 'fail', updated_at: now })
          .where('project_id', '=', projectId).where('date', '=', date).execute()
      } else {
        await db.deleteFrom('checkins')
          .where('project_id', '=', projectId).where('date', '=', date).execute()
      }
    })
  }, [db])

  const setCheckin = useCallback(async (
    projectId: string,
    date: string,
    status: CheckStatus | null,
    value: number | null,
    note: string | null,
  ) => {
    await withWrite(async () => {
      const now = nowMs()
      if (status === null) {
        await db.deleteFrom('checkins')
          .where('project_id', '=', projectId).where('date', '=', date).execute()
        return
      }
      await db.insertInto('checkins').values(checkinToRow({
        projectId, date, status, value, note, updatedAt: now,
      })).onConflict((oc) => oc.columns(['project_id', 'date']).doUpdateSet({
        status, value, note, updated_at: now,
      })).execute()
    })
  }, [db])

  return {
    addProject,
    updateProject,
    deleteProject,
    restoreProject,
    archiveProject,
    unarchiveProject,
    reorderProjects,
    cycleCheckin,
    setCheckin,
  }
}