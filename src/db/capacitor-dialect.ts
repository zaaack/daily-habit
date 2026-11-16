import type { DatabaseConnection, Driver, Dialect, QueryResult, CompiledQuery, QueryCompiler, DialectAdapter, DatabaseIntrospector } from 'kysely'
import { SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler } from 'kysely'
import type { SQLiteDBConnection } from '@capacitor-community/sqlite'

class CapacitorCommunityConnection implements DatabaseConnection {
  constructor(private conn: SQLiteDBConnection) {}

  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    const { sql, parameters } = compiledQuery
    const values = parameters as unknown[]

    if (this.isSelect(sql)) {
      const result = await this.conn.query(sql, values)
      return { rows: (result.values ?? []) as R[] }
    }

    // transaction: false — Kysely owns begin/commit/rollback (via the driver) ;
    // leaving the plugin default (true) makes native `run` begin another
    // transaction when one is already open, throwing "Already in transaction".
    const result = await this.conn.run(sql, values, false)
    return {
      numAffectedRows: result.changes?.changes !== undefined ? BigInt(result.changes.changes) : undefined,
      insertId: result.changes?.lastId !== undefined ? BigInt(result.changes.lastId) : undefined,
      rows: [],
    }
  }

  streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error('Streaming is not supported.')
  }

  // Mirror the engine adapter's READ_SQL: everything that yields rows must go
  // through conn.query(); conn.run() throws "code 100: another row available"
  // when a statement produces a result set (e.g. PRAGMA table_info).
  private isSelect(sql: string): boolean {
    return /^\s*(select|pragma|with|values|explain)\b/i.test(sql)
  }
}

class CapacitorCommunityDriver implements Driver {
  constructor(private conn: SQLiteDBConnection) {}

  async init(): Promise<void> {}

  async acquireConnection(): Promise<DatabaseConnection> {
    return new CapacitorCommunityConnection(this.conn)
  }

  async beginTransaction(): Promise<void> {
    await this.conn.beginTransaction()
  }

  async commitTransaction(): Promise<void> {
    await this.conn.commitTransaction()
  }

  async rollbackTransaction(): Promise<void> {
    await this.conn.rollbackTransaction()
  }

  async releaseConnection(): Promise<void> {}

  async destroy(): Promise<void> {}
}

export class CapacitorCommunitySqliteDialect implements Dialect {
  constructor(private conn: SQLiteDBConnection) {}

  createAdapter(): DialectAdapter {
    return new SqliteAdapter()
  }

  createDriver(): Driver {
    return new CapacitorCommunityDriver(this.conn)
  }

  createIntrospector(db: any): DatabaseIntrospector {
    return new SqliteIntrospector(db)
  }

  createQueryCompiler(): QueryCompiler {
    return new SqliteQueryCompiler()
  }
}
