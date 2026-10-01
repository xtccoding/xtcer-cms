#!/usr/bin/env node
/**
 * backup-supabase.mjs — 把 Supabase 里的表全量导出到本地 backups/ 目录。
 *
 * 用法:
 *   node scripts/backup-supabase.mjs                 # 导出全部表
 *   node scripts/backup-supabase.mjs --only deals,posts
 *   node scripts/backup-supabase.mjs --skip visitors
 *   node scripts/backup-supabase.mjs --csv           # 额外生成 CSV
 *   node scripts/backup-supabase.mjs --page-size 500
 *
 * 密钥优先级:
 *   1. SUPABASE_SERVICE_ROLE_KEY  (环境变量或 .env) —— 能绕过 RLS，拿全量
 *   2. PUBLIC_SUPABASE_ANON_KEY                    —— 只能拿 RLS 允许匿名读的行
 *
 * 输出: backups/<UTC 时间戳>/
 *   <table>.json      原始行数组（pretty 2 空格）
 *   <table>.csv       可选，扁平化后的 CSV
 *   _manifest.json    每张表的行数 / 字节数 / sha256 / 读取状态
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// ---------------------------------------------------------------- env 解析
function loadDotEnv() {
  const out = {}
  const p = join(ROOT, '.env')
  if (!existsSync(p)) return out
  for (const raw of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const k = line.slice(0, eq).trim()
    let v = line.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[k] = v
  }
  return out
}

const dotenv = loadDotEnv()
const pick = (k) => (process.env[k] && process.env[k].length ? process.env[k] : dotenv[k])

const SUPA_URL = (pick('PUBLIC_SUPABASE_URL') || '').replace(/\/+$/, '')
const SERVICE_KEY = pick('SUPABASE_SERVICE_ROLE_KEY') || ''
const ANON_KEY = pick('PUBLIC_SUPABASE_ANON_KEY') || ''

if (!SUPA_URL) {
  console.error('✗ 缺少 PUBLIC_SUPABASE_URL（.env 或环境变量）')
  process.exit(1)
}
const KEY = SERVICE_KEY || ANON_KEY
const KEY_KIND = SERVICE_KEY ? 'service_role' : 'anon'
if (!KEY) {
  console.error('✗ 既没有 SUPABASE_SERVICE_ROLE_KEY 也没有 PUBLIC_SUPABASE_ANON_KEY')
  process.exit(1)
}

// ---------------------------------------------------------------- 参数
const argv = process.argv.slice(2)
function flag(name) {
  const i = argv.indexOf(name)
  return i === -1 ? null : argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true
}
const ONLY = flag('--only')
const SKIP = flag('--skip')
const WANT_CSV = argv.includes('--csv')
const PAGE_SIZE = Number(flag('--page-size')) || 1000

// 代码库里实际用到的全部表（grep `supabase.from('x')` 得来）
const ALL_TABLES = [
  'deals',
  'deal_likes',
  'posts',
  'links',
  'feeds',
  'site_settings',
  'feedback',
  'blacklist',
  'visitors',
  'files',
  'assets',
]

let tables = ALL_TABLES
if (typeof ONLY === 'string') {
  const want = ONLY.split(',').map((s) => s.trim()).filter(Boolean)
  tables = ALL_TABLES.filter((t) => want.includes(t))
  for (const w of want) if (!ALL_TABLES.includes(w)) tables.push(w)
}
if (typeof SKIP === 'string') {
  const drop = SKIP.split(',').map((s) => s.trim())
  tables = tables.filter((t) => !drop.includes(t))
}

// ---------------------------------------------------------------- HTTP
const HEADERS = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  Accept: 'application/json',
}

async function get(url, headers = {}) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { ...HEADERS, ...headers } })
      return res
    } catch (err) {
      if (attempt === 4) throw err
      await new Promise((r) => setTimeout(r, 800 * attempt))
    }
  }
}

/** 探测表的主键式游标列：优先 id（uuid，唯一），退而求其次 created_at。 */
async function detectCursor(table) {
  const res = await get(`${SUPA_URL}/rest/v1/${table}?select=*&limit=1`)
  if (!res.ok) {
    const body = await res.text()
    return { error: `HTTP ${res.status}: ${body.slice(0, 200)}` }
  }
  const rows = await res.json()
  if (!Array.isArray(rows)) return { error: '响应不是数组' }
  if (rows.length === 0) return { key: null, empty: true, cols: [] }
  const cols = Object.keys(rows[0])
  if (cols.includes('id')) return { key: 'id', cols }
  if (cols.includes('created_at')) return { key: 'created_at', cols }
  return { key: null, cols }
}

/**
 * 分页拉全表。
 *
 * 大表必须用 **keyset（游标）分页**，不能用 offset —— 实测 visitors（21.7 万行）
 * 在 offset=130000 时 Supabase 直接回 `57014 statement timeout`，
 * 因为 OFFSET 需要先扫描并丢弃前面所有行。keyset 每页都是索引定位，恒定快。
 */
