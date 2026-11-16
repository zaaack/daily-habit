import { Link } from "react-router-dom";
import { ChevronRight, GripVertical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCheckins, useHabitActions } from "@/hooks/useHabit";
import { StatusCell } from "./StatusCell";
import type { Project } from "@/db/types";
import { todayStr } from "@/db/schema";
import { cn } from "@/lib/cn";

export function ProjectCard({
    project,
    dates,
    sorting,
}: {
    project: Project;
    dates: string[];
    sorting?: boolean;
}) {
    const { t } = useTranslation();
    const { cycleCheckin } = useHabitActions();
    const { checkins } = useCheckins(
        project.id,
        dates.length > 1 ? { from: dates[0], to: dates[dates.length - 1] } : undefined,
    );

    const byDate = new Map(checkins.map((c) => [c.date, c]));
    const today = todayStr();

    const failRate = (() => {
        const inRange = checkins.filter((c) => dates.includes(c.date));
        let fail = 0,
            total = 0;
        for (const c of inRange) {
            if (c.status === "success") total++;
            else if (c.status === "fail") {
                total++;
                fail++;
            }
        }
        return total > 0 ? Math.round((fail / total) * 100) : null;
    })();

    if (sorting) {
        return (
            <div className="card flex items-center gap-2" style={{ touchAction: 'none' }}>
                <GripVertical size={18} className="text-slate-400 shrink-0" />
                <span
                    className="h-7 w-7 grid place-items-center rounded-lg text-base shrink-0"
                    style={{ background: project.color + "25" }}
                >
                    {project.emoji}
                </span>
                <div className="font-medium text-slate-200 truncate">
                    {project.name}
                </div>
                {project.unit && (
                    <div className="text-xs text-slate-400 truncate">
                        · {project.unit}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="card">
            <Link
                to={`/project/${project.id}`}
                className="flex items-center gap-2.5 mb-2.5 active:opacity-70"
            >
                <span
                    className="h-8 w-8 grid place-items-center rounded-xl text-base shrink-0"
                    style={{ background: project.color + "20" }}
                >
                    {project.emoji}
                </span>
                <div
                    className={cn(
                        "font-medium",
                        project.deleted
                            ? "text-rose-500 line-through"
                            : project.archived
                              ? "text-amber-500 dark:text-amber-400"
                              : "text-slate-100",
                    )}
                >
                    {project.name}
                </div>
                {project.unit && (
                    <div className="text-xs text-slate-400">
                        · {project.unit}
                    </div>
                )}
                {failRate != null && failRate > 0 && (
                    <div className="text-xs text-rose-400 font-medium">
                        {t("home.failRate", { rate: failRate })}
                    </div>
                )}
                <ChevronRight size={16} className="ml-auto text-slate-400" />
            </Link>
            <div className="grid grid-cols-7 gap-1.5">
                {dates.map((d) => {
                    const c = byDate.get(d);
                    const isFuture = d > today;
                    return (
                        <div key={d} className={cn(isFuture && "opacity-50")}>
                            <StatusCell
                                projectId={project.id}
                                date={d}
                                checkin={c}
                                unit={project.unit}
                                color={project.color}
                                compact
                                disabled={isFuture}
                                onCycle={() => void cycleCheckin(project.id, d)}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}