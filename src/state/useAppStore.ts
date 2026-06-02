import { create } from "zustand";
import {
    getRepo,
    makeProjectId,
    makeRemotePath,
    nowMs,
    todayStr,
    DEFAULT_REMOTE_DIR,
} from "@/db";
import type { Project, Checkin, SyncState, CheckStatus } from "@/db/types";
import { runFullSync, syncOneProject } from "@/sync/fullSync";
import type { ConflictItem } from "@/db/types";

function sortProjects(projects: Project[]): Project[] {
    return [...projects].sort(
        (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || b.updatedAt - a.updatedAt,
    );
}

interface FilterState {
    normal: boolean;
    archived: boolean;
    deleted: boolean;
}

interface AppState {
    ready: boolean;
    projects: Project[];
    sync: SyncState;
    conflicts: Record<string, ConflictItem[]>;
    filterState: FilterState;

    init(): Promise<void>;

    addProject(input: {
        name: string;
        description?: string;
        unit: string | null;
        emoji: string;
        color: string;
    }): Promise<Project>;
    updateProject(
        id: string,
        patch: Partial<
            Pick<Project, "name" | "description" | "unit" | "emoji" | "color">
        >,
    ): Promise<void>;
    deleteProject(id: string): Promise<void>;
    restoreProject(id: string): Promise<void>;
    archiveProject(id: string): Promise<void>;
    unarchiveProject(id: string): Promise<void>;

    cycleCheckin(projectId: string, date: string): Promise<void>;
    setCheckin(
        projectId: string,
        date: string,
        status: CheckStatus | null,
        value: number | null,
        note: string | null,
    ): Promise<void>;

    triggerSync(): Promise<void>;
    reorderProjects(orderedIds: string[]): Promise<void>;
    resolveConflict(projectId: string, items: ConflictItem[]): Promise<void>;
    clearConflict(projectId: string): Promise<void>;
    setFilterState(state: FilterState): void;
}

let _syncInterval: ReturnType<typeof setInterval> | null = null;

export const useAppStore = create<AppState>((set, get) => ({
    ready: false,
    projects: [],
    sync: { status: "idle", at: null, error: null, pending: 0 },
    conflicts: {},
    filterState: { normal: true, archived: false, deleted: false },

    async init() {
        const timeout = new Promise<never>((_, reject) =>
            setTimeout(
                () => reject(new Error("初始化超时，请检查数据库连接")),
                15000,
            ),
        );
        try {
            const inner = (async () => {
                const repo = await getRepo();
                const lastSyncAt = await repo.getKV<number>("sync.lastAt");
                const lastSyncErr = await repo.getKV<string>("sync.lastError");
                const projects = sortProjects(await repo.listProjects());
                set({
                    projects,
                    sync: {
                        status: lastSyncErr ? "error" : "ok",
                        at: lastSyncAt ?? null,
                        error: lastSyncErr ?? null,
                        pending: 0,
                    },
                    ready: true,
                });
                void get().triggerSync();

                if (!_syncInterval) {
                    // 每 5 分钟定期检查云端同步
                    _syncInterval = setInterval(
                        () => {
                            // 只在非 syncing 状态下触发，避免堆积
                            const s = useAppStore.getState().sync;
                            if (s.status !== "syncing") {
                                void useAppStore.getState().triggerSync();
                            }
                        },
                        5 * 60 * 1000,
                    );
                }
            })();
            await Promise.race([inner, timeout]);
        } catch (e) {
            set({
                sync: {
                    status: "error",
                    at: null,
                    error: e instanceof Error ? e.message : String(e),
                    pending: 0,
                },
                ready: true,
            });
        }
    },

    async addProject({ name, description, unit, emoji, color }) {
        const repo = await getRepo();
        const now = nowMs();
        const id = makeProjectId();
        const project: Project = {
            id,
            name: name.trim(),
            description: description?.trim() ?? "",
            unit: unit?.trim() || null,
            emoji,
            color,
            sort: 0,
            createdAt: now,
            updatedAt: now,
            remoteEtag: null,
            remotePath: makeRemotePath(id, DEFAULT_REMOTE_DIR),
            deleted: 0,
            archived: 0,
        };
        await repo.upsertProject(project);
        set((s) => ({ projects: sortProjects([project, ...s.projects]) }));
        void get().triggerSync();
        return project;
    },

    async updateProject(id, patch) {
        const repo = await getRepo();
        const cur = await repo.getProject(id);
        if (!cur) return;
        const next: Project = { ...cur, ...patch, updatedAt: nowMs() };
        await repo.upsertProject(next);
        set((s) => ({
            projects: s.projects.map((p) => (p.id === id ? next : p)),
        }));
        void syncOneProject(id).catch(() => {});
    },

    async deleteProject(id) {
        const repo = await getRepo();
        const now = nowMs();
        await repo.softDeleteProject(id, now);
        const cur = await repo.getProject(id);
        if (cur) {
            const next: Project = { ...cur, deleted: 1, updatedAt: now };
            set((s) => ({
                projects: s.projects.map((p) => (p.id === id ? next : p)),
            }));
        }
        void get().triggerSync();
    },

    async restoreProject(id) {
        const repo = await getRepo();
        const cur = await repo.getProject(id);
        if (!cur) return;
        const now = nowMs();
        const next: Project = { ...cur, deleted: 0, updatedAt: now };
        await repo.upsertProject(next);
        set((s) => ({
            projects: sortProjects(
                s.projects.map((p) => (p.id === id ? next : p)),
            ),
        }));
        void get().triggerSync();
    },

    async archiveProject(id) {
        const repo = await getRepo();
        const cur = await repo.getProject(id);
        if (!cur) return;
        const now = nowMs();
        const next: Project = { ...cur, archived: 1, updatedAt: now };
        await repo.upsertProject(next);
        set((s) => ({
            projects: sortProjects(
                s.projects.map((p) => (p.id === id ? next : p)),
            ),
        }));
        void get().triggerSync();
    },

    async unarchiveProject(id) {
        const repo = await getRepo();
        const cur = await repo.getProject(id);
        if (!cur) return;
        const now = nowMs();
        const next: Project = { ...cur, archived: 0, updatedAt: now };
        await repo.upsertProject(next);
        set((s) => ({
            projects: sortProjects(
                s.projects.map((p) => (p.id === id ? next : p)),
            ),
        }));
        void get().triggerSync();
    },

    async cycleCheckin(projectId, date) {
        const repo = await getRepo();
        const cur = await repo.getCheckin(projectId, date);
        let nextStatus: CheckStatus | null;
        if (!cur) nextStatus = "success";
        else if (cur.status === "success") nextStatus = "fail";
        else nextStatus = null;
        if (nextStatus === null) {
            await repo.deleteCheckin(projectId, date);
        } else {
            const c: Checkin = {
                projectId,
                date,
                status: nextStatus,
                value: cur?.value ?? null,
                note: cur?.note ?? null,
                updatedAt: nowMs(),
            };
            await repo.upsertCheckin(c);
        }
        void syncOneProject(projectId).catch(() => {});
    },

    async setCheckin(projectId, date, status, value, note) {
        const repo = await getRepo();
        if (status === null) {
            await repo.deleteCheckin(projectId, date);
        } else {
            const c: Checkin = {
                projectId,
                date,
                status,
                value,
                note,
                updatedAt: nowMs(),
            };
            await repo.upsertCheckin(c);
        }
        void syncOneProject(projectId).catch(() => {});
    },

    async triggerSync() {
        const repo = await getRepo();
        set((s) => ({
            sync: { ...s.sync, status: "syncing", pending: s.sync.pending + 1 },
        }));
        try {
            await runFullSync(repo, {
                onConflict: (projectId, items) => {
                    set((s) => ({
                        conflicts: { ...s.conflicts, [projectId]: items },
                    }));
                },
                onProjectsChange: (projects) => {
                    set({ projects: sortProjects(projects) });
                },
            });
            const at = nowMs();
            await repo.setKV("sync.lastAt", at);
            await repo.deleteKV("sync.lastError");
            set((s) => ({
                sync: {
                    ...s.sync,
                    status: "ok",
                    at,
                    error: null,
                    pending: Math.max(0, s.sync.pending - 1),
                },
            }));
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            await repo.setKV("sync.lastError", msg);
            set((s) => ({
                sync: {
                    ...s.sync,
                    status: "error",
                    error: msg,
                    pending: Math.max(0, s.sync.pending - 1),
                },
            }));
        }
    },

    async reorderProjects(orderedIds) {
        const repo = await getRepo();
        const now = nowMs();
        const projects = get().projects;
        const idSort = new Map(orderedIds.map((id, i) => [id, i]));
        const next = projects.map((p) => {
            const sort = idSort.get(p.id);
            return sort !== undefined ? { ...p, sort, updatedAt: now } : p;
        });
        for (const p of next) {
            if (idSort.has(p.id)) await repo.upsertProject(p);
        }
        set({ projects: sortProjects(next) });
        void get().triggerSync();
    },

    async resolveConflict(projectId, items) {
        const repo = await getRepo();
        const resolvedItems = items.map((i) => ({
            ...i,
            resolution: i.resolution ?? ("local" as const),
        }));
        for (const it of resolvedItems) {
            const cur = await repo.getCheckin(projectId, it.date);
            if (it.resolution === "local") continue;
            if (it.resolution === "remote") {
                if (cur) {
                    if (it.field === "status") {
                        if (it.remote === null)
                            await repo.deleteCheckin(projectId, it.date);
                        else
                            await repo.upsertCheckin({
                                ...cur,
                                status: it.remote as CheckStatus,
                                updatedAt: nowMs(),
                            });
                    } else if (it.field === "value") {
                        await repo.upsertCheckin({
                            ...cur,
                            value: it.remote as number | null,
                            updatedAt: nowMs(),
                        });
                    } else if (it.field === "note") {
                        await repo.upsertCheckin({
                            ...cur,
                            note: it.remote as string | null,
                            updatedAt: nowMs(),
                        });
                    }
                } else if (it.remote !== null) {
                    await repo.upsertCheckin({
                        projectId,
                        date: it.date,
                        status: "success",
                        value: null,
                        note: null,
                        updatedAt: nowMs(),
                    });
                }
            }
        }
        set((s) => {
            const c = { ...s.conflicts };
            delete c[projectId];
            return { conflicts: c };
        });
        void get().triggerSync();
    },

    async clearConflict(projectId) {
        set((s) => {
            const c = { ...s.conflicts };
            delete c[projectId];
            return { conflicts: c };
        });
    },

    setFilterState(state) {
        set({ filterState: state });
    },
}));

export { todayStr };
