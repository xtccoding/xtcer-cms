-- ============================================================
-- xtcer-cms D1 建表（SQLite 方言）
--
-- 与 src/lib/schema.ts 的 Drizzle 定义一一对应，改这里必须同步改那边。
-- 执行：npx wrangler d1 execute xtcer-content --remote --file=database/d1-schema.sql
--
-- 类型映射（来自 Supabase/Postgres）：
--   uuid        → TEXT（应用侧 crypto.randomUUID()）
--   timestamptz → TEXT（ISO 8601 UTC，毫秒定长）
--   text[]      → TEXT（JSON 数组字符串）
--   jsonb       → TEXT（JSON 字符串）
--   boolean     → INTEGER 0/1
--   numeric     → REAL
--
-- visitors 表不再迁移：访客统计改用 Cloudflare Web Analytics（零写入）。
-- ============================================================

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT,
  content TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  views INTEGER NOT NULL DEFAULT 0,
  author TEXT DEFAULT 'XTcer',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at);
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author);

CREATE TABLE IF NOT EXISTS links (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  category TEXT DEFAULT '默认',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_links_sort ON links(sort_order);

CREATE TABLE IF NOT EXISTS blacklist (
  id TEXT PRIMARY KEY,
  ip TEXT NOT NULL UNIQUE,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  product TEXT NOT NULL,
  price TEXT NOT NULL,
  price_usd REAL,
  price_cny REAL,
  config TEXT,
  bandwidth TEXT,
  type TEXT DEFAULT 'promotion',
  target TEXT DEFAULT 'all_user',
  renewal_price TEXT,
  url TEXT,
  notes TEXT,
  category TEXT NOT NULL,
  region TEXT DEFAULT 'global',
  expiry TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS deals_provider_product_unique ON deals(provider, product);
CREATE INDEX IF NOT EXISTS idx_deals_category ON deals(category);
CREATE INDEX IF NOT EXISTS idx_deals_is_active ON deals(is_active);
CREATE INDEX IF NOT EXISTS idx_deals_price_cny ON deals(price_cny);

CREATE TABLE IF NOT EXISTS feeds (
  id TEXT PRIMARY KEY,
  feed_type TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  normalized_url TEXT,
  source TEXT,
  summary TEXT,
  tags TEXT,
  priority TEXT DEFAULT 'normal',
  metadata TEXT,
  url_hash TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS feeds_type_title_unique ON feeds(feed_type, title);
CREATE INDEX IF NOT EXISTS idx_feeds_type ON feeds(feed_type);
CREATE INDEX IF NOT EXISTS idx_feeds_published ON feeds(published_at);
CREATE INDEX IF NOT EXISTS idx_feeds_priority ON feeds(priority);
CREATE INDEX IF NOT EXISTS idx_feeds_url_hash ON feeds(url_hash);
CREATE INDEX IF NOT EXISTS idx_feeds_created ON feeds(created_at);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  filename TEXT,
  content_type TEXT,
  size INTEGER,
  content_hash TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assets_hash ON assets(content_hash);
CREATE INDEX IF NOT EXISTS idx_assets_created ON assets(created_at);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  url TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT,
  size INTEGER,
  share_slug TEXT NOT NULL UNIQUE,
  password TEXT,
  downloads INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_files_share_slug ON files(share_slug);

CREATE TABLE IF NOT EXISTS deal_likes (
  id TEXT PRIMARY KEY,
  target TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS deal_likes_target_ip_unique ON deal_likes(target, ip_hash);
CREATE INDEX IF NOT EXISTS idx_deal_likes_target ON deal_likes(target);

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  message TEXT NOT NULL,
  contact TEXT,
  ip_hash TEXT,
  path TEXT,
  handled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at);

CREATE TABLE IF NOT EXISTS site_settings (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_site_settings_key ON site_settings(key);
