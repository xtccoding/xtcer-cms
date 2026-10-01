import { supabase } from '../../../lib/supabase'

function isAuthenticated(cookies: any, request: Request, env: any): boolean {
  const cookieAuth = cookies.get('admin_auth')
  if (cookieAuth) return true
  const feedKey = request.headers.get('X-Feed-Key')
  const validKey = env?.FEED_API_KEY || import.meta.env.FEED_API_KEY
  if (feedKey && feedKey === validKey) return true
  return false
}

/**
 * POST /api/posts/batch-delete
 * Body: { ids: string[] }   (max 200 per request)
 * -> { success: true, deleted: number, requested: number, missing: string[] }
 *
 * 批量删除文章。单次最多 200 条，一条 SQL 完成（.in），
 * 避免逐篇 DELETE 的往返开销。
 */
export async function POST({ request, cookies, locals }: { request: Request; cookies: any; locals: any }) {
  if (!isAuthenticated(cookies, request, locals?.runtime?.env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const { ids } = body as { ids?: string[] }

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return new Response(JSON.stringify({
      error: 'ids 必须是非空数组',
      usage: 'POST /api/posts/batch-delete { "ids": ["uuid1", "uuid2"] }',
    }), { status: 400 })
  }

  if (ids.length > 200) {
    return new Response(JSON.stringify({ error: '单次最多 200 条' }), { status: 400 })
  }

  const cleanIds = [...new Set(ids.map((s) => String(s).trim()).filter(Boolean))]
  if (cleanIds.length === 0) {
    return new Response(JSON.stringify({ error: 'ids 去重后为空' }), { status: 400 })
  }

  // 先查出实际存在的，便于返回 missing
  const { data: existing, error: queryError } = await supabase
    .from('posts')
    .select('id')
    .in('id', cleanIds)

  if (queryError) {
    return new Response(JSON.stringify({ error: queryError.message }), { status: 500 })
  }

  const existingIds = (existing || []).map((r: any) => r.id)
  const missing = cleanIds.filter((id) => !existingIds.includes(id))

  if (existingIds.length === 0) {
    return new Response(JSON.stringify({
      success: true, deleted: 0, requested: cleanIds.length, missing,
    }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  }

  const { error } = await supabase
    .from('posts')
    .delete()
    .in('id', existingIds)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  return new Response(JSON.stringify({
    success: true,
    deleted: existingIds.length,
    requested: cleanIds.length,
    missing,
  }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
}
