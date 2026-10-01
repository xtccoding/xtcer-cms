// 清理「不便宜」的卡片 —— 两段式判定：
//
//   第一段（粗筛）：把价格文本归一成「月付人民币」，超过绝对阈值（默认
//                   月付 > ¥150 或 年付 > ¥1000）的先捞成候选。
//   第二段（精筛）：拿候选自己的「同规格大厂标准价」（curation 的 compare 块）
//                   去比 —— 比大厂还贵的才真正标记下线。
//
// 为什么不直接用 price_cny：它是人工录入的，口径不统一 ——
// 同样是 €4.5/月，Contabo Cloud VPS S 记成 39.15（月），
// Contabo Cloud VPS 10 却记成 427.68（年）。所以这里一律**从 price 文本重新解析**，
// 顺带把 price_cny 和解析值对不上的卡片列出来（数据质量提示）。
//
// 默认只出报告，加 --apply 才会把卡片下线（is_active=false，可恢复）。
//
// 用法：
//   node scripts/prune-expensive.mjs                 # 报告（读线上 API）
//   node scripts/prune-expensive.mjs --offline       # 报告（读 .shots/deals_api.json）
//   node scripts/prune-expensive.mjs --monthly 100   # 调粗筛阈值
//   node scripts/prune-expensive.mjs --json          # 机器可读输出
//   node scripts/prune-expensive.mjs --apply         # 真正下线被标记的卡片
//   node scripts/prune-expensive.mjs --restore       # 把上次下线的卡片恢复
import { readFileSync } from 'node:fs'
import { resolveCuration } from '../src/data/deal-curation.ts'
// 价格归一化只有这一份实现（站内排序也用它），别再在这里复制一份。
import { parsePrice } from '../src/lib/price.mjs'

const BASE = 'https://xtcer.cn'
const COOKIE = 'admin_auth=ctooctooctoo'

// 粗筛绝对阈值（人民币）
const MONTHLY_T = 150
const ANNUAL_T = 1000

// ---------------------------------------------------------------- price parse

// compare 块里的价格形如 '¥45/月'、'¥0.12/GB/月'、'$0.023/GB/月'
function refMonthly(priceText) {
  const p = parsePrice(priceText)
  if (p.period === 'metered') return null
  return p.monthlyCny
}

// 从规格串里抠 vCPU / 内存，用于判断「同规格」是否真的同规格。
// 例：'8vCPU / 32G / 400G NVMe' -> {vcpu:8, ram:32}；'2核 1GB 20GB SSD' -> {vcpu:2, ram:1}
function specOf(text) {
  const s = text || ''
  const vcpu = (s.match(/(\d+)\s*(?:v?cpu|核)/i) || [])[1]
  const ram = (s.match(/(\d+)\s*(?:GB?|G)\b/i) || [])[1]
  return { vcpu: vcpu ? +vcpu : null, ram: ram ? +ram : null }
}

// 只有当「这张卡的规格 ≤ 大厂基准的规格」时，比价才有意义 ——
// 否则拿 8核32G 的机器去比 2核4G 的基准价，是误伤。
function comparable(dealSpec, benchSpec) {
  if (dealSpec.vcpu == null || dealSpec.ram == null) return false
  if (benchSpec.vcpu == null || benchSpec.ram == null) return false
  return dealSpec.vcpu <= benchSpec.vcpu && dealSpec.ram <= benchSpec.ram
}

// ---------------------------------------------------------------------- fetch

async function loadDeals(offline) {
  if (offline) return JSON.parse(readFileSync('./.shots/deals_api.json', 'utf8'))
  const res = await fetch(`${BASE}/api/deals?include_expired=1`, {
    headers: { Cookie: COOKIE, 'User-Agent': 'Mozilla/5.0' },
  })
  if (!res.ok) throw new Error(`GET /api/deals -> ${res.status}`)
  return res.json()
}

async function setActive(id, active) {
  const res = await fetch(`${BASE}/api/deals`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: COOKIE, 'User-Agent': 'Mozilla/5.0' },
    body: JSON.stringify({ id, is_active: active }),
  })
  if (!res.ok) throw new Error(`PUT /api/deals ${id} -> ${res.status}`)
  return res.json()
}

