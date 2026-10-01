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

/** 'hot' = 热门后缀（卡片正面展示）；'promo' = 促销价；'cheap' = 低价冷门后缀 */
export type TldTag = 'hot' | 'promo' | 'cheap'

export interface TldPrice {
  /** e.g. '.com' */
  tld: string
  /** e.g. '$9.08 首年' */
  price: string
  tag?: TldTag
  /** e.g. '续费 $9.98' */
  note?: string
}

export const TLD_TAG_META: Record<TldTag, { label: string; cls: string }> = {
  hot: { label: '热门', cls: 'hot' },
  promo: { label: '促销', cls: 'promo' },
  cheap: { label: '低价', cls: 'cheap' },
}

/** 首年极低的后缀（2026-10 核实，续费普遍会涨）。 */
export const CHEAP_TLDS_NOTE =
  '冷门后缀首年低至 $0.98：.online / .top / .xyz / .site / .space / .shop / .fun / .icu —— 首年便宜，续费通常回到 $10+'

/**
 * 支付方式。国内用户最关心的是「能不能用微信/支付宝」，所以单独建模，
 * 而不是塞进一句 notes —— 它同时驱动卡片徽标和排序。
 */
export type PaymentMethod =
  | 'wechat'
  | 'alipay'
  | 'unionpay'
  | 'card'
  | 'paypal'
  | 'crypto'

export const PAYMENT_META: Record<PaymentMethod, { label: string; icon: string }> = {
  wechat: { label: '微信', icon: '💚' },
  alipay: { label: '支付宝', icon: '🔵' },
  unionpay: { label: '银联', icon: '🏦' },
  card: { label: '信用卡', icon: '💳' },
  paypal: { label: 'PayPal', icon: '🅿️' },
  crypto: { label: '加密货币', icon: '🪙' },
}

/** 排序权重：国内支付优先（微信 → 支付宝 → 银联），海外靠后。 */
export const PAYMENT_RANK: Record<PaymentMethod, number> = {
  wechat: 0,
  alipay: 1,
  unionpay: 2,
  card: 3,
  paypal: 4,
  crypto: 5,
}

/** 没有支付信息时排在有信息之后（避免「未知」被误排到最前）。 */
export const UNKNOWN_PAYMENT_RANK = 90

/**
 * 「完全免费、连付款方式都不需要」—— 对国内用户来说这比「能微信付款」更友好，
 * 所以给它一个比微信（0）还靠前的排序键。用 `freeNoCard: true` 标记。
 */
export const NO_PAYMENT_RANK = -1

/** 取一家支持的最「国内友好」的支付方式作为排序键；无信息返回 90。 */
export function paymentRank(
  payments?: PaymentMethod[],
  freeNoCard?: boolean,
): number {
  if (freeNoCard) return NO_PAYMENT_RANK
  if (!payments || payments.length === 0) return UNKNOWN_PAYMENT_RANK
  return Math.min(...payments.map(p => PAYMENT_RANK[p]))
}

