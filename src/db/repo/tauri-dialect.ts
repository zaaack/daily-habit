import type { DatabaseConnection, Driver, Dialect, QueryResult, CompiledQuery, QueryCompiler, DialectAdapter, DatabaseIntrospector, Kysely } from 'kysely'
import { SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler } from 'kysely'

interface TauriDb {
  select<T>(sql: string, bindings?: unknown[]): Promise<T>
  execute(sql: string, bindings?: unknown[]): Promise<{ lastInsertId?: number; rowsAffected: number }>
}

class TauriConnection implements DatabaseConnection {
  constructor(private db: TauriDb) {}

  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    const { sql, parameters } = compiledQuery
    const values = parameters as unknown[]

    if (this.isSelect(sql)) {
      const rows = await this.db.select<R[]>(sql, values)
      return { rows }
    }

    const result = await this.db.execute(sql, values)
    return {
      numAffectedRows: result.rowsAffected !== undefined ? BigInt(result.rowsAffected) : undefined,
      insertId: result.lastInsertId !== undefined ? BigInt(result.lastInsertId) : undefined,
      rows: [],
    }
  }

  streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error('Streaming is not supported.')
  }

  private isSelect(sql: string): boolean {
    const upper = sql.trimStart().toUpperCase()
    return upper.startsWith('SELECT') || upper.includes('RETURNING')
  }
}

class TauriDriver implements Driver {
  constructor(private db: TauriDb) {}

  async init(): Promise<void> {}

  async acquireConnection(): Promise<DatabaseConnection> {
    return new TauriConnection(this.db)
  }

  async beginTransaction(): Promise<void> {
    await this.db.execute('BEGIN TRANSACTION')
  }

  async commitTransaction(): Promise<void> {
    await this.db.execute('COMMIT')
  }

  async rollbackTransaction(): Promise<void> {
    await this.db.execute('ROLLBACK')
  }

  async releaseConnection(): Promise<void> {}

  async destroy(): Promise<void> {}
}

export class TauriDialect implements Dialect {
  constructor(private db: TauriDb) {}

  createAdapter(): DialectAdapter {
    return new SqliteAdapter()
  }

  createDriver(): Driver {
    return new TauriDriver(this.db)
  }

  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return new SqliteIntrospector(db as any)
  }

  createQueryCompiler(): QueryCompiler {
    return new SqliteQueryCompiler()
  }
}
