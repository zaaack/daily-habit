import type { Project, Checkin, CheckStatus, ConflictItem } from "@/db/types";

export interface CompactCheckin {
    d: number;
    s: 0 | 1 | -1;
    v: number | null;
    n: string | null;
    u: number;
}

export interface ProjectFile {
    version: 2;
    project: Omit<Project, "remoteEtag" | "remotePath">;
    checkins: CompactCheckin[];
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

type ProjectMeta = Omit<Project, "remoteEtag" | "remotePath">;

export interface MergeResult {
    project: ProjectMeta;
    /** 含 tombstone 的完整合并结果，应写入 DB */
    checkinsAll: Checkin[];
    /** 过滤掉 tombstone 的结果，用于 UI 和 re-upload */
    checkins: Checkin[];
    conflicts: ConflictItem[];
    changed: boolean;
}

export function emptyMergeResult(
    project: ProjectMeta,
    checkins: Checkin[] = [],
): MergeResult {
    return {
        project,
        checkinsAll: checkins,
        checkins,
        conflicts: [],
        changed: false,
    };
}

/**
 * Field-level LWW merge.
 * - project 字段按 project.updatedAt 整体取较新者
 * - checkins 按 (projectId, date) 联合：每条取 updatedAt 大者；
 *   同 date 两端都被改过且 status/value/note 任一不同 → 冲突
 */
export function mergeProjectFile(
    local: ProjectMeta,
    localCheckins: Checkin[],
    remote: ProjectFile,
): MergeResult {
    const remoteCheckins: Checkin[] = remote.checkins.map((c) =>
        compactToCheckin(remote.project.id, c),
    );
    const conflicts: ConflictItem[] = [];
    let project = local;
    let projectChanged = false;

    if (remote.project.updatedAt > local.updatedAt) {
        project = { ...remote.project };
        projectChanged = true;
    } else if (remote.project.updatedAt === local.updatedAt) {
        const sameMeta =
            remote.project.name === local.name &&
            remote.project.description === local.description &&
            remote.project.unit === local.unit &&
            remote.project.emoji === local.emoji &&
            remote.project.color === local.color &&
            remote.project.deleted === local.deleted &&
            remote.project.archived === local.archived;
        if (!sameMeta) {
            // 视为冲突；用项目维度冲突标记
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
                    name: remote.project.name,
                    description: remote.project.description,
                    unit: remote.project.unit,
                    emoji: remote.project.emoji,
                    color: remote.project.color,
                    deleted: !!remote.project.deleted,
                    archived: !!remote.project.archived,
                }),
            });
        }
    }

    const map = new Map<string, Checkin>();
    for (const c of localCheckins) map.set(c.date, c);
    const merged: Checkin[] = [];
    const seenDates = new Set<string>();

    for (const rc of remoteCheckins) {
        seenDates.add(rc.date);
        const lc = map.get(rc.date);
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
        projectChanged ||
        merged.length !== localCheckins.length ||
        merged.some((c, i) => c.updatedAt !== localCheckins[i]?.updatedAt);
    return {
        project,
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

/**
 * 状态指纹：字段顺序固定、打卡按日期排序。
 * 用于判断「本地 / 合并结果 / 远端文件」是否等价，是同步上传决策的基础。
 */
export function fingerprint(
    project: ProjectMeta,
    checkins: Checkin[],
): string {
    return JSON.stringify([
        [
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
        ],
        [...checkins]
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((c) => [
                c.date,
                c.status,
                c.value ?? null,
                c.note ?? null,
                c.updatedAt,
            ]),
    ]);
}

/** 远端文件的状态指纹 */
export function projectFileFingerprint(file: ProjectFile): string {
    return fingerprint(
        file.project,
        file.checkins.map((c) =>
            compactToCheckin(file.project.id, c),
        ),
    );
}
