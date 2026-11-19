/**
 * 「免费可领」判定 —— 站点主价值是帮人找能白嫖的云资源（俗称「领鸡蛋」）。
 *
 * 不新增数据库字段：deals 表由外部采集管道写入，改表要走 DDL；
 * 而「是不是免费」从现有数据就能可靠推出。一个 deal 满足任一条件即视为免费：
 *   - price_cny === 0（人工/管道已解析出 0 元）
 *   - price 文本含「免费 / free / 0 元」
 *   - 策展层显式标注 freeNoCard（完全免费、连付款方式都不需要）
 *
 * `freeNoCard` 优先级最高：它是人工核实过的，不受文本措辞影响。
 */

import type { DealCuration } from '../data/deal-curation'

/** 免费的类型：完全免费 / 免费额度 / 限时试用 */
export type FreebieKind = 'full' | 'quota' | 'trial'

export const FREEBIE_META: Record<
  FreebieKind,
  { label: string; icon: string; desc: string; cls: string }
> = {
  full: {
    label: '完全免费',
    icon: '🆓',
    desc: '注册就能用，不用付款、不用绑卡 —— 最省事的鸡蛋',
    cls: 'full',
  },
  quota: {
    label: '免费额度',
    icon: '🎁',
    desc: '免费套餐 / 每月赠额，小项目够用；超出部分才开始计费',
    cls: 'quota',
  },
  trial: {
    label: '免费试用',
    icon: '⏳',
    desc: '限时体验，到期前记得降级或迁走，别被自动续费咬到',
    cls: 'trial',
  },
}

/** 试用类：优先判 —— 「免费试用 30 天」本质是试用，不是长期免费 */
const TRIAL_RE = /(试用|体验|trial)/i
/** 额度类：免费套餐 / 赠金 / 每月 token，属于「有上限的免费」 */
const QUOTA_RE = /(额度|赠金|赠额|代金|积分|token|credit|免费版|免费套餐|免费计划|免费层级|free tier|hobby|每月|每\s*月)/i
/** 免费字样：兜底判定，只要出现就算免费 */
const FREE_RE = /(免费|free|0\s*元|零元|白嫖)/i

export interface FreebieInfo {
  /** 是否属于「免费可领」 */
  isFree: boolean
  /** 免费类型；isFree 为 false 时为空 */
  kind?: FreebieKind
}

interface DealLike {
  price?: string | null
  price_cny?: number | null
}

/**
 * 判定一条 deal 是否免费，并给出免费类型。
 *
 * @param deal 至少要含 price / price_cny
 * @param curation 策展元数据（可只传 freeNoCard）
 */
export function resolveFreebie(
  deal: DealLike,
  curation?: Pick<DealCuration, 'freeNoCard'>,
): FreebieInfo {
  const text = deal.price || ''
  const zeroPrice = deal.price_cny === 0
  const isFree = curation?.freeNoCard === true || zeroPrice || FREE_RE.test(text)

  if (!isFree) return { isFree: false }

  // 先看价格文案的语义：试用 / 免费套餐（有额度上限）比「完全免费」更具体。
  // freeNoCard 只保证「不用付款」，不代表无额度上限，所以不能一律归为完全免费。
  if (TRIAL_RE.test(text)) return { isFree: true, kind: 'trial' }
  if (QUOTA_RE.test(text)) return { isFree: true, kind: 'quota' }
  return { isFree: true, kind: 'full' }
}
