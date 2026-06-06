# Changelog

## 2026-06-06

### fix: 访客记录停止写入

**问题:** `/admin/visitors` 页面显示无记录，但 `visitors` 表有 1773 条历史数据，新访问未被记录。

**排查过程:**
1. 确认 Supabase 表存在且有数据（1773 条）
2. 确认 RLS 策略正确（allow_all_visitors, ALL, public）
3. 确认直接 SQL INSERT 可以写入
4. 确认中间件代码已打包进构建产物

**根因:** Cloudflare Workers 在返回 response 后会立即终止，fire-and-forget 的 Supabase insert Promise 来不及完成。

**修复:** 使用 `ctx.waitUntil()` 告诉 Cloudflare 保持 worker 存活直到 insert 完成。

**文件:** `src/middleware.ts`

**提交:** `8d7dcaf`
