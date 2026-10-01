/**
 * D1（SQLite）表结构定义 —— 全项目唯一事实来源。
 *
 * 三处共用：
 *   1. scripts/gen-d1-schema.mjs   → 生成 database/d1-schema.sql
 *   2. src/lib/d1/query.ts         → 读写时做类型序列化/反序列化
 *   3. scripts/import-to-d1.mjs    → 生成导入 SQL
 *
 * 类型映射（Postgres → SQLite）：
 *   uuid / text          → TEXT
 *   int                  → INTEGER
 *   real / numeric       → REAL
 *   bool                 → INTEGER (0/1)   ← 读出时转回 boolean
 *   ts (timestamptz)     → TEXT (ISO8601)  ← 字典序 == 时间序，可直接 ORDER BY
 *   json (jsonb)         → TEXT (JSON)     ← 读出时 JSON.parse
 *   array (TEXT[])       → TEXT (JSON 数组) ← 读出时 JSON.parse，contains/overlaps 走 json_each
 *
 * 刻意丢弃的列：
 *   posts.embedding (pgvector) —— 线上 1039 行全为 NULL，AI 搜索实际只用 ilike，
 *   建了没用。迁移时不带过来，省掉 pgvector 依赖。
 */

/** 列类型枚举 */
export const T = {
  UUID: 'uuid',
  TEXT: 'text',
  INT: 'int',
  REAL: 'real',
  BOOL: 'bool',
  TS: 'ts',
  JSON: 'json',
  ARRAY: 'array',
}

const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))"

