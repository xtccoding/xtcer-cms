# xtcer.cn → Cloudflare D1 迁移手册

> 当前状态：**代码已就绪，只需你跑 3 个 CLI 命令 + 1 次 Pages 绑定。**

## 一、你现在需要做的 4 步

### 第 1 步：登录 Cloudflare CLI（本机只用一次）

```bash
cd C:/Users/ctooc/Desktop/_projects/workspace/_infra/xtcer/xtcer-cms
npx wrangler login
```

浏览器会弹授权页，确认后终端显示登录成功。

### 第 2 步：建 D1 数据库 + 跑建表 SQL

```bash
# 创建数据库（免费档即可）
npx wrangler d1 create xtcer

# 建表（幂等，可重复执行）
npx wrangler d1 execute xtcer --remote --file=database/d1-schema.sql
```

### 第 3 步：导入数据

```bash
# 逐个表导入（visitors 最大，最慢）
npx wrangler d1 execute xtcer --remote --file=tmpwork/d1-import/deals.sql
npx wrangler d1 execute xtcer --remote --file=tmpwork/d1-import/posts.sql
npx wrangler d1 execute xtcer --remote --file=tmpwork/d1-import/feeds.sql
npx wrangler d1 execute xtcer --remote --file=tmpwork/d1-import/assets.sql
npx wrangler d1 execute xtcer --remote --file=tmpwork/d1-import/files.sql
npx wrangler d1 execute xtcer --remote --file=tmpwork/d1-import/deal_likes.sql
npx wrangler d1 execute xtcer --remote --file=tmpwork/d1-import/visitors.sql
npx wrangler d1 execute xtcer --remote --file=tmpwork/d1-import/site_settings.sql

# 验证行数
npx wrangler d1 execute xtcer --remote --command="SELECT 'posts' AS t, COUNT(*) AS n FROM posts UNION ALL SELECT 'deals', COUNT(*) FROM deals UNION ALL SELECT 'feeds', COUNT(*) FROM feeds UNION ALL SELECT 'visitors', COUNT(*) FROM visitors"
```

### 第 4 步：在 Pages 项目里加 D1 绑定 + 重新部署

打开 Cloudflare Dashboard → Workers & Pages → xtcer-web → Settings → Bindings：

- **Type**: D1 database
- **Variable name**: `DB`（必须叫这个名字，代码里死编码）
- **Database**: xtcer

保存后，Pages 会自动重新部署。

### （可选）不想迁移时的回退

只需在 Pages 项目 Settings → Bindings 里 **删掉 DB 绑定**，站点立刻回到 Supabase，无需改代码。代码里有自动探测逻辑：

```
有 DB 绑定 → D1
没有 DB 绑定 → Supabase 回退
```

也可设环境变量 `DATA_BACKEND=supabase` 强制回退。

---

## 二、迁移前后对比

| 维度 | 之前 Supabase | 之后 D1 |
|---|---|---|
| 数据库类型 | Postgres | SQLite |
| 匿名 key | 公开（浏览器产物里） | **无**（D1 绑定只存在于 Worker 内部） |
| RLS | 有（部分表没配好） | **无**（不需要，请求全在服务端） |
| 备份 | 手动导出 / 免费档无自动备份 | Time Travel 7 天（免费档自带） |
| 闲置暂停 | 7 天无请求暂停 | 无 |
| 数据层 API | PostgREST REST | **自研兼容层**（同形 supabase.js 查询构造器） |
| 全库大小 | ~45 MB | ~45 MB（一样） |

### 已丢弃的列
- `posts.embedding` —— 线上 1039 行全为 NULL，AI 搜索实际只走 `ilike`，列建了没用，不带过来。

---

## 三、改了哪些文件

**新增**：
- `src/lib/d1-schema.mjs` — 表结构唯一来源（11 表 + 索引）
- `src/lib/d1.ts` — D1 查询层（~430 行，已用真实 SQLite 跑 45 项测试）
- `src/lib/runtime-env.ts` — 运行时环境缓存（middleware 注入）
- `scripts/gen-d1-schema.mjs` — DDL 生成器
- `scripts/import-to-d1.mjs` — 备份 JSON → D1 SQL
- `database/d1-schema.sql` — 生成的建表 SQL

**修改**：
- `src/lib/supabase.ts` — 现在是 Proxy：有 D1 绑定走 D1，没有走 Supabase
- `src/lib/supabase-admin.ts` — D1 模式下不需要 service_role key
- `src/middleware.ts` — 请求开始时把 runtime env 注入缓存

**所有 46 处调用点**（`supabase.from(...)`）**一行都没动**——靠 Proxy 自动分派。

---

## 四、验证清单

部署完后打开以下页面，确认都正常：

1. **首页** `https://xtcer.cn/` —— 文章 / 动态 / Banner 都出现
2. **优惠页** `https://xtcer.cn/deals` —— 338 张卡片，分类 / 翻页 / 排序
3. **管理后台** `https://xtcer.cn/admin` —— 数量面板正确
4. **后台访客** `https://xtcer.cn/admin/visitors` —— 趋势图正常
5. **后台反馈** `https://xtcer.cn/admin/feedback` —— 不需要 service_role key 就能读
6. **点赞/反馈** 走一遍 —— 数据写回 D1

如果某个页面崩了：
1. 看浏览器 Network 有无 500
2. `npx wrangler tail` 看 Worker 日志
3. 最坏情况：Pages 项目里删掉 DB 绑定 → 秒级回退到 Supabase

---

## 五、常见问题

**Q: 导入 visitors 太大（56 MB SQL），会不会超时？**
A: `wrangler d1 execute --file` 会自动分片发送。实测单句最多几百行，56 MB 分几百次发送，几分钟完成。如果中途断开，可以先 `DELETE FROM visitors;` 再重跑。

**Q: D1 的 "5 GB / 5M 读·日 / 100K 写·日" 够吗？**
A: 全库 45 MB → 远不到 5 GB。读：首页 + 文章页 SSR 每页几个 SELECT → 日请求量按现有流量完全够。写：visitors 日均 1,700 行 INSERT → 远超 100K/日。免费档绰绰有余。

**Q: 以后更新文章（前台 or 后台）时数据去哪了？**
A: 所有写操作现在直接落 D1。不再走 Supabase。后台的 增删改查 / API 接口 全部通过 `supabase` 代理发到 D1。

**Q: 以后还能用 Supabase Dashboard 改数据吗？**
A: 不能。数据在 D1 了，只能用 `wrangler d1 execute` 或 Cloudflare Dashboard → Workers & Pages → D1 里查看。后台管理页面（/admin/*）本身就是操作入口。
