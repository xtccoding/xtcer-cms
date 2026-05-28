import { supabase } from '../../../lib/supabase'

function isAuthenticated(cookies: any, request: Request, env: any): boolean {
  const cookieAuth = cookies.get('admin_auth')
  if (cookieAuth) return true
  const feedKey = request.headers.get('X-Feed-Key')
  const validKey = env?.FEED_API_KEY || import.meta.env.FEED_API_KEY
  if (feedKey && feedKey === validKey) return true
  return false
}

function normalizeUrl(url: string): string {
  return url
    .replace(/\/$/, '')
    .replace(/#\w+$/, '')
    .replace(/\?.*$/, '')
    .toLowerCase()
}

function urlHash(url: string): string {
  let hash = 0
  const normalized = normalizeUrl(url)
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash) + normalized.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

export async function GET({ url }: { url: URL }) {
  const feed_type = url.searchParams.get('type')
  const priority = url.searchParams.get('priority')
  const limit = parseInt(url.searchParams.get('limit') || '100')

  let query = supabase
    .from('feeds')
    .select('*')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(Math.min(limit, 500))

  if (feed_type) query = query.eq('feed_type', feed_type)
  if (priority) query = query.eq('priority', priority)

  const { data, error } = await query
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  return new Response(JSON.stringify(data || []), { headers: { 'Content-Type': 'application/json' } })
}

export async function POST({ request, cookies, locals }: { request: Request; cookies: any; locals: any }) {
  if (!isAuthenticated(cookies, request, locals?.runtime?.env)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const body = await request.json()
  const { feed_type, title, url: feedUrl, source, summary, tags, priority, metadata, published_at } = body
  if (!feed_type || !title) return new Response(JSON.stringify({ error: 'feed_type and title required' }), { status: 400 })

  const insertData: any = {
    feed_type, title, source, summary, tags,
    priority: priority || 'normal',
    metadata: metadata || {},
    published_at: published_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  if (feedUrl) {
    insertData.url = feedUrl
    insertData.normalized_url = normalizeUrl(feedUrl)
    insertData.url_hash = urlHash(feedUrl)
  }

  const { data, error } = await supabase.from('feeds').upsert(insertData, { onConflict: 'feed_type,title' }).select().single()
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
}

export async function PUT({ request, cookies, locals }: { request: Request; cookies: any; locals: any }) {
  if (!isAuthenticated(cookies, request, locals?.runtime?.env)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const body = await request.json()
  const { id, ...updates } = body
  if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 })

  updates.updated_at = new Date().toISOString()
  if (updates.url) {
    updates.normalized_url = normalizeUrl(updates.url)
    updates.url_hash = urlHash(updates.url)
  }

  const { data, error } = await supabase.from('feeds').update(updates).eq('id', id).select().single()
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
}

export async function DELETE({ request, cookies, locals }: { request: Request; cookies: any; locals: any }) {
  if (!isAuthenticated(cookies, request, locals?.runtime?.env)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const body = await request.json()
  const { id } = body
  if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 })

  const { error } = await supabase.from('feeds').delete().eq('id', id)
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  return new Response(JSON.stringify({ success: true }))
}
