# XTCer CMS

> 🚀 **[Live Demo](https://xtcer.cn)** — 技术文章 · 云服务优惠 · AI 情报 · 安全漏洞实时推送

一个基于 **Astro + Supabase + Cloudflare Pages** 的轻量级 CMS，零成本部署，极速加载。

![Astro](https://img.shields.io/badge/Astro-SSR-FF5D01?logo=astro)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3FCF8E?logo=supabase)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Pages-F38020?logo=cloudflare)
![License](https://img.shields.io/badge/License-MIT-blue)

---

## Demo

**🔗 [https://xtcer.cn](https://xtcer.cn)**

| 页面 | 链接 | 说明 |
|------|------|------|
| 首页 | [xtcer.cn](https://xtcer.cn) | 文章 + 导航 + 最新情报 |
| 文章 | [xtcer.cn/posts/...](https://xtcer.cn) | Markdown + 目录 + 评论 |
| 优惠 | [xtcer.cn/deals](https://xtcer.cn/deals) | 云服务产品目录 |
| 情报 | [xtcer.cn/feeds](https://xtcer.cn/feeds) | 8 类实时情报流 |
| RSS | [xtcer.cn/rss.xml](https://xtcer.cn/rss.xml) | 订阅源 |
| 管理后台 | [xtcer.cn/admin](https://xtcer.cn/admin) | 密码保护 |

---

## 功能一览

| 模块 | 功能 | 状态 |
|------|------|------|
| 📝 文章 | Markdown 编辑器 + 预览 + AI 助手 + 目录 + 评论 + 浏览量 | ✅ |
| 🔗 导航 | 分组管理常用链接 | ✅ |
| 💰 优惠 | 云服务产品目录，外部 cron 推送 | ✅ |
| 📡 情报 | 8 类情报流，3 层防重，多 bot 推送 | ✅ |
| 👁 访客 | 自动记录 + 统计 + IP 黑名单 | ✅ |
| 🔍 搜索 | 全局搜索（Cmd+K / Ctrl+K） | ✅ |
| 📊 SEO | sitemap.xml + OG meta + RSS + Schema.org | ✅ |
| 💬 评论 | Giscus（基于 GitHub Discussions） | ✅ |
| 🤖 AI | Cerebras 免费模型（润色/扩展/摘要/翻译） | ✅ |
| 🌗 主题 | Light / Dark 切换，localStorage 持久化 | ✅ |
| 📱 响应式 | 移动端完美适配 | ✅ |

---

## 技术栈

```
┌─────────────────────────────────────────────────────────────┐
│                       XTCer CMS                             │
├────────────────┬────────────────┬───────────────────────────┤
│   Astro SSR    │   Supabase     │   Cloudflare Pages        │
│   (前端框架)    │  (PostgreSQL)  │   (部署 / CDN / Workers)  │
├────────────────┼────────────────┼───────────────────────────┤
│   marked       │  Row Level     │   边缘计算 (Edge Runtime)  │
│   Giscus       │  Security      │   自动 HTTPS              │
│   Cerebras AI  │  JSONB 扩展     │   环境变量                │
└────────────────┴────────────────┴───────────────────────────┘
```

---

## 项目结构

```
src/
├── components/
│   └── Sidebar.astro              # 管理后台侧边栏
├── layouts/
│   └── Layout.astro               # 全局布局 + 搜索弹窗 + 主题切换 + SEO
├── lib/
│   ├── supabase.ts                # Supabase 客户端
│   └── database.types.ts          # TypeScript 类型定义
├── middleware.ts                   # 访客追踪中间件
├── pages/
│   ├── index.astro                # 首页（文章 + 导航 + 情报）
│   ├── deals.astro                # 云服务优惠列表
│   ├── feeds.astro                # 情报流（8 分类 Tab）
│   ├── posts/[id].astro           # 文章详情（Markdown + TOC + 评论 + 更多文章）
│   ├── about / contact / privacy / tos
│   ├── admin/
│   │   ├── index.astro            # 设置页（架构概览 + 全量建表 SQL）
│   │   ├── login.astro            # 登录
│   │   ├── dashboard.astro        # 文章管理
│   │   ├── new.astro              # 新建文章（AI 助手）
│   │   ├── edit/[id].astro        # 编辑文章
│   │   ├── deals.astro            # 优惠管理
│   │   ├── feeds.astro            # 情报管理
│   │   ├── links.astro            # 导航管理
│   │   └── visitors.astro         # 访客统计 + 黑名单
│   └── api/
│       ├── posts/                 # 文章 CRUD + 浏览量
│       ├── deals/                 # 优惠 CRUD + 批量 upsert
│       ├── feeds/                 # 情报 CRUD + 3 层防重批量
│       ├── links/                 # 导航 CRUD
│       ├── visitors/              # 访客统计 + 记录
│       ├── blacklist/             # 黑名单管理
│       ├── search.ts              # 全文搜索
│       └── ai/index.ts            # AI 写作助手
├── astro.config.mjs
├── wrangler.toml
└── package.json
```

---

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/xtccoding/xtcer-cms.git
cd xtcer-cms
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

```env
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key
ADMIN_PASSWORD=your-admin-password
FEED_API_KEY=your-feed-api-key
```

### 3. 创建数据库

在 Supabase SQL Editor 中执行建表 SQL（完整 SQL 在管理后台 `/admin` 设置页可一键复制）。

| 表名 | 用途 | 特殊约束 |
|------|------|----------|
| `posts` | 文章 | `views` 浏览量计数 |
| `links` | 导航链接 | — |
| `visitors` | 访客记录 | — |
| `blacklist` | IP 黑名单 | `ip UNIQUE` |
| `deals` | 云服务优惠 | `UNIQUE(provider, product)` |
| `feeds` | 情报流 | `UNIQUE(feed_type, title)` + `url_hash` |

所有表启用 RLS，策略为全开放（写入安全靠 API 层认证）。

### 4. 本地开发

```bash
npm run dev
```

访问 `http://localhost:4321`

### 5. 部署

```bash
git push origin main
```

Cloudflare Pages 自动构建部署。

---

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `PUBLIC_SUPABASE_URL` | ✅ | Supabase 项目 URL |
| `PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase 匿名 Key |
| `ADMIN_PASSWORD` | ✅ | 管理后台密码（无硬编码回退） |
| `FEED_API_KEY` | ✅ | 外部推送认证 Key |

> 在 Cloudflare Pages → Settings → Environment variables 中配置。

---

## API 文档

### 认证方式

| 方式 | 用于 | 说明 |
|------|------|------|
| Cookie `admin_auth` | 管理后台 | 登录后自动设置 |
| Header `X-Feed-Key` | 外部程序 | 值等于 `FEED_API_KEY` |

### 端点总览

| 路径 | 方法 | 认证 | 说明 |
|------|------|------|------|
| `/api/posts` | GET | Cookie | 文章列表 |
| `/api/posts` | POST | Cookie / Key | 创建文章 |
| `/api/posts/[id]` | GET | 公开 | 文章详情 |
| `/api/posts/[id]` | PUT / DELETE | Cookie / Key | 更新 / 删除 |
| `/api/posts/views` | POST | 公开 | 浏览量 +1 |
| `/api/deals` | GET | 公开 | 优惠列表（category / region 筛选） |
| `/api/deals` | POST / PUT / DELETE | Cookie / Key | CRUD |
| `/api/deals/batch` | POST | Cookie / Key | 批量 upsert |
| `/api/feeds` | GET | 公开 | 情报列表（type / priority 筛选） |
| `/api/feeds` | POST / PUT / DELETE | Cookie / Key | CRUD |
| `/api/feeds/batch` | POST | Cookie / Key | 批量 upsert（3 层防重） |
| `/api/links` | GET / POST | Cookie | 导航链接 |
| `/api/links/[id]` | PUT / DELETE | Cookie | 导航链接 |
| `/api/visitors` | GET | Cookie | 访客统计 |
| `/api/visitors/track` | POST | 公开 | 记录访客 |
| `/api/blacklist` | GET / POST / DELETE | Cookie | 黑名单 |
| `/api/search` | GET | 公开 | 全文搜索 |
| `/api/ai` | POST | Cookie | AI 写作助手 |

### 批量推送示例

**推送优惠：**

```bash
curl -X POST https://xtcer.cn/api/deals/batch \
  -H "Content-Type: application/json" \
  -H "X-Feed-Key: YOUR_KEY" \
  -d '{
    "deals": [{
      "provider": "火山引擎",
      "product": "轻量应用服务器",
      "price": "¥29/年",
      "price_cny": 29,
      "config": "2核2G / 40G",
      "category": "compute",
      "region": "cn"
    }]
  }'
```

**推送情报：**

```bash
curl -X POST https://xtcer.cn/api/feeds/batch \
  -H "Content-Type: application/json" \
  -H "X-Feed-Key: YOUR_KEY" \
  -d '{
    "type": "ai_monetization",
    "items": [{
      "title": "DeepSeek 注册送100万tokens",
      "url": "https://platform.deepseek.com",
      "source": "alpha-feed",
      "summary": "新用户注册即送额度",
      "tags": ["llm", "free"],
      "priority": "high"
    }]
  }'
```

**推送文章：**

```bash
curl -X POST https://xtcer.cn/api/posts \
  -H "Content-Type: application/json" \
  -H "X-Feed-Key: YOUR_KEY" \
  -d '{
    "title": "文章标题",
    "content": "Markdown 内容..."
  }'
```

---

## 情报系统（Alpha Feed）

### 8 大情报分类

| 分类 | feed_type | 说明 | 频率 |
|------|-----------|------|------|
| 🔒 安全 | `security` | CVE、漏洞、攻击事件 | 每天 2 次 |
| 🐙 GitHub | `github_trending` | 开源热门项目 | 每天 1 次 |
| 🤖 AI | `ai_monetization` | AI API 额度 / 价差 | 每天 1 次 |
| 💰 加密 | `crypto_alpha` | DeFi / 空投 / 新链 | 每天 2 次 |
| 💸 捡漏 | `deal_hunt` | 云服务 / 域名 / 工具优惠 | 每天 1 次 |
| 📰 行业 | `industry_move` | 大厂动态 / 收购 / 政策 | 每周 2 次 |
| 🛠 工具 | `devtool_launch` | 新 CLI / 插件 / 平台 | 每周 1 次 |
| 🎓 学习 | `learn_alpha` | 免费课程 / 资源 | 每周 1 次 |

### 3 层防重机制

```
第 1 层: UNIQUE(feed_type, title)     → 80% 覆盖率
第 2 层: url_hash 归一化去重          → 90% 覆盖率
第 3 层: 标题模糊匹配（相似度 > 60%） → 95% 覆盖率
```

### 多 Bot 架构

```
Hermes (Bot 1)                    Junier (Bot 2)
├── deal_hunt (每天 09:00)        ├── security (每天 09:00/21:00)
├── ai_monetization (每天 09:30)  ├── github_trending (每天 10:00)
└── summary (每周日 10:00)        ├── crypto_alpha (每天 08:00/20:00)
                                  ├── industry_move (周一/周四)
                                  ├── devtool_launch (周六)
                                  └── learn_alpha (周日)

         ↓ 共用 FEED_API_KEY ↓

    POST /api/feeds/batch → Supabase (3 层防重)
```

---

## 页面路由

### 公开页面

| 路径 | 说明 |
|------|------|
| `/` | 首页（文章 + 导航 + 最新情报） |
| `/posts/[id]` | 文章详情（Markdown + TOC + 评论 + 更多文章悬浮框） |
| `/deals` | 云服务优惠（分类 Tab + 卡片） |
| `/feeds` | 情报流（8 分类 Tab + 优先级标记） |
| `/about` | 关于我们 |
| `/contact` | 联系我们 |
| `/privacy` | 隐私政策 |
| `/tos` | 服务条款 |
| `/rss.xml` | RSS 订阅 |
| `/sitemap.xml` | SEO 站点地图 |

### 管理后台

| 路径 | 说明 |
|------|------|
| `/admin` | 设置页（架构概览 + 全量建表 SQL） |
| `/admin/login` | 登录 |
| `/admin/dashboard` | 文章管理 |
| `/admin/new` | 新建文章（AI 助手） |
| `/admin/edit/[id]` | 编辑文章 |
| `/admin/deals` | 优惠管理 |
| `/admin/feeds` | 情报管理 |
| `/admin/links` | 导航管理 |
| `/admin/visitors` | 访客统计 + 黑名单 |

---

## 设计风格

- 🌗 Light / Dark 主题切换（localStorage 持久化，系统跟随）
- 🪟 苹果毛玻璃特效（`backdrop-filter: blur`）
- 🎨 渐变背景 + 网格纹理
- 📱 响应式：3 列（大屏）→ 2 列（平板）→ 1 列（手机）
- 📜 细线半透明滚动条
- ⌨️ 全局搜索快捷键（Cmd+K / Ctrl+K）

---

## AI 写作助手

基于 Cerebras 免费模型，支持多模型自动切换：

| 功能 | 说明 |
|------|------|
| 润色 | 优化表达，更流畅专业 |
| 扩展 | 添加细节和例子 |
| 摘要 | 生成 100 字摘要 |
| 起标题 | 生成 5 个标题建议 |
| 翻译 | 中英互译 |

模型按顺序尝试：`gpt-oss-120b` → `zai-glm-4.7` → `qwen-3-235b` → `llama3.1-8b`

---

## SEO 优化

- ✅ sitemap.xml（自动更新，包含所有文章）
- ✅ robots.txt（允许所有爬虫）
- ✅ Open Graph meta 标签
- ✅ Schema.org Article 结构化数据
- ✅ canonical URL
- ✅ RSS 订阅
- ✅ 语义化 HTML
- ✅ Lighthouse 满分架构

---

## 已知限制

- Cloudflare Pages 免费版 Worker 大小限制 3MB
- Supabase 免费版 500MB 数据库 + 1GB 存储
- AI 写作助手使用免费模型，可能不稳定
- 无文件上传功能（可通过 Supabase Storage 扩展）

---

## License

MIT
