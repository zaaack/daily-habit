import { useEffect, useRef, useState } from "react";
import { RouterProvider, createHashRouter } from "react-router-dom";
import { SyncProvider } from "sqlite-remote-sync/react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/state/useAppStore";
import { getDB } from "@/db";
import type { DB } from "@/db";
import type { Kysely } from "kysely";
import { Home } from "@/routes/Home";
import { ProjectDetail } from "@/routes/ProjectDetail";
import { History } from "@/routes/History";
import { Settings } from "@/routes/Settings";
import { NotFound } from "@/routes/NotFound";
import { Layout } from "@/components/Layout";
import { ConflictDialog } from "@/components/ConflictDialog";
import { DebugPanel } from "@/components/DebugPanel";
import { isWails } from "@/lib/platform";

const router = createHashRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: "project/:id", element: <ProjectDetail /> },
      { path: "history", element: <History /> },
      { path: "settings", element: <Settings /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

function getStoredTheme(): "auto" | "light" | "dark" {
  try {
    const v = localStorage.getItem("theme");
    if (v === "light" || v === "dark") return v;
  } catch {
    /* noop */
  }
  return "auto";
}

export function App() {
  const { t } = useTranslation();
  const ready = useAppStore((s) => s.ready);
  const bootError = useAppStore((s) => s.bootError);
  const init = useAppStore((s) => s.init);
  const engine = useAppStore((s) => s.engine);
  const configured = useAppStore((s) => s.configured);
  const bootedRef = useRef(false);
  const [db, setDb] = useState<Kysely<DB> | null>(null);

  // Theme follows the stored preference + system changes.
  useEffect(() => {
    const apply = () => {
      const mode = getStoredTheme();
      const dark =
        mode === "dark" ||
        (mode === "auto" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    void init().then(() => {
      try {
        setDb(getDB());
      } catch {
        /* bootError handled below */
      }
    });
  }, [init]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F12") {
        e.preventDefault();
        if (isWails) {
          (window as any).go?.main?.App?.ToggleDevTools();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!ready || !db) {
    return (
      <div className="grid h-full place-items-center text-slate-400">
        <div className="animate-pulse text-sm font-medium">
          {bootError ? bootError : t("app.loading")}
        </div>
      </div>
    );
  }

  return (
    <SyncProvider db={db} engine={engine ?? undefined} syncAfterWrite={configured}>
      <RouterProvider router={router} />
      <ConflictDialog />
      <DebugPanel />
    </SyncProvider>
  );
}