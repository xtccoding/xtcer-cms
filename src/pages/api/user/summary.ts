import type { APIRoute } from 'astro'
import { getAccountOverview, resolveCurrentUser } from '../../../lib/accounts'
import { json } from '../../../lib/http'

/**
 * GET /api/user/summary
 *
 * 供首页开蛋组件、DealCard 收藏按钮做登录态水合。
 * 公开页面有边缘缓存，**用户态只能走这个 no-store 接口**，不能塞进 SSR HTML。
 */
export const GET: APIRoute = async ({ locals, cookies }) => {
  const env = (locals as any)?.runtime?.env
  const user = await resolveCurrentUser(cookies, env)
  if (!user) return json({ error: 'unauthorized' }, 401)

  try {
    const data = await getAccountOverview(user, env)
    return json(data)
  } catch (err: any) {
    console.error('[api/user/summary]', err?.message || err)
    return json({ error: 'db error' }, 500)
  }
}
