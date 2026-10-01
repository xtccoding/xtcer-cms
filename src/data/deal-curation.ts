/**
 * Deal curation layer — editorial metadata that does NOT belong in the
 * volatile `deals` table.
 *
 * Why a code file instead of DB columns:
 *   - difficulty / warnings / promo codes are editorial judgement about a
 *     *provider's signup process*, which changes far more slowly than prices.
 *   - the `deals` table is written to via API by the collection pipeline and
 *     has no DDL access from the app (anon key + RLS), so adding columns would
 *     require manual SQL in the Supabase dashboard.
 *
 * Rules are matched in order — the FIRST match wins, so put the most specific
 * (provider + productIncludes) rules first and provider-wide rules after.
 */

export type Difficulty = 'easy' | 'medium' | 'hard'

export interface DealCuration {
  difficulty: Difficulty
  /** one-line risk note; rendered as a ⚠️ callout */
  warning?: string
  /** promo / coupon code, shown in a copyable chip */
  promo?: string
  /** explanation for the promo chip (or a note when there is no code) */
  promoNote?: string
  /** short bullet tips */
  tips?: string[]
  /** link to a full tutorial article */
  tutorialUrl?: string
  /**
   * Pull this item out of the difficulty sections and render it in a final
   * "补充" block — used for secondary perks like "buy hosting, get a domain".
   */
  supplement?: boolean
}

interface Rule extends Partial<DealCuration> {
  provider: string
  /** optional substring match against the product name */
  productIncludes?: string
}

/** Registration walk-through for the hard-to-open free tiers. */
const TUTORIAL = '/posts/df92ea33-2962-4531-acf2-9c57c433b7fb'

export const DIFFICULTY_RANK: Record<Difficulty, number> = {
  easy: 0,
  medium: 1,
  hard: 2,
}

export const DIFFICULTY_META: Record<
  Difficulty,
  { label: string; icon: string; desc: string }
> = {
  easy: { label: '易上手', icon: '✅', desc: '注册简单，邮箱或支付宝即可，几乎不会卡审核' },
  medium: { label: '有点门槛', icon: '🟡', desc: '需要信用卡或实名，或有额度到期、库存等坑' },
  hard: { label: '高难度 · 不保证成功', icon: '⚠️', desc: '风控严、常被拒，申请不到是常态' },
}

/** Header for the trailing "补充" block (buy X, get a domain free). */
export const SUPPLEMENT_META = {
  label: '补充 · 买其他送域名',
  icon: '🧩',
  desc: '买服务器 / 主机顺带赠送的域名，仅首年免费，续费按标准价 —— 可能用得上，故列在最后',
}

