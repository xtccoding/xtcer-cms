# XTCer - 项目文档

## 基本信息
- **项目名**: xtcer-cms
- **仓库**: https://github.com/xtccoding/xtcer-cms
- **部署地址**: https://xtcer-enp.pages.dev
- **技术栈**: Astro + Supabase + Cloudflare Pages
- **管理后台密码**: 环境变量 `ADMIN_PASSWORD`，默认 `xtcer2024`
- **外部推送 Key**: 环境变量 `FEED_API_KEY`（deals/feeds 的 X-Feed-Key 认证，Hermes + Junier 共用）

## Supabase 配置
- **项目 ID**: ltwwyznurskgsphujarm
- **URL**: https://ltwwyznurskgsphujarm.supabase.co
- **Anon Key**: sb_publishable_Lt6vsKIX08Ogsb8RW-gzVg_tvECPx6e

## 数据库表

### posts (文章)
```sql
CREATE TABLE posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### links (导航链接)
```sql
CREATE TABLE links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  category TEXT DEFAULT '默认',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### visitors (访客记录)
```sql
CREATE TABLE visitors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ip TEXT,
  path TEXT,
  user_agent TEXT,
  referer TEXT,
  country TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### blacklist (IP 黑名单)
```sql
CREATE TABLE blacklist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ip TEXT UNIQUE NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

所有表均启用 RLS，策略为全开放（anon key 可增删改查）。

## 页面路由

### 公开页面
| 路径 | 说明 |
|------|------|
| `/` | 首页：文章列表 + 导航链接 |
| `/posts/[id]` | 文章详情（Markdown 渲染） |
| `/about` | 关于我们 |
| `/contact` | 联系我们 |
| `/privacy` | 隐私政策 |
| `/tos` | 服务条款 |
| `/deals` | 云服务优惠列表（分类 Tab + 卡片展示） |
| `/feeds` | 情报流（8分类 Tab + 优先级标记） |

### 管理后台
| 路径 | 说明 |
|------|------|
| `/admin/login` | 登录页 |
| `/admin/logout` | 退出登录 |
| `/admin` | 设置/初始化引导 |
| `/admin/dashboard` | 文章管理（增删改查 + 搜索） |
| `/admin/new` | 新建文章（Markdown 编辑器 + AI 助手） |
| `/admin/edit/[id]` | 编辑文章（Markdown 编辑器 + AI 助手） |
| `/admin/links` | 导航链接管理 |
| `/admin/visitors` | 访客统计 + IP 黑名单管理 |
| `/admin/deals` | 云服务优惠管理（启停/删除/筛选） |

### 公开页面（新增）
| 路径 | 说明 |
|------|------|
| `/deals` | 云服务优惠列表（分类 Tab + 卡片展示） |

### API 路由
| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/posts` | GET/POST | 文章列表/创建 |
| `/api/posts/[id]` | GET/PUT/DELETE | 文章详情/更新/删除 |
| `/api/links` | GET/POST | 导航链接列表/创建 |
| `/api/links/[id]` | PUT/DELETE | 导航链接更新/删除 |
| `/api/visitors` | GET | 访客统计（支持 range 参数：1d/7d/30d） |
| `/api/visitors/track` | POST | 记录访客（中间件自动调用） |
| `/api/blacklist` | GET/POST/DELETE | 黑名单管理 |
| `/api/ai` | POST | AI 写作助手 |
| `/api/deals` | GET/POST/PUT/DELETE | 优惠信息（GET 公开，其余需认证） |
| `/api/deals/batch` | POST | 批量 upsert（按 provider+product 去重） |
| `/api/feeds` | GET/POST/PUT/DELETE | 情报流（GET 公开，其余需认证） |
| `/api/feeds/batch` | POST | 批量 upsert（3层防重：UNIQUE+URL归一化+标题模糊） |

## AI 写作助手
- **服务商**: Cerebras
- **API Key**: csk-j8f8wmwhehryvm54ke95d388rmnnjm5nwvr2ckf6jmj2rv32
- **模型（按顺序尝试）**: gpt-oss-120b → zai-glm-4.7 → qwen-3-235b-a22b-instruct-2507 → llama3.1-8b
- **功能**:
  - `polish`: 润色文章
  - `expand`: 扩展内容
  - `summarize`: 生成摘要
  - `title`: 生成标题建议
  - `translate-en`: 翻译成英文
  - `translate-zh`: 翻译成中文

## 访客追踪
- **中间件**: `src/middleware.ts` 自动记录所有公开页面访问
- **记录信息**: IP、路径、User-Agent、Referer
- **来源**: Cloudflare 请求头 `cf-connecting-ip`

## 设计风格
- 暗色主题（黑色背景 + 白色文字）
- 苹果毛玻璃特效（backdrop-filter: blur）
- 渐变背景 + 网格纹理
- 响应式：3列(大屏) → 2列(平板) → 1列(手机)

## 项目结构
```
src/
├── components/
│   └── Sidebar.astro          # 管理后台侧边栏组件
├── layouts/
│   └── Layout.astro           # 全局布局（CSS 变量 + 背景特效）
├── lib/
│   ├── supabase.ts            # Supabase 客户端
│   └── database.types.ts      # 数据库类型定义
├── middleware.ts               # 访客追踪中间件
├── pages/
│   ├── index.astro            # 首页
│   ├── about.astro            # 关于我们
│   ├── contact.astro          # 联系我们
│   ├── privacy.astro          # 隐私政策
│   ├── tos.astro              # 服务条款
│   ├── posts/[id].astro       # 文章详情
│   ├── admin/
│   │   ├── index.astro        # 设置页
│   │   ├── login.astro        # 登录
│   │   ├── logout.astro       # 退出
│   │   ├── dashboard.astro    # 文章管理
│   │   ├── new.astro          # 新建文章
│   │   ├── edit/[id].astro    # 编辑文章
│   │   ├── links.astro        # 导航管理
│   │   └── visitors.astro     # 访客管理
│   └── api/
│       ├── posts/index.ts     # 文章 API
│       ├── posts/[id].ts      # 文章 API
│       ├── links/index.ts     # 导航 API
│       ├── links/[id].ts      # 导航 API
│       ├── visitors/index.ts  # 访客统计 API
│       ├── visitors/track.ts  # 访客记录 API
│       ├── blacklist/index.ts # 黑名单 API
│       └── ai/index.ts        # AI API
├── astro.config.mjs           # Astro 配置
├── wrangler.toml              # Cloudflare 配置
└── package.json               # 依赖
```

## 已知限制
- Cloudflare Pages 免费版 Worker 大小限制 3MB（当前约 1.3MB）
- Supabase 免费版 500MB 数据库 + 1GB 存储
- AI 写作助手使用免费模型，可能不稳定（已做模型切换容错）
- 无文件上传功能（Supabase Storage 可扩展）

## 已修复问题
- **2026-05-28**: 管理页面文章预览未正确渲染 Markdown，导致纯文本语法标记显示或内容为空。修复方式：先 `marked.parse()` 转 HTML 再剥离标签提取纯文本（`dashboard.astro`）
