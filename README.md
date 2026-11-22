# XTcer CMS

> 技术探索者 · eXploring Tech

轻量级自建 CMS：**Astro SSR + Cloudflare D1 + R2 + Pages**。零外部请求，边缘缓存，单文件数据库。

```
Live   https://xtcer.cn
Stack  Astro 5 · D1 (SQLite) · R2 · Pages · Drizzle · Tailwind 4
```

---

## 零外部请求

页面渲染时不向任何第三方发请求。没有 CDN 字体、没有统计脚本、没有图标库、没有广告。

| 资源 | 做法 |
|---|---|
| 字体 | `@fontsource` 自托管（Inter 可变字体 latin + latin-ext；Space Grotesk 仅 700）。CJK 走系统字体，不下载中文字体包 |
| 图标 | 内联 SVG，不引 iconfont / lucide CDN |
| 统计 | Cloudflare Web Analytics（边缘注入，不落第三方 JS） |
| 图片 | Cloudflare R2 自建图床，hash 去重 |
| 数据库 | Cloudflare D1（SQLite），与 Worker 同区域 |
| 评论 | 自建：D1 `comments` 表 + `/api/comments`，无第三方脚本 |

> RSS / sitemap / OG meta 全部由站点自身生成，不依赖外部服务。

---

## 品牌故事

**XTcer** = **eXploring Tech** + **er（者）**

- **XT** — eXploring Tech，探索技术
- **cer** — 者，人

> 探索前沿，洞见未来

持续追踪 AI、安全、云服务等前沿动态，筛选真正有价值的信息。

---

## 功能

| 模块 | 能力 |
|---|---|
| 文章 | Markdown + 目录 + 标签 + 作者 + 相关推荐 + 浏览量 |
| 评论 | 自建（D1），SSR 首屏 + 表单直发，限流 5 条 / 10 分钟 / IP |
| 情报流 | 8 类分组，三层防重（`UNIQUE(feed_type,title)` + `url_hash` + 归一化 URL） |
| 优惠 | 云服务目录，按价格排序，外部 cron 批量 upsert |
| 图床 | R2 直传（S3 签名）+ hash 去重 + 标签 + 灯箱 |
| 文件 | R2 存储 + 分享链接 + 密码 + 过期 + 下载统计 |
| 账号 | 注册 / 登录 / 会话（HMAC Cookie）+ 每日签到 + 积分 + 兑换 + 收藏 |
| 搜索 | 全局搜索（Cmd+K / Ctrl+K） |
| 后台 | Dashboard / 文章 / 优惠 / 情报 / 链接 / 图床 / 文件 / 外观 / 访客 / 反馈 |
| SEO | sitemap.xml + RSS + OG + Schema.org + canonical |
| 主题 | Light / Dark，localStorage 持久化 |
| 外观 | Banner 文案 + 粒子动画参数（数量/大小/速度/颜色）可配 |
| 缓存 | 边缘 Cache API：文章 1h、列表 5min、5xx 兜底 15s |

---

## 技术栈

```
┌──────────────────────────────────────────────────────────────┐
│                          XTcer CMS                           │
├─────────────────┬──────────────────┬─────────────────────────┤
│  Astro 5 (SSR)  │  Cloudflare D1   │  Cloudflare R2          │
│  src/pages      │  SQLite · SQL    │  S3 兼容 · 图床/文件     │
│  src/components │  Drizzle ORM     │  签名直传               │
├─────────────────┼──────────────────┼─────────────────────────┤
│  Tailwind 4     │  Pages Functions │  Cache API              │
│  marked         │  middleware      │  Web Analytics          │
│  fontsource     │  HMAC Cookie 会话 │  Edge Runtime           │
└─────────────────┴──────────────────┴─────────────────────────┘
```

---

## 目录

