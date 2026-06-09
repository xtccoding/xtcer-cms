# XTcer CMS

> 🚀 **[Live Demo](https://xtcer.cn)** — 技术探索者 · eXploring Tech

**XTcer = eXploring Tech er（技术探索者）**

一个基于 **Astro + Supabase + Cloudflare Pages** 的轻量级 CMS，零成本部署，极速加载。

![Astro](https://img.shields.io/badge/Astro-SSR-FF5D01?logo=astro)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3FCF8E?logo=supabase)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Pages-F38020?logo=cloudflare)
![Tailwind](https://img.shields.io/badge/Tailwind-CSS-06B6D4?logo=tailwindcss)
![License](https://img.shields.io/badge/License-MIT-blue)

---

## 品牌故事

**XTcer** 代表 **eXploring Tech er**（技术探索者）：

- **XT** = eXploring Tech（探索技术）
- **cer** = 者（人/者后缀）

> 探索前沿，洞见未来

我们站在技术前沿，持续追踪 AI、安全、云服务等前沿技术动态，为你筛选最有价值的信息。

---

## Demo

**🔗 [https://xtcer.cn](https://xtcer.cn)**

| 页面 | 链接 | 说明 |
|------|------|------|
| 首页 | [xtcer.cn](https://xtcer.cn) | Siri 风格波浪 + 粒子效果 + 文章 + 导航 + 情报 |
| 文章 | [xtcer.cn/posts/...](https://xtcer.cn) | Markdown + 目录 + 评论 |
| 优惠 | [xtcer.cn/deals](https://xtcer.cn/deals) | 云服务产品目录 |
| 情报 | [xtcer.cn/feeds](https://xtcer.cn/feeds) | 8 类实时情报流 |
| 关于 | [xtcer.cn/about](https://xtcer.cn/about) | 品牌故事 |
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
| 🖼 图床 | R2 存储 + hash 去重 + 标签系统 + 搜索 + 灯箱 | ✅ |
| 📁 文件 | 文件存储 + 分享链接 + 密码保护 + 过期 + 下载统计 | ✅ |
| 👁 访客 | 自动记录 + 统计 + IP 黑名单 | ✅ |
| 🔍 搜索 | 全局搜索（Cmd+K / Ctrl+K） | ✅ |
| 📊 SEO | sitemap.xml + OG meta + RSS + Schema.org | ✅ |
| 💬 评论 | Giscus（基于 GitHub Discussions） | ✅ |
| 🤖 AI | Cerebras 免费模型（润色/扩展/摘要/翻译） | ✅ |
| 🌗 主题 | Light / Dark 切换，localStorage 持久化 | ✅ |
| 📱 响应式 | 移动端完美适配 | ✅ |
| ✨ 粒子效果 | Siri 风格波浪 + 背景粒子 + 鼠标跟随 | ✅ |
| 🎨 外观管理 | Banner 文字 + 粒子效果参数可配置 | ✅ |

---

## 技术栈

```
┌─────────────────────────────────────────────────────────────┐
│                       XTcer CMS                             │
├────────────────┬────────────────┬───────────────────────────┤
│   Astro SSR    │   Supabase     │   Cloudflare Pages        │
│   (前端框架)    │  (PostgreSQL)  │   (部署 / CDN / Workers)  │
├────────────────┼────────────────┼───────────────────────────┤
│   Tailwind CSS │  Row Level     │   边缘计算 (Edge Runtime)  │
│   marked       │  Security      │   自动 HTTPS              │
│   Giscus       │  JSONB 扩展     │   环境变量                │
│   Cerebras AI  │                │                           │
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
├── styles/
│   └── global.css                 # 全局样式（Glassmorphism 工具类）
├── pages/
│   ├── index.astro                # 首页（Siri 波浪 + 粒子 + Banner）
│   ├── deals.astro                # 云服务优惠列表
│   ├── feeds.astro                # 情报流（8 分类 Tab）
│   ├── posts/[id].astro           # 文章详情（Markdown + TOC + 评论）
│   ├── about.astro                # 关于页（品牌故事）
│   ├── contact / privacy / tos
│   ├── admin/
│   │   ├── index.astro            # 设置页（架构概览 + 全量建表 SQL）
│   │   ├── login.astro            # 登录
│   │   ├── dashboard.astro        # 文章管理
│   │   ├── new.astro              # 新建文章（AI 助手）
│   │   ├── edit/[id].astro        # 编辑文章
│   │   ├── deals.astro            # 优惠管理
│   │   ├── feeds.astro            # 情报管理
│   │   ├── links.astro            # 导航管理
│   │   ├── appearance.astro       # 外观管理（Banner + 粒子效果）
│   │   ├── [slug].astro           # 图床管理
│   │   ├── files/[slug].astro     # 文件管理 + 分享
│   │   └── visitors.astro         # 访客统计 + 黑名单
│   ├── s/[slug].astro             # 文件分享页（公开）
│   └── api/
│       ├── posts/                 # 文章 CRUD + 浏览量
│       ├── deals/                 # 优惠 CRUD + 批量 upsert
│       ├── feeds/                 # 情报 CRUD + 3 层防重批量
│       ├── links/                 # 导航 CRUD
│       ├── settings.ts            # 站点配置（Banner + 粒子效果）
│       ├── visitors/              # 访客统计 + 记录
│       ├── blacklist/             # 黑名单管理
│       ├── files/                 # 文件管理 + 分享 + 密码验证
│       ├── search.ts              # 全文搜索
│       └── ai/index.ts            # AI 写作助手
├── astro.config.mjs
├── tailwind.config.mjs            # Tailwind 配置
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
| `files` | 文件分享 | `share_slug UNIQUE` + 密码 + 过期 |
| `site_settings` | 站点配置 | `key UNIQUE`（Banner + 粒子效果） |

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
| `ADMIN_PATH` | ❌ | 自定义管理后台路径（默认 `/admin`） |

> 在 Cloudflare Pages → Settings → Environment variables 中配置。

### 自定义管理路径（安全加固）

设置 `ADMIN_PATH` 可以隐藏默认的 `/admin` 入口，防止暴力破解：

```env
# 示例：使用随机字符串作为管理入口
ADMIN_PATH=/a7b9c3d5e2
```

**效果**：
- ❌ 访问 `/admin` → 404 Not Found
- ✅ 访问 `/a7b9c3d5e2` → 重定向到管理后台

**安全建议**：
- 使用随机字符串，避免常见路径如 `/manage`、`/dashboard`
- 定期更换路径
- 路径设置后需要重新部署

---

## 外观管理

### 后台配置

访问 `/admin/appearance` 可以配置：

**Banner 文字**：
- 标题第一行：探索前沿
- 标题分隔符：·
- 标题第二行：洞见未来
- 英文 Tagline：eXploring Tech
- 中文 Tagline：技术探索者
- 描述标签：每行一个

**粒子效果模式**：

| 模式 | 说明 | 效果 |
|------|------|------|
| Siri 波浪 | 多层同心圆波动 | ◎◎◎ |
| 单环波动 | 单个圆环波动 | ○ |
| 双环波动 | 双层圆环波动 | ◎○ |
| 仅粒子 | 只有背景粒子 | · · · |

**可调参数**：
- 背景粒子：数量、大小、透明度、速度、颜色
- Siri 波浪：层数、半径、间距、幅度、频率、速度
- 鼠标效果：开关、半径、脉冲速度

### 数据库配置

配置存储在 `site_settings` 表：

```sql
CREATE TABLE site_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 设计风格

### Glassmorphism 设计系统

- 🌗 Light / Dark 主题切换（localStorage 持久化，系统跟随）
- 🪟 苹果毛玻璃特效（`backdrop-filter: blur`）
- ✨ Siri 风格中心波浪动画
- 🎨 渐变背景 + 网格纹理 + 浮动光球
- 🖱️ 鼠标跟随脉冲效果
- 📱 响应式：3 列（大屏）→ 2 列（平板）→ 1 列（手机）
- 📜 细线半透明滚动条
- ⌨️ 全局搜索快捷键（Cmd+K / Ctrl+K）

### 字体

- **品牌 Logo**：Space Grotesk（几何感、科技感）
- **正文内容**：Inter（可读性极佳、专业）

### 颜色方案

| 颜色 | 用途 |
|------|------|
| `#2997ff` | 主色（电光蓝） |
| `#bf5af2` | 强调色（紫色） |
| `#00ffff` | 辅助色（青色） |
| `#30d158` | 成功色（绿色） |
| `#ff9f0a` | 警告色（橙色） |
| `#ff453a` | 危险色（红色） |

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
| `/api/deals` | GET | 公开 | 优惠列表 |
| `/api/deals` | POST / PUT / DELETE | Cookie / Key | CRUD |
| `/api/deals/batch` | POST | Cookie / Key | 批量 upsert |
| `/api/feeds` | GET | 公开 | 情报列表 |
| `/api/feeds` | POST / PUT / DELETE | Cookie / Key | CRUD |
| `/api/feeds/batch` | POST | Cookie / Key | 批量 upsert（3 层防重） |
| `/api/links` | GET / POST | Cookie | 导航链接 |
| `/api/settings` | GET | 公开 | 站点配置 |
| `/api/settings` | POST | Cookie | 更新配置 |
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

---

## License

MIT
