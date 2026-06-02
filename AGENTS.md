# AGENTS.md

## Project
每日打卡 PWA + Android app. **Capacitor 6** + **React 19** + **TypeScript** + **Vite 6** + **Zustand** + **Dexie (web) / Capacitor SQLite (Android)** + **WebDAV** sync. Each project is one JSON file on the remote, synced via ETag optimistic locking with field-level LWW merge and a conflict dialog.

## Commands
- `pnpm dev` — Vite dev (browser only, runs against Dexie)
- `pnpm build` — **runs `scripts/generate-icons.mjs` first**, then `tsc -b`, then `vite build`. Outputs to `docs/`. Touching `public/favicon.svg` only takes effect after this.
- `pnpm build:cf` — `VITE_BASE_URL=/ pnpm build` — builds for Cloudflare Pages (root path).
- `pnpm lint` — ESLint, flat config. Only `**/*.{ts,tsx}`; ignores `docs`, `node_modules`, `android`, `.capacitor`, `*.config.js`, `*.config.ts`. `no-unused-vars` is off; `tsc` enforces unused locals/params.
- `pnpm android:build` — `pnpm build && cap sync android && cd android && ./gradlew assembleDebug`. APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`. Needs local JDK + Android SDK (not in CI).
- `pnpm cap:sync` / `pnpm cap:open:android` — Capacitor CLI helpers.

No tests, no Husky, no commitlint.

## Layout (real entrypoints)
- `src/main.tsx` → `src/App.tsx` — uses `createMemoryRouter` (NOT `BrowserRouter`; intentional for Android/PWA). `App` calls `useAppStore.init()` once and shows `ConflictDialog` at the root.
- `src/state/useAppStore.ts` — single zustand store. **All data mutations go through here** (addProject, updateProject, deleteProject, cycleCheckin, setCheckin, triggerSync, resolveConflict). Every mutation fires `syncOneProject(...)` or `triggerSync()` as fire-and-forget; sync errors set `sync.status='error'`.
- `src/db/` — `Repo` interface + `DexieRepo` (web) + `SqliteRepo` (Android). `getRepo()` is a module-level singleton, picks implementation via `isAndroid` from `src/lib/platform.ts`. New persistence code must implement `Repo`; don't bypass it.
- `src/sync/fullSync.ts` — full sync loop + `syncOneProject`. `mergeProjectFile` (in `src/sync/merge.ts`) is field-level LWW by `updatedAt`; ties with differing fields become `ConflictItem`s and surface via `useAppStore.conflicts`.
- `src/components/`, `src/routes/` — UI; `ProjectCard` polls checkins every 2s.
- `scripts/generate-icons.mjs` — uses `sharp` to render PNG icons from `public/favicon.svg` into `public/`.

Path alias: `@/*` → `src/*` (set in both `tsconfig.json` and `vite.config.ts`).

## Quirks
- `vite.config.ts` has `base: '/daily-habit/'` — matches GitHub Pages path. PWA `start_url`, manifest, and `navigateFallback` all depend on this. **Don't change it without updating the Pages deploy URL.**
- Android scheme is `https` in `capacitor.config.ts`; `allowMixedContent: false`. WebView loads `docs/` directly (no live reload URL configured).
- WebDAV config is stored in KV under key `webdav.config` (see `src/sync/fullSync.ts`). Default remote dir is `/daily-habit` (constant `DEFAULT_REMOTE_DIR` in `src/db/schema.ts`).
- Deletion is **soft** (`Project.deleted: 0|1`); sync still uploads deleted projects so other devices see the tombstone.
- ETag flow: `getDirEntryEtag` is called after every `putFileContents` because the `webdav` lib returns an opaque value, not the real ETag. Don't try to cache it across requests.
- The merge's "remote" upload uses `contentLength: false` — required for some WebDAV servers; do not "fix" it.
- Build output is `docs/` (not `dist/`). `VITE_BASE_URL` env var controls the asset base path; defaults to `/daily-habit/` (GitHub Pages). Set to `/` for root deployments (Cloudflare Pages, custom domain).
- The conflict dialog is mounted globally in `App.tsx`; `resolveConflict` always defaults each item's `resolution` to `'local'` if missing.

## Deploy
- Web: push to `main` → `.github/workflows/deploy.yml` (pnpm 9, Node 22) builds and publishes `docs/` to GitHub Pages at `/daily-habit/`. The workflow copies `docs/index.html` to `docs/404.html` for SPA routing — local builds don't need this.
- Cloudflare Workers: `pnpm build:cf && npx wrangler deploy` deploys `docs/` via Cloudflare Workers + Assets. `wrangler.jsonc` sets `not_found_handling: "single-page-application"` for SPA fallback. `public/_headers` provides COOP/COEP headers (native Workers support).
- Android: local-only, no CI.

## Conventions
- Tailwind utility classes; `cn()` helper in `src/lib/cn.ts`. Brand colors in `tailwind.config.js`.
- React 19 + react-router-dom v6 (memory router).
- Strict TS, `verbatimModuleSyntax`, `noUnusedLocals`/`noUnusedParameters` enforced — clean up imports.
- KV is JSON-stringified; do not store non-serializable values.
- Comments in source are sparse by design; don't add them unless asked.
