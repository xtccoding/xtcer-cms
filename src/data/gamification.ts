/**
 * 玩法配置：徽章 + 后续玩法模块注册表。
 *
 * 为什么单独一份数据文件而不是写死在页面里：
 * 玩法要能「加一个就是一个」，不用改 API、不用改表结构。新增徽章只在这里加一条；
 * 新增玩法（扭蛋机 / 排行榜 / 每日任务）在 PLAY_MODULES 里登记，
 * /account 页会自动渲染入口卡片，启用时把 status 改成 'live' 即可。
 *
 * ⚠️ 所有 id 都必须是 ^[a-z0-9_]+$，服务端会按此白名单校验，绝不信任前端传来的 id。
 */

export type BadgeKind = 'auto' | 'shop'

export interface BadgeDef {
  id: string
  name: string
  icon: string
  desc: string
  kind: BadgeKind
  /** kind === 'shop' 时必填：兑换所需积分 */
  cost?: number
  /** kind === 'auto' 时必填：达成规则（服务端按 rule 判定，见 accounts.evaluateBadges） */
  rule?: 'first_checkin' | 'streak_3' | 'streak_7' | 'favorites_5' | 'claims_3' | 'points_100'
}

export const BADGES: readonly BadgeDef[] = [
  {
    id: 'first_egg',
    name: '开蛋新手',
    icon: '🥚',
    desc: '完成第一次签到',
    kind: 'auto',
    rule: 'first_checkin',
  },
  {
    id: 'streak_3',
    name: '连签三日',
    icon: '🔥',
    desc: '连续签到 3 天',
    kind: 'auto',
    rule: 'streak_3',
  },
  {
    id: 'streak_7',
    name: '七日不断',
    icon: '⚡',
    desc: '连续签到 7 天',
    kind: 'auto',
    rule: 'streak_7',
  },
  {
    id: 'collector_5',
    name: '收藏家',
    icon: '⭐',
    desc: '收藏 5 个福利',
    kind: 'auto',
    rule: 'favorites_5',
  },
  {
    id: 'claims_3',
    name: '薅羊毛达人',
    icon: '🧺',
    desc: '标记领取 3 个福利',
    kind: 'auto',
    rule: 'claims_3',
  },
  {
    id: 'points_100',
    name: '百积分',
    icon: '💎',
    desc: '累计持有 100 积分',
    kind: 'auto',
    rule: 'points_100',
  },
  {
    id: 'neon_egg',
    name: '霓虹蛋',
    icon: '🌈',
    desc: '用积分兑换的限定徽章',
    kind: 'shop',
    cost: 40,
  },
  {
    id: 'cloud_nomad',
    name: '云游者',
    icon: '🛰️',
    desc: '用积分兑换的限定徽章',
    kind: 'shop',
    cost: 60,
  },
  {
    id: 'egg_legend',
    name: '领蛋传奇',
    icon: '🏆',
    desc: '积分商店里最贵的传说徽章',
    kind: 'shop',
    cost: 120,
  },
]

export const BADGE_MAP: Record<string, BadgeDef> = Object.fromEntries(
  BADGES.map((b) => [b.id, b]),
)

/** 玩法模块注册表：status = 'live' 已上线，'planned' 筹备中（页面只显示介绍，不渲染入口）。 */
export interface PlayModule {
  id: string
  name: string
  icon: string
  desc: string
  status: 'live' | 'planned'
  href?: string
}

export const PLAY_MODULES: readonly PlayModule[] = [
  {
    id: 'checkin',
    name: '每日开蛋',
    icon: '🥚',
    desc: '每天敲一颗蛋领积分，连签越多奖励越高',
    status: 'live',
    href: '/account#checkin',
  },
  {
    id: 'calendar',
    name: '打卡日历',
    icon: '🗓️',
    desc: '最近 14 天的签到足迹，一眼看到断了哪天',
    status: 'live',
    href: '/account#calendar',
  },
  {
    id: 'badge_shop',
    name: '徽章商店',
    icon: '🎖️',
    desc: '用签到积分兑换限定徽章，装点你的主页',
    status: 'live',
    href: '/account#badges',
  },
  {
    id: 'gacha',
    name: '扭蛋机',
    icon: '🎰',
    desc: '攒积分抽随机奖励（筹备中，先占个位）',
    status: 'planned',
  },
  {
    id: 'leaderboard',
    name: '签到排行榜',
    icon: '📊',
    desc: '看看谁的连签最长（筹备中，需要先有足够的活跃用户）',
    status: 'planned',
  },
  {
    id: 'quests',
    name: '每日任务',
    icon: '📜',
    desc: '收藏 / 领取 / 浏览任务换积分（筹备中）',
    status: 'planned',
  },
]

/** 签到积分：基础 5 分 + 连签加成，连签第 n 天最多 +7，即单日 5–12 分。 */
export function checkinPoints(streak: number): number {
  return 5 + Math.min(Math.max(streak - 1, 0), 7)
}

/** 首次「标记领取」奖励的积分。 */
export const CLAIM_POINTS = 2

/** 徽章 id 合法形态。 */
export const BADGE_ID_RE = /^[a-z0-9_]{2,32}$/

export function isBadgeId(input: unknown): input is string {
  return typeof input === 'string' && BADGE_ID_RE.test(input) && !!BADGE_MAP[input]
}

/** 把 badge id 列表转成前端可直接展示的摘要（未知 id 自动忽略）。 */
export function badgeInfo(ids: string[]): Array<Pick<BadgeDef, 'id' | 'name' | 'icon' | 'desc'>> {
  return ids
    .map((id) => BADGE_MAP[id])
    .filter((b): b is BadgeDef => !!b)
    .map((b) => ({ id: b.id, name: b.name, icon: b.icon, desc: b.desc }))
}
