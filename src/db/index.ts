import type { Repo } from './repo/Repo'
import { isAndroid, isTauri } from '@/lib/platform'

let _instance: Repo | null = null
let _initPromise: Promise<Repo> | null = null

export async function getRepo(): Promise<Repo> {
  if (_instance) return _instance
  if (_initPromise) return _initPromise

  _initPromise = (async () => {
    if (isAndroid) {
      const { SqliteRepo } = await import('./repo/SqliteRepo')
      const repo = new SqliteRepo()
      await repo.init()
      _instance = repo
      return repo
    }

    if (isTauri) {
      const { TauriRepo } = await import('./repo/TauriRepo')
      const repo = new TauriRepo()
      await repo.init()
      _instance = repo
      return repo
    }

    try {
      const { SqlocalRepo } = await import('./repo/SqlocalRepo')
      const repo = new SqlocalRepo()
      await repo.init()
      _instance = repo
      return repo
    } catch {
      console.warn('Sqlocal/OPFS unavailable, falling back to Dexie')
    }

    const { DexieRepo } = await import('./repo/DexieRepo')
    const repo = new DexieRepo()
    await repo.init()
    _instance = repo
    return repo
  })()
  return _initPromise
}

export type { Repo }
export * from './types'
export * from './schema'