const rules: Rule[] = [
  // ---------- supplement: bundles that throw in a free domain ----------
  // (productIncludes '赠' must come before the provider-wide rules below)
  {
    provider: '阿里云',
    productIncludes: '赠',
    difficulty: 'easy',
    supplement: true,
    warning: '仅首年赠送，到期按标准价续费；需购买指定配置的云服务器。',
  },
  {
    provider: '腾讯云',
    productIncludes: '赠',
    difficulty: 'easy',
    supplement: true,
    warning: '仅首年赠送；需选带「赠域名」标签的套餐，单独注册域名没有 0 元。',
  },
  {
    provider: '华为云',
    difficulty: 'easy',
    supplement: true,
    warning: '云耀 L 实例推广期赠送，仅首年，次年起计费。',
  },
  {
    provider: 'Hostinger',
    difficulty: 'easy',
    supplement: true,
    warning: '仅新用户首次下单有效；注意主机续约价通常高于首年。',
  },
  {
    provider: 'Bluehost',
    difficulty: 'easy',
    supplement: true,
    warning: '域名次年按约 $14.95/年续费，主机续费也偏贵，注意长期成本。',
  },

  // ---------- domain registrars (real prices, not "成本价/低价") ----------
  {
    provider: '阿里云',
    productIncludes: '域名注册',
    difficulty: 'easy',
    promoNote: '.cn 首年 ¥38 / .com 首年 ¥85；新用户有 ¥1 首年活动，优惠口令可再打折',
    tips: ['.cn 需实名认证', '不定期有低价活动，值得盯一下'],
  },
  {
    provider: '腾讯云',
    productIncludes: '域名注册',
    difficulty: 'easy',
    promoNote: '.cn 首年 ¥35 / .com 首年 ¥83；续费 .cn ¥39，优惠口令可降',
    tips: ['.cn 需实名认证', '优惠口令常年在，结算页记得填'],
  },
  {
    provider: '百度智能云',
    difficulty: 'easy',
    tips: ['曾不定期搞 .cn 8 元级活动，值得盯一下活动页'],
  },
  {
    provider: 'Cloudflare',
    difficulty: 'easy',
    tips: ['必须把域名的 DNS 托管到 Cloudflare', '首年与续费同价，长期最省'],
  },
  {
    provider: 'Spaceship',
    difficulty: 'easy',
    tips: ['首年最便宜，5 年总成本也最低'],
  },
  {
    provider: 'Namecheap',
    difficulty: 'easy',
    tips: ['首年最低但续费跳涨，长期持有建议到期前转出'],
  },

  // ---------- hard: the famous free tiers everyone struggles with ----------
  {
    provider: 'Oracle Cloud',
    difficulty: 'hard',
    warning:
      '信用卡验证极严，常报通用的 ABC 错误；注册后 24h 内不要连开多个 Arm 实例，否则易被冻结。',
    tutorialUrl: TUTORIAL,
  },
  {
    provider: 'Oracle',
    difficulty: 'hard',
    warning: '与 Always Free 共用同一套账号体系，注册难度相同。',
    tutorialUrl: TUTORIAL,
  },
  {
    provider: 'Azure',
    difficulty: 'hard',
    warning:
      '$200 试用 30 天到期后若未降级会自动扣费；B1S 免费仅 12 个月。注册后先设预算告警。',
    tutorialUrl: TUTORIAL,
  },
  {
    provider: 'Google Cloud',
    difficulty: 'hard',
    warning:
      '$300 额度 90 天，到期须手动停实例并删磁盘，否则按量计费；e2-micro 仅限美区三地。',
    tutorialUrl: TUTORIAL,
  },
  {
    provider: 'AWS',
    difficulty: 'hard',
    warning:
      '2025-07 起新账户改发最高 $200 信用点 / 6 个月，不再是 12 个月免费。务必设 Billing 告警。',
    tutorialUrl: TUTORIAL,
  },

  // ---------- medium ----------
  {
    provider: 'Hetzner',
    difficulty: 'medium',
    warning: '新账号常被要求身份验证，中国用户被拒率较高；通过后性价比很高。',
  },
  {
    provider: 'DigitalOcean',
    difficulty: 'medium',
    warning: '$200 额度 60 天，到期后自动按量扣费。',
  },
  {
    provider: 'Vultr',
    difficulty: 'medium',
    warning: '需绑卡，赠送额度到期后按量计费。',
  },
  {
    provider: 'Anthropic',
    difficulty: 'medium',
    warning: '需海外信用卡，国内访问受限。',
  },
  {
    provider: 'OpenAI',
    difficulty: 'medium',
    warning: '需海外信用卡，国内访问受限。',
  },
  {
    provider: 'Google Gemini',
    difficulty: 'medium',
    warning: '免费档需海外网络环境访问。',
  },
  {
    provider: '阿里云',
    difficulty: 'medium',
    warning: '需实名认证；¥38/年 为限时秒杀，库存极少。',
    promoNote: '活动页直降，无需优惠码',
  },
  {
    provider: '腾讯云',
    productIncludes: 'Linux',
    difficulty: 'medium',
    warning: '需实名认证；秒杀限时，库存少。',
    promoNote: '活动页直降，无需优惠码',
  },
  {
    provider: '雨云',
    difficulty: 'medium',
    warning: '国内中小商家，注意续费价与稳定性。',
  },

  // ---------- easy, with promo / tips worth surfacing ----------
  {
    provider: 'RackNerd',
    difficulty: 'easy',
    promo: 'RN-2022',
    promoNote: '常规 VPS 75 折（特价套餐无需码）；独立服务器用 15OFFDEDI',
    tips: ['分到被墙 IP 可 72 小时内免费更换', '优选洛杉矶 / 圣何塞 / 西雅图机房'],
  },
  {
    provider: 'Contabo',
    difficulty: 'easy',
    promoNote: '结账自动约 8 折（美 / 英机房免位置费），无需优惠码',
  },
  {
    provider: 'DediRock',
    difficulty: 'easy',
    tips: ['小商家，建议先短期试水再考虑长付'],
  },
  {
    provider: 'DediOne',
    difficulty: 'easy',
    tips: ['小商家，建议先短期试水再考虑长付'],
  },
  {
    provider: 'Lycheen',
    difficulty: 'easy',
    tips: ['小商家，建议先短期试水再考虑长付'],
  },
  {
    provider: 'justhost.asia',
    difficulty: 'easy',
    tips: ['小商家，建议先短期试水再考虑长付'],
  },
  {
    provider: 'EthernetServers',
    difficulty: 'easy',
    tips: ['OpenVZ 架构，不能自定义内核；注意续费价'],
  },
  {
    provider: 'BuyVM',
    difficulty: 'easy',
    tips: ['支持支付宝；有廉价块存储，适合做备份'],
  },
]

/** Resolve the curation for a deal. Unknown providers default to `easy`. */
export function resolveCuration(provider: string, product: string): DealCuration {
  const p = (provider || '').trim()
  const name = (product || '').trim()
  for (const rule of rules) {
    if (rule.provider !== p) continue
    if (rule.productIncludes && !name.includes(rule.productIncludes)) continue
    const { provider: _p, productIncludes: _pi, ...rest } = rule
    return { difficulty: 'easy', ...rest }
  }
  return { difficulty: 'easy' }
}
