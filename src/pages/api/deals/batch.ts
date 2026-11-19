import { upsertDeal } from '../../../lib/store'
import { isAdminOrFeedRequest } from '../../../lib/admin-auth'

export async function POST({ request, cookies, locals }: { request: Request; cookies: any; locals: any }) {
  if (!isAdminOrFeedRequest(cookies, request, locals?.runtime?.env)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const body = await request.json()
  const { deals } = body
  if (!Array.isArray(deals) || deals.length === 0) {
    return new Response(JSON.stringify({ error: 'deals array required' }), { status: 400 })
  }

  const results = []
  for (const deal of deals) {
    const { provider, product, price, price_usd, price_cny, config, bandwidth, type, target, renewal_price, url, notes, category, region, expiry } = deal
    if (!provider || !product || !price || !category) continue

    try {
      const data = await upsertDeal({ provider, product, price, price_usd, price_cny, config, bandwidth, type, target, renewal_price, url, notes, category, region, expiry })
      if (data) results.push(data)
    } catch {
      // 跳过单条失败，继续处理其余条目
    }
  }

  return new Response(JSON.stringify({ inserted: results.length, deals: results }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
}
