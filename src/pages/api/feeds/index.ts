import { supabase } from '../../../lib/supabase'

function isAuthenticated(cookies: any, request: Request): boolean {
  const cookieAuth = cookies.get('admin_auth')
  if (cookieAuth) return true
  const feedKey = request.headers.get('X-Feed-Key')
  if (feedKey && feedKey === import.meta.env.FEED_API_KEY) return true
  return false
}

function normalizeUrl(url: string): string {
  return url
    .replace(/\/$/, '')
    .replace(/#\w+$/, '')
    .replace(/\?.*$/, '')
    .toLowerCase()
}

export async function GET({ url }: { url: URL }) {
  const feed_type = url.searchParams.get('type')
  const priority = url.searchParams.get('priority')
  const limit = parseInt(url.searchParams.get('limit') || '100')

  let query = supabase
    .from('feeds')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 500))

  if (feed_type) query = query.eq('feed_type', feed_type)
  if (priority) query = query.eq('priority', priority)

  const { data, error } = await query
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  return new Response(JSON.stringify(data || []), { headers: { 'Content-Type': 'application/json' } })
}

export async function POST({ request, cookies }: { request: Request; cookies: any }) {
  if (!isAuthenticated(cookies, request)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const body = await request.json()
  const { feed_type, title, url: feedUrl, source, priority, metadata } = body
  if (!feed_type || !title) return new Response(JSON.stringify({ error: 'feed_type and title required' }), { status: 400 })

  const insertData: any = { feed_type, title, source, priority: priority || 'normal', metadata: metadata || {} }
  if (feedUrl) {
    insertData.url = feedUrl
    insertData.normalized_url = normalizeUrl(feedUrl)
  }

  const { data, error } = await supabase.from('feeds').insert(insertData).select().single()
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
}

export async function PUT({ request, cookies }: { request: Request; cookies: any }) {
  if (!isAuthenticated(cookies, request)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const body = await request.json()
  const { id, ...updates } = body
  if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 })

  updates.updated_at = new Date().toISOString()
  if (updates.url) updates.normalized_url = normalizeUrl(updates.url)

  const { data, error } = await supabase.from('feeds').update(updates).eq('id', id).select().single()
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
}

export async function DELETE({ request, cookies }: { request: Request; cookies: any }) {
  if (!isAuthenticated(cookies, request)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const body = await request.json()
  const { id } = body
  if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 })

  const { error } = await supabase.from('feeds').delete().eq('id', id)
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  return new Response(JSON.stringify({ success: true }))
}
