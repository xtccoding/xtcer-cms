/**
 * 用户体系的数据库访问层（唯一写用户相关 SQL 的地方）。
 *
 * 统一用 D1 预处理语句（bind），不做任何字符串拼接 —— 所有用户输入只会作为
 * 参数绑定，结构上杜绝 SQL 注入。
 *
 * 关键并发安全：
 * - 签到靠主键 (user_id, day) + INSERT OR IGNORE，重复/并发请求只会成功一次。
 * - 收藏 / 领取同理。
 * - 扣积分用 `UPDATE ... WHERE points >= ?` 条件更新，靠 changes 判定是否扣成功，
 *   不会出现「余额扣成负数」。
 */
import { getRuntimeEnv } from './runtime-env'
import {
  BADGES,
  CLAIM_POINTS,
  checkinPoints,
  BADGE_MAP,
  isBadgeId,
  type BadgeDef,
} from '../data/gamification'
import { USER_COOKIE, randomHex, sha256Hex, SESSION_MAX_AGE } from './auth'
import { nowIso } from './db'
import { previousDay, siteDay } from './http'

function d1(env?: any): any {
  const binding = (env ?? getRuntimeEnv())?.DB
  if (!binding) throw new Error('D1 绑定 DB 未配置')
  return binding
}

/** 对外可见的用户信息：绝不包含 password_hash / password_salt。 */
export interface PublicUser {
  id: string
  username: string
  points: number
  streak: number
  last_checkin: string | null
  created_at: string
}

interface UserRow extends PublicUser {
  password_hash: string
  password_salt: string
}

export function toPublicUser(row: UserRow | any): PublicUser {
  return {
    id: row.id,
    username: row.username,
    points: Number(row.points ?? 0),
    streak: Number(row.streak ?? 0),
    last_checkin: row.last_checkin ?? null,
    created_at: row.created_at,
  }
}

// ---------------------------------------------------------------- 用户

export async function getUserByUsername(username: string, env?: any): Promise<UserRow | null> {
  const row = await d1(env)
    .prepare('SELECT * FROM users WHERE username_lower = ?')
    .bind(username.trim().toLowerCase())
    .first()
  return (row as UserRow) ?? null
}

export async function getUserById(id: string, env?: any): Promise<PublicUser | null> {
  const row = await d1(env).prepare('SELECT * FROM users WHERE id = ?').bind(id).first()
  return row ? toPublicUser(row) : null
}

/**
 * 创建用户。用户名冲突时返回 null（靠 username_lower 唯一索引兜底，
 * 不做「先查再插」——那样在并发下依然会撞车）。
 */
export async function createUser(
  input: { username: string; passwordHash: string; passwordSalt: string },
  env?: any,
): Promise<PublicUser | null> {
  const id = crypto.randomUUID()
  const createdAt = nowIso()
  try {
    await d1(env)
      .prepare(
        `INSERT INTO users (id, username, username_lower, password_hash, password_salt, points, streak, last_checkin, created_at)
         VALUES (?, ?, ?, ?, ?, 0, 0, NULL, ?)`,
      )
      .bind(
        id,
        input.username,
        input.username.toLowerCase(),
        input.passwordHash,
        input.passwordSalt,
        createdAt,
      )
      .run()
  } catch (err: any) {
    const message = String(err?.message || '')
    if (/UNIQUE|constraint/i.test(message)) return null
    throw err
  }
  return { id, username: input.username, points: 0, streak: 0, last_checkin: null, created_at: createdAt }
}

// ---------------------------------------------------------------- 会话

