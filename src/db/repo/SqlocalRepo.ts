import type { Repo, DateRange } from './Repo'
import type { Project, Checkin } from '../types'
import { Kysely, sql } from 'kysely'

interface ProjectsTable {
  id: string
  name: string
  unit: string | null
  emoji: string
  color: string
  created_at: number
  updated_at: number
  remote_etag: string | null
  remote_path: string
  deleted: number
}

interface CheckinsTable {
  project_id: string
  date: string
  status: string
  value: number | null
  note: string | null
  updated_at: number
}

interface SettingsKvTable {
  key: string
  value: string
}

interface DB {
  projects: ProjectsTable
  checkins: CheckinsTable
  settings_kv: SettingsKvTable
}

export class SqlocalRepo implements Repo {
  private db: Kysely<DB> | null = null
  private ready: Promise<void> | null = null

  async init(): Promise<void> {
    if (this.ready) return this.ready
    this.ready = this._init()
    await this.ready
  }

  private async _init(): Promise<void> {
    const { SQLocalKysely } = await import('sqlocal/kysely')
    const { dialect } = new SQLocalKysely('daily-habit.sqlite3')
    this.db = new Kysely<DB>({ dialect })

    await sql`CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      unit TEXT,
      emoji TEXT NOT NULL,
      color TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      remote_etag TEXT,
      remote_path TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0
    )`.execute(this.db)

    await sql`CREATE TABLE IF NOT EXISTS checkins (
      project_id TEXT NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL,
      value REAL,
      note TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (project_id, date)
    )`.execute(this.db)

    await sql`CREATE TABLE IF NOT EXISTS settings_kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`.execute(this.db)
  }

  private async getDb(): Promise<Kysely<DB>> {
    await this.init()
    if (!this.db) throw new Error('SqlocalRepo not initialized')
    return this.db
  }

  private rowToProject(r: ProjectsTable): Project {
    return {
      id: r.id,
      name: r.name,
      unit: r.unit,
      emoji: r.emoji,
      color: r.color,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      remoteEtag: r.remote_etag,
      remotePath: r.remote_path,
      deleted: r.deleted as 0 | 1,
    }
  }

  private rowToCheckin(r: CheckinsTable): Checkin {
    return {
      projectId: r.project_id,
      date: r.date,
      status: r.status as 'success' | 'fail',
      value: r.value,
      note: r.note,
      updatedAt: r.updated_at,
    }
  }

  async listProjects(includeDeleted = false): Promise<Project[]> {
    const db = await this.getDb()
    const rows = includeDeleted
      ? await db.selectFrom('projects').selectAll().orderBy('updated_at', 'desc').execute()
      : await db.selectFrom('projects').selectAll().where('deleted', '=', 0).orderBy('updated_at', 'desc').execute()
    return rows.map(r => this.rowToProject(r))
  }

  async getProject(id: string): Promise<Project | undefined> {
    const db = await this.getDb()
    const row = await db.selectFrom('projects').selectAll().where('id', '=', id).executeTakeFirst()
    return row ? this.rowToProject(row) : undefined
  }

  async upsertProject(p: Project): Promise<void> {
    const db = await this.getDb()
    await sql`INSERT OR REPLACE INTO projects
      (id, name, unit, emoji, color, created_at, updated_at, remote_etag, remote_path, deleted)
      VALUES (${p.id}, ${p.name}, ${p.unit}, ${p.emoji}, ${p.color}, ${p.createdAt}, ${p.updatedAt}, ${p.remoteEtag}, ${p.remotePath}, ${p.deleted})
    `.execute(db)
  }

  async softDeleteProject(id: string, updatedAt: number): Promise<void> {
    const db = await this.getDb()
    await sql`UPDATE projects SET deleted = 1, updated_at = ${updatedAt} WHERE id = ${id}`.execute(db)
  }

  async getCheckin(projectId: string, date: string): Promise<Checkin | undefined> {
    const db = await this.getDb()
    const row = await db.selectFrom('checkins').selectAll()
      .where('project_id', '=', projectId)
      .where('date', '=', date)
      .executeTakeFirst()
    return row ? this.rowToCheckin(row) : undefined
  }

  async getCheckins(projectId: string, range?: DateRange): Promise<Checkin[]> {
    const db = await this.getDb()
    let query = db.selectFrom('checkins').selectAll().where('project_id', '=', projectId)
    if (range?.from) query = query.where('date', '>=', range.from)
    if (range?.to) query = query.where('date', '<=', range.to)
    const rows = await query.orderBy('date', 'asc').execute()
    return rows.map(r => this.rowToCheckin(r))
  }

  async upsertCheckin(c: Checkin): Promise<void> {
    const db = await this.getDb()
    await sql`INSERT OR REPLACE INTO checkins
      (project_id, date, status, value, note, updated_at)
      VALUES (${c.projectId}, ${c.date}, ${c.status}, ${c.value}, ${c.note}, ${c.updatedAt})
    `.execute(db)
  }

  async deleteCheckin(projectId: string, date: string): Promise<void> {
    const db = await this.getDb()
    await sql`DELETE FROM checkins WHERE project_id = ${projectId} AND date = ${date}`.execute(db)
  }

  async getKV<T = unknown>(key: string): Promise<T | null> {
    const db = await this.getDb()
    const row = await db.selectFrom('settings_kv').selectAll().where('key', '=', key).executeTakeFirst()
    if (!row) return null
    try { return JSON.parse(row.value) as T } catch { return null }
  }

  async setKV(key: string, value: unknown): Promise<void> {
    const db = await this.getDb()
    await sql`INSERT OR REPLACE INTO settings_kv (key, value) VALUES (${key}, ${JSON.stringify(value)})`.execute(db)
  }

  async deleteKV(key: string): Promise<void> {
    const db = await this.getDb()
    await sql`DELETE FROM settings_kv WHERE key = ${key}`.execute(db)
  }
}
