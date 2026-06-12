import { supabase } from '../../../lib/supabase'

function isAuthenticated(cookies: any, request: Request, env: any): boolean {
  const cookieAuth = cookies.get('admin_auth')
  if (cookieAuth) return true
  const feedKey = request.headers.get('X-Feed-Key')
  const validKey = env?.FEED_API_KEY || import.meta.env.FEED_API_KEY
  if (feedKey && feedKey === validKey) return true
  return false
}

interface TagItem {
  id: string
  tags: string[]
}

export async function PATCH({ request, cookies, locals }: { request: Request; cookies: any; locals: any }) {
  if (!isAuthenticated(cookies, request, locals?.runtime?.env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const { items, mode } = body as { items: TagItem[]; mode?: string }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return new Response(JSON.stringify({
      error: 'items 必须是非空数组',
      usage: 'PATCH /api/posts/tags { "items": [{"id": "xxx", "tags": ["ai","llm"]}], "mode": "set" }',
      modes: { set: '覆盖（默认）', add: '追加', remove: '移除' },
    }), { status: 400 })
  }

  if (items.length > 100) {
    return new Response(JSON.stringify({ error: '单次最多 100 条' }), { status: 400 })
  }

  const ids = items.map(i => i.id).filter(Boolean)
  const { data: currentPosts } = await supabase
    .from('posts')
    .select('id, tags')
    .in('id', ids)

  const currentMap = new Map<string, string[]>()
  for (const p of currentPosts || []) currentMap.set(p.id, p.tags || [])

  const results = []

  for (const item of items) {
    const cleanTags = (item.tags || []).map(t => String(t).trim().toLowerCase()).filter(Boolean)
    if (!item.id || cleanTags.length === 0) {
      results.push({ id: item.id, status: 'skipped' })
      continue
    }

    const existing = currentMap.get(item.id) || []
    let finalTags: string[]

    if (mode === 'add') {
      finalTags = [...new Set([...existing, ...cleanTags])]
    } else if (mode === 'remove') {
      finalTags = existing.filter(t => !cleanTags.includes(t))
    } else {
      finalTags = [...new Set(cleanTags)]
    }

    const { error } = await supabase
      .from('posts')
      .update({ tags: finalTags })
      .eq('id', item.id)

    results.push({ id: item.id, status: error ? 'error' : 'ok', tags: finalTags, error: error?.message })
  }

  return new Response(JSON.stringify({ updated: results.filter(r => r.status === 'ok').length, total: items.length, results }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}