export const TABLES = {
  posts: {
    columns: {
      id: { type: T.UUID, pk: true },
      title: { type: T.TEXT, notNull: true },
      summary: { type: T.TEXT },
      content: { type: T.TEXT },
      tags: { type: T.ARRAY, notNull: true, default: [] },
      views: { type: T.INT, notNull: true, default: 0 },
      author: { type: T.TEXT },
      created_at: { type: T.TS, notNull: true, default: 'now' },
      updated_at: { type: T.TS, notNull: true, default: 'now' },
    },
    indexes: [{ columns: ['created_at'] }, { columns: ['views'] }],
  },

  deals: {
    columns: {
      id: { type: T.UUID, pk: true },
      provider: { type: T.TEXT, notNull: true },
      product: { type: T.TEXT, notNull: true },
      price: { type: T.TEXT, notNull: true },
      price_usd: { type: T.REAL },
      price_cny: { type: T.REAL },
      config: { type: T.TEXT },
      bandwidth: { type: T.TEXT },
      type: { type: T.TEXT, notNull: true, default: 'vps' },
      target: { type: T.TEXT, notNull: true, default: '' },
      renewal_price: { type: T.TEXT },
      url: { type: T.TEXT },
      notes: { type: T.TEXT },
      category: { type: T.TEXT, notNull: true },
      region: { type: T.TEXT, notNull: true, default: 'global' },
      expiry: { type: T.TEXT },
      is_active: { type: T.BOOL, notNull: true, default: true },
      created_at: { type: T.TS, notNull: true, default: 'now' },
      updated_at: { type: T.TS, notNull: true, default: 'now' },
    },
    indexes: [
      { columns: ['provider'] },
      { columns: ['category'] },
      { columns: ['created_at'] },
      // api/deals/batch.ts 的 upsert 冲突目标
      { columns: ['provider', 'product'], unique: true },
    ],
  },

  feeds: {
    columns: {
      id: { type: T.UUID, pk: true },
      feed_type: { type: T.TEXT, notNull: true },
      title: { type: T.TEXT, notNull: true },
      url: { type: T.TEXT },
      normalized_url: { type: T.TEXT },
      source: { type: T.TEXT },
      summary: { type: T.TEXT },
      tags: { type: T.ARRAY },
      priority: { type: T.TEXT, notNull: true, default: 'normal' },
      metadata: { type: T.JSON },
      url_hash: { type: T.TEXT },
      published_at: { type: T.TEXT },
      created_at: { type: T.TS, notNull: true, default: 'now' },
      updated_at: { type: T.TS, notNull: true, default: 'now' },
    },
    indexes: [
      { columns: ['created_at'] },
      { columns: ['feed_type'] },
      { columns: ['url_hash'] },
      // api/feeds/index.ts + batch.ts 的 upsert 冲突目标
      { columns: ['feed_type', 'title'], unique: true },
    ],
  },

  assets: {
    columns: {
      id: { type: T.UUID, pk: true },
      key: { type: T.TEXT, notNull: true },
      url: { type: T.TEXT, notNull: true },
      thumbnail_url: { type: T.TEXT },
      filename: { type: T.TEXT },
      content_type: { type: T.TEXT },
      size: { type: T.INT },
      content_hash: { type: T.TEXT },
      tags: { type: T.ARRAY, notNull: true, default: [] },
      created_at: { type: T.TS, notNull: true, default: 'now' },
    },
    indexes: [{ columns: ['created_at'] }, { columns: ['content_hash'] }],
  },

  files: {
    columns: {
      id: { type: T.UUID, pk: true },
      key: { type: T.TEXT, notNull: true },
      url: { type: T.TEXT, notNull: true },
      filename: { type: T.TEXT, notNull: true },
      content_type: { type: T.TEXT },
      size: { type: T.INT },
      share_slug: { type: T.TEXT, notNull: true },
      password: { type: T.TEXT },
      downloads: { type: T.INT, notNull: true, default: 0 },
      expires_at: { type: T.TEXT },
      created_at: { type: T.TS, notNull: true, default: 'now' },
    },
    indexes: [
      { columns: ['share_slug'], unique: true },
      { columns: ['created_at'] },
    ],
  },

  deal_likes: {
    columns: {
      id: { type: T.UUID, pk: true },
      target: { type: T.TEXT, notNull: true },
      ip_hash: { type: T.TEXT, notNull: true },
      created_at: { type: T.TS, notNull: true, default: 'now' },
    },
    indexes: [
      { columns: ['target'] },
      // 同一 IP 哈希对同一目标只能点一次
      { columns: ['target', 'ip_hash'], unique: true },
    ],
  },

  feedback: {
    columns: {
      id: { type: T.UUID, pk: true },
      message: { type: T.TEXT, notNull: true },
      contact: { type: T.TEXT },
      ip_hash: { type: T.TEXT },
      path: { type: T.TEXT },
      handled: { type: T.BOOL, notNull: true, default: false },
      created_at: { type: T.TS, notNull: true, default: 'now' },
    },
    indexes: [{ columns: ['created_at'] }],
  },

  links: {
    columns: {
      id: { type: T.UUID, pk: true },
      title: { type: T.TEXT, notNull: true },
      url: { type: T.TEXT, notNull: true },
      description: { type: T.TEXT, default: '' },
      icon: { type: T.TEXT, default: '' },
      category: { type: T.TEXT, notNull: true, default: '默认' },
      sort_order: { type: T.INT, notNull: true, default: 0 },
      created_at: { type: T.TS, notNull: true, default: 'now' },
    },
    indexes: [{ columns: ['sort_order'] }, { columns: ['category'] }],
  },

  blacklist: {
    columns: {
      id: { type: T.UUID, pk: true },
      ip: { type: T.TEXT, notNull: true },
      reason: { type: T.TEXT, default: '' },
      created_at: { type: T.TS, notNull: true, default: 'now' },
    },
    indexes: [{ columns: ['ip'], unique: true }],
  },

  visitors: {
    columns: {
      id: { type: T.UUID, pk: true },
      ip: { type: T.TEXT, notNull: true },
      path: { type: T.TEXT, notNull: true },
      user_agent: { type: T.TEXT, default: '' },
      referer: { type: T.TEXT, default: '' },
      country: { type: T.TEXT },
      created_at: { type: T.TS, notNull: true, default: 'now' },
    },
    indexes: [{ columns: ['created_at'] }, { columns: ['ip'] }],
  },

  site_settings: {
    columns: {
      id: { type: T.UUID, pk: true },
      key: { type: T.TEXT, notNull: true },
      value: { type: T.JSON, notNull: true },
      created_at: { type: T.TS, notNull: true, default: 'now' },
      updated_at: { type: T.TS, notNull: true, default: 'now' },
    },
    indexes: [{ columns: ['key'], unique: true }],
  },
}

/** 所有表名 */
export const TABLE_NAMES = Object.keys(TABLES)

/** 某表的列名集合 */
export function columnNames(table) {
  return Object.keys(TABLES[table]?.columns || {})
}

/** 该列是否需要从 SQLite 反序列化（array / json / bool） */
export function needsDecode(table, column) {
  const t = TABLES[table]?.columns?.[column]?.type
  return t === T.ARRAY || t === T.JSON || t === T.BOOL
}

/** SQLite 列类型 */
export function sqliteType(type) {
  switch (type) {
    case T.INT:
    case T.BOOL:
      return 'INTEGER'
    case T.REAL:
      return 'REAL'
    default:
      return 'TEXT'
  }
}

export { NOW }
