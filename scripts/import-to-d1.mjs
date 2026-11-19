#!/usr/bin/env node
/**
 * import-to-d1.mjs — 把 backups/<ts>/*.json 转成 D1（SQLite）可直接执行的 SQL。
 *
 * 用法:
 *   node scripts/import-to-d1.mjs                       # 用最新 backups 目录
 *   node scripts/import-to-d1.mjs --dir backups/xxx     # 指定目录
 *   node scripts/import-to-d1.mjs --out tmpwork/d1-import
 *
 * 输出 tmpwork/d1-import/<table>.sql，随后用：
 *   npx wrangler d1 execute xtcer-content --remote --file=tmpwork/d1-import/posts.sql
 *
 * 说明:
 * - 全部使用 INSERT OR REPLACE，脚本可重复执行（按主键覆盖）。
 * - JSON 列（tags/metadata/site_settings.value）统一转成 JSON 字符串。
 * - boolean → 0/1；timestamptz → 定长毫秒 ISO 字符串。
 */
import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const flag = (n) => {
  const i = argv.indexOf(n)
  return i === -1 ? null : argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true
}

function latestBackupDir() {
  const base = join(ROOT, 'backups')
  if (!existsSync(base)) return null
  const dirs = readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}T/.test(d.name))
    .map((d) => d.name)
    .sort()
  return dirs.length ? join(base, dirs[dirs.length - 1]) : null
}

const SRC = typeof flag('--dir') === 'string' ? join(ROOT, flag('--dir')) : latestBackupDir()
if (!SRC) {
  console.error('✗ 找不到 backups 导出目录')
  process.exit(1)
}
const OUT = join(ROOT, typeof flag('--out') === 'string' ? flag('--out') : 'tmpwork/d1-import')
mkdirSync(OUT, { recursive: true })

const NOW = '1970-01-01T00:00:00.000Z'
const iso = (v) => {
  if (v === null || v === undefined || v === '') return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
const json = (v) => {
  if (v === null || v === undefined) return null
  return typeof v === 'string' ? v : JSON.stringify(v)
}
const int = (v, d = 0) => (v === null || v === undefined || v === '' ? d : Number(v))
const bool = (v, d = 0) => (v === null || v === undefined ? d : v ? 1 : 0)

/** table → [列名, 类型, 默认值] */
const TABLES = {
  posts: [
    ['id', 'text'], ['title', 'text'], ['summary', 'text'], ['content', 'text'],
    ['tags', 'json', '[]'], ['views', 'int', 0], ['author', 'text', 'XTcer'],
    ['created_at', 'ts', NOW], ['updated_at', 'ts', NOW],
  ],
  links: [
    ['id', 'text'], ['title', 'text'], ['url', 'text'], ['description', 'text'],
    ['icon', 'text'], ['category', 'text', '默认'], ['sort_order', 'int', 0],
    ['created_at', 'ts', NOW],
  ],
  deals: [
    ['id', 'text'], ['provider', 'text'], ['product', 'text'], ['price', 'text'],
    ['price_usd', 'num'], ['price_cny', 'num'], ['config', 'text'], ['bandwidth', 'text'],
    ['type', 'text', 'promotion'], ['target', 'text', 'all_user'], ['renewal_price', 'text'],
    ['url', 'text'], ['notes', 'text'], ['category', 'text'], ['region', 'text', 'global'],
    ['expiry', 'text'], ['is_active', 'bool', 1],
    ['created_at', 'ts', NOW], ['updated_at', 'ts', NOW],
  ],
  feeds: [
    ['id', 'text'], ['feed_type', 'text'], ['title', 'text'], ['url', 'text'],
    ['normalized_url', 'text'], ['source', 'text'], ['summary', 'text'],
    ['tags', 'json', '[]'], ['priority', 'text', 'normal'], ['metadata', 'json', '{}'],
    ['url_hash', 'text'], ['published_at', 'ts'], ['created_at', 'ts', NOW], ['updated_at', 'ts', NOW],
  ],
  assets: [
    ['id', 'text'], ['key', 'text'], ['url', 'text'], ['thumbnail_url', 'text'],
    ['filename', 'text'], ['content_type', 'text'], ['size', 'int'], ['content_hash', 'text'],
    ['tags', 'json', '[]'], ['created_at', 'ts', NOW],
  ],
  files: [
    ['id', 'text'], ['key', 'text'], ['url', 'text'], ['filename', 'text'],
    ['content_type', 'text'], ['size', 'int'], ['share_slug', 'text'], ['password', 'text'],
    ['downloads', 'int', 0], ['expires_at', 'ts'], ['created_at', 'ts', NOW],
  ],
  deal_likes: [
    ['id', 'text'], ['target', 'text'], ['ip_hash', 'text'], ['created_at', 'ts', NOW],
  ],
  feedback: [
    ['id', 'text'], ['message', 'text'], ['contact', 'text'], ['ip_hash', 'text'],
    ['path', 'text'], ['handled', 'bool', 0], ['created_at', 'ts', NOW],
  ],
  blacklist: [
    ['id', 'text'], ['ip', 'text'], ['reason', 'text'], ['created_at', 'ts', NOW],
  ],
  site_settings: [
    ['id', 'text'], ['key', 'text'], ['value', 'json', 'null'],
    ['created_at', 'ts', NOW], ['updated_at', 'ts', NOW],
  ],
}

function sqlValue(v) {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return String(v)
  return `'${String(v).replace(/'/g, "''")}'`
}

function coerce(kind, raw, fallback) {
  switch (kind) {
    case 'json': {
      const v = json(raw)
      return v === null ? (fallback === undefined ? null : fallback) : v
    }
    case 'ts':
      return iso(raw) ?? fallback ?? null
    case 'int':
      return int(raw, fallback ?? 0)
    case 'num':
      return raw === null || raw === undefined || raw === '' ? null : Number(raw)
    case 'bool':
      return bool(raw, fallback ?? 0)
    default:
      return raw === undefined ? null : raw
  }
}

const report = []
for (const [table, cols] of Object.entries(TABLES)) {
  const file = join(SRC, `${table}.json`)
  if (!existsSync(file)) {
    report.push({ table, rows: 0, skipped: 'no export file' })
    continue
  }
  const rows = JSON.parse(readFileSync(file, 'utf8'))
  const names = cols.map((c) => c[0])
  const lines = [`-- ${table}: ${rows.length} rows (from ${SRC.replace(ROOT, '.')})`]
  lines.push(`DELETE FROM ${table};`)
  for (const row of rows) {
    const values = cols.map(([name, kind, fallback]) => sqlValue(coerce(kind, row[name], fallback)))
    lines.push(`INSERT OR REPLACE INTO ${table} (${names.join(', ')}) VALUES (${values.join(', ')});`)
  }
  writeFileSync(join(OUT, `${table}.sql`), lines.join('\n') + '\n', 'utf8')
  report.push({ table, rows: rows.length })
}

console.log(`▸ 源目录: ${SRC}`)
console.log(`▸ 输出  : ${OUT}`)
for (const r of report) console.log(`  ${r.table.padEnd(14)} ${r.rows ? r.rows + ' 行' : '(空 ' + r.skipped + ')'}`)
