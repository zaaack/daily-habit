# Daily Habit

[English](#english) · [中文](#中文)

每日打卡 App · Capacitor + React + TypeScript + Vite + Zustand + Dexie/SQLite + WebDAV Sync

## 中文

### 功能

- ✅ / ❌ / 留空 三种打卡状态（留空不入库）
- 数字单位、备注
- 首页：项目列表 + 最近 N 天打卡状态（3-7 滑块自由选），单元格点击循环、双击/长按弹窗编辑
- 详情页：月度热力图 + uPlot 折线 + 历史查询
- WebDAV 同步（启动 + 打卡后触发），每项目一个 JSON，ETag 乐观锁，冲突弹窗
- 跨平台：Android（Capacitor 6 + Capacitor SQLite）/ Web（PWA，Dexie/IndexedDB）

### 开发

```bash
pnpm install
pnpm dev              # 浏览器预览
pnpm build            # 打包到 docs/（GitHub Pages）
pnpm build:cf         # 打包到 docs/（Cloudflare Pages，根路径）
pnpm preview          # 预览构建
pnpm android:build    # 打包 APK
```

### 部署

| 平台 | 方式 | 说明 |
|------|------|------|
| GitHub Pages | 推送 `main` → CI 自动部署 | 路径 `/daily-habit/` |
| Cloudflare Pages | 连接仓库，build 命令 `pnpm build:cf`，输出目录 `docs` | 支持自定义域，免费计划无限流量 |
| Android | 本地 `pnpm android:build` | APK 输出 `android/app/build/outputs/apk/debug/app-debug.apk` |

### 目录约定

- `src/db/` 数据层（Repo 接口 + Dexie/SQLite 双实现）
- `src/sync/` WebDAV 同步引擎
- `src/state/` zustand store
- `src/components/` 通用组件
- `src/routes/` 路由页面

---

## English

### Features

- ✅ / ❌ / skip three check-in states (skip = no record)
- Numeric values, notes
- Home: project list + last N day heatmap (3-7 slider), single-click cycle, double-click/long-press edit
- Detail: monthly heatmap + uPlot line chart + history
- WebDAV sync (on startup & after check-in), one JSON per project, ETag optimistic locking, conflict dialog
- Cross-platform: Android (Capacitor 6 + Capacitor SQLite) / Web (PWA, Dexie/IndexedDB)

### Development

```bash
pnpm install
pnpm dev              # Browser preview
pnpm build            # Build to docs/ (GitHub Pages)
pnpm build:cf         # Build to docs/ (Cloudflare Pages, root path)
pnpm preview          # Preview production build
pnpm android:build    # Build APK
```

### Deployment

| Platform | Method | Notes |
|----------|--------|-------|
| GitHub Pages | Push `main` → CI auto-deploys | Base path `/daily-habit/` |
| Cloudflare Pages | Connect repo, build command `pnpm build:cf`, output dir `docs` | Custom domain supported, free plan unlimited bandwidth |
| Android | `pnpm android:build` locally | APK at `android/app/build/outputs/apk/debug/app-debug.apk` |

### Directory Structure

- `src/db/` Data layer (Repo interface + Dexie/SQLite dual impl)
- `src/sync/` WebDAV sync engine
- `src/state/` Zustand store
- `src/components/` Shared components
- `src/routes/` Route pages
