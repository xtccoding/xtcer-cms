import type { APIRoute } from 'astro'
import { grantAutoBadges, resolveCurrentUser, setFavorite } from '../../../lib/accounts'
import { badgeInfo } from '../../../data/gamification'
import { validateTarget } from '../../../lib/interactions'
import { allowRequest, json, readJson, rejectCrossOrigin } from '../../../lib/http'

/**
 * POST /api/user/favorite
 * body: { dealId: string, favorited: boolean }
 */
export const POST: APIRoute = async ({ request, locals, cookies, url }) => {
  const crossOrigin = rejectCrossOrigin(request, url)
  if (crossOrigin) return crossOrigin

  const env = (locals as any)?.runtime?.env
  if (!(await allowRequest(env, request, 'favorite', 60, 60))) {
    return json({ error: '操作太频繁' }, 429)
  }

  const user = await resolveCurrentUser(cookies, env)
  if (!user) return json({ error: 'unauthorized' }, 401)

  const parsed = await readJson(request)
  if (!parsed.ok) return parsed.response

  const dealId = validateTarget(parsed.data?.dealId)
  if (!dealId) return json({ error: 'invalid dealId' }, 400)
  if (typeof parsed.data?.favorited !== 'boolean') {
    return json({ error: 'invalid favorited' }, 400)
  }

  try {
    await setFavorite(user.id, dealId, parsed.data.favorited, env)
    const newBadges = parsed.data.favorited ? await grantAutoBadges(user.id, env) : []
    return json({ ok: true, favorited: parsed.data.favorited, newBadges: badgeInfo(newBadges) })
  } catch (err: any) {
    console.error('[api/user/favorite]', err?.message || err)
    return json({ error: '收藏失败，请稍后再试' }, 500)
  }
}
