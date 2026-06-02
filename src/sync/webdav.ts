import type { WebDAVClient } from 'webdav'

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
  const { createClient } = await import('webdav')
  _client = createClient(cfg.url, {
    username: cfg.username,
    password: cfg.password,
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
