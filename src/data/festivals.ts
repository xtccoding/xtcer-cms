/**
 * 节日促销专区配置（黑五 / 双十一 / 双十二 / 元旦 / 春节…）
 *
 * 设计原则：
 *   - 节日是**时间窗口**，不是人工开关。到点自动亮、过了自动灭，无需手动改代码。
 *   - 每个节日声明：关键词（用于把 deal 归入该专区）、起止日期、主题色、口号。
 *   - `activeFestival()` 返回当前生效的节日；`upcomingFestival()` 返回下一个
 *     未开始的节日，用于倒计时。
 *   - 时区按北京时间（UTC+8）判定，避免服务器 UTC 导致「差一天」。
 */

export type Festival = {
  /** 稳定 id，用于 URL（?cat=festival-<id>） */
  id: string
  /** 展示名 */
  label: string
  /** 卡片/横幅上的短口号 */
  slogan: string
  /** 开始日期（含），北京时间 */
  start: string
  /** 结束日期（含），北京时间 */
  end: string
  /** 主色（横幅渐变、Tab 高亮） */
  accent: string
  /** 主题 emoji */
  icon: string
  /**
   * 命中关键词：deal 的 provider / product / notes 里出现任一，
   * 即视为该节日相关，归入专区。小写比较。
   */
  keywords: string[]
}

/**
 * 节日表。日期按**每年**填，跨年在 activeFestival 里按 MM-DD 匹配，
 * 所以这里写的是「年内区间」，年份只作参考、不参与判定。
 *
 * ⚠️ 黑五每年具体日期不同（11 月第 4 个星期五），这里给的是覆盖窗口（11 月下旬）。
 *    如需精确，手动改 start/end 即可。
 */
export const FESTIVALS: Festival[] = [
  {
    id: 'blackfriday',
    label: '黑五',
    slogan: 'Black Friday · 年度最狠一波',
    start: '11-20',
    end: '12-02',
    accent: '#111418',
    icon: '🖤',
    keywords: ['black friday', 'blackfriday', '黑五', 'bfcm', 'cyber monday', 'cybermonday'],
  },
  {
    id: 'double11',
    label: '双十一',
    slogan: '双 11 · 国内云厂商年度钜惠',
    start: '10-20',
    end: '11-13',
    accent: '#ff3a3a',
    icon: '🛍️',
    keywords: ['双11', '双 11', '双十一', '11.11', '11·11', 'singles day'],
  },
  {
    id: 'double12',
    label: '双十二',
    slogan: '双 12 · 年末补货',
    start: '12-05',
    end: '12-13',
    accent: '#ff6a00',
    icon: '🎁',
    keywords: ['双12', '双 12', '双十二', '12.12', '12·12'],
  },
]

/** 北京时间的 YYYY-MM-DD（UTC+8）。 */
export function beijingDate(now: Date = new Date()): string {
  const bj = new Date(now.getTime() + 8 * 3600 * 1000)
  return bj.toISOString().slice(0, 10)
}

/** 把 'MM-DD' 落到某个基准年，得到可比较的 YYYY-MM-DD。 */
function withYear(mmdd: string, year: number): string {
  return `${year}-${mmdd}`
}

/**
 * 判定某个节日在「今天」是否处于窗口内。
 * 支持跨年（如元旦：12-28 → 01-03），此时用「或」逻辑。
 */
export function isFestivalActive(f: Festival, today = beijingDate()): boolean {
  const year = Number(today.slice(0, 4))
  const start = withYear(f.start, year)
  const end = withYear(f.end, year)
  if (f.start <= f.end) {
    return today >= start && today <= end
  }
  // 跨年窗口：今天在 start 之后（本年末）或 end 之前（次年初）
  return today >= start || today <= withYear(f.end, year)
}

/** 当前生效的节日（若有多个重叠，返回优先级最高的第一个）。 */
export function activeFestival(today = beijingDate()): Festival | null {
  return FESTIVALS.find(f => isFestivalActive(f, today)) || null
}

/** 下一个尚未开始的节日（用于倒计时），按开始日期升序取第一个未过的。 */
export function upcomingFestival(today = beijingDate()): Festival | null {
  const year = Number(today.slice(0, 4))
  const candidates = FESTIVALS.map(f => {
    let start = withYear(f.start, year)
    if (start < today) start = withYear(f.start, year + 1)
    return { f, start }
  }).sort((a, b) => (a.start < b.start ? -1 : 1))
  return candidates[0]?.f || null
}

/** 距某节日的开始还有多少天（北京时间，向上取整到「天」）。已开始返回 0。 */
export function daysUntil(f: Festival, today = beijingDate()): number {
  const year = Number(today.slice(0, 4))
  let start = withYear(f.start, year)
  if (start < today) start = withYear(f.start, year + 1)
  const t0 = Date.parse(`${today}T00:00:00+08:00`)
  const t1 = Date.parse(`${start}T00:00:00+08:00`)
  return Math.max(0, Math.round((t1 - t0) / 86400000))
}

/**
 * 判断一个 deal 是否属于某节日专区。
 * 命中规则：provider / product / notes 任意字段包含任一关键词（不区分大小写）。
 * 也允许通过 category 显式标记（如 category='festival:blackfriday'）。
 */
export function dealMatchesFestival(
  deal: { provider?: string | null; product?: string | null; notes?: string | null; category?: string | null },
  f: Festival
): boolean {
  if (deal.category && deal.category.toLowerCase().includes(`festival:${f.id}`)) return true
  const hay = `${deal.provider || ''} ${deal.product || ''} ${deal.notes || ''}`.toLowerCase()
  return f.keywords.some(k => hay.includes(k.toLowerCase()))
}
