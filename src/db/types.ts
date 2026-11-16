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

/** A conflict auto-resolved by the sync engine, surfaced as a notice. */
export interface ConflictNotice {
  seq: number
  tbl: string
  pk: string
  at: number
}
