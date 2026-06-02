# Daily Habit

每日打卡 App · Capacitor + React + TypeScript + Vite + Zustand + Dexie/SQLite + WebDAV 同步

## 功能

- ✅ / ❌ / 留空 三种打卡状态（留空不入库）
- 数字单位、备注
- 首页：项目列表 + 最近 N 天打卡状态（3-7 滑块自由选），单元格点击循环、双击/长按弹窗编辑
- 详情页：月度热力图 + uPlot 折线 + 历史查询
- WebDAV 同步（启动 + 打卡后触发），每项目一个 JSON，ETag 乐观锁，冲突弹窗
- 跨平台：Android（Capacitor 6 + Capacitor SQLite）/ Web（PWA，Dexie/IndexedDB）

## 开发

```bash
pnpm install
pnpm dev          # 浏览器预览
pnpm build        # 打包到 dist
pnpm preview      # 预览构建
pnpm android:build  # 打包 APK
```

## 部署

- Web：推送到 `main` 触发 `.github/workflows/deploy.yml` 部署到 GitHub Pages（路径 `/daily-habit/`）
- Android：本地 `pnpm android:build`，输出 `android/app/build/outputs/apk/debug/app-debug.apk`

## 目录约定

- `src/db/` 数据层（Repo 接口 + Dexie/SQLite 双实现）
- `src/sync/` WebDAV 同步引擎
- `src/state/` zustand store
- `src/components/` 通用组件
- `src/routes/` 路由页面