/** 微信 / 支付宝 / 银联 任一即视为「国内环境友好」。 */
export function isCnFriendly(payments?: PaymentMethod[]): boolean {
  return !!payments?.some(p => p === 'wechat' || p === 'alipay' || p === 'unionpay')
}

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
  /** per-TLD pricing (domain registrars); 'hot' ones also show on the card face */
  tlds?: TldPrice[]
  /** footnote under the TLD table (verification date, renewal traps, …) */
  tldNote?: string
  /** 支持的支付方式 —— 决定「国内友好」徽标与排序，只写已核实的 */
  payments?: PaymentMethod[]
  /**
   * 完全免费、不需要任何付款方式（无信用卡、无充值）。
   * 排序时比「微信」还靠前 —— 对国内用户来说不用付钱才是最友好的。
   */
  freeNoCard?: boolean
  /** 使用限制 / 雷点（最低充值、仅信用卡、仅 IPv6、限速、按月清零…） */
  limits?: string[]
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
    payments: ['wechat', 'alipay', 'unionpay'],
    warning: '仅首年赠送，到期按标准价续费。',
  },
  {
    provider: '腾讯云',
    productIncludes: '赠',
    difficulty: 'easy',
    supplement: true,
    payments: ['wechat', 'alipay', 'unionpay'],
    warning: '需选带「赠域名」标签的套餐，单独注册域名没有 0 元。',
  },
  {
    provider: '华为云',
    productIncludes: '赠',
    difficulty: 'easy',
    supplement: true,
    payments: ['wechat', 'alipay', 'unionpay'],
    warning: '仅首年赠送，次年起按标准价计费。',
  },
  {
    provider: 'Hostinger',
    productIncludes: '赠',
    difficulty: 'easy',
    supplement: true,
    payments: ['card', 'paypal'],
    warning: '仅新用户首次下单有效；注意主机续约价通常高于首年。',
  },
  {
    provider: 'Bluehost',
    productIncludes: '赠',
    difficulty: 'easy',
    supplement: true,
    payments: ['card', 'paypal'],
    warning: '域名次年按约 $14.95/年续费，主机续费也偏贵，注意长期成本。',
  },

  // ---------- domain registrars (real prices, not "成本价/低价") ----------
  {
    provider: '阿里云',
    productIncludes: '域名注册',
    difficulty: 'easy',
    payments: ['wechat', 'alipay', 'unionpay'],
    promoNote: '.cn 首年 ¥38 / .com 首年 ¥85；新用户有 ¥1 首年活动，优惠口令可再打折',
    tlds: [
      { tld: '.cn', price: '¥38 首年', tag: 'hot', note: '续费 ¥42，需实名' },
      { tld: '.com', price: '¥85 首年', tag: 'hot', note: '续费 ¥95' },
      { tld: '.xyz', price: '¥1 起 首年', tag: 'promo', note: '续费回到 ¥15-25' },
      { tld: '.top', price: '¥1-3 首年', tag: 'promo', note: '续费回到 ¥15-25' },
      { tld: '.xin', price: '¥18 首年', tag: 'cheap' },
    ],
    tldNote: '国内注册商，备案必须用它。首年 1 元级活动频繁，但续费是坑。',
    tips: ['.cn 需实名认证', '想备案必须在国内注册商买'],
  },
  {
    provider: '腾讯云',
    productIncludes: '域名注册',
    difficulty: 'easy',
    payments: ['wechat', 'alipay', 'unionpay'],
    promoNote: '.cn 首年 ¥35 / .com 首年 ¥83；续费 .cn ¥39，优惠口令可降',
    tlds: [
      { tld: '.cn', price: '¥35 首年', tag: 'hot', note: '续费 ¥39，需实名' },
      { tld: '.com', price: '¥83 首年', tag: 'hot', note: '续费 ¥90（口令可降）' },
      { tld: '.cc', price: '¥29 首年', tag: 'promo', note: '续费 ¥75' },
      { tld: '.top', price: '首年促销', tag: 'promo' },
      { tld: '.xyz', price: '首年促销', tag: 'promo' },
    ],
    tldNote: '国内注册商，备案必须用它。优惠口令常年在，结算页记得填。',
    tips: ['.cn 需实名认证', '优惠口令常年在，结算页记得填'],
  },
  {
    provider: '百度智能云',
    productIncludes: '域名注册',
    difficulty: 'easy',
    payments: ['wechat', 'alipay', 'unionpay'],
    tlds: [
      { tld: '.com', price: '¥33 首年（新客）', tag: 'promo', note: '新客专享' },
      { tld: '.top', price: '¥15 起', tag: 'cheap' },
      { tld: '.cn', price: '曾 ¥8 活动', tag: 'promo', note: '不定期，需盯活动页' },
    ],
    tldNote: '价格随活动大幅波动，属于「时不时捡漏」型，值得关注但不稳定。',
  },
  {
    provider: 'Cloudflare',
    productIncludes: '域名注册',
    difficulty: 'easy',
    payments: ['card', 'paypal'],
    tlds: [
      { tld: '.com', price: '$10.44/年', tag: 'hot', note: '注册=续费，无套路' },
      { tld: '.net', price: '$11.20/年', tag: 'hot' },
      { tld: '.org', price: '$10.11/年', tag: 'hot' },
      { tld: '.app', price: '$13.20/年', tag: 'cheap' },
    ],
    tldNote: '没有任何首年促销，全部按注册局成本价 —— 短期不便宜，长期最省。',
    tips: ['首年与续费同价，长期持有最省'],
  },
  {
    provider: 'Porkbun',
    productIncludes: '域名注册',
    difficulty: 'easy',
    payments: ['card', 'paypal'],
    tlds: [
      { tld: '.com', price: '$11.06/年', tag: 'hot', note: '一口价不涨' },
      { tld: '.io', price: '$32.44 首年', tag: 'hot', note: '全网最低' },
      { tld: '.ai', price: '$65.44 首年', tag: 'hot', note: 'AI 热门后缀' },
      { tld: '.co', price: '$12.13 首年', tag: 'hot' },
      { tld: '.xyz', price: '$1.16 首年', tag: 'promo', note: '续费约 $12' },
      { tld: '.online', price: '$0.99 首年', tag: 'promo', note: '续费会涨' },
      { tld: '.dev', price: '$12.34/年', tag: 'cheap' },
    ],
    tldNote: `${CHEAP_TLDS_NOTE}。.io / .ai 首年价常为全网最低。`,
    tips: ['一口价后缀续费不涨，长期持有最省'],
  },
  {
    provider: 'Spaceship',
    productIncludes: '域名注册',
    difficulty: 'easy',
    payments: ['card', 'paypal'],
    tlds: [
      { tld: '.com', price: '$9.08 首年', tag: 'promo', note: '续费 $9.98' },
      { tld: '.xyz', price: '$0.99/年', tag: 'cheap', note: '6-9 位纯数字，首年续费同价' },
      { tld: '.space', price: '≈$0.99 首年', tag: 'cheap' },
      { tld: '.site', price: '≈$0.99 首年', tag: 'cheap' },
      { tld: '.buzz', price: '≈$1 首年', tag: 'cheap', note: '冷门后缀' },
      { tld: '.online', price: '≈$0.99 首年', tag: 'cheap' },
    ],
    tldNote:
      '首年最狠的一家；纯数字 .xyz 首年+续费都约 $0.99，是全站唯一「续费不涨」的极低价后缀。',
    tips: ['想极致省钱：注册 6-9 位纯数字 .xyz'],
  },
  {
    provider: 'Namecheap',
    productIncludes: '域名注册',
    difficulty: 'easy',
    payments: ['card', 'paypal'],
    tlds: [
      { tld: '.com', price: '$5.98 首年', tag: 'promo', note: '续费 $13.98' },
      { tld: '.info', price: '$3.98 首年', tag: 'cheap', note: '续费跳 $21.98' },
      { tld: '.top', price: '$1.88 首年', tag: 'cheap' },
      { tld: '.xyz', price: '$1.98 首年', tag: 'cheap', note: '续费 $9.98' },
      { tld: '.online', price: '$0.99 首年', tag: 'cheap', note: '续费会涨' },
      { tld: '.org', price: '$9.18 首年', tag: 'hot' },
    ],
    tldNote: `${CHEAP_TLDS_NOTE}。Namecheap 首年最低，但续费跳涨最狠。`,
    tips: ['首年最低但续费跳涨，长期持有建议到期前转出'],
  },
  {
    provider: 'NameSilo',
    productIncludes: '域名注册',
    difficulty: 'easy',
    payments: ['card', 'paypal'],
    tlds: [
      { tld: '.com', price: '$11.05/年', tag: 'hot', note: '一口价不涨' },
      { tld: '.net', price: '$12.79/年', tag: 'hot' },
    ],
    tldNote: '无首年套路，注册=续费；批量持有可进折扣计划（5000+ 降至 $7.75）。',
  },
  {
    provider: 'Dynadot',
    productIncludes: '域名注册',
    difficulty: 'easy',
    payments: ['card', 'paypal'],
    tlds: [
      { tld: '.com', price: '$10.88/年', tag: 'hot', note: '单一定价' },
      { tld: '.io', price: '$35.99 首年', tag: 'hot' },
    ],
    tldNote: '500+ 后缀，单一定价；有中文站，适合批量管理。',
  },

  // ---------- hard: the famous free tiers everyone struggles with ----------
  {
    provider: 'Oracle Cloud',
    difficulty: 'hard',
    payments: ['card'],
    limits: [
      '仅信用卡验证，国内卡/虚拟卡常被拒',
      '免费 ARM（Ampere）实例长期缺货，需蹲点抢',
      '同一身份或卡重复申请会被永久拉黑',
    ],
    warning:
      '信用卡验证极严，常报通用的 ABC 错误；注册后 24h 内不要连开多个 Arm 实例，否则易被冻结。',
    tutorialUrl: TUTORIAL,
  },
  {
    provider: 'Oracle',
    difficulty: 'hard',
    payments: ['card'],
    warning: '与 Always Free 共用同一套账号体系，注册难度相同。',
    tutorialUrl: TUTORIAL,
  },
  {
    provider: 'Azure',
    difficulty: 'hard',
    payments: ['card'],
    limits: ['$200 额度 30 天到期，未降级会自动扣费', 'B1S 免费仅 12 个月'],
    warning:
      '$200 试用 30 天到期后若未降级会自动扣费；B1S 免费仅 12 个月。注册后先设预算告警。',
    tutorialUrl: TUTORIAL,
  },
  {
    provider: 'Google Cloud',
    difficulty: 'hard',
    payments: ['card'],
    limits: ['$300 额度 90 天，到期须手动停实例并删磁盘', 'e2-micro 仅限美区三地'],
    warning:
      '$300 额度 90 天，到期须手动停实例并删磁盘，否则按量计费；e2-micro 仅限美区三地。',
    tutorialUrl: TUTORIAL,
  },
  {
    provider: 'AWS',
    difficulty: 'hard',
    payments: ['card'],
    limits: ['新账户仅最高 $200 信用点 / 6 个月，不再是 12 个月免费', '务必设 Billing 告警'],
    warning:
      '2025-07 起新账户改发最高 $200 信用点 / 6 个月，不再是 12 个月免费。务必设 Billing 告警。',
    tutorialUrl: TUTORIAL,
  },

  // ---------- medium ----------
  {
    provider: 'Hetzner',
    difficulty: 'medium',
    payments: ['card', 'paypal'],
    limits: ['新账号常被要求身份验证，中国用户被拒率高'],
    warning: '新账号常被要求身份验证，中国用户被拒率较高；通过后性价比很高。',
  },
  {
    provider: 'DigitalOcean',
    difficulty: 'medium',
    payments: ['card', 'paypal'],
    limits: ['$200 额度 60 天，到期自动按量扣费'],
    warning: '$200 额度 60 天，到期后自动按量扣费。',
  },
  {
    provider: 'Vultr',
    difficulty: 'medium',
    payments: ['alipay', 'unionpay', 'card', 'paypal'],
    limits: ['赠送额度到期后自动按量计费', '需先充值余额才能开机'],
    warning: '需绑卡，赠送额度到期后按量计费。',
    tips: ['支持支付宝 / 银联，国内用户可直接充值'],
  },
  {
    provider: 'Anthropic',
    difficulty: 'medium',
    payments: ['card'],
    limits: ['仅海外信用卡', '国内访问受限'],
    warning: '需海外信用卡，国内访问受限。',
  },
  {
    provider: 'OpenAI',
    difficulty: 'medium',
    payments: ['card'],
    limits: ['仅海外信用卡', '国内访问受限'],
    warning: '需海外信用卡，国内访问受限。',
  },
  {
    provider: 'Google Gemini',
    difficulty: 'medium',
    payments: ['card'],
    limits: ['免费档需海外网络环境访问'],
    warning: '免费档需海外网络环境访问。',
  },
  {
    provider: '阿里云',
    difficulty: 'medium',
    payments: ['wechat', 'alipay', 'unionpay'],
    limits: ['需实名认证', '¥38/年 秒杀库存极少，基本靠抢'],
    warning: '需实名认证；¥38/年 为限时秒杀，库存极少。',
    promoNote: '活动页直降，无需优惠码',
  },
  {
    provider: '腾讯云',
    productIncludes: 'Linux',
    difficulty: 'medium',
    payments: ['wechat', 'alipay', 'unionpay'],
    limits: ['需实名认证', '秒杀限时，库存少'],
    warning: '需实名认证；秒杀限时，库存少。',
    promoNote: '活动页直降，无需优惠码',
  },
  {
    provider: '雨云',
    difficulty: 'medium',
    payments: ['wechat', 'alipay'],
    limits: ['中小商家，注意续费价与稳定性'],
    warning: '国内中小商家，注意续费价与稳定性。',
  },

  // ---------- easy, with promo / tips worth surfacing ----------
  {
    provider: 'RackNerd',
    difficulty: 'easy',
    payments: ['alipay', 'card', 'paypal', 'crypto'],
    promo: 'RN-2022',
    promoNote: '常规 VPS 75 折（特价套餐无需码）；独立服务器用 15OFFDEDI',
    tips: ['分到被墙 IP 可 72 小时内免费更换', '优选洛杉矶 / 圣何塞 / 西雅图机房'],
  },
  {
    provider: 'Contabo',
    difficulty: 'easy',
    payments: ['card', 'paypal'],
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
    payments: ['alipay', 'card', 'paypal', 'crypto'],
    tips: ['续费价会跳涨，长期使用要提前算成本'],
  },
  {
    provider: 'BuyVM',
    difficulty: 'easy',
    payments: ['alipay', 'paypal', 'crypto', 'card'],
    tips: ['支持支付宝；有廉价块存储，适合做备份'],
  },

  // ---------- NAT VPS：共享 IPv4 + 独立 IPv6，年付几美元 ----------
  // 同一家的 NAT 套餐支付方式/限制完全一致，用 provider 级规则覆盖全部机型。
  {
    provider: 'ByteVirt',
    difficulty: 'easy',
    payments: ['alipay', 'paypal'],
    limits: [
      'IPv4 默认被 GFW 阻断，必须用 IPv6 访问',
      '共享 IPv4，只分到约 20 个端口，没有 80/443',
      '超流量后限速至 1Mbps（不额外扣费）',
      '机房下单后不可更换；小商家，无 SLA',
    ],
    promo: 'BV2026',
    promoNote: '结算页可试 BV2026（年付 8 折）/ WELCOME25（首购 75 折），失效以官网为准',
    tips: ['LXC 更便宜但共享内核，需要自定义内核时选 KVM'],
  },

  // ---------- 容器托管（Serverless 容器，免费额度）----------
  {
    provider: 'Render',
    difficulty: 'easy',
    freeNoCard: true,
    limits: [
      '空闲 15 分钟强制休眠，冷启动 30-60 秒',
      '仅 0.1 vCPU / 512MB，最多 1 个并发服务',
      '磁盘为临时存储，重启 / 重新部署即丢',
    ],
    tips: ['适合 Docker Web 服务与 demo，不适合需要秒回的公开 API'],
  },
  {
    provider: 'Koyeb',
    difficulty: 'easy',
    freeNoCard: true,
    limits: [
      '无流量时自动休眠',
      '最多 1 个活跃服务，0.1 vCPU / 512MB',
      '本地磁盘仅 2GB 且为临时存储',
    ],
  },
  {
    provider: 'Zeabur',
    difficulty: 'medium',
    payments: ['wechat', 'alipay'],
    limits: ['每月 $5 免费额度，按月清零不累积', '高负载服务会很快耗尽额度'],
    tips: ['亚太路由优化，国内访问体验较好'],
  },

  // ---------- 内网穿透 / 隧道 ----------
  {
    provider: '花生壳',
    difficulty: 'easy',
    payments: ['wechat', 'alipay', 'unionpay'],
    limits: [
      '免费版仅 1Mbps 带宽、每月 1GB 流量',
      '免费版 2 条映射、5 并发',
      '升级套餐约 ¥1299/年起，性价比低',
    ],
  },
  {
    provider: 'cpolar',
    difficulty: 'easy',
    payments: ['wechat', 'alipay'],
    limits: ['免费版隧道数与带宽有限，域名随机且每次重启会变'],
  },
  {
    provider: 'Cloudflare',
    productIncludes: 'Tunnel',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['需自有域名并把 NS 托管到 Cloudflare'],
  },

  // ---------- 共享主机 / 虚拟主机 ----------
  {
    provider: 'Hostinger',
    difficulty: 'easy',
    payments: ['card', 'paypal'],
    limits: ['首年促销价需一次买满 48 个月', '续费价通常翻数倍'],
  },
  {
    provider: 'Namecheap',
    productIncludes: '虚拟主机',
    difficulty: 'easy',
    payments: ['card', 'paypal'],
    limits: ['首年 $1.98/月起，续费跳涨', '不支持国内备案'],
  },

  // ---------- AI 编程工具（国内友好，微信 / 支付宝可付）----------
  {
    provider: 'Qoder CN',
    difficulty: 'easy',
    payments: ['wechat', 'alipay', 'unionpay'],
    limits: [
      '社区版无 Credits，多文件 / 重构 / Quest 等高级功能不可用',
      '社区版每日调用次数有限，次日刷新',
      '需阿里云账号 + 实名认证',
    ],
    promoNote: '个人社区版永久免费；专业版 59 元/月（含 2000 Credits）',
    tips: ['VS Code / JetBrains 装插件即可用，模型可在面板里随时切换'],
  },
  {
    provider: '智谱 ZCode',
    difficulty: 'easy',
    payments: ['wechat', 'alipay'],
    limits: [
      '3 亿 GLM-5.3-Flash token 为周末限时活动，发放后周日 23:00 清零',
      '先到先得，不是长期权益；活动是否继续以官网为准',
    ],
  },
  {
    provider: 'WorkBuddy',
    difficulty: 'easy',
    payments: ['wechat', 'alipay', 'unionpay'],
    limits: ['免费体验额度有限，长期使用需订阅', '个人版 99 / 199 / 999 元/月三档'],
    promoNote: '新用户注册自动发放，无需绑卡',
  },
  {
    provider: 'Trae',
    difficulty: 'easy',
    payments: ['wechat', 'alipay'],
    limits: ['免费版每月调用额度有上限，超出需付费', '2026 年起已移除 Claude 模型'],
  },
  {
    provider: 'Cursor',
    difficulty: 'easy',
    payments: ['card'],
    limits: [
      '免费档高级模型请求每月仅 50 次，很快用完',
      '国内访问不稳定，需自备网络环境',
    ],
    promoNote: '学生认证可免费领 1 年 Pro',
  },
  {
    provider: 'GitHub Copilot',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['免费档每月 2,000 次补全 + 50 次对话', '部分高级模型不在免费档内'],
    promoNote: '学生 / 教师 / 热门开源维护者可免费申请 Pro',
  },
  {
    provider: '腾讯云 CodeBuddy',
    difficulty: 'easy',
    payments: ['wechat', 'alipay', 'unionpay'],
    limits: ['个人免费版有每月调用上限', '高级模型与团队功能需订阅'],
  },
  {
    provider: '文心快码 Comate',
    difficulty: 'easy',
    payments: ['wechat', 'alipay', 'unionpay'],
    limits: ['免费版有每月补全 / 对话次数上限', '需百度账号登录'],
  },

  // ---------- 免费 AI API / 模型额度 ----------
  {
    provider: '火山引擎 豆包',
    difficulty: 'easy',
    payments: ['wechat', 'alipay', 'unionpay'],
    limits: [
      '「安心体验」额度按模型分别计算，用完即止',
      '每日 200 万 Token 需参与协作奖励计划，且按天清零',
      '超额后自动转为按量计费，注意关掉后付费',
    ],
    tips: ['推理 / 视觉 / 语音模型各有独立免费额度，可分别领取'],
  },
  {
    provider: 'Cerebras',
    difficulty: 'medium',
    payments: ['card'],
    limits: [
      '免费层每天 100 万 Token，速率受限',
      '另有 $5 一次性试用额度，之后最低充值 $10',
      '国内需自备网络环境访问',
    ],
    tips: ['推理速度极快，适合做实时补全与流式对话'],
  },
  {
    provider: 'Mistral',
    difficulty: 'medium',
    payments: ['card'],
    limits: ['免费层额度较小且不透明，随时可能调整', '国内需自备网络环境'],
  },
  {
    provider: 'Hugging Face',
    difficulty: 'easy',
    freeNoCard: true,
    limits: [
      '免费额度极小（约 $0.10/月），只够试跑',
      '免费层请求日志策略宽松，别传敏感数据',
    ],
  },
  {
    provider: 'Google Colab',
    difficulty: 'easy',
    freeNoCard: true,
    limits: [
      '免费 GPU 无配额保证，随机分配且可能排队',
      '闲置会自动断开，运行时长有上限',
      '国内需自备网络环境',
    ],
  },

  // ---------- 免费 PaaS / 计算 ----------
  {
    provider: 'Deno Deploy',
    difficulty: 'easy',
    freeNoCard: true,
    limits: [
      '2026-09 起额度削减：CPU 15→10 小时/月、内存 350→150 GiB-小时、应用 20→10 个',
      '持久卷存储已取消，只能存 KV / 对象存储',
      '未绑定支付方式的组织额度会被进一步限制',
      '超配额应用直接暂停，不会计费',
    ],
  },
  {
    provider: 'Railway',
    difficulty: 'medium',
    payments: ['card'],
    limits: [
      '$5 试用额度 30 天有效，用完降级到 $1/月 的 Free 档',
      'Free 档在高峰期可能拒绝新部署',
      '必须绑定支付方式才能长期使用',
    ],
  },
  {
    provider: 'Modal',
    difficulty: 'medium',
    payments: ['card'],
    limits: ['$30 额度每月重置、不累积', '需绑定支付方式', '超出后按量计费'],
    tips: ['跑 GPU 推理与批处理最省事，冷启动很快'],
  },
  {
    provider: 'Freestyle',
    difficulty: 'medium',
    payments: ['card'],
    limits: [
      '额度按自然月重置：200 vCPU-小时 + 400 GiB 内存-小时',
      '无持久化 VM 与快照，关机即丢数据',
      '最多 10 个并发 / 保存的 VM',
    ],
  },
  {
    provider: 'Paperspace',
    difficulty: 'medium',
    payments: ['card'],
    limits: [
      '免费实例容量紧张时需要排队',
      '单次会话上限 6 小时，存储仅 5GB',
      '需绑定支付方式',
    ],
  },
  {
    provider: 'Lightning AI',
    difficulty: 'medium',
    payments: ['card'],
    limits: ['每月 15 credits，GPU 需额外消耗', 'Studio 每 4 小时自动重启', '需手机号验证'],
  },

  // ---------- 免费数据库 / 存储 ----------
  {
    provider: 'TiDB Cloud',
    difficulty: 'easy',
    freeNoCard: true,
    limits: [
      '免费档仅 1 个集群，5GB 行存储 + 每月 5000 万请求单元',
      '长期闲置可能被回收，重要数据记得导出',
    ],
    tips: ['从 MySQL 迁移基本只改连接串'],
  },
  {
    provider: 'Aiven',
    difficulty: 'medium',
    payments: ['card'],
    limits: ['免费实例闲置会自动关机，需手动唤醒', '无 SLA，规格很小', '需绑定支付方式'],
  },
  {
    provider: 'Qdrant Cloud',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['1GB RAM / 4GB 磁盘，只够原型', '闲置一周挂起、四周后删除'],
  },
  {
    provider: 'Pinecone',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['免费档仅限 AWS us-east-1', '索引数与存储受限，读写有每月额度'],
  },
  {
    provider: 'Redis Cloud',
    difficulty: 'medium',
    payments: ['card'],
    limits: ['免费档仅 30MB 内存', '无持久化保障，别当主库用', '需绑定支付方式'],
  },
  {
    provider: 'Tigris',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['免费 5GB 存储', '服务较新，长期可用性需自行评估'],
  },
  {
    provider: 'Cloudflare',
    productIncludes: 'D1',
    difficulty: 'easy',
    payments: ['card'],
    limits: [
      '2026-09-01 起为硬上限：读满 500 万行或写满 10 万行后，当天查询直接失败直到 UTC 零点',
      '共 5GB 存储，单库上限 10GB',
    ],
  },
  {
    provider: 'Cloudflare',
    productIncludes: 'R2',
    difficulty: 'easy',
    payments: ['card'],
    limits: ['需先绑定支付方式才启用', '免费 10GB-月，超出部分按量计费（出网仍免费）'],
  },
  {
    provider: 'Cloudflare',
    productIncludes: 'Workers',
    difficulty: 'easy',
    payments: ['card'],
    limits: [
      '硬上限：每天 10 万请求，超限直接拒绝而非计费',
      '每请求 10ms CPU 时间、128MB 内存',
    ],
  },

  // ---------- 免费可观测 / 邮件 / 分析 ----------
  {
    provider: 'Grafana Cloud',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['指标保留 14 天、日志 30 天', '超出免费额度需升级，注意别接高基数指标'],
  },
  {
    provider: 'Better Stack',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['检查间隔最短 3 分钟', '日志仅保留 3 天'],
  },
  {
    provider: 'Sentry',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['每月 5,000 错误 + 1 个用户', '超出后当月新事件被丢弃'],
  },
  {
    provider: 'Axiom',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['3 个数据集 / 25GB 存储 / 30 天保留', '查询计算量单独计量'],
  },
  {
    provider: 'PostHog',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['每月 100 万事件，超出后当月停止采集', '会话回放单独计量'],
  },
  {
    provider: 'UptimeRobot',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['免费档检查间隔最短 5 分钟', '仅 50 个监控，告警方式受限'],
  },
  {
    provider: 'Resend',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['每天 100 封 / 每月 3,000 封', '需自有域名并配置 SPF / DKIM 才能发信'],
  },
  {
    provider: 'Brevo',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['每天 300 封，超出当天停发', '需验证发信域名'],
  },
  {
    provider: 'Clerk',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['免费 50,000 MAU，超出按量计费', '生产环境需绑定支付方式'],
  },
  {
    provider: 'Hookdeck',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['每月 10,000 事件', '事件保留期有限'],
  },

  // ---------- 支付宝 / 微信友好的海外 VPS（国人商家为主）----------
  {
    provider: 'CloudCone',
    difficulty: 'easy',
    payments: ['alipay', 'wechat', 'paypal', 'card'],
    limits: [
      '需先给账户充值余额再下单，不是直接付款',
      '促销套餐售罄即止，补货不定时',
      '线路为普通 BGP，不是 CN2 GIA',
    ],
    promoNote: '支持支付宝 / 微信 / PayPal，无需海外信用卡',
  },
  {
    provider: '狗云',
    difficulty: 'easy',
    payments: ['alipay', 'wechat'],
    limits: ['弹性云按小时扣费，不用了要记得销毁', 'CN2 等优质线路需单独选购，价格更高'],
    tips: ['弹性云适合短期测试，长期用选经典云年付'],
  },
  {
    provider: '咸鱼云',
    difficulty: 'medium',
    payments: ['alipay', 'wechat'],
    limits: ['2021 年成立的新商家，规模小', 'CN2 GIA 资源有限，常售罄', '建议先月付试水'],
    tips: ['低价 CN2 GIA 里比较有代表性的一家，注意备份'],
  },
  {
    provider: '六六云',
    difficulty: 'medium',
    payments: ['alipay', 'wechat'],
    limits: ['主打双 ISP 原生 IP，价格偏高', '原生 IP 库存波动大', '小商家，注意续费与售后'],
  },
  {
    provider: 'LisaHost',
    difficulty: 'medium',
    payments: ['alipay', 'wechat'],
    limits: ['双 ISP 原生 IP 成本高，单价不便宜', '小商家，稳定性需自行评估'],
  },
  {
    provider: 'MoeCloud',
    difficulty: 'medium',
    payments: ['alipay', 'wechat'],
    limits: ['韩国机房资源有限，常缺货', '小商家，建议短期试水'],
  },
  {
    provider: 'UFOVPS',
    difficulty: 'easy',
    payments: ['alipay', 'wechat'],
    limits: ['线路档位多，不同档价格与质量差异大', '注意区分 BGP 与 CN2 套餐'],
    tips: ['2015 年起的老牌国人商家，售后相对稳定'],
  },
  {
    provider: 'CUBECLOUD',
    difficulty: 'easy',
    payments: ['alipay', 'wechat'],
    limits: ['CN2 GIA 带宽较小（常见 10-30Mbps）', '优质线路套餐价格会随行情波动'],
  },
  {
    provider: 'HostDare',
    difficulty: 'easy',
    payments: ['alipay', 'card', 'paypal'],
    limits: ['CN2 GIA 套餐带宽较小', '年付为主，退订政策需提前确认'],
  },
  {
    provider: '搬瓦工',
    difficulty: 'easy',
    payments: ['alipay', 'unionpay', 'card', 'paypal'],
    limits: [
      'CN2 GIA 价格偏高，且续费同价',
      '中国香港 / 日本机房比美国贵不少',
      '热门套餐常年缺货，需蹲补货',
    ],
    tips: ['后台一键迁移机房，换机房不用重装系统'],
  },

  // ---------- 免费静态托管 ----------
  {
    provider: 'Surge.sh',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['免费层不支持自定义 SSL，绑自定义域名只能走 HTTP', '只做静态托管，没有后端能力'],
  },
  {
    provider: 'GitHub Pages',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['通常要求公开仓库', '不支持 SSR 与边缘函数', '仓库 1GB 上限、每月 100GB 流量'],
  },
  {
    provider: 'GitLab Pages',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['免费档每月 400 CI 分钟，5 人以上组织已收紧', '必须用 CI 流水线产出构建物才能发布'],
  },
  {
    provider: 'Firebase Hosting',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['每天约 360MB 免费传输，超出需升级 Blaze 按量计费', '全栈能力仍需依赖 Cloud Functions / Cloud Run'],
  },
  {
    provider: 'Azure Static Web Apps',
    difficulty: 'medium',
    payments: ['card'],
    limits: ['每订阅仅 10 个应用', '超出 100GB 后站点会立即停用', '需 Azure 账号并绑定支付方式'],
  },
  {
    provider: 'deployment.io',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['免费档每月仅 10 次任务执行', '限 1 个用户'],
  },
  {
    provider: 'Cloud 66',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['免费仅 1 台部署服务器 + 1 个静态站', '仅限个人项目'],
  },
  {
    provider: 'Catalyst by Zoho',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['免费额度按项目与调用量计，超出需升级', '需注册 Zoho 账号'],
  },
  {
    provider: 'Solo',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['模板与自定义能力有限，只适合落地页', '生成内容不能导出为完整工程'],
  },
  {
    provider: 'Karbon Sites',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['免费档每月仅 5 次生成', '自带 Gemini API Key 才能解锁不限次'],
  },

  // ---------- 免费容器 / 函数 ----------
  {
    provider: 'Hugging Face Spaces',
    difficulty: 'easy',
    freeNoCard: true,
    limits: [
      '空闲 48 小时后休眠',
      '免费 Space 不支持绑定自定义域名',
      '共享 vCPU，不适合当生产 API',
    ],
  },
  {
    provider: 'AWS Lambda',
    difficulty: 'medium',
    payments: ['card'],
    limits: ['需绑定信用卡', '超出免费额度按量计费，缺少限流时容易被流量放大账单', '低频调用有冷启动'],
  },
  {
    provider: 'Azure Functions',
    difficulty: 'medium',
    payments: ['card'],
    limits: ['需绑定信用卡', '依赖配套存储账号，可能产生少量费用', 'Linux v3 运行时已到生命周期末期'],
  },
  {
    provider: '阿里云函数计算',
    difficulty: 'easy',
    payments: ['wechat', 'alipay', 'unionpay'],
    limits: ['国内版仅前 3 个月免费，之后自动转按量计费', '需实名认证'],
  },
  {
    provider: '腾讯云函数 SCF',
    difficulty: 'easy',
    payments: ['wechat', 'alipay', 'unionpay'],
    limits: ['仅前 3 个月免费试用', '试用后需购买最低订阅包（约 9.9 元/月）', '需实名认证'],
  },
  {
    provider: 'Netlify Functions',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['每月 12.5 万次请求 + 100 小时计算', '额度耗尽后站点会直接返回 502'],
  },
  {
    provider: 'StackBlitz',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['私有协作与组织仓库需付费', '单项目上传上限 1MB'],
  },
  {
    provider: 'CodeSandbox',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['免费档每月 40 小时 VM credits，用完即停', '限 5 名成员'],
  },
  {
    provider: 'GitHub Codespaces',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['个人账号每月 120 core-hours + 15GB-month，用尽会阻断', '组织账号额度不与个人共享'],
  },

  // ---------- 免费数据库 / 存储 / CDN ----------
  {
    provider: 'Google Firestore',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['每天 5 万读 / 2 万写，超出后当日请求被拒', '仅 1GB 存储'],
  },
  {
    provider: 'BigQuery',
    difficulty: 'medium',
    payments: ['card'],
    limits: ['需绑定结算账号', '每月 1TB 查询免费，超出按扫描数据量计费', '沙盒模式有额外限制'],
  },
  {
    provider: 'AWS DynamoDB',
    difficulty: 'medium',
    payments: ['card'],
    limits: ['需绑定信用卡', '25GB 仅限标准表存储，超出按量计费'],
  },
  {
    provider: 'Azure Cosmos DB',
    difficulty: 'medium',
    payments: ['card'],
    limits: ['需绑定信用卡', '1000 RU/s 仅够轻量负载，超出按量计费'],
  },
  {
    provider: 'Oracle Database',
    difficulty: 'hard',
    payments: ['card'],
    limits: ['与 Oracle 云账号同一套体系，注册风控极严', '2 个自治数据库各 20GB，闲置可能被回收'],
    tutorialUrl: TUTORIAL,
  },
  {
    provider: 'IBM Cloudant',
    difficulty: 'medium',
    payments: ['card'],
    limits: ['需绑定信用卡', '仅 1GB 存储，超出按量计费'],
  },
  {
    provider: 'IBM Db2',
    difficulty: 'medium',
    payments: ['card'],
    limits: ['需绑定信用卡', '仅 100MB 存储，只够学习验证'],
  },
  {
    provider: 'Momento Cache',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['单条 TTL 硬上限 24 小时，不能当持久存储', '最大 100 RPS'],
  },
  {
    provider: 'Neo4j Aura',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['免费实例闲置会暂停，需手动唤醒', '单实例，不适合生产'],
  },
  {
    provider: 'Weaviate Cloud',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['免费沙盒有资源上限', '长期闲置会被回收'],
  },
  {
    provider: 'Zilliz Cloud',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['免费 Serverless 集群有容量与索引上限', '超出需升级付费档'],
  },
  {
    provider: 'Meilisearch Cloud',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['免费实例规格很小', '中文分词需自行配置，默认对中文不友好'],
  },
  {
    provider: 'ClickHouse Cloud',
    difficulty: 'medium',
    payments: ['card'],
    limits: ['试用额度有有效期，到期必须绑卡否则实例停用'],
  },
  {
    provider: 'Timescale Cloud',
    difficulty: 'medium',
    payments: ['card'],
    limits: ['试用额度有有效期，到期后自动按量计费'],
  },
  {
    provider: 'Xata',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['免费档有存储与请求上限', '超出需升级付费档'],
  },
  {
    provider: 'Nhost',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['免费项目闲置会暂停，需手动唤醒', '有存储与请求上限'],
  },
  {
    provider: 'Appwrite',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['Cloud 免费档有项目数与请求上限', '只有自托管才真正不限量'],
  },
  {
    provider: 'Turso',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['硬上限：5GB 存储 / 每月 5 亿行读 / 1000 万行写，超出直接拒绝', '边缘副本有同步流量限制'],
  },
  {
    provider: 'Google Cloud Storage',
    difficulty: 'medium',
    payments: ['card'],
    limits: ['需绑定结算账号', '超出 5GB 存储或 1GB 出网后按量计费'],
  },
  {
    provider: 'Cloudflare Workers KV',
    difficulty: 'medium',
    payments: ['card'],
    limits: [
      '最终一致性，写入全球传播最长约 60 秒 —— 不能用于锁 / 计数 / 权限',
      '每天写入仅 1000 次',
      '需绑定支付方式才启用',
    ],
  },
  {
    provider: 'Cloudflare Queues',
    difficulty: 'medium',
    payments: ['card'],
    limits: ['每月 100 万次操作，超出按量计费', '需绑定支付方式才启用'],
  },
  {
    provider: 'Storj',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['免费 25GB 存储 + 25GB 出网/月', '超出按约 $4/TB 计费'],
  },
  {
    provider: 'Filebase',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['免费 5GB 存储 + 每月 100GB 出网', '超出按量计费'],
  },
  {
    provider: 'Cloudinary',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['每月 25 credits，用尽后媒体处理直接停止', '免费层输出带品牌标识'],
  },
  {
    provider: 'ImageKit',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['每月 20GB 带宽 + 3GB 存储', '超出后按量计费'],
  },
  {
    provider: 'Gcore',
    difficulty: 'medium',
    payments: ['card'],
    limits: ['每月 1TB 流量触顶后立刻失去分发能力或产生计费', '需注册账号并绑卡'],
  },

  // ---------- 监控 / 分析 ----------
  {
    provider: 'Mixpanel',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['每月 100 万事件 + 5 个保存报表', '免费档报表数与回放次数偏少'],
  },
  {
    provider: 'Amplitude',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['Starter 限 1 万 MTU + 200 万事件', '超出后按 MTU 计费'],
  },
  {
    provider: 'Umami',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['Hobby 仅 3 个网站 / 每月 10 万事件 / 6 个月数据保留'],
  },
  {
    provider: 'Cloudflare Web Analytics',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['只做流量统计，没有漏斗与产品分析能力', '需把站点接入 Cloudflare'],
  },
  {
    provider: 'Google Analytics',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['大数据量会触发数据采样', '隐私与 Cookie 同意需自行配置合规'],
  },
  {
    provider: 'New Relic',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['每月 100GB 数据摄入', '免费档仅 1 个全功能用户'],
  },
  {
    provider: 'Checkly',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['免费档检查频率与运行次数有限', '浏览器检查消耗更多额度'],
  },
  {
    provider: 'Otterwatch',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['仅 5 个域名', '只做证书与域名到期监控，不含可用性探测'],
  },

  // ---------- 邮件 / 认证 / 消息 ----------
  {
    provider: 'Zoho Mail',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['免费版不含 IMAP / POP，桌面客户端通常要升级', '单域名 5 用户、每人 5GB'],
  },
  {
    provider: '阿里企业邮箱',
    difficulty: 'easy',
    payments: ['wechat', 'alipay', 'unionpay'],
    limits: [
      '2026-03-04 后新申请的免费版不支持开启三方客户端登录',
      '需阿里云实名认证，且申请后 7 天内完成域名解析',
      '外发限 2000 收件人/天/企业',
    ],
  },
  {
    provider: '腾讯企业邮箱',
    difficulty: 'easy',
    payments: ['wechat', 'alipay', 'unionpay'],
    limits: ['基础版 VIP 账号数为 0，高级功能需购买账号', '每个腾讯云账号最多 5 个基础版实例'],
  },
  {
    provider: 'Cloudflare Email Routing',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['只能收信转发，不提供托管邮箱', '需把域名 NS 托管到 Cloudflare'],
  },
  {
    provider: 'ImprovMX',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['免费版只能收信转发，发信（SMTP）需付费'],
  },
  {
    provider: 'Forward Email',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['免费版 DNS 记录公开可见', '私密 SMTP 转发需付费'],
  },
  {
    provider: 'Mailgun',
    difficulty: 'medium',
    payments: ['card'],
    limits: ['每月 1,000 封', '注册需信用卡验证，风控较严，容易因自动审查被封禁'],
  },
  {
    provider: 'AWS SES',
    difficulty: 'medium',
    payments: ['card'],
    limits: ['仅前 6 个月每月 3,000 条，之后按量计费', '新账号默认在沙盒中，需申请解除才能发给任意收件人'],
  },
  {
    provider: '腾讯云短信',
    difficulty: 'easy',
    payments: ['wechat', 'alipay', 'unionpay'],
    limits: ['免费包仅 100-200 条', '正式使用需备案 + 签名与模板审核'],
  },
  {
    provider: 'Twilio',
    difficulty: 'medium',
    payments: ['card'],
    limits: ['试用短信会附带醒目标识，只能本地调试', '需绑卡才能正式发送'],
  },
  {
    provider: 'Logto Cloud',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['免费云版不支持绑定自定义域名（需付费附加包）', '50,000 MAU 上限'],
  },
  {
    provider: 'Kinde',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['免费档 7,500 MAU，是主流方案里余量最小的', '超限后价格跃迁明显'],
  },
  {
    provider: 'Firebase Auth',
    difficulty: 'easy',
    freeNoCard: true,
    limits: [
      'Spark 档每天 3,000 活跃用户',
      'SAML / OIDC 仅 2 DAU',
      '宣传的 5 万 MAU 需升级 Blaze 付费档',
    ],
  },
  {
    provider: 'Firebase Cloud Messaging',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['推送本身免费，但触发逻辑需自建后端或 Cloud Functions'],
  },
  {
    provider: 'Svix',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['每月 50,000 条消息', '超出需升级付费档'],
  },
  {
    provider: 'Inngest',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['每月 5 万次执行 + 5 个并发步骤 + 50 万事件'],
  },
  {
    provider: 'Trigger.dev',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['每月 $5 计算额度，用完即停', '20 个并发运行、5 名团队成员上限'],
  },

  // ---------- 免费 AI API ----------
  {
    provider: 'Google AI Studio',
    difficulty: 'medium',
    limits: [
      '免费层有速率与每日请求上限',
      '免费层内容可能被用于改进 Google 产品，别传敏感数据',
      '国内需自备网络环境',
    ],
  },
  {
    provider: 'Kaggle',
    difficulty: 'medium',
    limits: [
      'GPU 时长需手机验证，每周 30 GPU 小时',
      'TPU 需身份验证',
      '免费 GPU 不保证可用性，高峰需排队',
    ],
  },
  {
    provider: 'Weights & Biases',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['100GB 存储', '仅个人项目免费，团队与商用需付费'],
  },
  {
    provider: 'Comet ML',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['个人与学术用途免费', '商用与团队协作需付费'],
  },
  {
    provider: 'Deepnote',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['免费档 5GB 内存 / 2 vCPU', '团队最多 3 位编辑'],
  },
  {
    provider: 'Tavily',
    difficulty: 'medium',
    limits: ['每月 1,000 次请求', '国内需自备网络环境'],
  },
  {
    provider: 'Firecrawl',
    difficulty: 'medium',
    limits: ['每月 1,000 credits', '复杂站点与深层抓取会消耗更多 credit', '国内需自备网络环境'],
  },
  {
    provider: 'Cohere',
    difficulty: 'medium',
    limits: ['Trial Key 每月 1,000 次调用、限速 20 次/分', '仅限评估用途，商用需付费 Key'],
  },
  {
    provider: 'Together AI',
    difficulty: 'medium',
    payments: ['card'],
    limits: ['赠送额度用完即止，之后需充值', '需绑定支付方式', '国内需自备网络环境'],
  },
  {
    provider: 'DeepInfra',
    difficulty: 'medium',
    payments: ['card'],
    limits: ['赠送额度用完即止', '之后按 token 计费', '国内需自备网络环境'],
  },
  {
    provider: 'Replicate',
    difficulty: 'medium',
    payments: ['card'],
    limits: ['赠送额度很少', '跑图像 / 视频模型消耗极快，几小时就能烧完'],
  },
  {
    provider: 'NVIDIA NIM',
    difficulty: 'medium',
    limits: ['注册赠送 1,000 credits，用完即止', '国内需自备网络环境'],
  },
  {
    provider: 'GitHub Models',
    difficulty: 'medium',
    limits: ['额度按 GitHub 账号等级分配', '有速率限制，适合实验不适合生产'],
  },
  {
    provider: 'Perplexity',
    difficulty: 'medium',
    payments: ['card'],
    limits: ['需订阅 Pro 才每月赠 $5 API 额度', '额度不累积、按月清零'],
  },

  // ---------- AI 编程工具 ----------
  {
    provider: 'v0.dev',
    difficulty: 'medium',
    payments: ['card'],
    limits: ['免费额度用完即止', '只生成前端界面代码，后端仍需自己接'],
  },
  {
    provider: 'Supermaven',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['免费档只含行内补全，不含对话与 Agent 功能'],
  },

  // ---------- 支付宝友好的 VPS（续）----------
  {
    provider: 'HostKVM',
    difficulty: 'easy',
    payments: ['alipay', 'card', 'paypal'],
    limits: ['折扣为夏季活动价，随时恢复原价', '微信支付未核实，下单前以官网结算页为准'],
    tips: ['移动 CMI 直连延迟可低到 35ms，移动宽带用户优先考虑'],
  },
  {
    provider: '椰草云',
    difficulty: 'easy',
    payments: ['alipay', 'paypal'],
    limits: ['首年 5 折为活动价，续费回原价', '微信支付未核实'],
  },
  {
    provider: 'DMIT',
    difficulty: 'medium',
    payments: ['alipay', 'card', 'paypal'],
    limits: ['高端三网优化线路单价偏高', '热门套餐常年缺货，需蹲补货'],
  },
  {
    provider: 'GreenCloud',
    difficulty: 'medium',
    payments: ['alipay', 'card', 'paypal'],
    limits: ['特价套餐常售罄', '小商家，建议先短期试水再考虑年付'],
  },
  {
    provider: 'GigsGigsCloud',
    difficulty: 'medium',
    payments: ['alipay', 'card', 'paypal'],
    limits: ['不同机房的价格与线路质量差异很大', '促销多为限时，过期回原价'],
  },
  {
    provider: 'V.PS',
    difficulty: 'medium',
    payments: ['alipay', 'card', 'paypal'],
    limits: ['三网优化线路成本高，单价偏贵', '小商家，稳定性需自行评估'],
  },
  {
    provider: 'Megalayer',
    difficulty: 'easy',
    payments: ['wechat', 'alipay', 'unionpay'],
    limits: ['免备案线路资源有限，常缺货', '注意续费价与首年促销价的差距'],
  },
  {
    provider: 'Liteserver',
    difficulty: 'medium',
    payments: ['card', 'paypal'],
    limits: ['HDD 存储型 IO 低，不适合跑数据库', '仅荷兰机房，国内访问延迟高'],
  },
  {
    provider: 'UpCloud',
    difficulty: 'medium',
    payments: ['card', 'paypal'],
    limits: ['需绑定信用卡', '机房以欧洲为主，国内访问一般'],
  },
  {
    provider: 'Akamai Linode',
    difficulty: 'medium',
    payments: ['card', 'paypal'],
    limits: ['需绑定信用卡', '国内访问需自行优化线路', '新客试用金有有效期'],
  },
  {
    provider: 'OVHcloud',
    difficulty: 'medium',
    payments: ['card', 'paypal'],
    limits: ['需绑定信用卡，部分地区注册风控较严', '机房以欧洲为主'],
  },
  {
    provider: 'VirMach',
    difficulty: 'medium',
    payments: ['card', 'paypal'],
    limits: ['历史上稳定性与售后口碑一般', '只建议放可随时重建的数据', '超售较严重'],
  },
  {
    provider: 'Bunny.net',
    difficulty: 'medium',
    payments: ['card', 'paypal'],
    limits: ['按量付费、没有免费额度，需先充值', '用多少扣多少，忘关流量会持续计费'],
  },
  {
    provider: '又拍云',
    difficulty: 'easy',
    payments: ['wechat', 'alipay', 'unionpay'],
    limits: ['赠送额度有有效期，过期清零', '需实名认证'],
  },
  {
    provider: '多吉云',
    difficulty: 'easy',
    payments: ['wechat', 'alipay', 'unionpay'],
    limits: ['免费额度按月赠送，超出需充值', '需实名认证'],
  },
  {
    provider: 'BootCDN',
    difficulty: 'easy',
    freeNoCard: true,
    limits: ['只镜像开源公共库，不能托管私有文件', '偶发国内 DNS 污染或证书过期'],
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
