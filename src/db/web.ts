import { CompiledQuery, Kysely } from 'kysely'
import { WaSqliteWorkerDialect } from 'kysely-wasqlite-worker'
import wasmAssetUrl from '@subframe7536/sqlite-wasm/dist/wa-sqlite-async.wasm?url'
import { fromKysely } from 'sqlite-remote-sync'
import type { SqliteAdapter } from 'sqlite-remote-sync'
import { DDL_STATEMENTS, type DB, type Boot } from './db'

// SQLite pages live in the VFS's own IndexedDB store (`<fileName>.db`). A fixed
// fileName keeps one database per browser profile (one "device").
const FILE_NAME = 'daily-habit.sqlite'

// `base: './'`/GitHub Pages makes Vite emit a document-relative URL, but the
// worker's locateFile() resolves it against the worker chunk. Resolve absolute.
const WASM_URL = new URL(wasmAssetUrl, document.baseURI).href

export async function initWebDB(): Promise<Boot> {
  const dialect = new WaSqliteWorkerDialect({
    fileName: FILE_NAME,
    // IndexedDB VFS (IDBBatchAtomicVFS), not OPFS — no COOP/COEP headers needed
    // on GitHub Pages / Cloudflare Pages.
    preferOPFS: false,
    url: () => WASM_URL,
    worker: () => new Worker(new URL('./sqlite-worker.ts', import.meta.url), { type: 'module' }),
  })

  const db = new Kysely<DB>({ dialect })
  // Run each statement separately, then force the worker's async driver.init()
  // (and schema creation) to finish before handing the instance to the engine.
  for (const stmt of DDL_STATEMENTS) {
    await db.executeQuery(CompiledQuery.raw(stmt))
  }

  const adapter = fromKysely(db, {
    compiledQuery: (sql, params) => CompiledQuery.raw(sql, params),
  })

  return { db, adapter }
}