import { create } from "zustand";
import type { SyncEngine } from "sqlite-remote-sync";
import { initDB } from "@/db";
import { configureEngine, getEngine, onConflict, isConfigured } from "@/sync/engine";
import type { ConflictNotice } from "@/db/types";

interface FilterState {
  normal: boolean;
  archived: boolean;
  deleted: boolean;
}

interface AppState {
  ready: boolean;
  bootError: string | null;
  conflicts: ConflictNotice[];
  filterState: FilterState;
  sortMode: boolean;
  engine: SyncEngine | null;
  configured: boolean;

  init(): Promise<void>;
  reconfigureEngine(): Promise<boolean>;
  clearConflicts(): void;
  setFilterState(state: FilterState): void;
  toggleSortMode(): void;
  setSortMode(v: boolean): void;
}

let _initStarted = false;

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  bootError: null,
  conflicts: [],
  filterState: { normal: true, archived: false, deleted: false },
  sortMode: false,
  engine: null,
  configured: false,

  async init() {
    if (get().ready || _initStarted) return;
    _initStarted = true;
    try {
      await initDB();
      const adapter = (await import("@/db")).getAdapter();
      await configureEngine(adapter);
      onConflict((n) => {
        set((s) => ({ conflicts: [...s.conflicts.slice(-49), { ...n, at: Date.now() }] }));
      });
      set({ ready: true, engine: getEngine(), configured: isConfigured() });
    } catch (e) {
      _initStarted = false;
      set({ bootError: e instanceof Error ? e.message : String(e) });
    }
  },

  async reconfigureEngine() {
    try {
      const adapter = (await import("@/db")).getAdapter();
      await configureEngine(adapter);
      set({ engine: getEngine(), configured: isConfigured() });
      const engine = getEngine();
      if (engine) {
        try {
          await engine.sync();
        } catch { /* auto-sync will retry */ }
      }
      return true;
    } catch (e) {
      set({ bootError: e instanceof Error ? e.message : String(e) });
      return false;
    }
  },

  clearConflicts() {
    set({ conflicts: [] });
  },

  setFilterState(state) {
    set({ filterState: state });
  },

  toggleSortMode() {
    set((s) => ({ sortMode: !s.sortMode }));
  },

  setSortMode(v) {
    set({ sortMode: v });
  },
}));