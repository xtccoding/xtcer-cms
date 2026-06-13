import { supabase } from '../../../lib/supabase'

function isAuthenticated(cookies: any, request: Request, env: any): boolean {
  const cookieAuth = cookies.get('admin_auth')
  if (cookieAuth) return true
  const feedKey = request.headers.get('X-Feed-Key')
  const validKey = env?.FEED_API_KEY || import.meta.env.FEED_API_KEY
  if (feedKey && feedKey === validKey) return true
  return false
}

export async function GET({ params }: { params: { id: string } }) {
  const { id } = params
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) {
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })
  }

  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export async function PUT({ params, request, cookies, locals }: { params: { id: string }; request: Request; cookies: any; locals: any }) {
  if (!isAuthenticated(cookies, request, locals?.runtime?.env)) {
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

  const { data, error } = await supabase
    .from('posts')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export async function PATCH({ params, request, cookies, locals }: { params: { id: string }; request: Request; cookies: any; locals: any }) {
  if (!isAuthenticated(cookies, request, locals?.runtime?.env)) {
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

  const { data: current } = await supabase
    .from('posts')
    .select('tags')
    .eq('id', id)
    .single()

  let finalTags: string[]
  if (mode === 'add') {
    const existing = current?.tags || []
    finalTags = [...new Set([...existing, ...cleanTags])]
  } else if (mode === 'remove') {
    const existing = current?.tags || []
    finalTags = existing.filter((t: string) => !cleanTags.includes(t))
  } else {
    finalTags = [...new Set(cleanTags)]
  }

  const { data, error } = await supabase
    .from('posts')
    .update({ tags: finalTags })
    .eq('id', id)
    .select('id, title, tags')
    .single()

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export async function DELETE({ params, request, cookies, locals }: { params: { id: string }; request: Request; cookies: any; locals: any }) {
  if (!isAuthenticated(cookies, request, locals?.runtime?.env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { id } = params
  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', id)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  return new Response(JSON.stringify({ success: true }))
}
