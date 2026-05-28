import { supabase } from '../../../lib/supabase'

function isAuthenticated(cookies: any, request: Request, env: any): boolean {
  const cookieAuth = cookies.get('admin_auth')
  if (cookieAuth) return true
  const feedKey = request.headers.get('X-Feed-Key')
  const validKey = env?.FEED_API_KEY || import.meta.env.FEED_API_KEY
  if (feedKey && feedKey === validKey) return true
  return false
}

export async function GET({ url }: { url: URL }) {
  const category = url.searchParams.get('category')
  const region = url.searchParams.get('region')

  let query = supabase
    .from('deals')
    .select('*')
    .eq('is_active', true)
    .order('price_cny', { ascending: true, nullsFirst: false })

  if (category) query = query.eq('category', category)
  if (region) query = query.eq('region', region)

  const { data, error } = await query
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  return new Response(JSON.stringify(data || []), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
}

export async function POST({ request, cookies, locals }: { request: Request; cookies: any; locals: any }) {
  if (!isAuthenticated(cookies, request, locals?.runtime?.env)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const body = await request.json()
  const { provider, product, price, price_usd, price_cny, config, bandwidth, type, target, renewal_price, url, notes, category, region, expiry } = body
  if (!provider || !product || !price || !category) {
    return new Response(JSON.stringify({ error: 'Missing required fields: provider, product, price, category' }), { status: 400 })
  }

  const { data, error } = await supabase
    .from('deals')
    .insert({ provider, product, price, price_usd, price_cny, config, bandwidth, type, target, renewal_price, url, notes, category, region, expiry })
    .select().single()

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
}

export async function PUT({ request, cookies, locals }: { request: Request; cookies: any; locals: any }) {
  if (!isAuthenticated(cookies, request, locals?.runtime?.env)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const body = await request.json()
  const { id, ...updates } = body
  if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 })

  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('deals')
    .update(updates)
    .eq('id', id)
    .select().single()

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
}

export async function DELETE({ request, cookies, locals }: { request: Request; cookies: any; locals: any }) {
  if (!isAuthenticated(cookies, request, locals?.runtime?.env)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const body = await request.json()
  const { id } = body
  if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 })

  const { error } = await supabase.from('deals').delete().eq('id', id)
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  return new Response(JSON.stringify({ success: true }))
}
