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

### feat: 图床缩略图优化

**问题:** 图床页面每次加载都请求原图，图片多时加载慢。

**修复:** 
- 网格使用 Cloudflare Image Resizing 生成 400px 宽度缩略图
- 点击灯箱时加载原图
- 预加载前后图片提升切换体验
- 缩略图加载失败自动回退到原图

**前提:** `img.xtcer.cn` 域名需在 Cloudflare 代理后面并开启 Image Resizing。若未开启，会自动回退到原图。

**文件:** `src/pages/admin/[slug].astro`

**提交:** `5f88189`
