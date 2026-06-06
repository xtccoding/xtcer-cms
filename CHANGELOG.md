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

**方案一（已弃用）:** Cloudflare Image Resizing - 需要 Pro 计划。

**方案二（当前）:** 浏览器端 Canvas 生成缩略图
- 上传时用 Canvas API 生成 400px WebP 缩略图
- 缩略图存到 R2 的 `thumbs/` 目录
- 数据库新增 `thumbnail_url` 字段
- 网格优先加载缩略图，失败自动回退原图
- 灯箱点击加载原图

**需要执行:**
```sql
ALTER TABLE assets ADD COLUMN IF NOT EXISTS thumbnail_url text;
```

**文件:** `src/pages/admin/[slug].astro`, `src/pages/api/upload.ts`, `src/lib/database.types.ts`

**提交:** `865b6e1`

### feat: 文件管理与分享

**功能:**
- 管理后台文件上传/删除（侧边栏"文件"入口）
- 存储在 R2 的 `files/` 前缀下
- 分享链接支持自定义 slug（默认 8 位随机）
- 可选密码保护
- 可选过期时间（1小时/1天/7天/30天）
- 下载次数统计
- 公开分享页 `/s/:slug`（图片/视频/音频/PDF 在线预览）

**需要执行:**
```sql
CREATE TABLE IF NOT EXISTS files (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL,
  url text NOT NULL,
  filename text NOT NULL,
  content_type text,
  size bigint,
  share_slug text NOT NULL UNIQUE,
  password text,
  downloads int DEFAULT 0,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_files_share_slug ON files(share_slug);
CREATE OR REPLACE FUNCTION increment_downloads(slug text)
RETURNS void AS $$ BEGIN UPDATE files SET downloads = downloads + 1 WHERE share_slug = slug; END; $$ LANGUAGE plpgsql;
```

**文件:** `src/pages/admin/files.astro`, `src/pages/s/[slug].astro`, `src/pages/api/files/`, `src/components/Sidebar.astro`, `src/lib/database.types.ts`

**提交:** `29d8fc1`
