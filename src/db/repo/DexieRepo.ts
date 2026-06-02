import Dexie, { type Table } from 'dexie'
import type { Repo, DateRange } from './Repo'
import type { Project, Checkin, SettingKV } from '../types'
import { SCHEMA_VERSION } from '../schema'

class HabitDB extends Dexie {
  projects!: Table<Project, string>
  checkins!: Table<Checkin, [string, string]>
  kv!: Table<SettingKV, string>

  constructor() {
    super('daily-habit')
    this.version(SCHEMA_VERSION).stores({
      projects: 'id, updatedAt, deleted',
      checkins: '[projectId+date], projectId, date, updatedAt',
      kv: 'key',
    }).upgrade(async (tx) => {
      // Ensure all projects have archived field (added in v3)
      const all = await tx.table('projects').toArray() as Project[]
      for (const p of all) {
        if (p.archived === undefined) {
          await tx.table('projects').put({ ...p, archived: 0 })
        }
      }
    })
  }
}

export class DexieRepo implements Repo {
  private db: HabitDB

  constructor() {
    this.db = new HabitDB()
  }

  async init(): Promise<void> {
    await this.db.open()
  }

  async clearDatabase(): Promise<void> {
    this.db.close()
    await Dexie.delete('daily-habit')
    this.db = new HabitDB()
    await this.db.open()
  }

  async listProjects(includeDeleted = false): Promise<Project[]> {
    const all = await this.db.projects.toArray()
    const filtered = includeDeleted ? all : all.filter(p => p.deleted === 0)
    filtered.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || b.updatedAt - a.updatedAt)
    return filtered
  }

  async getProject(id: string): Promise<Project | undefined> {
    return this.db.projects.get(id)
  }

  async upsertProject(p: Project): Promise<void> {
    await this.db.projects.put(p)
  }

  async softDeleteProject(id: string, updatedAt: number): Promise<void> {
    const p = await this.db.projects.get(id)
    if (!p) return
    p.deleted = 1
    p.updatedAt = updatedAt
    await this.db.projects.put(p)
  }

  async getCheckin(projectId: string, date: string): Promise<Checkin | undefined> {
    const c = await this.db.checkins.get([projectId, date])
    return c && c.status !== 'deleted' ? c : undefined
  }

  async getCheckins(projectId: string, range?: DateRange): Promise<Checkin[]> {
    let coll = this.db.checkins.where('projectId').equals(projectId)
    let arr = await coll.toArray()
    arr = arr.filter(c => c.status !== 'deleted')
    if (range?.from) arr = arr.filter(c => c.date >= range.from!)
    if (range?.to) arr = arr.filter(c => c.date <= range.to!)
    arr.sort((a, b) => a.date.localeCompare(b.date))
    return arr
  }

  async getCheckinsAll(projectId: string): Promise<Checkin[]> {
    const arr = await this.db.checkins.where('projectId').equals(projectId).toArray()
    arr.sort((a, b) => a.date.localeCompare(b.date))
    return arr
  }

  async upsertCheckin(c: Checkin): Promise<void> {
    await this.db.checkins.put(c)
  }

  async bulkUpsertCheckins(checkins: Checkin[]): Promise<void> {
    await this.db.checkins.bulkPut(checkins)
  }

  async deleteCheckin(projectId: string, date: string, updatedAt?: number): Promise<void> {
    if (updatedAt) {
      const cur = await this.db.checkins.get([projectId, date])
      const c: Checkin = {
        projectId,
        date,
        status: 'deleted',
        value: cur?.value ?? null,
        note: cur?.note ?? null,
        updatedAt,
      }
      await this.db.checkins.put(c)
    } else {
      await this.db.checkins.delete([projectId, date])
    }
  }

  async getKV<T = unknown>(key: string): Promise<T | null> {
    const r = await this.db.kv.get(key)
    if (!r) return null
    try { return JSON.parse(r.value) as T } catch { return null }
  }

  async setKV(key: string, value: unknown): Promise<void> {
    await this.db.kv.put({ key, value: JSON.stringify(value) })
  }

  async deleteKV(key: string): Promise<void> {
    await this.db.kv.delete(key)
  }
}
