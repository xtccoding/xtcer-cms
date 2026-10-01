import { supabase } from '../../../lib/supabase'

function isAuthenticated(cookies: any, request: Request, env: any): boolean {
  const cookieAuth = cookies.get('admin_auth')
  if (cookieAuth) return true
  const feedKey = request.headers.get('X-Feed-Key')
  const validKey = env?.FEED_API_KEY || import.meta.env.FEED_API_KEY
  if (feedKey && feedKey === validKey) return true
  return false
}

export async function GET({ cookies, url }: { cookies: any; url: URL }) {
  const auth = cookies.get('admin_auth')
  if (!auth) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'))
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20')))
  const offset = (page - 1) * limit

  const { count } = await supabase
    .from('posts')
    .select('id', { count: 'exact', head: true })

  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const total = count || 0
  const totalPages = Math.ceil(total / limit)

  return new Response(JSON.stringify({ data, total, page, totalPages }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export async function POST({ request, cookies, locals }: { request: Request; cookies: any; locals: any }) {
  if (!isAuthenticated(cookies, request, locals?.runtime?.env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const body = await request.json()
  const { title, content, summary, tags, author } = body

  if (!title) {
    return new Response(JSON.stringify({ error: 'Title is required' }), { status: 400 })
  }

  const insertData: any = { title, content: content || '', summary: summary || '' }
  if (tags && Array.isArray(tags)) insertData.tags = tags
  if (author) insertData.author = author

  const { data, error } = await supabase
    .from('posts')
    .insert(insertData)
    .select()
    .single()

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}
