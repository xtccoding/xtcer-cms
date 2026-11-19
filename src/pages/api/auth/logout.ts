import type { APIRoute } from 'astro'
import { clearUserCookie } from '../../../lib/accounts'
import { json, rejectCrossOrigin } from '../../../lib/http'

/** POST /api/auth/logout —— 删除服务端会话 + 清 Cookie。 */
export const POST: APIRoute = async ({ request, cookies, url }) => {
  const crossOrigin = rejectCrossOrigin(request, url)
  if (crossOrigin) return crossOrigin

  try {
    await clearUserCookie(cookies)
  } catch (err: any) {
    console.error('[api/auth/logout]', err?.message || err)
  }
  return json({ ok: true })
}
