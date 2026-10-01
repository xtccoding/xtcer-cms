-- ============================================================
-- xtcer.cn — Cloudflare D1（SQLite）表结构
--
-- 本文件由 scripts/gen-d1-schema.mjs 自动生成，请勿手工编辑。
-- 要改表结构，改 src/lib/d1-schema.mjs 后重新生成。
--
-- 部署步骤：
--   1) wrangler d1 create xtcer
--   2) wrangler d1 execute xtcer --remote --file=database/d1-schema.sql
--   3) wrangler d1 execute xtcer --remote --file=<导入数据.sql>
--   4) 在 Pages 项目 Settings → Bindings 加 D1 绑定，变量名 DB
--
-- 幂等：全部 IF NOT EXISTS，可重复执行。
-- ============================================================

-- ---------- posts ----------
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT,
  content TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  views INTEGER NOT NULL DEFAULT 0,
  author TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);
CREATE INDEX IF NOT EXISTS idx_posts_views ON posts(views);

-- ---------- deals ----------
CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  product TEXT NOT NULL,
  price TEXT NOT NULL,
  price_usd REAL,
  price_cny REAL,
  config TEXT,
  bandwidth TEXT,
  type TEXT NOT NULL DEFAULT 'vps',
  target TEXT NOT NULL DEFAULT '',
  renewal_price TEXT,
  url TEXT,
  notes TEXT,
  category TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'global',
  expiry TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_deals_provider ON deals(provider);
CREATE INDEX IF NOT EXISTS idx_deals_category ON deals(category);
CREATE INDEX IF NOT EXISTS idx_deals_created_at ON deals(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_deals_provider_product ON deals(provider, product);

-- ---------- feeds ----------
CREATE TABLE IF NOT EXISTS feeds (
  id TEXT PRIMARY KEY,
  feed_type TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  normalized_url TEXT,
  source TEXT,
  summary TEXT,
  tags TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  metadata TEXT,
  url_hash TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_feeds_created_at ON feeds(created_at);
CREATE INDEX IF NOT EXISTS idx_feeds_feed_type ON feeds(feed_type);
CREATE INDEX IF NOT EXISTS idx_feeds_url_hash ON feeds(url_hash);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_feeds_feed_type_title ON feeds(feed_type, title);

-- ---------- assets ----------
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  filename TEXT,
  content_type TEXT,
  size INTEGER,
  content_hash TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_assets_created_at ON assets(created_at);
CREATE INDEX IF NOT EXISTS idx_assets_content_hash ON assets(content_hash);

-- ---------- files ----------
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  url TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT,
  size INTEGER,
  share_slug TEXT NOT NULL,
  password TEXT,
  downloads INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_files_share_slug ON files(share_slug);
CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at);

-- ---------- deal_likes ----------
CREATE TABLE IF NOT EXISTS deal_likes (
  id TEXT PRIMARY KEY,
  target TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_deal_likes_target ON deal_likes(target);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_deal_likes_target_ip_hash ON deal_likes(target, ip_hash);

-- ---------- feedback ----------
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  message TEXT NOT NULL,
  contact TEXT,
  ip_hash TEXT,
  path TEXT,
  handled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at);

-- ---------- links ----------
CREATE TABLE IF NOT EXISTS links (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT DEFAULT '',
  icon TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT '默认',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_links_sort_order ON links(sort_order);
CREATE INDEX IF NOT EXISTS idx_links_category ON links(category);

-- ---------- blacklist ----------
CREATE TABLE IF NOT EXISTS blacklist (
  id TEXT PRIMARY KEY,
  ip TEXT NOT NULL,
  reason TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_blacklist_ip ON blacklist(ip);

-- ---------- visitors ----------
CREATE TABLE IF NOT EXISTS visitors (
  id TEXT PRIMARY KEY,
  ip TEXT NOT NULL,
  path TEXT NOT NULL,
  user_agent TEXT DEFAULT '',
  referer TEXT DEFAULT '',
  country TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_visitors_created_at ON visitors(created_at);
CREATE INDEX IF NOT EXISTS idx_visitors_ip ON visitors(ip);

-- ---------- site_settings ----------
CREATE TABLE IF NOT EXISTS site_settings (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_site_settings_key ON site_settings(key);

-- ---------- 迁移自检 ----------
-- 建表后跑这个，确认每张表都在（预期 11 行）：
--   SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name;