async function fetchAll(table, onProgress) {
  const det = await detectCursor(table)
  if (det.error) return { rows: [], total: null, error: det.error }
  if (det.empty) return { rows: [], total: 0, error: null }

  const rows = []
  let total = null
  let cursor = null
  const key = det.key

  for (;;) {
    let url = `${SUPA_URL}/rest/v1/${table}?select=*`
    if (key) {
      url += `&order=${key}.asc`
      if (cursor !== null) url += `&${key}=gt.${encodeURIComponent(cursor)}`
    }
    // keyset 模式下每页都要的是「剩余集合」的前 PAGE_SIZE 行，Range 恒为 0..N
    const res = await get(url, {
      Prefer: 'count=exact',
      Range: `0-${PAGE_SIZE - 1}`,
      'Range-Unit': 'items',
    })

    if (res.status === 416) break // 区间超出末尾，正常结束
    if (!res.ok) {
      const body = await res.text()
      return { rows, total, error: `HTTP ${res.status}: ${body.slice(0, 200)}` }
    }

    // 首次请求没有游标过滤，此时的 count 才是全表真实行数
    if (total === null) {
      const cr = res.headers.get('content-range') || ''
      const m = cr.match(/\/(\d+|\*)$/)
      if (m && m[1] !== '*') total = Number(m[1])
    }

    const page = await res.json()
    if (!Array.isArray(page) || page.length === 0) break

    rows.push(...page)
    if (onProgress) onProgress(rows.length, total)

    if (page.length < PAGE_SIZE) break
    if (total !== null && rows.length >= total) break

    if (key) {
      const next = page[page.length - 1][key]
      if (next === undefined || next === null || next === cursor) {
        return { rows, total, error: `游标 ${key} 无法推进（值为 ${next}），已停止以免死循环` }
      }
      cursor = next
    } else {
      return { rows, total, error: '表既无 id 也无 created_at，无法做游标分页' }
    }

    if (rows.length > 500000) {
      return { rows, total, error: '超过 500k 行保护阈值，已停止' }
    }
  }

  return { rows, total, error: null }
}

// ---------------------------------------------------------------- CSV
function csvCell(v) {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function toCsv(rows) {
  if (!rows.length) return ''
  const cols = []
  const seen = new Set()
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (!seen.has(k)) {
        seen.add(k)
        cols.push(k)
      }
    }
  }
  const lines = [cols.map(csvCell).join(',')]
  for (const r of rows) lines.push(cols.map((c) => csvCell(r[c])).join(','))
  return lines.join('\r\n') + '\r\n'
}

// ---------------------------------------------------------------- main
const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('Z', 'Z')
const outDir = join(ROOT, 'backups', stamp)
mkdirSync(outDir, { recursive: true })

console.log(`▸ 目标: ${SUPA_URL}`)
console.log(`▸ 密钥: ${KEY_KIND}${KEY_KIND === 'anon' ? '（RLS 会挡掉部分行，拿不到全量）' : ''}`)
console.log(`▸ 输出: backups/${stamp}/`)
console.log(`▸ 表  : ${tables.join(', ')}  (page-size=${PAGE_SIZE})`)
console.log('')

const manifest = {
  exported_at: new Date().toISOString(),
  supabase_url: SUPA_URL,
  key_kind: KEY_KIND,
  page_size: PAGE_SIZE,
  tables: {},
}
let failures = 0

for (const table of tables) {
  process.stdout.write(`  ${table.padEnd(16)} `)
  const t0 = Date.now()
  let last = 0
  const { rows, total, error } = await fetchAll(table, (n, tot) => {
    if (n - last >= PAGE_SIZE * 10) {
      last = n
      process.stdout.write(`\r  ${table.padEnd(16)} … ${n}${tot ? '/' + tot : ''}   `)
    }
  })

  if (error) {
    failures++
    console.log(`\r  ${table.padEnd(16)} ✗ ${error}`)
    manifest.tables[table] = { ok: false, error }
    continue
  }

  const json = JSON.stringify(rows, null, 2)
  writeFileSync(join(outDir, `${table}.json`), json, 'utf8')
  const sha = createHash('sha256').update(json).digest('hex').slice(0, 16)

  let csvBytes = 0
  if (WANT_CSV && rows.length) {
    const csv = toCsv(rows)
    writeFileSync(join(outDir, `${table}.csv`), csv, 'utf8')
    csvBytes = Buffer.byteLength(csv)
  }

  const ms = Date.now() - t0
  const warn = total !== null && rows.length < total ? `  ⚠ 可见 ${rows.length}/${total}（RLS 过滤）` : ''
  console.log(
    `\r  ${table.padEnd(16)} ✓ ${String(rows.length).padStart(7)} 行  ` +
      `${(Buffer.byteLength(json) / 1024).toFixed(1).padStart(8)} KB  ${ms}ms  ${sha}${warn}`
  )

  manifest.tables[table] = {
    ok: true,
    rows: rows.length,
    visible_total: total,
    bytes: Buffer.byteLength(json),
    csv_bytes: csvBytes,
    sha256_16: sha,
    ms,
  }
}

writeFileSync(join(outDir, '_manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')

const okCount = Object.values(manifest.tables).filter((t) => t.ok).length
const totalRows = Object.values(manifest.tables).reduce((a, t) => a + (t.rows || 0), 0)
console.log('')
console.log(`✓ 完成: ${okCount}/${tables.length} 张表, 共 ${totalRows} 行`)
if (failures) console.log(`✗ ${failures} 张表失败`)
console.log(`  目录: ${outDir}`)
if (KEY_KIND === 'anon') {
  console.log('')
  console.log('⚠ 当前用的是 anon key。RLS 保护的表（feedback / blacklist / links 等）拿不到行。')
  console.log('  要拿全量请在 .env 里填 SUPABASE_SERVICE_ROLE_KEY 后重跑。')
}
