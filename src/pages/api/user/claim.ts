import type { APIRoute } from 'astro'
import { markClaim, resolveCurrentUser } from '../../../lib/accounts'
import { badgeInfo } from '../../../data/gamification'
import { validateTarget } from '../../../lib/interactions'
import { allowRequest, json, readJson, rejectCrossOrigin } from '../../../lib/http'

/**
 * POST /api/user/claim
 * body: { dealId: string } —— 标记「我已经领过」。首次标记 +2 积分。
 */
export const POST: APIRoute = async ({ request, locals, cookies, url }) => {
  const crossOrigin = rejectCrossOrigin(request, url)
  if (crossOrigin) return crossOrigin

  const env = (locals as any)?.runtime?.env
  if (!(await allowRequest(env, request, 'claim', 60, 60))) {
    return json({ error: '操作太频繁' }, 429)
  }

  const user = await resolveCurrentUser(cookies, env)
  if (!user) return json({ error: 'unauthorized' }, 401)

  const parsed = await readJson(request)
  if (!parsed.ok) return parsed.response

  const dealId = validateTarget(parsed.data?.dealId)
  if (!dealId) return json({ error: 'invalid dealId' }, 400)

  try {
    const result = await markClaim(user.id, dealId, env)
    return json({ ok: true, ...result, newBadges: badgeInfo(result.newBadges) })
  } catch (err: any) {
    console.error('[api/user/claim]', err?.message || err)
    return json({ error: '操作失败，请稍后再试' }, 500)
  }
}
