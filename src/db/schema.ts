import type { Project, Checkin, CheckStatus } from './types'

export const SCHEMA_VERSION = 2

export const PROJECT_COLORS = [
  '#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4',
  '#ec4899', '#84cc16', '#f97316', '#14b8a6',
]

export const PROJECT_EMOJIS = [
  '📚', '🏃', '💧', '🧘', '✍️', '🎨', '🎵', '🍎',
  '☕', '💤', '🧹', '💪', '🌱', '🚴', '📝', '🧠',
]

export const DEFAULT_REMOTE_DIR = '/daily-habit'

export function makeRemotePath(id: string, dir: string = DEFAULT_REMOTE_DIR): string {
  const d = dir.endsWith('/') ? dir.slice(0, -1) : dir
  return `${d}/${id}.json`
}

export function makeProjectId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16)
}

export function nowMs(): number {
  return Date.now()
}

export function todayStr(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function shiftDateStr(s: string, days: number): string {
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  return todayStr(dt)
}

export function monthDays(year: number, month: number): string[] {
  const days = new Date(year, month + 1, 0).getDate()
  return Array.from({ length: days }, (_, i) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`,
  )
}

export type { Project, Checkin, CheckStatus }
