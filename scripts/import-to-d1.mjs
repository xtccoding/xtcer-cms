#!/usr/bin/env node
/**
 * import-to-d1.mjs —— 把 backups/ 里的 JSON 备份转成可执行的 D1 导入 SQL。
 *
 * 用法:
 *   node scripts/import-to-d1.mjs                          # 用最新一次备份
 *   node scripts/import-to-d1.mjs --dir backups/xxx
 *   node scripts/import-to-d1.mjs --only deals,posts
 *   node scripts/import-to-d1.mjs --skip visitors
 *   node scripts/import-to-d1.mjs --since 2026-07-01       # 只导这个日期之后的行
 *
 * 产物: tmpwork/d1-import/<表名>.sql  +  _README.txt（含要执行的命令）
 *
 * 为什么用**字面量**而不是绑定参数：
 *   D1 单条查询最多 100 个绑定参数。visitors 有 7 列 → 每句只能塞 14 行，
 *   21.7 万行要发 1.5 万条语句。改成把值内联进 SQL（本地备份是可信数据，
 *   单引号按 SQL 标准转义成 ''），限制就只剩「单条语句 ≤ 100 KB」，
 *   每句能塞几百行，语句数降到几百条。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TABLES, T } from '../src/lib/d1-schema.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// ---------------------------------------------------------------- 参数
const argv = process.argv.slice(2)
function flag(name) {
  const i = argv.indexOf(name)
  if (i === -1) return null
  const next = argv[i + 1]
  return next && !next.startsWith('--') ? next : true
}

const ONLY = flag('--only')
const SKIP = flag('--skip')
const SINCE = flag('--since')
const DIR_ARG = flag('--dir')
const MAX_STMT_BYTES = 90 * 1024 // 留出余量（D1 上限 100 KB）

function resolveBackupDir() {
  if (typeof DIR_ARG === 'string') return join(ROOT, DIR_ARG)
  const base = join(ROOT, 'backups')
  if (!existsSync(base)) throw new Error('backups/ 不存在，先跑 scripts/backup-supabase.mjs')
  const dirs = readdirSync(base)
    .filter((d) => existsSync(join(base, d, '_manifest.json')))
    .sort()
  if (!dirs.length) throw new Error('backups/ 下没有找到带 _manifest.json 的备份目录')
  return join(base, dirs[dirs.length - 1])
}

// ---------------------------------------------------------------- SQL 字面量
function sqlLiteral(value, colType) {
  if (value === null || value === undefined) return 'NULL'

  if (colType === T.ARRAY || colType === T.JSON) {
    const s = typeof value === 'string' ? value : JSON.stringify(value)
    return quote(s)
  }
  if (colType === T.BOOL) {
    if (typeof value === 'boolean') return value ? '1' : '0'
    if (typeof value === 'number') return value ? '1' : '0'
    return value === 'true' || value === '1' ? '1' : '0'
  }
  if (colType === T.INT || colType === T.REAL) {
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
    if (typeof value === 'boolean') return value ? '1' : '0'
    const n = Number(value)
    return Number.isFinite(n) ? String(n) : quote(String(value))
  }
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  return quote(typeof value === 'string' ? value : JSON.stringify(value))
}

/** SQL 标准转义：单引号翻倍。同时把 \u0000 之类的控制字符剔掉（SQLite 文本不接受 NUL）。 */
function quote(s) {
  const cleaned = String(s).replace(/\u0000/g, '')
  return `'${cleaned.replace(/'/g, "''")}'`
}

// ---------------------------------------------------------------- 主流程
const backupDir = resolveBackupDir()
console.log(`▸ 备份目录: ${backupDir.replace(ROOT + '/', '').replace(ROOT + '\\', '')}`)

const outDir = join(ROOT, 'tmpwork', 'd1-import')
mkdirSync(outDir, { recursive: true })

let tables = Object.keys(TABLES)
if (typeof ONLY === 'string') {
  const want = ONLY.split(',').map((s) => s.trim())
  tables = tables.filter((t) => want.includes(t))
}
if (typeof SKIP === 'string') {
  const drop = SKIP.split(',').map((s) => s.trim())
  tables = tables.filter((t) => !drop.includes(t))
}

const report = []
let grandRows = 0