// ----------------------------------------------------------------------- main

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const next = process.argv[i + 1]
  return next && !next.startsWith('--') ? next : true
}

async function main() {
  const offline = !!arg('offline')
  const asJson = !!arg('json')
  const apply = !!arg('apply')
  const restore = !!arg('restore')
  const monthlyT = Number(arg('monthly', MONTHLY_T)) || MONTHLY_T
  const annualT = Number(arg('annual', ANNUAL_T)) || ANNUAL_T

  const all = await loadDeals(offline)
  // 报告/下线只针对在架卡片；--restore 需要能看到已下线的，所以对全量都算一遍。
  const deals = all

  const rows = []
  const dataIssues = []

  for (const d of deals) {
    const p = parsePrice(d.price)
    const c = resolveCuration(d.provider, d.product)

    // 参考卡（大厂标准价）与补充卡是「故意贵」的对照基准，天然不参与清理。
    const exempt = !!(c.reference || c.supplement)

    // 只用卡片自己的「同规格大厂价」。没有 compare 块就不敢下结论，
    // 交给「待人工确认」，而不是拿不同规格的分类均值去误伤。
    const refs = (c.compare || [])
      .map(r => ({ vendor: r.vendor, config: r.config, price: r.price, monthly: refMonthly(r.price) }))
      .filter(r => r.monthly != null && r.monthly > 0)
    refs.sort((a, b) => a.monthly - b.monthly)
    const bench = refs[0] || null
    const benchSource = bench ? 'compare' : null

    const monthly = p.monthlyCny
    const annual = p.annualCny
    const coarse = !exempt && monthly != null && (monthly > monthlyT || (annual != null && annual > annualT))

    // 精筛：必须「有同规格大厂价」且「规格不高于基准」，才敢判它贵。
    const dealSpec = specOf(d.config)
    const specOk = bench ? comparable(dealSpec, specOf(bench.config)) : false
    const flagged = coarse && bench && specOk ? monthly > bench.monthly : false
    let reviewReason = null
    if (coarse && !bench) reviewReason = '缺同规格大厂价'
    else if (coarse && !specOk) reviewReason = `规格（${d.config}）高于基准（${bench.config}），不可比`
    else if (coarse && !flagged) reviewReason = null // 保留
    const needsReview = coarse && !flagged && reviewReason != null

    rows.push({
      id: d.id,
      provider: d.provider,
      product: d.product,
      category: d.category,
      type: d.type,
      isActive: d.is_active !== false,
      price: d.price,
      price_cny: d.price_cny,
      monthlyCny: monthly,
      annualCny: annual,
      period: p.period,
      promo: p.promo,
      exempt,
      coarse,
      flagged,
      needsReview,
      reviewReason,
      bench,
      benchSource,
      config: d.config,
    })

    // ---- 数据质量：price_cny 与解析值口径不一致 / 价格模糊（只看在架） ----
    if (d.is_active === false) continue
    if (p.period === 'vague' || p.period === 'unparsed' || p.period === 'noperiod') {
      dataIssues.push({ id: d.id, provider: d.provider, product: d.product, price: d.price, kind: p.period, note: p.reason })
    } else if (monthly != null && typeof d.price_cny === 'number' && d.price_cny > 0) {
      // 解析出月付后，看 price_cny 更像「月」还是「年」口径
      const asMonth = d.price_cny
      const asYear = d.price_cny / 12
      const offMonth = Math.abs(asMonth - monthly) / monthly
      const offYear = Math.abs(asYear - monthly) / monthly
      const best = Math.min(offMonth, offYear)
      if (best > 0.25) {
        dataIssues.push({
          id: d.id,
          provider: d.provider,
          product: d.product,
          price: d.price,
          kind: 'price_cny-mismatch',
          note: `price_cny=${d.price_cny} 与解析月付≈¥${monthly.toFixed(1)} 差 ${(best * 100).toFixed(0)}%`,
        })
      }
    }
  }

  const activeRows = rows.filter(r => r.isActive)
  const coarseRows = activeRows.filter(r => r.coarse).sort((a, b) => b.monthlyCny - a.monthlyCny)
  const flaggedRows = activeRows.filter(r => r.flagged).sort((a, b) => b.monthlyCny - a.monthlyCny)
  const reviewRows = activeRows.filter(r => r.needsReview).sort((a, b) => b.monthlyCny - a.monthlyCny)
  const keptRows = coarseRows.filter(r => !r.flagged && !r.needsReview)
  const exemptCount = activeRows.filter(r => r.exempt).length
  const restoreRows = rows.filter(r => !r.isActive && r.flagged).sort((a, b) => b.monthlyCny - a.monthlyCny)

  if (asJson) {
    console.log(JSON.stringify({
      thresholds: { monthly: monthlyT, annual: annualT },
      scanned: activeRows.length,
      coarse: coarseRows,
      flagged: flaggedRows,
      needsReview: reviewRows,
      dataIssues,
    }, null, 2))
    return
  }

  const money = v => (v == null ? '—' : `¥${v.toFixed(v < 100 ? 1 : 0)}`)

  console.log(`扫描在架卡片：${activeRows.length}（其中参考/补充卡 ${exemptCount} 张，豁免）`)
  console.log(`粗筛阈值：月付 > ${money(monthlyT)} 或 年付 > ${money(annualT)}`)
  console.log(`\n【第一段 · 粗筛候选】${coarseRows.length} 张`)
  for (const r of coarseRows) {
    console.log(`  ${money(r.monthlyCny).padStart(8)}/月  ${r.provider} / ${r.product}  （${r.price}）`)
  }

  console.log(`\n【第二段 · 精筛标记】${flaggedRows.length} 张 —— 比大厂同规格还贵，建议下线`)
  for (const r of flaggedRows) {
    console.log(`  ${money(r.monthlyCny).padStart(8)}/月  >  ${money(r.bench.monthly)}/月 ${r.bench.vendor} ${r.bench.config}  [${r.benchSource}]`)
    console.log(`             ${r.provider} / ${r.product}  （${r.price}）`)
  }

  console.log(`\n【待人工确认】${reviewRows.length} 张 —— 粗筛过了，但不敢自动判`)
  for (const r of reviewRows) {
    console.log(`  ${money(r.monthlyCny).padStart(8)}/月  ${r.provider} / ${r.product}  （${r.price}）`)
    console.log(`             ↳ ${r.reviewReason}`)
  }

  console.log(`\n【保留】${keptRows.length} 张 —— 粗筛通过，但仍比大厂便宜`)
  for (const r of keptRows) {
    console.log(`  ${money(r.monthlyCny).padStart(8)}/月  ≤  ${money(r.bench?.monthly ?? NaN)}/月 ${r.bench?.vendor ?? '（无基准）'}`)
    console.log(`             ${r.provider} / ${r.product}  （${r.price}）`)
  }

  console.log(`\n【数据质量提示】${dataIssues.length} 张（喂给 fix_notes / 补价用）`)
  for (const r of dataIssues) {
    console.log(`  [${r.kind}] ${r.provider} / ${r.product} —— ${r.price} :: ${r.note}`)
  }

  if (restore) {
    if (!restoreRows.length) {
      console.log('\n[restore] 没有被标记下线、可恢复的卡片')
      return
    }
    console.log(`\n[restore] 恢复 ${restoreRows.length} 张……`)
    for (const r of restoreRows) {
      await setActive(r.id, true)
      console.log(`  + ${r.provider} / ${r.product}`)
    }
    console.log('[done] 已恢复')
    return
  }

  if (apply) {
    if (!flaggedRows.length) {
      console.log('\n[apply] 没有需要下线的卡片')
      return
    }
    console.log(`\n[apply] 下线 ${flaggedRows.length} 张……`)
    for (const r of flaggedRows) {
      await setActive(r.id, false)
      console.log(`  - ${r.provider} / ${r.product}`)
    }
    console.log('[done] 已下线（可用 --restore 恢复）')
    return
  }

  console.log('\n（仅报告。加 --apply 执行下线，--restore 恢复）')
}

main().catch(e => {
  console.error('[error]', e.message)
  process.exit(1)
})
