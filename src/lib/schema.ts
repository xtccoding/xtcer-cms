/**
 * D1（SQLite）数据库结构定义 —— Drizzle ORM。
 *
 * 从 Supabase/Postgres 迁移时的类型映射：
 *   uuid         → TEXT（应用侧 crypto.randomUUID() 生成，SQLite 无 uuid 类型）
 *   timestamptz  → TEXT（统一 ISO 8601 UTC 字符串，定长毫秒精度，保证字符串排序 == 时间排序）
 *   text[]       → TEXT（JSON 数组字符串，读写由 store 层负责 JSON.parse/stringify）
 *   jsonb        → TEXT（JSON 字符串，同上）
 *   boolean      → INTEGER 0/1
 *   numeric      → REAL
 *
 * 这里刻意**不使用** drizzle 的 json mode：D1 里历史数据可能有 NULL/空串，
 * 显式在 store 层解析更容易控制兜底，也避免 mode 默认值在不同版本间的差异。
 */
import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const posts = sqliteTable(
  'posts',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    title: text('title').notNull(),
    summary: text('summary'),
    content: text('content'),
    tags: text('tags').notNull().default('[]'),
    views: integer('views').notNull().default(0),
    author: text('author').default('XTcer'),
    created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
    updated_at: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index('idx_posts_created').on(t.created_at),
    index('idx_posts_author').on(t.author),
  ],
)

export const links = sqliteTable(
  'links',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    title: text('title').notNull(),
    url: text('url').notNull(),
    description: text('description'),
    icon: text('icon'),
    category: text('category').default('默认'),
    sort_order: integer('sort_order').notNull().default(0),
    created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('idx_links_sort').on(t.sort_order)],
)

export const blacklist = sqliteTable(
  'blacklist',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    ip: text('ip').notNull().unique(),
    reason: text('reason'),
    created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  },
)

export const deals = sqliteTable(
  'deals',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    provider: text('provider').notNull(),
    product: text('product').notNull(),
    price: text('price').notNull(),
    price_usd: real('price_usd'),
    price_cny: real('price_cny'),
    config: text('config'),
    bandwidth: text('bandwidth'),
    type: text('type').default('promotion'),
    target: text('target').default('all_user'),
    renewal_price: text('renewal_price'),
    url: text('url'),
    notes: text('notes'),
    category: text('category').notNull(),
    region: text('region').default('global'),
    expiry: text('expiry'),
    is_active: integer('is_active').notNull().default(1),
    created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
    updated_at: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    uniqueIndex('deals_provider_product_unique').on(t.provider, t.product),
    index('idx_deals_category').on(t.category),
    index('idx_deals_is_active').on(t.is_active),
    index('idx_deals_price_cny').on(t.price_cny),
  ],
)

export const feeds = sqliteTable(
  'feeds',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    feed_type: text('feed_type').notNull(),
    title: text('title').notNull(),
    url: text('url'),
    normalized_url: text('normalized_url'),
    source: text('source'),
    summary: text('summary'),
    tags: text('tags'),
    priority: text('priority').default('normal'),
    metadata: text('metadata'),
    url_hash: text('url_hash'),
    published_at: text('published_at'),
    created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
    updated_at: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    uniqueIndex('feeds_type_title_unique').on(t.feed_type, t.title),
    index('idx_feeds_type').on(t.feed_type),
    index('idx_feeds_published').on(t.published_at),
    index('idx_feeds_priority').on(t.priority),
    index('idx_feeds_url_hash').on(t.url_hash),
    index('idx_feeds_created').on(t.created_at),
  ],
)

export const assets = sqliteTable(
  'assets',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    key: text('key').notNull().unique(),
    url: text('url').notNull(),
    thumbnail_url: text('thumbnail_url'),
    filename: text('filename'),
    content_type: text('content_type'),
    size: integer('size'),
    content_hash: text('content_hash'),
    tags: text('tags').notNull().default('[]'),
    created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index('idx_assets_hash').on(t.content_hash),
    index('idx_assets_created').on(t.created_at),
  ],
)

export const files = sqliteTable(
  'files',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    key: text('key').notNull(),
    url: text('url').notNull(),
    filename: text('filename').notNull(),
    content_type: text('content_type'),
    size: integer('size'),
    share_slug: text('share_slug').notNull().unique(),
    password: text('password'),
    downloads: integer('downloads').notNull().default(0),
    expires_at: text('expires_at'),
    created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('idx_files_share_slug').on(t.share_slug)],
)