```
src/
├── layouts/
│   └── Layout.astro              # 全站布局 · 搜索 · 主题 · SEO
├── components/
│   ├── AuthPanel.astro           # 登录/注册面板
│   ├── DealCard.astro            # 优惠卡片（含点赞）
│   ├── DealsTable.astro          # 优惠表格视图
│   ├── FeedbackBox.astro         # 反馈
│   ├── FestivalBanner.astro      # 节日横幅
│   ├── Pagination.astro          # 分页
│   └── Sidebar.astro             # 后台侧栏
├── lib/
│   ├── db.ts                     # D1 + Drizzle 客户端
│   ├── schema.ts                 # 表定义与索引
│   ├── store.ts                  # 数据访问层（唯一写 SQL 的地方）
│   ├── auth.ts                   # 账号 / 会话
│   ├── admin-auth.ts             # 后台鉴权
│   ├── admin-path.ts             # 自定义后台路径
│   ├── accounts.ts               # 积分 / 签到 / 兑换
│   ├── http.ts                   # JSON 响应 · 限流 · 同源校验
│   ├── interactions.ts           # 点赞 / IP 哈希
│   ├── theme.ts                  # 主题
│   ├── freebie.ts                # 免费额度解析
│   ├── deal-categories.ts        # 优惠分类
│   ├── related-posts.ts          # 相关文章
│   ├── auto-link.ts              # 正文自动内链
│   ├── price.mjs                 # 价格换算
│   └── runtime-env.ts            # 运行时 env 注入
├── data/
│   ├── festivals.ts              # 节日数据
│   ├── deal-curation.ts          # 优惠人工精选
│   └── gamification.ts           # 徽章 / 等级
├── styles/
│   ├── global.css                # 全站样式（Glassmorphism）
│   ├── admin.css                 # 后台样式
│   └── fonts.css                 # 自托管字体声明
├── middleware.ts                 # 边缘缓存 + 后台路径重写
└── pages/
    ├── index.astro               # 首页
    ├── posts/index.astro         # 文章列表
    ├── posts/[id].astro          # 文章详情
    ├── feeds.astro               # 情报流
    ├── deals.astro               # 优惠
    ├── tags/ · topics/ · authors/
    ├── account.astro             # 个人中心（签到/积分/收藏）
    ├── login · register
    ├── about · contact · privacy · tos
    ├── s/[slug].astro            # 文件分享
    ├── rss.xml.ts · sitemap.xml.ts · theme.css.ts
    ├── admin/                    # 后台（密码保护）
    └── api/                      # 全部 JSON 接口
```

---

## 快速开始

```bash
git clone https://github.com/xtccoding/xtcer-cms.git
cd xtcer-cms
npm install
cp .env.example .env      # 按需填写
npm run dev               # http://localhost:4321
```

### 建库

D1 表结构见 `database/d1-schema.sql`：

```bash
npx wrangler d1 execute xtcer-content --local  --file database/d1-schema.sql
npx wrangler d1 execute xtcer-content --remote --file database/d1-schema.sql
```

`wrangler.toml` 里的 `database_id` 换成自己的 D1。

---

## 环境变量

在 Cloudflare Pages → Settings → Environment variables 配置。

| 变量 | 必填 | 用途 |
|---|---|---|
| `ADMIN_PASSWORD` | ✅ | 后台登录密码 |
| `FEED_API_KEY` | ✅ | 外部推送（`X-Feed-Key`） |
| `LIKE_SALT` | ✅ | 点赞 + 评论的 IP 哈希盐（未配则两项功能关闭） |
| `UPLOAD_API_KEY` | ✅ | 上传接口 |
| `ADMIN_PATH` | ❌ | 自定义后台入口，默认 `/admin` |
| `R2_ACCOUNT_ID` | ✅ | R2 账号 |
| `R2_ACCESS_KEY_ID` | ✅ | R2 Access Key |
| `R2_SECRET_ACCESS_KEY` | ✅ | R2 Secret |
| `R2_BUCKET_NAME` | ✅ | 桶名 |
| `R2_PUBLIC_URL` | ✅ | 公开访问域名 |

### 隐藏后台入口

```env
ADMIN_PATH=/a7b9c3d5e2
```

