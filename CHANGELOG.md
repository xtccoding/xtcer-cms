# Changelog

## 2026-10-29

### fix: 文件上传 50MB 以上全部失败（Workers 1102 内存超限）

**现象:** 后台 `/xadminx/files` 上传大文件，100MB 以内的都传不上去。

**实测阈值（线上逐档验证）:**

| 文件 | 结果 |
|---|---|
| 1MB / 10MB / 30MB | ✅ 200 |
| 50MB / 95MB | ❌ `error code: 1102` / HTTP 503 |

**根因:** Cloudflare Workers 有 **128MB 内存上限**，而原实现把整个文件读进 Worker：
`request.formData()` 缓冲一份 → `file.arrayBuffer()` 再一份 → SHA-256 摘要
→ S3 签名，同一份数据同时存在 3～4 份，50MB 就爆。代码里那个 100MB 判断
根本走不到，实际天花板在 30～50MB 之间。

**修复:** 改为分片上传（S3 Multipart Upload）

- 新增 `src/pages/api/files/multipart.ts`：`init` → 逐片 `PUT`（8MB/片）→ `complete`，
  失败自动 `abort` 清理未完成分片。Worker 每次只持有一片，内存占用与文件总大小无关。
- 前端 `admin/files/[slug].astro`：`< 20MB` 仍走原单请求（快），`≥ 20MB` 自动切分片，
  进度条按片推进。上限从 100MB 提到 **500MB**。
- 实测：50MB / 37s（7 片）、95MB / 60s（12 片），下载字节数完全一致。

**过程中踩的两个坑（都写进代码注释了）:**

1. **`DOMParser is not defined`** —— `@aws-sdk/client-s3` 检测到 `fetch` 存在就把运行环境
   当浏览器，用 `DOMParser` 解析 S3 响应 XML（`CreateMultipartUpload` 要从里面取
   `UploadId`）。Workers 没有 DOMParser；补了 `@xmldom/xmldom` 后又缺 `Node` 常量。
   在 Workers 上给 SDK 补 DOM 环境是个无底洞。
2. **最终改用 `aws4fetch`** —— 只做 SigV4 签名、拿原生 `Response`，`UploadId` 用正则
   从 XML 提取，`CompleteMultipartUpload` 的 parts 直接拼 XML。零 DOM 依赖，体积也更小。

**注意:** `PUT` 上传二进制片时不要用 `multipart/form-data`，否则会撞 Astro 的
CSRF 同源检查；这里用 `application/octet-stream`。

**文件:** `src/pages/api/files/multipart.ts`（新增）、`src/pages/admin/files/[slug].astro`

### chore: 建立 git.xen → GitHub 自动镜像

本地 `git.xen`（Forgejo）为主库，push 后经 Push Mirror（`sync_on_commit`）自动同步到
`xtccoding/xtcer-cms`，再触发 Cloudflare Pages 自动构建部署。实测 push 后约 10s
GitHub 收到、约 40s 线上生效。日常 `git push local main` 即可，**不要在 GitHub 侧直接改代码**
（镜像为 `--mirror` 语义，会被强制覆盖）。

同时补了 `.gitignore`：`.workbuddy-ai/`、`drafts/_feeds_*.json`、`.shots_deals_all.json`
不应入库。

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