for (const table of tables) {
  const file = join(backupDir, `${table}.json`)
  if (!existsSync(file)) {
    console.log(`  ${table.padEnd(14)} — 跳过（备份里没有这个文件）`)
    continue
  }

  let rows = JSON.parse(readFileSync(file, 'utf8'))
  if (!Array.isArray(rows)) rows = []
  const rawCount = rows.length

  // --since 过滤（按 created_at）
  if (typeof SINCE === 'string') {
    rows = rows.filter((r) => r?.created_at && String(r.created_at) >= SINCE)
  }

  const schemaCols = TABLES[table].columns
  if (!rows.length) {
    console.log(`  ${table.padEnd(14)} — 0 行，跳过`)
    report.push({ table, rows: 0, bytes: 0, skipped: rawCount })
    continue
  }

  // 列清单 = 模式列 ∩ 备份里出现过的键
  const present = new Set()
  for (const r of rows) for (const k of Object.keys(r)) present.add(k)
  const cols = Object.keys(schemaCols).filter((c) => present.has(c))
  const unknown = [...present].filter((k) => !Object.prototype.hasOwnProperty.call(schemaCols, k))
  if (unknown.length) console.log(`  ${table.padEnd(14)}   ⚠ 备份里有模式外的列，已忽略: ${unknown.join(', ')}`)

  const colList = cols.join(', ')
  const lines = []
  lines.push(`-- ${table}: ${rows.length} 行`)
  lines.push(`-- 由 scripts/import-to-d1.mjs 生成`)
  lines.push('')

  let batch = []
  let batchBytes = 0

  const flush = () => {
    if (!batch.length) return
    lines.push(`INSERT INTO ${table} (${colList}) VALUES`)
    lines.push(batch.join(',\n') + ';')
    lines.push('')
    batch = []
    batchBytes = 0
  }

  for (const row of rows) {
    const values = cols.map((c) => sqlLiteral(row[c], schemaCols[c].type))
    const tuple = `(${values.join(', ')})`
    // 单条语句 ≤ MAX_STMT_BYTES
    if (batchBytes + tuple.length + 2 > MAX_STMT_BYTES) flush()
    batch.push(tuple)
    batchBytes += tuple.length + 2
  }
  flush()

  const sql = lines.join('\n')
  const outFile = join(outDir, `${table}.sql`)
  writeFileSync(outFile, sql, 'utf8')

  grandRows += rows.length
  report.push({ table, rows: rows.length, bytes: Buffer.byteLength(sql), skipped: rawCount - rows.length })
  console.log(
    `  ${table.padEnd(14)} ✓ ${String(rows.length).padStart(7)} 行  ${(Buffer.byteLength(sql) / 1024 / 1024).toFixed(1).padStart(6)} MB` +
      (rawCount !== rows.length ? `  （原始 ${rawCount} 行，按 --since 过滤掉 ${rawCount - rows.length}）` : '')
  )
}

// ---------------------------------------------------------------- README
const readme = []
readme.push('D1 数据导入 —— 按顺序执行下面几条命令')
readme.push('='.repeat(50))
readme.push('')
readme.push('前置：先建表（如果还没建）')
readme.push('  wrangler d1 execute xtcer --remote --file=database/d1-schema.sql')
readme.push('')
readme.push('然后逐表导入（文件在本目录）：')
readme.push('')
for (const r of report) {
  if (!r.rows) continue
  readme.push(`  wrangler d1 execute xtcer --remote --file=tmpwork/d1-import/${r.table}.sql`)
}
readme.push('')
readme.push('导入后核对行数：')
readme.push('')
const checks = report.filter((r) => r.rows).map((r) => `SELECT '${r.table}' AS t, COUNT(*) AS n FROM ${r.table}`)
if (checks.length) {
  readme.push(`  wrangler d1 execute xtcer --remote --command="${checks.join(' UNION ALL ')}"`)
}
readme.push('')
readme.push('预期行数：')
for (const r of report.filter((x) => x.rows)) readme.push(`  ${r.table.padEnd(14)} ${r.rows}`)
readme.push('')
readme.push('⚠️ visitors 行数最多，导入最慢（几分钟）。中途失败可以直接重跑该表的 SQL ——')
readme.push('   脚本生成的是纯 INSERT，重跑会产生重复行。若要重跑，先 DELETE FROM visitors;')

writeFileSync(join(outDir, '_README.txt'), readme.join('\n'), 'utf8')

console.log('')
console.log(`✓ 共 ${grandRows} 行，SQL 输出到 tmpwork/d1-import/`)
console.log(`  执行指引见 tmpwork/d1-import/_README.txt`)
