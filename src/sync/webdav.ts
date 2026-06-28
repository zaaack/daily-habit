import type { WebDAVClient } from 'webdav'
import { isWails } from '@/lib/platform'

export interface WebDavConfig {
  url: string
  username: string
  password: string
  remoteDir: string
}

let _client: WebDAVClient | null = null
let _clientCfg: WebDavConfig | null = null

export async function getClient(cfg: WebDavConfig): Promise<WebDAVClient> {
  if (_client && _clientCfg && sameCfg(_clientCfg, cfg)) return _client

  let url = cfg.url
  let username = cfg.username
  let password = cfg.password

  if (isWails) {
    const go = (window as any).go
    if (go?.main?.App) {
      await go.main.App.SetWebdavProxyTarget(cfg.url)
      const port = await go.main.App.GetProxyPort()
      if (port > 0) {
        url = `http://127.0.0.1:${port}`
      }
    }
  }

  const { createClient } = await import('webdav')
  _client = createClient(url, {
    username,
    password,
  })
  _clientCfg = cfg
  return _client
}

export function resetClient() {
  _client = null
  _clientCfg = null
}

function sameCfg(a: WebDavConfig, b: WebDavConfig) {
  return a.url === b.url && a.username === b.username && a.password === b.password && a.remoteDir === b.remoteDir
}

export function normalizeDir(dir: string): string {
  if (!dir) return '/daily-habit'
  return dir.startsWith('/') ? dir : `/${dir}`
}
