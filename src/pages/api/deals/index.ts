import { createDeal, deleteDeal, listDeals, updateDeal } from '../../../lib/store'
import { isAdminRequest } from '../../../lib/admin-auth'

export async function GET({ url }: { url: URL }) {
  const category = url.searchParams.get('category')
  const region = url.searchParams.get('region')

  try {
    // 过期即隐藏：expiry 为空 = 长期有效；有值则必须 >= 今天（YYYY-MM-DD 字符串比较）。
    // 传 ?include_expired=1 可绕过，供后台/核对使用。
    const data = await listDeals({
      includeExpired: url.searchParams.get('include_expired') === '1',
      category,
      region,
    })
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || '数据库错误' }), { status: 500 })
  }
}

export async function POST({ request, cookies, locals }: { request: Request; cookies: any; locals: any }) {
  if (!isAdminRequest(cookies, locals?.runtime?.env)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const body = await request.json()
  const { provider, product, price, price_usd, price_cny, config, bandwidth, type, target, renewal_price, url, notes, category, region, expiry } = body
  if (!provider || !product || !price || !category) {
    return new Response(JSON.stringify({ error: 'Missing required fields: provider, product, price, category' }), { status: 400 })
  }

  try {
    const data = await createDeal({ provider, product, price, price_usd, price_cny, config, bandwidth, type, target, renewal_price, url, notes, category, region, expiry })
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || '数据库错误' }), { status: 500 })
  }
}

export async function PUT({ request, cookies, locals }: { request: Request; cookies: any; locals: any }) {
  if (!isAdminRequest(cookies, locals?.runtime?.env)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const body = await request.json()
  const { id, ...updates } = body
  if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 })

  updates.updated_at = new Date().toISOString()

  try {
    const data = await updateDeal(id, updates)
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || '数据库错误' }), { status: 500 })
  }
}

export async function DELETE({ request, url, cookies, locals }: { request: Request; url: URL; cookies: any; locals: any }) {
  if (!isAdminRequest(cookies, locals?.runtime?.env)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  // Support both query param and body
  let id = url.searchParams.get('id')
  if (!id) {
    try { const body = await request.json(); id = body.id } catch {}
  }
  if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 })

  try {
    await deleteDeal(id)
    return new Response(JSON.stringify({ success: true }))
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || '数据库错误' }), { status: 500 })
  }
}
