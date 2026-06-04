import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    RotateCcw,
    Settings as SettingsIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/state/useAppStore";
import { todayStr } from "@/db/schema";
import type { Checkin } from "@/db/types";
import { StatusCell } from "@/components/StatusCell";
import { ProjectEditor } from "@/components/ProjectEditor";
import { MonthlyStatsChart } from "@/components/MonthlyStatsChart";
import { ValueTrendChart } from "@/components/ValueTrendChart";
import { cn } from "@/lib/cn";

interface WeekRow {
    monthLabel: string | null;
    days: (string | null)[];
}

function dateToStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getSunday(dateStr: string): Date {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() - d.getDay());
    return d;
}

function monthDiff(y1: number, m1: number, y2: number, m2: number): number {
    return (y2 - y1) * 12 + (m2 - m1);
}

function pageToMonthYear(pageNum: number): [number, number] {
    const [ty, tm] = todayStr().split("-").map(Number);
    let total = ty * 12 + (tm - 1) + pageNum;
    return [Math.floor(total / 12), (total % 12) + 1];
}

function buildPage(pageNum: number): WeekRow[] {
    const [targetYear, targetMonth] = pageToMonthYear(pageNum);
    const firstOfMonth = new Date(targetYear, targetMonth - 1, 1);
    const startSunday = getSunday(dateToStr(firstOfMonth));

    const result: WeekRow[] = [];
    let prevMonth = -1;

    for (let w = 0; w < 5; w++) {
        const days: (string | null)[] = [];
        for (let d = 0; d < 7; d++) {
            const date = new Date(startSunday);
            date.setDate(date.getDate() + w * 7 + d);
            days.push(dateToStr(date));
        }
        const midDate = new Date(startSunday);
        midDate.setDate(midDate.getDate() + w * 7 + 3);
        const month = midDate.getMonth();
        result.push({
            monthLabel:
                prevMonth !== month
                    ? `${midDate.getFullYear()}-${String(month + 1).padStart(2, "0")}`
                    : null,
            days,
        });
        prevMonth = month;
    }
    return result;
}

