export type CheckStatus = 'success' | 'fail' | 'deleted'

export interface Project {
  id: string
  name: string
  description: string
  unit: string | null
  emoji: string
  color: string
  sort: number
  createdAt: number
  updatedAt: number
  remoteEtag: string | null
  remotePath: string
  deleted: 0 | 1
  archived: 0 | 1
}

export interface Checkin {
  projectId: string
  date: string
  status: CheckStatus
  value: number | null
  note: string | null
  updatedAt: number
}

export interface SettingKV {
  key: string
  value: string
}

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'error' | 'conflict' | 'no-config'

export interface SyncState {
  status: SyncStatus
  at: number | null
  error: string | null
  pending: number
}

export interface ConflictItem {
  date: string
  field: 'status' | 'value' | 'note'
  local: string | number | null
  remote: string | number | null
  resolution?: 'local' | 'remote' | 'merge'
}
