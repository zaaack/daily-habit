import type { Repo } from './repo/Repo'
import { DexieRepo } from './repo/DexieRepo'
import { SqliteRepo } from './repo/SqliteRepo'
import { isAndroid } from '@/lib/platform'

let _instance: Repo | null = null
let _initPromise: Promise<Repo> | null = null

export async function getRepo(): Promise<Repo> {
  if (_instance) return _instance
  if (_initPromise) return _initPromise

  _initPromise = (async () => {
    const repo: Repo = isAndroid ? new SqliteRepo() : new DexieRepo()
    await repo.init()
    _instance = repo
    return repo
  })()
  return _initPromise
}

export type { Repo }
export * from './types'
export * from './schema'
