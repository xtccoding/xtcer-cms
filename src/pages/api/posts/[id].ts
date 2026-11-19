import { deletePost, getPost, getPostLite, updatePost } from '../../../lib/store'
import { isAdminRequest } from '../../../lib/admin-auth'

export async function GET({ params }: { params: { id: string } }) {
  const data = await getPost(params.id)
  if (!data) {
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })
  }

  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export async function PUT({ params, request, cookies, locals }: { params: { id: string }; request: Request; cookies: any; locals: any }) {
  if (!isAdminRequest(cookies, locals?.runtime?.env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { id } = params
  const body = await request.json()
  const { title, content, summary, tags, author } = body

  const updateData: any = {}
  if (title !== undefined) updateData.title = title
  if (content !== undefined) updateData.content = content
  if (summary !== undefined) updateData.summary = summary
  if (tags !== undefined && Array.isArray(tags)) updateData.tags = tags
  if (author !== undefined) updateData.author = author
  updateData.updated_at = new Date().toISOString()

  try {
    const data = await updatePost(id, updateData)
    if (!data) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })
    }
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || '数据库错误' }), { status: 500 })
  }
}

export async function PATCH({ params, request, cookies, locals }: { params: { id: string }; request: Request; cookies: any; locals: any }) {
  if (!isAdminRequest(cookies, locals?.runtime?.env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { id } = params
  const body = await request.json().catch(() => ({}))
  const { tags, mode } = body

  if (!tags || !Array.isArray(tags)) {
    return new Response(JSON.stringify({ error: 'tags 必须是数组', usage: 'PATCH /api/posts/:id { "tags": ["ai","llm"], "mode": "set" }' }), { status: 400 })
  }

  const cleanTags = tags.map((t: string) => String(t).trim().toLowerCase()).filter(Boolean)
  if (cleanTags.length === 0) {
    return new Response(JSON.stringify({ error: 'tags 不能为空' }), { status: 400 })
  }

  try {
    const current = await getPostLite(id)
    if (!current) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })
    }

    const existing = current.tags || []
    let finalTags: string[]
    if (mode === 'add') {
      finalTags = [...new Set([...existing, ...cleanTags])]
    } else if (mode === 'remove') {
      finalTags = existing.filter((t: string) => !cleanTags.includes(t))
    } else {
      finalTags = [...new Set(cleanTags)]
    }

    const data = await updatePost(id, { tags: finalTags })
    return new Response(JSON.stringify({ id, title: data?.title, tags: finalTags }), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || '数据库错误' }), { status: 500 })
  }
}

export async function DELETE({ params, cookies, locals }: { params: { id: string }; cookies: any; locals: any }) {
  if (!isAdminRequest(cookies, locals?.runtime?.env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  try {
    await deletePost(params.id)
    return new Response(JSON.stringify({ success: true }))
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || '数据库错误' }), { status: 500 })
  }
}
