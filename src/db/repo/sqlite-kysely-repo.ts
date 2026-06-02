import type { Repo, DateRange } from './Repo'
import type { Project, Checkin } from '../types'
import { Kysely } from 'kysely'

export interface ProjectsTable {
  id: string
  name: string
  description: string
  unit: string | null
  emoji: string
  color: string
  sort: number
  created_at: number
  updated_at: number
  remote_etag: string | null
  remote_path: string
  deleted: number
  archived: number
}

export interface CheckinsTable {
  project_id: string
  date: string
  status: string
  value: number | null
  note: string | null
  updated_at: number
}

export interface SettingsKvTable {
  key: string
  value: string
}

export interface DB {
  projects: ProjectsTable
  checkins: CheckinsTable
  settings_kv: SettingsKvTable
}

export abstract class SqliteKyselyRepo implements Repo {
  protected db: Kysely<DB> | null = null
  protected ready: Promise<void> | null = null

  abstract init(): Promise<void>

  async clearDatabase(): Promise<void> {
    const db = await this.getDb()
    await db.schema.dropTable('settings_kv').ifExists().execute()
    await db.schema.dropTable('checkins').ifExists().execute()
    await db.schema.dropTable('projects').ifExists().execute()
    await this.createTables()
  }

  protected async getDb(): Promise<Kysely<DB>> {
    if (!this.db) throw new Error('Repo not initialized. Call init() first.')
    return this.db
  }

  protected async createTables(): Promise<void> {
    const db = await this.getDb()
    await db.schema
      .createTable('projects')
      .addColumn('id', 'text', col => col.primaryKey())
      .addColumn('name', 'text', col => col.notNull())
      .addColumn('description', 'text', col => col.notNull().defaultTo(''))
      .addColumn('unit', 'text')
      .addColumn('emoji', 'text', col => col.notNull())
      .addColumn('color', 'text', col => col.notNull())
      .addColumn('sort', 'real', col => col.notNull().defaultTo(0))
      .addColumn('created_at', 'integer', col => col.notNull())
      .addColumn('updated_at', 'integer', col => col.notNull())
      .addColumn('remote_etag', 'text')
      .addColumn('remote_path', 'text', col => col.notNull())
      .addColumn('deleted', 'integer', col => col.notNull().defaultTo(0))
      .ifNotExists()
      .execute()

    try {
      await db.schema
        .alterTable('projects')
        .addColumn('sort', 'real', col => col.notNull().defaultTo(0))
        .execute()
    } catch { /* column already exists */ }

    try {
      await db.schema
        .alterTable('projects')
        .addColumn('description', 'text', col => col.notNull().defaultTo(''))
        .execute()
    } catch { /* column already exists */ }

    try {
      await db.schema
        .alterTable('projects')
        .addColumn('archived', 'integer', col => col.notNull().defaultTo(0))
        .execute()
    } catch { /* column already exists */ }

    await db.schema
      .createTable('checkins')
      .addColumn('project_id', 'text', col => col.notNull())
      .addColumn('date', 'text', col => col.notNull())
      .addColumn('status', 'text', col => col.notNull())
      .addColumn('value', 'real')
      .addColumn('note', 'text')
      .addColumn('updated_at', 'integer', col => col.notNull())
      .addPrimaryKeyConstraint('checkins_pk', ['project_id', 'date'])
      .ifNotExists()
      .execute()

    await db.schema
      .createTable('settings_kv')
      .addColumn('key', 'text', col => col.primaryKey())
      .addColumn('value', 'text', col => col.notNull())
      .ifNotExists()
      .execute()
  }

  protected rowToProject(r: ProjectsTable): Project {
    return {
      id: r.id,
      name: r.name,
      description: r.description ?? '',
      unit: r.unit,
      emoji: r.emoji,
      color: r.color,
      sort: r.sort,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      remoteEtag: r.remote_etag,
      remotePath: r.remote_path,
      deleted: r.deleted as 0 | 1,
      archived: r.archived as 0 | 1,
    }
  }

