import type { Project, Checkin, SettingKV, CheckStatus } from '../types'

export interface DateRange {
  from?: string
  to?: string
}

export interface Repo {
  init(): Promise<void>
  clearDatabase(): Promise<void>
  // projects
  listProjects(includeDeleted?: boolean): Promise<Project[]>
  getProject(id: string): Promise<Project | undefined>
  upsertProject(p: Project): Promise<void>
  softDeleteProject(id: string, updatedAt: number): Promise<void>
  // checkins
  getCheckin(projectId: string, date: string): Promise<Checkin | undefined>
  getCheckins(projectId: string, range?: DateRange): Promise<Checkin[]>
  upsertCheckin(c: Checkin): Promise<void>
  bulkUpsertCheckins(checkins: Checkin[]): Promise<void>
  deleteCheckin(projectId: string, date: string): Promise<void>
  // kv
  getKV<T = unknown>(key: string): Promise<T | null>
  setKV(key: string, value: unknown): Promise<void>
  deleteKV(key: string): Promise<void>
}

export type { Project, Checkin, SettingKV, CheckStatus }
