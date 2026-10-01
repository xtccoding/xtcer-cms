#!/usr/bin/env node
/**
 * gen-d1-schema.mjs —— 由 src/lib/d1-schema.mjs 生成 database/d1-schema.sql
 *
 * 用法:
 *   node scripts/gen-d1-schema.mjs            # 写入 database/d1-schema.sql
 *   node scripts/gen-d1-schema.mjs --stdout   # 只打印
 *
 * 生成后用它建表：
 *   wrangler d1 execute xtcer --remote --file=database/d1-schema.sql
 */
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TABLES, T, NOW, sqliteType } from '../src/lib/d1-schema.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT = join(ROOT, 'database', 'd1-schema.sql')

function renderDefault(col) {
  if (!('default' in col)) return ''
  const d = col.default
  if (d === 'now') return ` DEFAULT ${NOW}`
  if (typeof d === 'boolean') return ` DEFAULT ${d ? 1 : 0}`
  if (typeof d === 'number') return ` DEFAULT ${d}`
  if (Array.isArray(d)) return ` DEFAULT '${JSON.stringify(d)}'`
  return ` DEFAULT '${String(d).replace(/'/g, "''")}'`
}

const lines = []
lines.push('-- ============================================================')
lines.push('-- xtcer.cn — Cloudflare D1（SQLite）表结构')
lines.push('--')
lines.push('-- 本文件由 scripts/gen-d1-schema.mjs 自动生成，请勿手工编辑。')
lines.push('-- 要改表结构，改 src/lib/d1-schema.mjs 后重新生成。')
lines.push('--')
lines.push('-- 部署步骤：')
lines.push('--   1) wrangler d1 create xtcer')
lines.push('--   2) wrangler d1 execute xtcer --remote --file=database/d1-schema.sql')
lines.push('--   3) wrangler d1 execute xtcer --remote --file=<导入数据.sql>')
lines.push('--   4) 在 Pages 项目 Settings → Bindings 加 D1 绑定，变量名 DB')
lines.push('--')
lines.push('-- 幂等：全部 IF NOT EXISTS，可重复执行。')
lines.push('-- ============================================================')
lines.push('')

for (const [table, def] of Object.entries(TABLES)) {
  lines.push(`-- ---------- ${table} ----------`)
  lines.push(`CREATE TABLE IF NOT EXISTS ${table} (`)

  const colDefs = []
  for (const [name, col] of Object.entries(def.columns)) {
    let s = `  ${name} ${sqliteType(col.type)}`
    if (col.pk) s += ' PRIMARY KEY'
    if (col.notNull) s += ' NOT NULL'
    s += renderDefault(col)
    colDefs.push(s)
  }
  lines.push(colDefs.join(',\n'))
  lines.push(');')

  for (const idx of def.indexes || []) {
    const unique = idx.unique ? 'UNIQUE ' : ''
    const prefix = idx.unique ? 'uniq' : 'idx'
    const name = `${prefix}_${table}_${idx.columns.join('_')}`
    lines.push(
      `CREATE ${unique}INDEX IF NOT EXISTS ${name} ON ${table}(${idx.columns.join(', ')});`
    )
  }
  lines.push('')
}

lines.push('-- ---------- 迁移自检 ----------')
lines.push('-- 建表后跑这个，确认每张表都在（预期 11 行）：')
lines.push("--   SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name;")
lines.push('')

const sql = lines.join('\n')

if (process.argv.includes('--stdout')) {
  process.stdout.write(sql)
} else {
  writeFileSync(OUT, sql, 'utf8')
  const tableCount = Object.keys(TABLES).length
  const indexCount = Object.values(TABLES).reduce((a, d) => a + (d.indexes?.length || 0), 0)
  console.log(`✓ 已生成 database/d1-schema.sql`)
  console.log(`  ${tableCount} 张表, ${indexCount} 个索引, ${(Buffer.byteLength(sql) / 1024).toFixed(1)} KB`)
  console.log(`  表: ${Object.keys(TABLES).join(', ')}`)
}
