import { CompiledQuery, Kysely } from 'kysely'
import { fromKysely } from 'sqlite-remote-sync'
import type { SqliteAdapter } from 'sqlite-remote-sync'
import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import { CapacitorCommunitySqliteDialect } from './capacitor-dialect'
import { DDL_STATEMENTS, type DB, type Boot } from './db'

// Android keeps native Capacitor SQLite storage. The Kysely dialect wraps the
// connection; the sync engine runs through the same Kysely instance.
let conn: SQLiteDBConnection | null = null

export async function initAndroidDB(): Promise<Boot> {
  const { SQLiteConnection, CapacitorSQLite } = await import('@capacitor-community/sqlite')
  const sqlite = new SQLiteConnection(CapacitorSQLite as unknown as Record<string, unknown>)
  const dbName = 'daily-habit'
  const cons = await sqlite.checkConnectionsConsistency()
  if (!cons.result) {
    await sqlite.createConnection(dbName, false, 'no-encryption', 1, false)
  }
  const c = await sqlite.retrieveConnection(dbName, false)
  await c.open()
  conn = c

  const db = new Kysely<DB>({
    dialect: new CapacitorCommunitySqliteDialect(c),
  })
  for (const stmt of DDL_STATEMENTS) {
    await db.executeQuery(CompiledQuery.raw(stmt))
  }

  const adapter = fromKysely(db, {
    compiledQuery: (sql, params) => CompiledQuery.raw(sql, params),
  })

  return { db, adapter }
}

export { conn }