访问 `/admin` 直接 404，只有 `/a7b9c3d5e2` 能进。

---

## API

### 鉴权

| 方式 | 用于 |
|---|---|
| Cookie `admin_auth` | 后台页面与接口 |
| `X-Feed-Key: <FEED_API_KEY>` | 外部程序写入 |

### 端点

| 路径 | 方法 | 鉴权 |
|---|---|---|
| `/api/posts` | GET / POST | Cookie / Key |
| `/api/posts/[id]` | GET / PUT / DELETE | 公开 / Cookie / Key |
| `/api/posts/views` | POST | 公开 |
| `/api/posts/batch-delete` · `/api/posts/tags` | POST / GET | Cookie |
| `/api/deals` · `/api/deals/batch` | CRUD / 批量 | 公开 / Cookie / Key |
| `/api/feeds` · `/api/feeds/batch` | CRUD / 批量 | 公开 / Cookie / Key |
| `/api/links` · `/api/links/[id]` | CRUD | Cookie |
| `/api/settings` | GET / POST | 公开 / Cookie |
| `/api/search` | GET | 公开 |
| `/api/comments` | GET / POST | 公开（限流） |
| `/api/likes` | GET / POST | 公开 |
| `/api/gallery` · `/api/upload` | 上传 | Cookie / Key |
| `/api/files/*` | 上传 / 分享 / 下载 | Cookie / 分享码 |
| `/api/user/summary` · `checkin` · `claim` · `redeem` · `favorite` | 账号 | 用户会话 |
| `/api/auth/login` · `register` · `logout` | 认证 | 公开 |
| `/api/ai` · `/api/ai/tag` | POST | Cookie |
| `/api/feedback` · `/api/admin/feedback` | 反馈 | 公开 / Cookie |

### 批量推送示例

```bash
# 情报
curl -X POST https://xtcer.cn/api/feeds/batch \
  -H 'Content-Type: application/json' \
  -H 'X-Feed-Key: YOUR_KEY' \
  -d '{
    "type": "ai_monetization",
    "items": [{
      "title": "示例情报标题",
      "url": "https://example.com",
      "source": "collector",
      "summary": "一句话摘要",
      "tags": ["llm"],
      "priority": "high"
    }]
  }'

# 优惠
curl -X POST https://xtcer.cn/api/deals/batch \
  -H 'Content-Type: application/json' \
  -H 'X-Feed-Key: YOUR_KEY' \
  -d '{
    "deals": [{
      "provider": "示例云",
      "product": "轻量服务器",
      "price": "¥29/年",
      "price_cny": 29,
      "config": "2核2G / 40G",
      "category": "compute",
      "region": "cn"
    }]
  }'
```

---

## 性能与配额

边缘缓存走 **Cache API**（`middleware.ts`），TTL 按路径分级：

| 路径 | 边缘缓存 |
|---|---|
| `/posts/[id]` | 1 小时 |
| `/` `/posts` `/feeds` `/deals` `/tags/*` | 5 分钟 |
| 其它公开页 | 2 分钟 |
| `/admin` `/api` `/account` | 不缓存 |
| 5xx 兜底 | 15 秒（防空转重试打穿数据库） |

计数类查询（`countFeeds` / 点赞聚合）走 60 秒 isolate 内存缓存。

> D1 免费额度是 **500 万行读 / 天**。高频列表页如果没有边缘缓存 + 计数缓存，很容易被爬虫打穿并返回 `7500`（配额超限）。上面两层缓存就是为此加的。

---

## 部署

```bash
git push origin main
```

Cloudflare Pages 自动构建。首次需在 Pages 绑定 D1（`DB`）与 R2。

---

## 已知限制

- Pages 免费版 Worker 体积上限 3 MB
- D1 免费版 500 万行读 / 天、5 GB 存储
- R2 免费版 10 GB 存储 / 100 万次 A 类操作 / 月
- AI 助手调用 Cerebras 免费模型，高峰期可能不稳定

---

## License

MIT
