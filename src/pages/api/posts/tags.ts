import { getPostTagsMap, updatePost } from '../../../lib/store'
import { isAdminRequest } from '../../../lib/admin-auth'

interface TagItem {
  id: string
  tags: string[]
}

export async function PATCH({ request, cookies, locals }: { request: Request; cookies: any; locals: any }) {
  if (!isAdminRequest(cookies, locals?.runtime?.env)) {
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
  const currentMap = await getPostTagsMap(ids)

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

    try {
      await updatePost(item.id, { tags: finalTags })
      results.push({ id: item.id, status: 'ok', tags: finalTags })
    } catch (e: any) {
      results.push({ id: item.id, status: 'error', tags: finalTags, error: e?.message })
    }
  }

  return new Response(JSON.stringify({ updated: results.filter(r => r.status === 'ok').length, total: items.length, results }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}
