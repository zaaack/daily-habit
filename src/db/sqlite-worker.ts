import { createOnMessageCallback, defaultCreateDatabaseFn } from 'kysely-wasqlite-worker'

// Custom worker: delegates to the built-in SQL executor. No custom requests
// (export/reset) needed — the demo's extra requests are only for the clear/export
// UI, which this app does through Kysely and the engine instead.
createOnMessageCallback(defaultCreateDatabaseFn)