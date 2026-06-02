import { Kysely } from 'kysely'
import { SqliteKyselyRepo, type DB } from './sqlite-kysely-repo'

export class SqlocalRepo extends SqliteKyselyRepo {
  async init(): Promise<void> {
    if (this.ready) return this.ready
    this.ready = (async () => {
      const { SQLocalKysely } = await import('sqlocal/kysely')
      const { dialect } = new SQLocalKysely('daily-habit.sqlite3')
      this.db = new Kysely<DB>({ dialect })
      await this.createTables()
    })()
    await this.ready
  }
}
