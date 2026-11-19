import type { APIRoute } from 'astro'
import { performCheckin, resolveCurrentUser } from '../../../lib/accounts'
import { badgeInfo } from '../../../data/gamification'
import { allowRequest, json, rejectCrossOrigin } from '../../../lib/http'

/**
 * POST /api/user/checkin
 * 无请求体。重复调用是幂等的：今天已签过返回 { already: true }，不重复加分。
 */
export const POST: APIRoute = async ({ request, locals, cookies, url }) => {
  const crossOrigin = rejectCrossOrigin(request, url)
  if (crossOrigin) return crossOrigin

  const env = (locals as any)?.runtime?.env
  if (!(await allowRequest(env, request, 'checkin', 20, 60))) {
    return json({ error: '操作太频繁' }, 429)
  }

  const user = await resolveCurrentUser(cookies, env)
  if (!user) return json({ error: 'unauthorized' }, 401)

  try {
    const result = await performCheckin(user.id, env)
    if (result.already) {
      return json({ ok: true, already: true, streak: user.streak, points: user.points })
    }
    return json({
      ok: true,
      already: false,
      awarded: result.awarded,
      streak: result.streak,
      points: result.points,
      newBadges: badgeInfo(result.newBadges),
    })
  } catch (err: any) {
    console.error('[api/user/checkin]', err?.message || err)
    return json({ error: '签到失败，请稍后再试' }, 500)
  }
}
