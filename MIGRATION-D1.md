# xtcer.cn 数据层：Cloudflare D1 + Drizzle

> 状态：**已完成迁移并上线验证。** 数据层不再依赖 Supabase。

## 一、当前架构

| 项 | 值 |
|---|---|
| 数据库 | Cloudflare D1（SQLite） |
| 库名 / ID | `xtcer-content` / `7396e16f-a21a-491d-9852-af670b75698a` |
| 绑定名 | `DB`（`wrangler.toml` + Pages 项目均已配置） |
| ORM | Drizzle（`drizzle-orm/d1`） |
| 表结构 | `src/lib/schema.ts`（唯一来源）↔ `database/d1-schema.sql`（线上 DDL） |
| 数据访问 | `src/lib/store.ts`（唯一写 SQL 的地方） |
| 访客统计 | Cloudflare Web Analytics（零写入，不再有 visitors 表写入） |

请求链路：`middleware.ts` 把 `locals.runtime.env` 存入 `runtime-env.ts` → `db.ts` 取 `env.DB` 构造 Drizzle 客户端 → `store.ts` 暴露按语义命名的函数 → 页面/API 只调 store。

## 二、日常操作

```bash
# 本地库（首次）
npx wrangler d1 execute xtcer-content --local --file=database/d1-schema.sql

# 线上执行 SQL（需要主账号 token）
$env:CLOUDFLARE_API_TOKEN='<cfat_...>'
$env:CLOUDFLARE_ACCOUNT_ID='e0b59ba0845dba41abc02c1b14f7895e'
npx wrangler d1 execute xtcer-content --remote --file=database/d1-schema.sql
```

> Token 只在 `hm/ASSETS.md §1.5.x` 中保存，不要写进仓库或聊天。

## 三、数据导入 / 重新同步

```bash
# 1. 从 Supabase 重新导出（可选，历史数据在 backups/）
node scripts/backup-supabase.mjs --skip visitors

# 2. 生成 D1 SQL（默认取最新 backups 目录，输出 tmpwork/d1-import/）
node scripts/import-to-d1.mjs

# 3. 逐表导入（INSERT OR REPLACE，可重复执行）
npx wrangler d1 execute xtcer-content --remote --file=tmpwork/d1-import/posts.sql
npx wrangler d1 execute xtcer-content --remote --file=tmpwork/d1-import/deals.sql
npx wrangler d1 execute xtcer-content --remote --file=tmpwork/d1-import/feeds.sql
npx wrangler d1 execute xtcer-content --remote --file=tmpwork/d1-import/assets.sql
npx wrangler d1 execute xtcer-content --remote --file=tmpwork/d1-import/files.sql
npx wrangler d1 execute xtcer-content --remote --file=tmpwork/d1-import/site_settings.sql
npx wrangler d1 execute xtcer-content --remote --file=tmpwork/d1-import/feedback.sql
npx wrangler d1 execute xtcer-content --remote --file=tmpwork/d1-import/deal_likes.sql
npx wrangler d1 execute xtcer-content --remote --file=tmpwork/d1-import/links.sql
npx wrangler d1 execute xtcer-content --remote --file=tmpwork/d1-import/blacklist.sql
```

最近一次导入（2026-11-19）：posts 928 / deals 408 / feeds 674 / assets 1709 / files 12 / site_settings 2 / feedback 1 / deal_likes 1 / links 0 / blacklist 0。

## 四、类型映射注意事项

| Postgres | SQLite(D1) | 处理方式 |
|---|---|---|
| `uuid` | `TEXT` | 应用侧 `crypto.randomUUID()` |
| `timestamptz` | `TEXT` | ISO 8601 定长毫秒，字符串排序 == 时间排序 |
| `text[]` | `TEXT` | JSON 数组字符串，store 层 parse/stringify |
| `jsonb` | `TEXT` | 同上 |
| `boolean` | `INTEGER 0/1` | store 层 `is_active` / `handled` 自动转换 |
| `numeric` | `REAL` | — |

已知精度损失：`tags` 用 `LIKE '%"tag"%'` 近似包含匹配；全文检索由 `LIKE` 承担（无 FTS）。

## 五、验证清单

1. `/` 首页：文章 / 动态 / Banner / 友链正常
2. `/posts`、`/posts/:id`：列表与详情、相关推荐、浏览量自增
3. `/feeds`、`/tags`、`/tags/:tag`、`/topics/:topic`、`/authors/XTcer`
4. `/deals`：卡片、分类筛选、点赞
5. `/rss.xml`、`/sitemap.xml`：全量条目（不再受 1000 行截断）
6. `/xadminx`：概览计数、文章、优惠、情报、文件、反馈、外观
7. 反馈提交与 `/s/:slug` 分享下载

## 六、容量

免费档：5 GB 存储 / 5M 行读·日 / 100K 行写·日。当前库约 14 MB，按日均几千 PV 远未触顶；去掉 visitors 写入后写压力基本只剩浏览量自增与后台编辑。

## 七、回退

Supabase 客户端已删除，代码层面不再有回退开关。如需回退：切回上一个 release commit（`git revert` 迁移提交）并在 Pages 环境变量中保留原 Supabase 配置。
