/**
 * 价格文本归一化 —— 站点与脚本共用的**唯一**实现。
 *
 * 为什么需要它：数据库里的 `price_cny` 是人工录入的，**口径不统一** ——
 * 同样是 €4.5/月，Contabo Cloud VPS S 记成 39.15（月租口径），
 * Contabo Cloud VPS 10 却记成 427.68（年付口径）。直接按它排序会排错。
 * 所以排序/比价一律**从 `price` 文本重新解析**成「月付人民币」。
 *
 * 写 .mjs 而不是 .ts：这样 Astro 页面（Vite）和 scripts/ 下的 Node 脚本
 * 可以 import 同一份代码，不必维护两个副本。
 *
 * 使用方：
 * - src/pages/deals.astro          → 按价格排序
 * - scripts/prune-expensive.mjs    → 粗筛「不便宜」的卡片
 */

/** 与站内既有 price_cny 保持同一套汇率，便于「解析值 vs 录入值」比对。 */
export const FX = { CNY: 1, USD: 7.2, EUR: 7.92 }

const FULLWIDTH = { '￥': '¥', '．': '.', '，': ',', '（': '(', '）': ')' }

export const clean = s =>
  (s || '')
    .replace(/[￥．，（）]/g, ch => FULLWIDTH[ch] || ch)
    .trim()

const CURRENCY = [
  ['¥', 'CNY'],
  ['$', 'USD'],
  ['€', 'EUR'],
]

function parseAmount(text) {
  const m = clean(text).match(/([¥$€])\s*([\d.]+)/)
  if (!m) return null
  const currency = (CURRENCY.find(c => c[0] === m[1]) || [, 'CNY'])[1]
  const amount = parseFloat(m[2])
  if (!Number.isFinite(amount)) return null
  return { amount, currency }
}

/**
 * @returns {{monthlyCny:number|null, annualCny:number|null, period:string, promo:boolean, reason?:string}}
 */
export function parsePrice(raw) {
  const text = clean(raw)
  const promo = /首年|首月|试用|折后|起/.test(text)

  if (!text) return { monthlyCny: null, annualCny: null, period: 'empty', promo }
  // 免费（允许后面跟额度描述，如「免费10GB」「免费 + $200 试用金」）
  if (/免费|free/i.test(text)) {
    return { monthlyCny: 0, annualCny: 0, period: 'free', promo: false }
  }
  // 搭售：赠域名 / 赠主机，本身没有独立标价
  if (/随套餐|随服务器|随主机|赠域名|赠主机/.test(text)) {
    return { monthlyCny: null, annualCny: null, period: 'bundled', promo: false, reason: '搭售赠品，无独立标价' }
  }
  // 模糊价 vs 滚动促销：「秒杀中」是真模糊；「秒杀价（每日 17:55 开抢）」口径是清楚的
  if (/秒杀|极低价|超低价|待定|咨询/.test(text)) {
    const descriptive = /每日|每周|周末|开抢|官网|限量|抢购/.test(text)
    if (!descriptive) {
      return { monthlyCny: null, annualCny: null, period: 'vague', promo, reason: '价格模糊，无法归一' }
    }
    return { monthlyCny: null, annualCny: null, period: 'rolling', promo: true, reason: '滚动促销，无固定月租' }
  }
  // 额度 / 赠金 / 按量付费，不是标价
  if (/额度|余额|抵扣|赠金|credits?|按量|按需付费/i.test(text)) {
    return { monthlyCny: null, annualCny: null, period: 'credit', promo: false, reason: '赠额/按量，非月租标价' }
  }

  const amt = parseAmount(text)
  if (!amt) return { monthlyCny: null, annualCny: null, period: 'unparsed', promo, reason: '未解析出金额' }
  if (amt.amount === 0) return { monthlyCny: 0, annualCny: 0, period: 'free', promo: false }
  const rate = FX[amt.currency] ?? 1

  // 计量价（按 GB / TB / 百万 token）：无法折算成月租，跳过
  if (/\/\s*(GB|TB|G|T|M|百万)\b/i.test(text) || /token/i.test(text)) {
    return { monthlyCny: null, annualCny: null, period: 'metered', promo, reason: '计量价（按量），不参与月租比较' }
  }

  // 按小时：优先取括号里的「≈$X/月」
  if (/\/\s*小时/.test(text)) {
    const monthlyHint = text.match(/≈\s*([¥$€])\s*([\d.]+)\s*\/\s*月/)
    if (monthlyHint) {
      const r = FX[(CURRENCY.find(c => c[0] === monthlyHint[1]) || [, 'CNY'])[1]] ?? 1
      const m = parseFloat(monthlyHint[2]) * r
      return { monthlyCny: m, annualCny: m * 12, period: 'hour', promo: false }
    }
    const m = amt.amount * 730 * rate
    return { monthlyCny: m, annualCny: m * 12, period: 'hour', promo: false }
  }

  // 多个月一付，如「$2.49/6个月」
  const multiMonth = text.match(/\/\s*(\d+)\s*个?月/)
  if (multiMonth) {
    const n = parseInt(multiMonth[1], 10) || 1
    const total = amt.amount * rate
    return { monthlyCny: total / n, annualCny: (total / n) * 12, period: 'multi-month', promo }
  }

  if (/\/\s*首?年|每年/.test(text)) {
    const annual = amt.amount * rate
    return { monthlyCny: annual / 12, annualCny: annual, period: 'year', promo }
  }
  if (/\/\s*首?月|每月/.test(text)) {
    const monthly = amt.amount * rate
    return { monthlyCny: monthly, annualCny: monthly * 12, period: 'month', promo }
  }

  // 只有金额没有周期 —— 常见于「¥199 起」这类，按年处理太激进，标记待确认
  return { monthlyCny: null, annualCny: null, period: 'noperiod', promo, reason: '缺计费周期' }
}

/**
 * 排序用的「月付人民币」。**解析不出来就返回 null**，不做任何兜底。
 *
 * 为什么不退回 `price_cny`：它只说明「这行数据里有个数字」，不代表是月租。
 * `$5 试用额度` 的 price_cny 是 36（按 $5 折的），拿它参与价格排序会让一张
 * 「赠额卡」插到免费卡和付费卡中间，排出来的顺序是错的。
 * 凡是「月租口径说不清」的（赠额 / 搭售 / 模糊价 / 按量计费 / 缺周期），
 * 一律返回 null，由调用方决定沉到最后。
 *
 * @param {string|null|undefined} rawPrice 数据库里的 price 文本
 * @returns {number|null} 月付人民币；null = 无法归一
 */
export function monthlyCny(rawPrice) {
  return parsePrice(rawPrice).monthlyCny
}
