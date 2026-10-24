import type { Project, Checkin, CheckStatus, ConflictItem } from "@/db/types";
import { quarterOfDate } from "@/db/schema";

export interface CompactCheckin {
    d: number;
    s: 0 | 1 | -1;
    v: number | null;
    n: string | null;
    u: number;
}

/** 远端项目元数据文件（v3 起打卡按季度拆分到独立文件） */
export interface ProjectMetaFile {
    version: 3;
    project: ProjectMeta;
    /** quarter → checkinsHash，用于只拉取发生变化的季度 */
    quarters?: Record<string, string>;
}

/** 每个季度一个打卡文件，路径为 `{remoteDir}/{projectId}/{year}-Q{n}.json` */
export interface QuarterFile {
    version: 1;
    projectId: string;
    quarter: string;
    checkins: CompactCheckin[];
}

/** 旧版单文件格式（v1 可读格式 / v2 compact 格式），仅用于迁移 */
export interface LegacyProjectFile {
    version: 1 | 2;
    project: ProjectMeta;
    checkins: (CompactCheckin | ReadableCheckin)[];
}

export interface ReadableCheckin {
    date: string;
    status: CheckStatus;
    value: number | null;
    note: string | null;
    updatedAt: number;
}

export interface ReadableProjectFile {
    version: 1;
    project: Omit<Project, "remoteEtag" | "remotePath">;
    checkins: ReadableCheckin[];
}

// ---- date ↔ epoch-day helpers ----

