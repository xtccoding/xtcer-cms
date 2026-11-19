import { addBlacklist, deleteBlacklist, listBlacklist } from '../../../lib/store'
import { isAdminRequest } from '../../../lib/admin-auth'

export async function GET({ cookies, locals }: { cookies: any; locals: any }) {
  if (!isAdminRequest(cookies, locals?.runtime?.env)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  try {
    const data = await listBlacklist()
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || '数据库错误' }), { status: 500 })
  }
}

export async function POST({ request, cookies, locals }: { request: Request; cookies: any; locals: any }) {
  if (!isAdminRequest(cookies, locals?.runtime?.env)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const body = await request.json()
  const { ip, reason } = body
  if (!ip) return new Response(JSON.stringify({ error: 'IP required' }), { status: 400 })

  try {
    const data = await addBlacklist(ip, reason || '')
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || '数据库错误' }), { status: 500 })
  }
}

export async function DELETE({ url, cookies, locals }: { url: URL; cookies: any; locals: any }) {
  if (!isAdminRequest(cookies, locals?.runtime?.env)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const id = url.searchParams.get('id')
  if (!id) return new Response(JSON.stringify({ error: 'ID required' }), { status: 400 })

  try {
    await deleteBlacklist(id)
    return new Response(JSON.stringify({ success: true }))
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || '数据库错误' }), { status: 500 })
  }
}
