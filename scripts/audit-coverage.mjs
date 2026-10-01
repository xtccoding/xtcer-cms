// Coverage check: which live deals resolve to a *default* curation (no metadata)?
// A default curation means the card shows no payment badges, no limits, no tips —
// so it sorts last and tells the user nothing about how to pay.
//
// Run:  curl -s "https://xtcer.cn/api/deals?all=1" -o .shots/deals_api.json && node scripts/audit-coverage.mjs
import { readFileSync } from 'node:fs'
import { resolveCuration } from '../src/data/deal-curation.ts'

const raw = JSON.parse(readFileSync('./.shots/deals_api.json', 'utf8'))
const deals = raw.deals ?? raw

const bare = []
for (const d of deals) {
  const c = resolveCuration(d.provider, d.product)
  const hasMeta =
    (c.payments && c.payments.length > 0) ||
    c.freeNoCard ||
    (c.limits && c.limits.length > 0) ||
    (c.tips && c.tips.length > 0) ||
    c.warning ||
    c.promoNote ||
    (c.tlds && c.tlds.length > 0)
  if (!hasMeta) bare.push(d)
}

console.log(`deals scanned        : ${deals.length}`)
console.log(`no curation metadata : ${bare.length}`)
console.log()
const byProv = new Map()
for (const d of bare) {
  if (!byProv.has(d.provider)) byProv.set(d.provider, [])
  byProv.get(d.provider).push(d.product)
}
for (const [prov, prods] of [...byProv].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${prov.padEnd(24)} ${prods.length}  ${prods.join(' | ')}`)
}