export function dateStrToEpochDay(s: string): number {
    const [y, m, d] = s.split("-").map(Number);
    return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

export function epochDayToDateStr(epochDay: number): string {
    const d = new Date(epochDay * 86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// ---- compact (sync) ↔ Checkin converters ----

export function checkinToCompact(c: Checkin): CompactCheckin {
    return {
        d: dateStrToEpochDay(c.date),
        s: c.status === "deleted" ? -1 : c.status === "success" ? 1 : 0,
        v: c.value,
        n: c.note,
        // 秒（保留小数位以维持毫秒精度），读取时用 Math.round 消除浮点误差
        u: c.updatedAt / 1000,
    };
}

export function compactToCheckin(
    projectId: number | string,
    c: CompactCheckin,
): Checkin {
    return {
        projectId: String(projectId),
        date: epochDayToDateStr(c.d),
        status: c.s === 1 ? "success" : c.s === -1 ? "deleted" : "fail",
        value: c.v,
        note: c.n,
        updatedAt: Math.round(c.u * 1000),
    };
}

export function isDeletedAndEmptyCheckin(c: Checkin): boolean {
    return c.status === "deleted" && c.value === null && !c.note;
}

export type ProjectMeta = Omit<Project, "remoteEtag" | "remotePath">;

export interface MetaMergeResult {
    project: ProjectMeta;
    conflicts: ConflictItem[];
    changed: boolean;
}

export interface CheckinsMergeResult {
    /** 含 tombstone 的完整合并结果，应写入 DB */
    checkinsAll: Checkin[];
    /** 过滤掉 tombstone 的结果，用于 UI */
    checkins: Checkin[];
    conflicts: ConflictItem[];
    changed: boolean;
}

/**
 * Field-level LWW merge for project metadata.
 * updatedAt 相同但字段不同 → 记为项目级冲突。
 */
export function mergeProjectMeta(
    local: ProjectMeta,
    remote: ProjectMeta,
): MetaMergeResult {
    const conflicts: ConflictItem[] = [];
    let project = local;
    let changed = false;

    if (remote.updatedAt > local.updatedAt) {
        project = { ...remote };
        changed = true;
    } else if (remote.updatedAt === local.updatedAt) {
        const sameMeta =
            remote.name === local.name &&
            remote.description === local.description &&
            remote.unit === local.unit &&
            remote.emoji === local.emoji &&
            remote.color === local.color &&
            remote.deleted === local.deleted &&
            remote.archived === local.archived;
        if (!sameMeta) {
            conflicts.push({
                date: "__project__",
                field: "note",
                local: JSON.stringify({
                    name: local.name,
                    description: local.description,
                    unit: local.unit,
                    emoji: local.emoji,
                    color: local.color,
                    deleted: !!local.deleted,
                    archived: !!local.archived,
                }),
                remote: JSON.stringify({
                    name: remote.name,
                    description: remote.description,
                    unit: remote.unit,
                    emoji: remote.emoji,
                    color: remote.color,
                    deleted: !!remote.deleted,
                    archived: !!remote.archived,
                }),
            });
        }
    }

    return { project, conflicts, changed };
}

/**
 * Field-level LWW merge for checkins. 远端列表应按日期去重后传入。
 * 同 date 两端 updatedAt 相同且 status/value/note 任一不同 → 冲突。
 */
export function mergeCheckinLists(
    localCheckins: Checkin[],
    remoteCheckins: Checkin[],
): CheckinsMergeResult {
    const localByDate = new Map(localCheckins.map((c) => [c.date, c]));
    const conflicts: ConflictItem[] = [];
    const merged: Checkin[] = [];
    const seenDates = new Set<string>();

    for (const rc of remoteCheckins) {
        if (seenDates.has(rc.date)) continue;
        seenDates.add(rc.date);
        const lc = localByDate.get(rc.date);
        if (!lc) {
            merged.push(rc);
            continue;
        }
        if (lc.updatedAt === rc.updatedAt) {
            const same =
                lc.status === rc.status &&
                (lc.value ?? null) === (rc.value ?? null) &&
                (lc.note ?? null) === (rc.note ?? null);
            if (!same) {
                const field: "status" | "value" | "note" =
                    lc.status !== rc.status
                        ? "status"
                        : lc.value !== rc.value
                          ? "value"
                          : "note";
                conflicts.push({
                    date: rc.date,
                    field,
                    local: pickField(lc, field),
                    remote: pickField(rc, field),
                });
            }
            merged.push(lc);
            continue;
        }
        const winner = lc.updatedAt > rc.updatedAt ? lc : rc;
        merged.push(winner);
    }

    for (const lc of localCheckins) {
        if (!seenDates.has(lc.date)) merged.push(lc);
    }

    merged.sort((a, b) => a.date.localeCompare(b.date));
    const active = merged.filter((c) => !isDeletedAndEmptyCheckin(c));
    const changed =
        merged.length !== localCheckins.length ||
        merged.some((c) => {
            const lc = localByDate.get(c.date);
            return (
                !lc ||
                lc.status !== c.status ||
                (lc.value ?? null) !== (c.value ?? null) ||
                (lc.note ?? null) !== (c.note ?? null) ||
                lc.updatedAt !== c.updatedAt
            );
        });

    return {
        checkinsAll: merged,
        checkins: active,
        conflicts,
        changed,
    };
}

function pickField(
    c: Checkin,
    f: "status" | "value" | "note",
): string | number | null {
    if (f === "status") return c.status;
    if (f === "value") return c.value;
    return c.note;
}

/** 合并多份远端来源（旧单文件 + 季度文件）时按日期去重，保留 updatedAt 较新者 */
export function dedupeCheckins(checkins: Checkin[]): Checkin[] {
    const byDate = new Map<string, Checkin>();
    for (const c of checkins) {
        const prev = byDate.get(c.date);
        if (!prev || c.updatedAt > prev.updatedAt) byDate.set(c.date, c);
    }
    return [...byDate.values()];
}

export function groupCheckinsByQuarter(
    checkins: Checkin[],
): Map<string, Checkin[]> {
    const groups = new Map<string, Checkin[]>();
    for (const c of checkins) {
        const quarter = quarterOfDate(c.date);
        const list = groups.get(quarter);
        if (list) list.push(c);
        else groups.set(quarter, [c]);
    }
    return groups;
}

function projectTuple(project: ProjectMeta): unknown[] {
    return [
        project.id,
        project.name,
        project.description,
        project.unit ?? null,
        project.emoji,
        project.color,
        project.sort ?? 0,
        project.createdAt,
        project.updatedAt,
        project.deleted,
        project.archived,
    ];
}

function checkinTuples(checkins: Checkin[]): unknown[][] {
    return [...checkins]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((c) => [
            c.date,
            c.status,
            c.value ?? null,
            c.note ?? null,
            c.updatedAt,
        ]);
}

export function projectFingerprint(project: ProjectMeta): string {
    return JSON.stringify(projectTuple(project));
}

export function checkinsFingerprint(checkins: Checkin[]): string {
    return JSON.stringify(checkinTuples(checkins));
}

/** 季度内容摘要，写入项目元数据以避免每轮同步拉取全部季度文件 */
export function checkinsHash(checkins: Checkin[]): string {
    const s = checkinsFingerprint(checkins);
    let hash = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        hash ^= s.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return `${(hash >>> 0).toString(16).padStart(8, "0")}-${s.length.toString(16)}`;
}

export function quarterHashes(checkins: Checkin[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [quarter, list] of groupCheckinsByQuarter(checkins)) {
        out[quarter] = checkinsHash(list);
    }
    return out;
}

/**
 * 状态指纹：字段顺序固定、打卡按日期排序。
 * 用于判断「本地 / 合并结果 / 远端文件」是否等价，是同步上传决策的基础。
 */
export function fingerprint(
    project: ProjectMeta,
    checkins: Checkin[],
): string {
    return JSON.stringify([projectTuple(project), checkinTuples(checkins)]);
}
