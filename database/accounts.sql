-- ============================================================
-- 用户体系（注册 / 登录 / 签到 / 积分 / 收藏 / 领取 / 徽章）
--
-- 目标库：Cloudflare D1（SQLite）。执行方式：
--   本地：npx wrangler d1 execute DB --local  --file database/accounts.sql
--   生产：npx wrangler d1 execute DB --remote --file database/accounts.sql
--
-- 幂等：可重复执行，不会重复建表 / 丢数据。
--
-- 安全约定：
--   - 密码只存 PBKDF2-SHA256 摘要（迭代 15 万次，16 字节随机盐），从不存明文。
--   - 会话表只存 token 的 SHA-256，不存 token 原文 —— 库被读走也无法冒用登录态。
--   - deal_id / badge_id 全部经过应用层白名单校验后才入库。
--   - 限流表只存 sha256(ip + 动作)，不存明文 IP。
-- ============================================================

-- ---------- 用户 ----------
-- username 保留用户输入的原始大小写用于展示；username_lower 走唯一索引，
-- 保证「Alice」和「alice」不能重复注册，也避免登录时大小写踩坑。
CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  username       TEXT NOT NULL,
  username_lower TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  password_salt  TEXT NOT NULL,
  points         INTEGER NOT NULL DEFAULT 0,
  streak         INTEGER NOT NULL DEFAULT 0,
  last_checkin   TEXT,                         -- YYYY-MM-DD（Asia/Shanghai）
  created_at     TEXT NOT NULL
);

-- ---------- 会话 ----------
-- token_hash = SHA-256(随机 token)。过期时间用 ISO 8601 字符串，字符串比较即时间比较。
CREATE TABLE IF NOT EXISTS user_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);

-- ---------- 签到记录 ----------
-- 主键 (user_id, day) 是防重复签到的唯一真源：
-- 并发两次请求时只有一条能插入成功，另外一条被数据库拒绝。
CREATE TABLE IF NOT EXISTS user_checkins (
  user_id    TEXT NOT NULL,
  day        TEXT NOT NULL,
  points     INTEGER NOT NULL,
  streak     INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, day)
);

-- ---------- 收藏 / 领取 ----------
CREATE TABLE IF NOT EXISTS user_favorites (
  user_id    TEXT NOT NULL,
  deal_id    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, deal_id)
);
CREATE INDEX IF NOT EXISTS idx_user_favorites_user ON user_favorites(user_id);

CREATE TABLE IF NOT EXISTS user_claims (
  user_id    TEXT NOT NULL,
  deal_id    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, deal_id)
);
CREATE INDEX IF NOT EXISTS idx_user_claims_user ON user_claims(user_id);

-- ---------- 徽章 ----------
-- source: auto（达成条件自动发放）/ shop（积分兑换）
CREATE TABLE IF NOT EXISTS user_badges (
  user_id    TEXT NOT NULL,
  badge_id   TEXT NOT NULL,
  source     TEXT NOT NULL DEFAULT 'auto',
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, badge_id)
);

-- ---------- 登录 / 注册限流 ----------
-- key = sha256(ip + ':' + action)，按固定窗口计数。只用于防暴力破解。
CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);