export const dealLikes = sqliteTable(
  'deal_likes',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    target: text('target').notNull(),
    ip_hash: text('ip_hash').notNull(),
    created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    uniqueIndex('deal_likes_target_ip_unique').on(t.target, t.ip_hash),
    index('idx_deal_likes_target').on(t.target),
  ],
)

export const feedback = sqliteTable(
  'feedback',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    message: text('message').notNull(),
    contact: text('contact'),
    ip_hash: text('ip_hash'),
    path: text('path'),
    handled: integer('handled').notNull().default(0),
    created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('idx_feedback_created_at').on(t.created_at)],
)

/**
 * 文章评论（自建，取代 Giscus 外部脚本）。
 *
 * - 单层回复：parent_id 指向同 post 下的顶层评论（不递归嵌套，UI 只有一级）
 * - status: visible / hidden，后台可隐藏，公开接口只返回 visible
 * - ip_hash 只存 SHA-256(salt+ip)，用于限流与防刷，不存明文
 */
export const comments = sqliteTable(
  'comments',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    post_id: text('post_id').notNull(),
    parent_id: text('parent_id'),
    author: text('author').notNull(),
    content: text('content').notNull(),
    ip_hash: text('ip_hash').notNull(),
    status: text('status').notNull().default('visible'),
    created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index('idx_comments_post').on(t.post_id, t.created_at),
    index('idx_comments_status').on(t.status),
    index('idx_comments_parent').on(t.parent_id),
  ],
)

export const siteSettings = sqliteTable(
  'site_settings',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    key: text('key').notNull().unique(),
    value: text('value').notNull(),
    created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
    updated_at: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('idx_site_settings_key').on(t.key)],
)

// ---------------------------------------------------------------- 用户体系
// 见 database/accounts.sql。密码与会话都只存摘要，见 src/lib/auth.ts。

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    /** 小写用户名，唯一索引 —— 避免「Alice / alice」重复注册。 */
    username_lower: text('username_lower').notNull().unique(),
    password_hash: text('password_hash').notNull(),
    password_salt: text('password_salt').notNull(),
    points: integer('points').notNull().default(0),
    streak: integer('streak').notNull().default(0),
    /** YYYY-MM-DD（Asia/Shanghai），为空表示从未签到。 */
    last_checkin: text('last_checkin'),
    created_at: text('created_at').notNull(),
  },
)

export const userSessions = sqliteTable(
  'user_sessions',
  {
    /** SHA-256(token)，不存 token 原文。 */
    token_hash: text('token_hash').primaryKey(),
    user_id: text('user_id').notNull(),
    created_at: text('created_at').notNull(),
    expires_at: text('expires_at').notNull(),
  },
  (t) => [index('idx_user_sessions_user').on(t.user_id)],
)

export const userCheckins = sqliteTable(
  'user_checkins',
  {
    user_id: text('user_id').notNull(),
    day: text('day').notNull(),
    points: integer('points').notNull(),
    streak: integer('streak').notNull(),
    created_at: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('user_checkins_user_day_unique').on(t.user_id, t.day)],
)

export const userFavorites = sqliteTable(
  'user_favorites',
  {
    user_id: text('user_id').notNull(),
    deal_id: text('deal_id').notNull(),
    created_at: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('user_favorites_user_deal_unique').on(t.user_id, t.deal_id),
    index('idx_user_favorites_user').on(t.user_id),
  ],
)

export const userClaims = sqliteTable(
  'user_claims',
  {
    user_id: text('user_id').notNull(),
    deal_id: text('deal_id').notNull(),
    created_at: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('user_claims_user_deal_unique').on(t.user_id, t.deal_id),
    index('idx_user_claims_user').on(t.user_id),
  ],
)

export const userBadges = sqliteTable(
  'user_badges',
  {
    user_id: text('user_id').notNull(),
    badge_id: text('badge_id').notNull(),
    /** auto = 达成条件自动发放；shop = 积分兑换。 */
    source: text('source').notNull().default('auto'),
    created_at: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('user_badges_user_badge_unique').on(t.user_id, t.badge_id)],
)

export const rateLimits = sqliteTable('rate_limits', {
  key: text('key').primaryKey(),
  window_start: integer('window_start').notNull(),
  count: integer('count').notNull(),
})

export type PostRow = typeof posts.$inferSelect
export type DealRow = typeof deals.$inferSelect
export type FeedRow = typeof feeds.$inferSelect
export type AssetRow = typeof assets.$inferSelect
export type FileRow = typeof files.$inferSelect
export type LinkRow = typeof links.$inferSelect
export type FeedbackRow = typeof feedback.$inferSelect
export type SettingRow = typeof siteSettings.$inferSelect
