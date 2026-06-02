import { Kysely } from 'kysely'
import { SqliteKyselyRepo, type DB } from './sqlite-kysely-repo'
import { TauriDialect } from './tauri-dialect'

export class TauriRepo extends SqliteKyselyRepo {
  async init(): Promise<void> {
    if (this.ready) return this.ready
    this.ready = (async () => {
      const Database = (await import('@tauri-apps/plugin-sql')).default
      const db = await Database.load('sqlite:daily-habit.db')
      this.db = new Kysely<DB>({ dialect: new TauriDialect(db) })
      await this.createTables()
    })()
    await this.ready
  }
}
