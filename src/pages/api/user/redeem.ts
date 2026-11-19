import type { APIRoute } from 'astro'
import { redeemBadge, resolveCurrentUser } from '../../../lib/accounts'
import { allowRequest, json, readJson, rejectCrossOrigin } from '../../../lib/http'

/**
 * POST /api/user/redeem
 * body: { badgeId: string } —— 用积分兑换商店徽章。
 */
export const POST: APIRoute = async ({ request, locals, cookies, url }) => {
  const crossOrigin = rejectCrossOrigin(request, url)
  if (crossOrigin) return crossOrigin

  const env = (locals as any)?.runtime?.env
  if (!(await allowRequest(env, request, 'redeem', 30, 60))) {
    return json({ error: '操作太频繁' }, 429)
  }

  const user = await resolveCurrentUser(cookies, env)
  if (!user) return json({ error: 'unauthorized' }, 401)

  const parsed = await readJson(request)
  if (!parsed.ok) return parsed.response

  try {
    const result = await redeemBadge(user.id, parsed.data?.badgeId, env)
    if (!result.ok) {
      const message =
        result.reason === 'owned'
          ? '你已经有这枚徽章了'
          : result.reason === 'insufficient'
            ? '积分不够，再签几天吧'
            : '无效的徽章'
      const status = result.reason === 'invalid' ? 400 : 409
      return json({ error: message }, status)
    }
    return json({ ok: true, points: result.points, badge: result.badge })
  } catch (err: any) {
    console.error('[api/user/redeem]', err?.message || err)
    return json({ error: '兑换失败，请稍后再试' }, 500)
  }
}
