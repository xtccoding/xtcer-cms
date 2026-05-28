import { supabase } from '../../../lib/supabase'

function isAuthenticated(cookies: any, request: Request): boolean {
  const cookieAuth = cookies.get('admin_auth')
  if (cookieAuth) return true
  const feedKey = request.headers.get('X-Feed-Key')
  if (feedKey && feedKey === process.env.FEED_API_KEY) return true
  return false
}

export async function POST({ request, cookies }: { request: Request; cookies: any }) {
  if (!isAuthenticated(cookies, request)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const body = await request.json()
  const { deals } = body
  if (!Array.isArray(deals) || deals.length === 0) {
    return new Response(JSON.stringify({ error: 'deals array required' }), { status: 400 })
  }

  const results = []
  for (const deal of deals) {
    const { provider, product, price, price_usd, price_cny, config, bandwidth, type, target, renewal_price, url, notes, category, region, expiry } = deal
    if (!provider || !product || !price || !category) continue

    const { data, error } = await supabase
      .from('deals')
      .upsert(
        { provider, product, price, price_usd, price_cny, config, bandwidth, type, target, renewal_price, url, notes, category, region, expiry, updated_at: new Date().toISOString() },
        { onConflict: 'provider,product' }
      )
      .select()

    if (!error && data) results.push(...data)
  }

  return new Response(JSON.stringify({ inserted: results.length, deals: results }), { headers: { 'Content-Type': 'application/json' } })
}