  protected rowToCheckin(r: CheckinsTable): Checkin {
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
      ? await db.selectFrom('projects').selectAll().orderBy('sort', 'asc').orderBy('updated_at', 'desc').execute()
      : await db.selectFrom('projects').selectAll().where('deleted', '=', 0).orderBy('sort', 'asc').orderBy('updated_at', 'desc').execute()
    return rows.map(r => this.rowToProject(r))
  }

  async getProject(id: string): Promise<Project | undefined> {
    const db = await this.getDb()
    const row = await db.selectFrom('projects').selectAll().where('id', '=', id).executeTakeFirst()
    return row ? this.rowToProject(row) : undefined
  }

  async upsertProject(p: Project): Promise<void> {
    const db = await this.getDb()
    await db.insertInto('projects')
      .values({
        id: p.id,
        name: p.name,
        description: p.description,
        unit: p.unit,
        emoji: p.emoji,
        color: p.color,
        sort: p.sort,
        created_at: p.createdAt,
        updated_at: p.updatedAt,
        remote_etag: p.remoteEtag,
        remote_path: p.remotePath,
        deleted: p.deleted,
        archived: p.archived,
      })
      .onConflict(cb => cb.column('id').doUpdateSet({
        name: p.name,
        description: p.description,
        unit: p.unit,
        emoji: p.emoji,
        color: p.color,
        sort: p.sort,
        created_at: p.createdAt,
        updated_at: p.updatedAt,
        remote_etag: p.remoteEtag,
        remote_path: p.remotePath,
        deleted: p.deleted,
        archived: p.archived,
      }))
      .execute()
  }

  async softDeleteProject(id: string, updatedAt: number): Promise<void> {
    const db = await this.getDb()
    await db.updateTable('projects')
      .set({ deleted: 1, updated_at: updatedAt })
      .where('id', '=', id)
      .execute()
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
    await db.insertInto('checkins')
      .values({
        project_id: c.projectId,
        date: c.date,
        status: c.status,
        value: c.value,
        note: c.note,
        updated_at: c.updatedAt,
      })
      .onConflict(cb => cb.columns(['project_id', 'date']).doUpdateSet({
        status: c.status,
        value: c.value,
        note: c.note,
        updated_at: c.updatedAt,
      }))
      .execute()
  }

  async bulkUpsertCheckins(checkins: Checkin[]): Promise<void> {
    const db = await this.getDb()
    for (const c of checkins) {
      await db.insertInto('checkins')
        .values({
          project_id: c.projectId,
          date: c.date,
          status: c.status,
          value: c.value,
          note: c.note,
          updated_at: c.updatedAt,
        })
        .onConflict(cb => cb.columns(['project_id', 'date']).doUpdateSet({
          status: c.status,
          value: c.value,
          note: c.note,
          updated_at: c.updatedAt,
        }))
        .execute()
    }
  }

  async deleteCheckin(projectId: string, date: string): Promise<void> {
    const db = await this.getDb()
    await db.deleteFrom('checkins')
      .where('project_id', '=', projectId)
      .where('date', '=', date)
      .execute()
  }

  async getKV<T = unknown>(key: string): Promise<T | null> {
    const db = await this.getDb()
    const row = await db.selectFrom('settings_kv').selectAll().where('key', '=', key).executeTakeFirst()
    if (!row) return null
    try { return JSON.parse(row.value) as T } catch { return null }
  }

  async setKV(key: string, value: unknown): Promise<void> {
    const db = await this.getDb()
    const serialized = JSON.stringify(value)
    await db.insertInto('settings_kv')
      .values({ key, value: serialized })
      .onConflict(cb => cb.column('key').doUpdateSet({ value: serialized }))
      .execute()
  }

  async deleteKV(key: string): Promise<void> {
    const db = await this.getDb()
    await db.deleteFrom('settings_kv')
      .where('key', '=', key)
      .execute()
  }
}
