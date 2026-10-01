import type { APIRoute } from 'astro'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '../../../lib/supabase-admin'
import { isAdminRequest } from '../../../lib/admin-auth'
import { JSON_HEADERS, isTableMissing, isValidUuid } from '../../../lib/interactions'
import type { Database } from '../../../lib/database.types'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

type Guard = { admin: SupabaseClient<Database> } | { response: Response }

/**
 * 统一前置校验：后台会话 + service_role 客户端。
 *
 * ⚠️ 必须比对口令值，不能只判断 cookie 是否存在 —— 否则任何人带上
 *    `Cookie: admin_auth=x` 就能通过（项目里部分旧接口就是这种写法）。
 */
function guard(cookies: any, locals: any): Guard {
  const env = locals?.runtime?.env
  if (!isAdminRequest(cookies, env)) {
    return { response: json({ error: 'unauthorized' }, 401) }
  }
  const admin = createAdminClient(env)
  if (!admin) {
    return { response: json({ error: 'service_role_not_configured' }, 503) }
  }
  return { admin }
}

/** 列缺失（如尚未重跑 SQL 补 handled 列）时给出可操作提示，而不是干巴巴的 500。 */
function dbError(error: any): Response {
  if (isTableMissing(error)) return json({ error: 'unavailable' }, 503)
  if (String(error?.code) === '42703') {
    return json({ error: 'schema_outdated', detail: '数据库缺少 handled 列，请重新执行 database/interactions.sql' }, 500)
  }
  return json({ error: error?.message || 'db error' }, 500)
}

/** DELETE /api/admin/feedback?id=<uuid> —— 删除单条反馈。 */
export const DELETE: APIRoute = async ({ cookies, locals, url }) => {
  const g = guard(cookies, locals)
  if ('response' in g) return g.response

  const id = url.searchParams.get('id')
  if (!isValidUuid(id)) return json({ error: 'invalid id' }, 400)

  const { error } = await g.admin.from('feedback').delete().eq('id', id)
  if (error) return dbError(error)

  return json({ ok: true })
}

/**
 * PATCH /api/admin/feedback —— 切换「已处理」。
 * body: { id: uuid, handled: boolean }
 */
export const PATCH: APIRoute = async ({ request, cookies, locals }) => {
  const g = guard(cookies, locals)
  if ('response' in g) return g.response

  let body: any
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid json' }, 400)
  }

  if (!isValidUuid(body?.id)) return json({ error: 'invalid id' }, 400)
  if (typeof body?.handled !== 'boolean') return json({ error: 'invalid handled' }, 400)

  const { error } = await g.admin.from('feedback').update({ handled: body.handled }).eq('id', body.id)
  if (error) return dbError(error)

  return json({ ok: true, id: body.id, handled: body.handled })
}
