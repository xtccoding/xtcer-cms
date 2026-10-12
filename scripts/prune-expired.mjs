#!/usr/bin/env node
/**
 * prune-expired.mjs — 淘汰过期信息（「过期就直接删除」）。
 *
 * 淘汰对象：
 *   1. deals  —— expiry 已过（expiry < 今天）。expiry 为 null = 长期有效，不动。
 *   2. feeds  —— 超过 --feed-days 天（默认 90）的历史情报。国庆/双十一这类
 *                时效性内容过期后一直挂着没有意义，按时效淘汰。
 *
 * 行为：
 *   - 默认是 **dry-run**（只报告将删除什么），必须显式 --apply 才真删。
 *   - --apply 前会先把待删行导出到 backups/prune-<时间戳>/，可回滚。
 *   - 幂等：重复跑不会重复删（第二次找不到候选即 0 条）。
 *
 * 用法：
 *   node scripts/prune-expired.mjs                    # 预演，看会删什么
 *   node scripts/prune-expired.mjs --apply            # 真删（先备份）
 *   node scripts/prune-expired.mjs --feed-days 60     # 自定义 feed 保留天数
 *   node scripts/prune-expired.mjs --only deals       # 只处理 deals
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// ---------------------------------------------------------------- env
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[k] = v
  }
  return out
}
const dotenv = loadDotEnv()
const pick = (k) => (process.env[k] && process.env[k].length ? process.env[k] : dotenv[k])

const SUPA_URL = (pick('PUBLIC_SUPABASE_URL') || '').replace(/\/+$/, '')
const KEY = pick('SUPABASE_SERVICE_ROLE_KEY') || ''

if (!SUPA_URL || !KEY) {
  console.error('✗ 需要 PUBLIC_SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// ---------------------------------------------------------------- 参数
const argv = process.argv.slice(2)
function flag(name, def = null) {
  const i = argv.indexOf(name)
  if (i === -1) return def
  return argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true
}
const APPLY = argv.includes('--apply')
const FEED_DAYS = Number(flag('--feed-days', '90')) || 90
const ONLY = flag('--only') // deals | feeds | null=both

const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: 'application/json' }
const TODAY = new Date().toISOString().slice(0, 10)

async function req(path, opts = {}) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
        ...opts,
        headers: { ...HEADERS, ...(opts.headers || {}) },
      })
      if (!res.ok) {
        const body = await res.text()
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`)
      }
      return res
    } catch (err) {
      if (attempt === 4) throw err
      await new Promise((r) => setTimeout(r, 700 * attempt))
    }
  }
}

// ---------------------------------------------------------------- 备份
let backupDir = null
function ensureBackupDir() {
  if (backupDir) return backupDir
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  backupDir = join(ROOT, 'backups', `prune-${stamp}`)
  mkdirSync(backupDir, { recursive: true })
  return backupDir
}
function saveBackup(name, rows) {
  const dir = ensureBackupDir()
  const p = join(dir, `${name}.json`)
  writeFileSync(p, JSON.stringify(rows, null, 2))
  return p
}

// ---------------------------------------------------------------- 候选查询
async function findExpiredDeals() {
  // expiry 非空且 < 今天
  const res = await req(`deals?select=*&expiry=not.is.null&expiry=lt.${TODAY}&order=expiry.asc`)
  return res.json()
}

async function findStaleFeeds() {
  const cutoff = new Date(Date.now() - FEED_DAYS * 86400000).toISOString()
  const res = await req(`feeds?select=*&created_at=lt.${cutoff}&order=created_at.asc`)
  return res.json()
}

// ---------------------------------------------------------------- 删除
async function deleteByIds(table, ids) {
  if (ids.length === 0) return 0
  let deleted = 0
  // 分批 + 每次 postgrest in 过滤，避免超长 URL
  const BATCH = 50
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH)
    const filter = `in.(${chunk.join(',')})`
    await req(`${table}?id=${filter}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
    deleted += chunk.length
  }
  return deleted
}

// ---------------------------------------------------------------- main
async function main() {
  console.log(`\n🗑  prune-expired  ${APPLY ? '(APPLY — 真删)' : '(DRY-RUN — 只报告)'}`)
  console.log(`   今天 = ${TODAY}   feed 保留 ${FEED_DAYS} 天\n`)

  const summary = []

  if (!ONLY || ONLY === 'deals') {
    const expired = await findExpiredDeals()
    console.log(`▸ deals 过期（expiry < ${TODAY}）：${expired.length} 条`)
    for (const d of expired.slice(0, 20)) {
      console.log(`    - [${d.expiry}] ${d.provider} / ${d.product}`)
    }
    if (expired.length > 20) console.log(`    … 其余 ${expired.length - 20} 条略`)
    if (APPLY && expired.length) {
      console.log(`    备份 → ${saveBackup('deals-deleted', expired)}`)
      const n = await deleteByIds('deals', expired.map((d) => d.id))
      console.log(`    ✓ 已删除 ${n} 条`)
    }
    summary.push(['deals', expired.length])
  }

  if (!ONLY || ONLY === 'feeds') {
    const stale = await findStaleFeeds()
    console.log(`\n▸ feeds 过期（created_at 早于 ${FEED_DAYS} 天前）：${stale.length} 条`)
    for (const f of stale.slice(0, 20)) {
      console.log(`    - [${String(f.created_at).slice(0, 10)}] ${f.feed_type}  ${String(f.title).slice(0, 60)}`)
    }
    if (stale.length > 20) console.log(`    … 其余 ${stale.length - 20} 条略`)
    if (APPLY && stale.length) {
      console.log(`    备份 → ${saveBackup('feeds-deleted', stale)}`)
      const n = await deleteByIds('feeds', stale.map((f) => f.id))
      console.log(`    ✓ 已删除 ${n} 条`)
    }
    summary.push(['feeds', stale.length])
  }

  console.log('\n── 汇总 ──')
  for (const [t, n] of summary) console.log(`   ${t}: ${n} 条待处理`)
  if (!APPLY) console.log('\n   （dry-run 结束；加 --apply 才会真删，删除前自动备份到 backups/）')
  else console.log('\n   ✓ 完成。')
}

main().catch((e) => {
  console.error('✗ 失败:', e.message)
  process.exit(1)
})
