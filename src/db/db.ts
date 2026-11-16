import type { Project, Checkin, CheckStatus } from './types'
import type { Kysely } from 'kysely'

/** Result of opening the platform DB: the Kysely instance + its sync adapter. */
export interface Boot {
  db: Kysely<DB>
  adapter: import('sqlite-remote-sync').SqliteAdapter
}

/** SQLite row shape for the `projects` table. */
export interface ProjectsRow {
  id: string
  name: string
  description: string
  unit: string | null
  emoji: string
  color: string
  sort: number
  created_at: number
  updated_at: number
  deleted: number
  archived: number
}

/** SQLite row shape for the `checkins` table. */
export interface CheckinsRow {
  project_id: string
  date: string
  status: string
  value: number | null
  note: string | null
  updated_at: number
}

/** Kysely schema. Only `projects` and `checkins` are synced by the engine. */
export interface DB {
  projects: ProjectsRow
  checkins: CheckinsRow
}

/**
 * DDL statements executed one at a time on every platform. Multi-statement
 * `COMPOUND` strings don't run reliably through some Kysely dialects, and the
 * sync engine discovers tables via `PRAGMA table_info`, so every table must
 * exist before the engine is created.
 */
export const DDL_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS projects (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  unit       TEXT,
  emoji      TEXT NOT NULL,
  color      TEXT NOT NULL,
  sort       REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  archived   INTEGER NOT NULL DEFAULT 0
)`,
  `CREATE TABLE IF NOT EXISTS checkins (
  project_id TEXT NOT NULL,
  date       TEXT NOT NULL,
  status     TEXT NOT NULL,
  value      REAL,
  note       TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (project_id, date)
)`,
]

/** Convenience: raw DDL executed as a single string (legacy). */
export const DDL = DDL_STATEMENTS.join(';\n')

export function rowToProject(r: ProjectsRow): Project {
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
    deleted: r.deleted as 0 | 1,
    archived: r.archived as 0 | 1,
  }
}

export function projectToRow(p: Project): ProjectsRow {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    unit: p.unit,
    emoji: p.emoji,
    color: p.color,
    sort: p.sort,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    deleted: p.deleted,
    archived: p.archived,
  }
}

export function rowToCheckin(r: CheckinsRow): Checkin {
  return {
    projectId: r.project_id,
    date: r.date,
    status: r.status as CheckStatus,
    value: r.value,
    note: r.note,
    updatedAt: r.updated_at,
  }
}

export function checkinToRow(c: Checkin): CheckinsRow {
  return {
    project_id: c.projectId,
    date: c.date,
    status: c.status,
    value: c.value,
    note: c.note,
    updated_at: c.updatedAt,
  }
}