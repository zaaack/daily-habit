import { Kysely } from 'kysely'
import { SqliteKyselyRepo, type DB } from './sqlite-kysely-repo'
import { CapacitorCommunitySqliteDialect } from './capacitor-community-dialect'
import type { SQLiteDBConnection } from '@capacitor-community/sqlite'

export class SqliteRepo extends SqliteKyselyRepo {
  private conn: SQLiteDBConnection | null = null

  async init(): Promise<void> {
    if (this.ready) return this.ready
    this.ready = (async () => {
      const { SQLiteConnection, CapacitorSQLite } = await import('@capacitor-community/sqlite')
      const sqlite = new SQLiteConnection(CapacitorSQLite as unknown as Record<string, unknown>)
      const dbName = 'daily-habit'
      const cons = await sqlite.checkConnectionsConsistency()
      if (!cons.result) {
        await sqlite.createConnection(dbName, false, 'no-encryption', 1, false)
      }
      this.conn = await sqlite.retrieveConnection(dbName, false)
      await this.conn.open()

      this.db = new Kysely<DB>({
        dialect: new CapacitorCommunitySqliteDialect(this.conn),
      })
      await this.createTables()
    })()
    await this.ready
  }
}
