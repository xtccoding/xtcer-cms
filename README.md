# XTCer

轻量、美观的内容管理系统。

## 技术栈

- **前端**: [Astro](https://astro.build/) - 极快的静态站点生成器
- **后端**: [Supabase](https://supabase.com/) - 开源的 Firebase 替代方案
- **部署**: [Cloudflare Pages](https://pages.cloudflare.com/) - 免费、全球 CDN

## 功能

- 极快的页面加载速度
- 美观的暗色主题 UI
- 内容管理（通过 Supabase）
- 用户认证（通过 Supabase Auth）
- 文件存储（通过 Supabase Storage）
- 全球 CDN 部署

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并填入你的 Supabase 凭据：

```bash
cp .env.example .env
```

编辑 `.env`：

```
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:4321

### 4. 部署到 Cloudflare Pages

```bash
npm run deploy
```

## 项目结构

```
xtcer-cms/
├── src/
│   ├── layouts/      # 页面布局
│   ├── pages/        # 页面路由
│   ├── components/   # 组件
│   └── lib/          # 工具函数和配置
├── public/           # 静态资源
├── astro.config.mjs  # Astro 配置
└── wrangler.toml     # Cloudflare 配置
```

## Supabase 设置

### 创建 posts 表

在 Supabase SQL 编辑器中运行：

```sql
CREATE TABLE posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 允许匿名读取
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON posts
  FOR SELECT USING (true);
```

## 许可证

MIT
