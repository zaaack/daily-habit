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

    const result = await this.conn.run(sql, values)
    return {
      numAffectedRows: result.changes?.changes !== undefined ? BigInt(result.changes.changes) : undefined,
      insertId: result.changes?.lastId !== undefined ? BigInt(result.changes.lastId) : undefined,
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
