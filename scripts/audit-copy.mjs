// Detect duplicated copy between the DB `notes` field and the curation blocks
// (limits / warning / promoNote / tips / perf / pros). All of them render on the
// same card, so any sentence that appears in both shows up twice — the exact
// "看起来重复" complaint. Run from the repo root:
//   node scripts/audit-copy.mjs
import { readFileSync } from 'node:fs'
import { resolveCuration } from '../src/data/deal-curation.ts'

const deals = JSON.parse(readFileSync('./.shots/deals_api.json', 'utf8'))

const norm = s =>
  (s || '')
    .toLowerCase()
    .replace(/[\s，。、；：！？,.;:!?·（）()「」“”"'’—-]/g, '')

function bigrams(s) {
  const out = new Set()
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2))
  return out
}

function overlap(a, b) {
  if (!a || !b) return 0
  const A = bigrams(norm(a))
  const B = bigrams(norm(b))
  if (!A.size || !B.size) return 0
  let hit = 0
  for (const g of A) if (B.has(g)) hit++
  return hit / Math.min(A.size, B.size)
}

const rows = []
for (const d of deals) {
  if (d.is_active === false) continue
  const c = resolveCuration(d.provider, d.product)
  const notes = d.notes || ''
  if (!notes) continue
  const blocks = []
  for (const l of c.limits || []) blocks.push(['limit', l])
  if (c.warning) blocks.push(['warning', c.warning])
  if (c.promoNote) blocks.push(['promoNote', c.promoNote])
  for (const t of c.tips || []) blocks.push(['tip', t])
  // 2026-10 新增字段：性能机型 / 优势 / 对比也渲染在卡片上，同样不能和 notes 撞车
  if (c.perf) blocks.push(['perf', c.perf])
  for (const p of c.pros || []) blocks.push(['pro', p])
  for (const cmp of c.compare || []) blocks.push(['compare', `${cmp.vendor} ${cmp.config}`])

  const hits = []
  for (const [kind, text] of blocks) {
    const o = overlap(notes, text)
    if (o >= 0.34) hits.push({ kind, o: +o.toFixed(2), text })
  }
  if (hits.length) rows.push({ provider: d.provider, product: d.product, notes, hits })
}

rows.sort((a, b) => Math.max(...b.hits.map(h => h.o)) - Math.max(...a.hits.map(h => h.o)))

console.log(`deals scanned: ${deals.filter(d => d.is_active !== false).length}`)
console.log(`cards with overlapping copy: ${rows.length}\n`)
for (const r of rows) {
  console.log(`● ${r.provider} / ${r.product}`)
  console.log(`   notes : ${r.notes}`)
  for (const h of r.hits) console.log(`   ${h.kind.padEnd(9)}(${h.o}) ${h.text}`)
  console.log()
}
