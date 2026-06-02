import type { Repo, DateRange } from './Repo'
import type { Project, Checkin } from '../types'
import type { SQLiteDBConnection } from '@capacitor-community/sqlite'

export class SqliteRepo implements Repo {
  private conn: SQLiteDBConnection | null = null
  private ready: Promise<void> | null = null

  async init(): Promise<void> {
    if (this.ready) return this.ready
    this.ready = this._init()
    await this.ready
  }

  private async _init(): Promise<void> {
    const { SQLiteConnection, CapacitorSQLite } = await import('@capacitor-community/sqlite')
    const sqlite = new SQLiteConnection(CapacitorSQLite as unknown as Record<string, unknown>)
    const dbName = 'daily-habit'
    const cons = await sqlite.checkConnectionsConsistency()
    if (!cons.result) {
      await sqlite.createConnection(dbName, false, 'no-encryption', 1, false)
    }
    this.conn = await sqlite.retrieveConnection(dbName, false)
    await this.conn.open()

    await this.exec(`CREATE TABLE IF NOT EXISTS projects (
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
    )`)
    await this.exec(`CREATE TABLE IF NOT EXISTS checkins (
      project_id TEXT NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL,
      value REAL,
      note TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (project_id, date)
    )`)
    await this.exec(`CREATE TABLE IF NOT EXISTS settings_kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`)
  }

  private async getConn(): Promise<SQLiteDBConnection> {
    await this.init()
    if (!this.conn) throw new Error('SqliteRepo not initialized')
    return this.conn
  }

  private async exec(sql: string, params: unknown[] = []): Promise<void> {
    const conn = await this.getConn()
    await conn.run(sql, params as never)
  }

  private async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    const conn = await this.getConn()
    const r = await conn.query(sql, params as never)
    return (r.values ?? []) as T[]
  }

  private rowToProject(r: any): Project {
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
      deleted: r.deleted,
    }
  }

  private rowToCheckin(r: any): Checkin {
    return {
      projectId: r.project_id,
      date: r.date,
      status: r.status,
      value: r.value,
      note: r.note,
      updatedAt: r.updated_at,
    }
  }

  async listProjects(includeDeleted = false): Promise<Project[]> {
    const sql = includeDeleted
      ? `SELECT * FROM projects ORDER BY updated_at DESC`
      : `SELECT * FROM projects WHERE deleted = 0 ORDER BY updated_at DESC`
    const rows = await this.query(sql)
    return rows.map(r => this.rowToProject(r))
  }

  async getProject(id: string): Promise<Project | undefined> {
    const rows = await this.query(`SELECT * FROM projects WHERE id = ?`, [id])
    return rows.length ? this.rowToProject(rows[0]) : undefined
  }

  async upsertProject(p: Project): Promise<void> {
    await this.exec(
      `INSERT OR REPLACE INTO projects
       (id,name,unit,emoji,color,created_at,updated_at,remote_etag,remote_path,deleted)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [p.id, p.name, p.unit, p.emoji, p.color, p.createdAt, p.updatedAt,
       p.remoteEtag, p.remotePath, p.deleted],
    )
  }

  async softDeleteProject(id: string, updatedAt: number): Promise<void> {
    await this.exec(
      `UPDATE projects SET deleted = 1, updated_at = ? WHERE id = ?`,
      [updatedAt, id],
    )
  }

  async getCheckin(projectId: string, date: string): Promise<Checkin | undefined> {
    const rows = await this.query(
      `SELECT * FROM checkins WHERE project_id = ? AND date = ?`,
      [projectId, date],
    )
    return rows.length ? this.rowToCheckin(rows[0]) : undefined
  }

  async getCheckins(projectId: string, range?: DateRange): Promise<Checkin[]> {
    const params: unknown[] = [projectId]
    let sql = `SELECT * FROM checkins WHERE project_id = ?`
    if (range?.from) { sql += ` AND date >= ?`; params.push(range.from) }
    if (range?.to)   { sql += ` AND date <= ?`; params.push(range.to) }
    sql += ` ORDER BY date ASC`
    const rows = await this.query(sql, params)
    return rows.map(r => this.rowToCheckin(r))
  }

  async upsertCheckin(c: Checkin): Promise<void> {
    await this.exec(
      `INSERT OR REPLACE INTO checkins
       (project_id,date,status,value,note,updated_at)
       VALUES (?,?,?,?,?,?)`,
      [c.projectId, c.date, c.status, c.value, c.note, c.updatedAt],
    )
  }

  async deleteCheckin(projectId: string, date: string): Promise<void> {
    await this.exec(
      `DELETE FROM checkins WHERE project_id = ? AND date = ?`,
      [projectId, date],
    )
  }

  async getKV<T = unknown>(key: string): Promise<T | null> {
    const rows = await this.query(`SELECT value FROM settings_kv WHERE key = ?`, [key])
    if (!rows.length) return null
    try { return JSON.parse((rows[0] as any).value) as T } catch { return null }
  }

  async setKV(key: string, value: unknown): Promise<void> {
    await this.exec(
      `INSERT OR REPLACE INTO settings_kv (key,value) VALUES (?,?)`,
      [key, JSON.stringify(value)],
    )
  }

  async deleteKV(key: string): Promise<void> {
    await this.exec(`DELETE FROM settings_kv WHERE key = ?`, [key])
  }
}