export function ProjectDetail() {
    const { t } = useTranslation();
    const { id = "" } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const projects = useAppStore((s) => s.projects);
    const cycle = useAppStore((s) => s.cycleCheckin);
    const checkinVersion = useAppStore((s) => s.checkinVersion);
    const project = useMemo(
        () => projects.find((p) => p.id === id),
        [projects, id],
    );
    const [checkins, setCheckins] = useState<Checkin[]>([]);
    const [editorOpen, setEditorOpen] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);

    const today = todayStr();
    const [pageNum, setPageNum] = useState(0);
    const [dragY, setDragY] = useState(0);
    const dragging = useRef(false);
    const startY = useRef(0);
    const [pageH, setPageH] = useState(0);
    const currRef = useRef<HTMLDivElement>(null);
    const calendarRef = useRef<HTMLDivElement>(null);
    const wheelTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
        undefined,
    );

    const pages = useMemo(
        () => ({
            prev: buildPage(pageNum - 1),
            curr: buildPage(pageNum),
            next: buildPage(pageNum + 1),
        }),
        [pageNum],
    );

    const [viewYear, viewMonth] = useMemo(
        () => pageToMonthYear(pageNum),
        [pageNum],
    );

    useEffect(() => {
        const el = currRef.current;
        if (!el) return;
        const measure = () => setPageH(el.offsetHeight);
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, [pageNum]);

    const snapToPage = useCallback(
        (deltaY: number) => {
            const threshold = pageH * 0.2;
            if (deltaY < -threshold) setPageNum((p) => p + 1);
            else if (deltaY > threshold) setPageNum((p) => p - 1);
            setDragY(0);
        },
        [pageH],
    );

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        dragging.current = true;
        startY.current = e.clientY;
        setDragY(0);
    }, []);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        if (!dragging.current) return;
        setDragY(e.clientY - startY.current);
    }, []);

    const onPointerUp = useCallback(
        (e: React.PointerEvent) => {
            if (!dragging.current) return;
            dragging.current = false;
            snapToPage(e.clientY - startY.current);
        },
        [snapToPage],
    );

    useEffect(() => {
        const el = calendarRef.current;
        if (!el) return;
        const handler = (e: WheelEvent) => {
            e.preventDefault();
            if (wheelTimer.current) return;
            const dir = e.deltaY > 0 ? 1 : -1;
            setPageNum((p) => p + dir);
            wheelTimer.current = setTimeout(() => {
                wheelTimer.current = undefined;
            }, 400);
        };
        el.addEventListener("wheel", handler, { passive: false });
        return () => el.removeEventListener("wheel", handler);
    }, []);

    const goToCurrent = useCallback(() => {
        setPageNum(0);
    }, []);

    const navigateToMonth = useCallback(
        (year: number, month: number) => {
            const [ty, tm] = today.split("-").map(Number);
            setPageNum(monthDiff(ty, tm, year, month));
            setPickerOpen(false);
        },
        [today],
    );

    const byDate = new Map(checkins.map((c) => [c.date, c]));
    const [ty, tm] = today.split("-").map(Number);

    useEffect(() => {
        let alive = true;
        const load = async () => {
            const { getRepo } = await import("@/db");
            const repo = await getRepo();
            const all = await repo.getCheckins(id);
            if (alive) setCheckins(all);
        };
        void load();
        return () => { alive = false; };
    }, [id, checkinVersion]);

    if (!project) {
        return (
            <div className="card text-center text-slate-400 py-12">
                <div className="text-sm">{t("project.notFound")}</div>
                <Link to="/" className="btn-ghost mt-3">
                    {t("project.backHome")}
                </Link>
            </div>
        );
    }

    const offset = -pageH + dragY;
    const isDragging = dragY !== 0;

    const renderWeeks = (weeks: WeekRow[]) =>
        weeks.map((w, wi) => {
            const hasToday = w.days.some((d) => d === today);
            return (
                <div key={wi}>
                    <div
                        className={cn(
                            "grid grid-cols-7 gap-1",
                            hasToday && "bg-brand-500/5 rounded-lg",
                        )}
                    >
                        {w.days.map((d, j) => {
                            if (!d) return <div key={j} />;
                            const c = byDate.get(d);
                            const isToday = d === today;
                            return (
                                <div
                                    key={d}
                                    className={cn(
                                        "flex justify-center",
                                        isToday &&
                                            "border-2 border-brand-500/60 rounded-lg",
                                    )}
                                >
                                    <StatusCell
                                        projectId={project.id}
                                        date={d}
                                        checkin={c}
                                        unit={project.unit}
                                        color={project.color}
                                        refreshKey={checkinVersion}
                                        disabled={d > today}
                                        onCycle={() =>
                                            void cycle(project.id, d)
                                        }
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        });

    return (
        <div className="space-y-3">
            <div className="card flex items-center gap-3">
                <Link
                    to="/"
                    className="btn-ghost p-2 rounded-xl"
                    aria-label={t("project.back")}
                >
                    <ChevronLeft size={18} />
                </Link>
                <span
                    className="h-9 w-9 grid place-items-center rounded-xl text-lg shrink-0"
                    style={{ background: project.color + "20" }}
                >
                    {project.emoji}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-100 truncate">{project.name}</div>
                    {project.description && (
                        <div className="text-xs text-slate-400 mt-0.5 truncate">
                            {project.description}
                        </div>
                    )}
                    {project.unit && (
                        <div className="text-xs text-slate-400">
                            {project.unit}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    {pageNum !== 0 && (
                        <button
                            className="btn-ghost p-2 rounded-xl"
                            onClick={goToCurrent}
                            aria-label={t("project.goToCurrent")}
                        >
                            <RotateCcw size={14} />
                        </button>
                    )}
                    <button
                        className="btn-ghost p-2 rounded-xl"
                        onClick={() => setEditorOpen(true)}
                        aria-label={t("project.settings")}
                    >
                        <SettingsIcon size={16} />
                    </button>
                </div>
            </div>

            <div className="card">
                <div className="relative mb-3 flex items-center justify-between">
                    <button
                        className="flex items-center gap-1.5 text-sm font-semibold text-slate-100 hover:text-brand-400 transition-colors"
                        onClick={() => setPickerOpen((v) => !v)}
                    >
                        {t("project.yearMonth", {
                            year: viewYear,
                            month: viewMonth,
                        })}
                        <ChevronDown
                            size={14}
                            className={cn(
                                "transition-transform duration-200",
                                pickerOpen && "rotate-180",
                            )}
                        />
                    </button>
                    <div className="flex items-center gap-1">
                        <button
                            className="btn-ghost p-1.5 rounded-lg"
                            onClick={() => setPageNum((p) => p - 1)}
                            aria-label="previous month"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <button
                            className="btn-ghost p-1.5 rounded-lg"
                            onClick={() => setPageNum((p) => p + 1)}
                            aria-label="next month"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                    {pickerOpen && (
                        <div className="absolute left-0 top-full mt-1 z-10 bg-slate-900/95 backdrop-blur-xl rounded-xl shadow-xl border border-slate-700/50 p-3 min-w-[200px]">
                            <div className="flex items-center gap-2 mb-3">
                                <select
                                    className="flex-1 text-sm bg-slate-800/80 border border-slate-700/50 rounded-lg px-2.5 py-1.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                                    value={viewYear}
                                    onChange={(e) => {
                                        const y = Number(e.target.value);
                                        navigateToMonth(y, viewMonth);
                                    }}
                                >
                                    {Array.from(
                                        { length: 11 },
                                        (_, i) => ty - 5 + i,
                                    ).map((y) => (
                                        <option key={y} value={y}>
                                            {t("project.year", { year: y })}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-4 gap-1.5">
                                {Array.from(
                                    { length: 12 },
                                    (_, i) => i + 1,
                                ).map((m) => (
                                    <button
                                        key={m}
                                        className={cn(
                                            "text-xs py-2 rounded-lg transition-all duration-150",
                                            m === viewMonth
                                                ? "bg-brand-500 text-white font-medium shadow-sm shadow-brand-500/30"
                                                : "text-slate-300 hover:bg-slate-800/50",
                                        )}
                                        onClick={() =>
                                            navigateToMonth(viewYear, m)
                                        }
                                    >
                                        {t("project.month", { month: m })}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <div className="grid grid-cols-7 gap-1 text-[10px] text-slate-400 mb-1.5">
                    {(t("common.dow", { returnObjects: true }) as string[]).map(
                        (d) => (
                            <div key={d} className="text-center font-medium">
                                {d}
                            </div>
                        ),
                    )}
                </div>
                <div
                    ref={calendarRef}
                    className="overflow-hidden select-none cursor-grab active:cursor-grabbing"
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    style={{ touchAction: "none", height: pageH || "auto" }}
                >
                    <div
                        style={{
                            transform: `translateY(${offset}px)`,
                            transition: isDragging
                                ? "none"
                                : "transform 0.3s ease",
                        }}
                    >
                        <div className="space-y-2 mb-2">
                            {renderWeeks(pages.prev)}
                        </div>
                        <div ref={currRef} className="space-y-2 mb-2">
                            {renderWeeks(pages.curr)}
                        </div>
                        <div className="space-y-2">
                            {renderWeeks(pages.next)}
                        </div>
                    </div>
                </div>
            </div>

            <div className="card">
                <div className="text-sm font-semibold text-slate-100 mb-3">
                    {t("project.monthlyStats")}
                </div>
                <MonthlyStatsChart
                    checkins={checkins}
                    color={project.color}
                    currentYear={ty}
                    currentMonth={tm - 1}
                    unit={project.unit}
                />
            </div>
            <div className="card">
                <div className="text-sm font-semibold text-slate-100 mb-3">
                    {t("project.valueTrend")}
                </div>
                <ValueTrendChart
                    checkins={checkins}
                    color={project.color}
                    currentYear={ty}
                    currentMonth={tm - 1}
                />
            </div>
            <Link
                to={`/history?project=${project.id}`}
                className="card flex items-center justify-center text-sm text-brand-400 hover:text-brand-500 font-medium transition-colors"
            >
                {t("project.viewAllHistory")}
            </Link>

            <ProjectEditor
                open={editorOpen}
                onOpenChange={setEditorOpen}
                initial={{
                    id: project.id,
                    name: project.name,
                    description: project.description,
                    unit: project.unit,
                    emoji: project.emoji,
                    color: project.color,
                }}
                onDelete={() => navigate("/")}
            />
        </div>
    );
}
