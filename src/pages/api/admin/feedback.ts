import type { APIRoute } from 'astro'
import { deleteFeedback, setFeedbackHandled } from '../../../lib/store'
import { isAdminRequest } from '../../../lib/admin-auth'
import { JSON_HEADERS, isValidUuid } from '../../../lib/interactions'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

/**
 * 统一前置校验：后台会话。
 *
 * ⚠️ 必须比对口令值，不能只判断 cookie 是否存在 —— 否则任何人带上
 *    `Cookie: admin_auth=x` 就能通过（项目里部分旧接口就是这种写法）。
 */
function guard(cookies: any, locals: any): Response | null {
  if (!isAdminRequest(cookies, locals?.runtime?.env)) {
    return json({ error: 'unauthorized' }, 401)
  }
  return null
}

/** DELETE /api/admin/feedback?id=<uuid> —— 删除单条反馈。 */
export const DELETE: APIRoute = async ({ cookies, locals, url }) => {
  const denied = guard(cookies, locals)
  if (denied) return denied

  const id = url.searchParams.get('id')
  if (!isValidUuid(id)) return json({ error: 'invalid id' }, 400)

  try {
    await deleteFeedback(id)
    return json({ ok: true })
  } catch (e: any) {
    return json({ error: e?.message || 'db error' }, 500)
  }
}

/**
 * PATCH /api/admin/feedback —— 切换「已处理」。
 * body: { id: uuid, handled: boolean }
 */
export const PATCH: APIRoute = async ({ request, cookies, locals }) => {
  const denied = guard(cookies, locals)
  if (denied) return denied

  let body: any
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid json' }, 400)
  }

  if (!isValidUuid(body?.id)) return json({ error: 'invalid id' }, 400)
  if (typeof body?.handled !== 'boolean') return json({ error: 'invalid handled' }, 400)

  try {
    await setFeedbackHandled(body.id, body.handled)
    return json({ ok: true, id: body.id, handled: body.handled })
  } catch (e: any) {
    return json({ error: e?.message || 'db error' }, 500)
  }
}