/** 建会话：返回明文 token（只交给 Cookie），库里只留 SHA-256。 */
export async function createSession(userId: string, env?: any): Promise<string> {
  const token = randomHex(32)
  const tokenHash = await sha256Hex(token)
  const createdAt = nowIso()
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString()
  await d1(env)
    .prepare(
      'INSERT INTO user_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    )
    .bind(tokenHash, userId, createdAt, expiresAt)
    .run()
  return token
}

export async function deleteSession(token: string, env?: any): Promise<void> {
  if (!token) return
  const tokenHash = await sha256Hex(token)
  await d1(env).prepare('DELETE FROM user_sessions WHERE token_hash = ?').bind(tokenHash).run()
}

/** 按 token 取用户；过期 / 不存在返回 null。 */
export async function getSessionUser(token: string, env?: any): Promise<PublicUser | null> {
  if (!token || token.length > 128) return null
  const tokenHash = await sha256Hex(token)
  const row = await d1(env)
    .prepare(
      `SELECT u.* FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .bind(tokenHash, nowIso())
    .first()
  return row ? toPublicUser(row) : null
}

/** 从 Astro 的 cookies 里解析当前用户。 */
export async function resolveCurrentUser(
  cookies: { get(name: string): { value?: string } | undefined },
  env?: any,
): Promise<PublicUser | null> {
  const token = cookies?.get?.(USER_COOKIE)?.value
  if (!token) return null
  try {
    return await getSessionUser(token, env)
  } catch {
    return null
  }
}

/** 登录成功后清掉旧 token（防止会话固定攻击），再发新 token。 */
export async function rotateSession(
  cookies: {
    get(name: string): { value?: string } | undefined
    set(name: string, value: string, opts: any): void
    delete(name: string, opts?: any): void
  },
  userId: string,
  env?: any,
): Promise<void> {
  const existing = cookies.get(USER_COOKIE)?.value
  if (existing) {
    try {
      await deleteSession(existing, env)
    } catch {
      // 旧 token 清理失败不影响新会话签发
    }
  }
  const token = await createSession(userId, env)
  cookies.set(USER_COOKIE, token, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
  })
}

export async function clearUserCookie(cookies: {
  get(name: string): { value?: string } | undefined
  delete(name: string, opts?: any): void
}): Promise<void> {
  const token = cookies.get(USER_COOKIE)?.value
  if (token) {
    try {
      await deleteSession(token)
    } catch {
      // 忽略：Cookie 仍会被清掉
    }
  }
  cookies.delete(USER_COOKIE, { path: '/' })
}

// ---------------------------------------------------------------- 签到

export async function listCheckinDays(userId: string, limit = 30, env?: any): Promise<string[]> {
  const res = await d1(env)
    .prepare('SELECT day FROM user_checkins WHERE user_id = ? ORDER BY day DESC LIMIT ?')
    .bind(userId, limit)
    .all()
  return (res?.results || []).map((r: any) => String(r.day))
}

export async function countCheckins(userId: string, env?: any): Promise<number> {
  const row = await d1(env)
    .prepare('SELECT COUNT(*) AS n FROM user_checkins WHERE user_id = ?')
    .bind(userId)
    .first()
  return Number(row?.n ?? 0)
}

/**
 * 执行签到：插入记录 + 更新用户积分 / 连签。
 * 返回 { already: true } 表示今天已签过（幂等，不重复加分）。
 */
export async function performCheckin(
  userId: string,
  env?: any,
): Promise<
  | { already: true }
  | { already: false; awarded: number; streak: number; points: number; newBadges: string[] }
> {
  const day = siteDay()
  const user = await getUserById(userId, env)
  if (!user) throw new Error('user not found')

  const streak = user.last_checkin === previousDay(day) ? Number(user.streak) + 1 : 1
  const awarded = checkinPoints(streak)

  const res = await d1(env)
    .prepare(
      'INSERT OR IGNORE INTO user_checkins (user_id, day, points, streak, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(userId, day, awarded, streak, nowIso())
    .run()

  // changes === 0 → 今天已经签过（含并发双击的情况）
  if (Number(res?.meta?.changes ?? 0) === 0) return { already: true }

  await d1(env)
    .prepare(
      'UPDATE users SET points = points + ?, streak = ?, last_checkin = ? WHERE id = ?',
    )
    .bind(awarded, streak, day, userId)
    .run()

  const newBadges = await grantAutoBadges(userId, env)
  const fresh = await getUserById(userId, env)
  return { already: false, awarded, streak, points: Number(fresh?.points ?? 0), newBadges }
}

// ---------------------------------------------------------------- 收藏 / 领取

export async function listFavoriteIds(userId: string, env?: any): Promise<string[]> {
  const res = await d1(env)
    .prepare('SELECT deal_id FROM user_favorites WHERE user_id = ? ORDER BY created_at DESC LIMIT 200')
    .bind(userId)
    .all()
  return (res?.results || []).map((r: any) => String(r.deal_id))
}

export async function countFavorites(userId: string, env?: any): Promise<number> {
  const row = await d1(env)
    .prepare('SELECT COUNT(*) AS n FROM user_favorites WHERE user_id = ?')
    .bind(userId)
    .first()
  return Number(row?.n ?? 0)
}

export async function setFavorite(
  userId: string,
  dealId: string,
  favorited: boolean,
  env?: any,
): Promise<void> {
  if (favorited) {
    await d1(env)
      .prepare('INSERT OR IGNORE INTO user_favorites (user_id, deal_id, created_at) VALUES (?, ?, ?)')
      .bind(userId, dealId, nowIso())
      .run()
  } else {
    await d1(env)
      .prepare('DELETE FROM user_favorites WHERE user_id = ? AND deal_id = ?')
      .bind(userId, dealId)
      .run()
  }
}

export async function listClaimIds(userId: string, env?: any): Promise<string[]> {
  const res = await d1(env)
    .prepare('SELECT deal_id FROM user_claims WHERE user_id = ? ORDER BY created_at DESC LIMIT 200')
    .bind(userId)
    .all()
  return (res?.results || []).map((r: any) => String(r.deal_id))
}

export async function countClaims(userId: string, env?: any): Promise<number> {
  const row = await d1(env)
    .prepare('SELECT COUNT(*) AS n FROM user_claims WHERE user_id = ?')
    .bind(userId)
    .first()
  return Number(row?.n ?? 0)
}

/** 标记领取。首次标记奖励积分；重复标记幂等且不重复加分。 */
export async function markClaim(
  userId: string,
  dealId: string,
  env?: any,
): Promise<{ claimed: boolean; awarded: number; points: number; newBadges: string[] }> {
  const res = await d1(env)
    .prepare('INSERT OR IGNORE INTO user_claims (user_id, deal_id, created_at) VALUES (?, ?, ?)')
    .bind(userId, dealId, nowIso())
    .run()

  const inserted = Number(res?.meta?.changes ?? 0) > 0
  if (!inserted) {
    const user = await getUserById(userId, env)
    return { claimed: false, awarded: 0, points: Number(user?.points ?? 0), newBadges: [] }
  }

  await d1(env).prepare('UPDATE users SET points = points + ? WHERE id = ?').bind(CLAIM_POINTS, userId).run()
  const newBadges = await grantAutoBadges(userId, env)
  const user = await getUserById(userId, env)
  return { claimed: true, awarded: CLAIM_POINTS, points: Number(user?.points ?? 0), newBadges }
}

// ---------------------------------------------------------------- 徽章

export async function listBadgeIds(userId: string, env?: any): Promise<string[]> {
  const res = await d1(env)
    .prepare('SELECT badge_id FROM user_badges WHERE user_id = ? ORDER BY created_at ASC')
    .bind(userId)
    .all()
  return (res?.results || []).map((r: any) => String(r.badge_id)).filter((id) => !!BADGE_MAP[id])
}

async function addBadge(userId: string, badgeId: string, source: 'auto' | 'shop', env?: any): Promise<boolean> {
  const res = await d1(env)
    .prepare('INSERT OR IGNORE INTO user_badges (user_id, badge_id, source, created_at) VALUES (?, ?, ?, ?)')
    .bind(userId, badgeId, source, nowIso())
    .run()
  return Number(res?.meta?.changes ?? 0) > 0
}

/**
 * 按当前数据判定「自动徽章」，补发尚未获得的。返回本次新获得的 badge id 列表。
 * 幂等：已达到的徽章不会重复插入。
 */
export async function grantAutoBadges(userId: string, env?: any): Promise<string[]> {
  const user = await getUserById(userId, env)
  if (!user) return []

  const [checkinCount, favoriteCount, claimCount, owned] = await Promise.all([
    countCheckins(userId, env),
    countFavorites(userId, env),
    countClaims(userId, env),
    listBadgeIds(userId, env),
  ])
  const ownedSet = new Set(owned)

  const earned: string[] = []
  for (const badge of BADGES) {
    if (badge.kind !== 'auto' || !badge.rule || ownedSet.has(badge.id)) continue
    const hit =
      (badge.rule === 'first_checkin' && checkinCount >= 1) ||
      (badge.rule === 'streak_3' && Number(user.streak) >= 3) ||
      (badge.rule === 'streak_7' && Number(user.streak) >= 7) ||
      (badge.rule === 'favorites_5' && favoriteCount >= 5) ||
      (badge.rule === 'claims_3' && claimCount >= 3) ||
      (badge.rule === 'points_100' && Number(user.points) >= 100)
    if (hit && (await addBadge(userId, badge.id, 'auto', env))) earned.push(badge.id)
  }
  return earned
}

/** 积分兑换徽章。返回错误码而不是抛异常，便于 API 直接映射状态码。 */
export async function redeemBadge(
  userId: string,
  badgeId: string,
  env?: any,
): Promise<
  | { ok: true; points: number; badge: BadgeDef }
  | { ok: false; reason: 'invalid' | 'owned' | 'insufficient' }
> {
  if (!isBadgeId(badgeId)) return { ok: false, reason: 'invalid' }
  const badge = BADGE_MAP[badgeId]
  if (badge.kind !== 'shop' || !badge.cost) return { ok: false, reason: 'invalid' }

  const owned = await listBadgeIds(userId, env)
  if (owned.includes(badgeId)) return { ok: false, reason: 'owned' }

  // 条件更新：只有余额足够时才扣，避免并发兑换把积分扣成负数。
  const res = await d1(env)
    .prepare('UPDATE users SET points = points - ? WHERE id = ? AND points >= ?')
    .bind(badge.cost, userId, badge.cost)
    .run()
  if (Number(res?.meta?.changes ?? 0) === 0) return { ok: false, reason: 'insufficient' }

  await addBadge(userId, badgeId, 'shop', env)
  const user = await getUserById(userId, env)
  return { ok: true, points: Number(user?.points ?? 0), badge }
}

// ---------------------------------------------------------------- 汇总

export interface AccountOverview {
  user: PublicUser
  checkedInToday: boolean
  checkinDays: string[]
  favoriteIds: string[]
  claimIds: string[]
  badgeIds: string[]
}

/** /account 与 /api/user/summary 共用的聚合查询。 */
export async function getAccountOverview(user: PublicUser, env?: any): Promise<AccountOverview> {
  const [checkinDays, favoriteIds, claimIds, badgeIds] = await Promise.all([
    listCheckinDays(user.id, 60, env),
    listFavoriteIds(user.id, env),
    listClaimIds(user.id, env),
    listBadgeIds(user.id, env),
  ])
  const today = siteDay()
  return {
    user,
    checkedInToday: checkinDays.includes(today),
    checkinDays,
    favoriteIds,
    claimIds,
    badgeIds,
  }
}
