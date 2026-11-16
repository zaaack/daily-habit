import type { Kysely } from 'kysely'
import type { SqliteAdapter } from 'sqlite-remote-sync'
import { isAndroid } from '@/lib/platform'
import { initWebDB } from './web'
import { initAndroidDB } from './android'
import type { DB } from './db'

let _db: Kysely<DB> | null = null
let _adapter: SqliteAdapter | null = null
let _bootPromise: Promise<void> | null = null

async function doBoot(): Promise<void> {
  const { db, adapter } = isAndroid ? await initAndroidDB() : await initWebDB()
  _db = db
  _adapter = adapter
}

export async function initDB(): Promise<void> {
  if (_bootPromise) return _bootPromise
  _bootPromise = doBoot().catch((e) => {
    _bootPromise = null
    throw e
  })
  return _bootPromise
}

export function getDB(): Kysely<DB> {
  if (!_db) throw new Error('DB not initialized. Call initDB() first.')
  return _db
}

/** The sqlite-remote-sync adapter for the sync engine. */
export function getAdapter(): SqliteAdapter {
  if (!_adapter) throw new Error('DB not initialized. Call initDB() first.')
  return _adapter
}

/** Wipe all rows (used by "clear all data"). Keeps the schema + engine meta tables. */
export async function clearAll(): Promise<void> {
  const db = getDB()
  await db.deleteFrom('checkins').execute()
  await db.deleteFrom('projects').execute()
}

export type { DB } from './db'
export { rowToProject, rowToCheckin, projectToRow, checkinToRow } from './db'
export * from './schema'
export * from './types'