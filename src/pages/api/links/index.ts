import { createLink, listLinks } from '../../../lib/store'
import { isAdminRequest } from '../../../lib/admin-auth'

export async function GET({ cookies, locals }: { cookies: any; locals: any }) {
  if (!isAdminRequest(cookies, locals?.runtime?.env)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  try {
    const data = await listLinks()
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || '数据库错误' }), { status: 500 })
  }
}

export async function POST({ request, cookies, locals }: { request: Request; cookies: any; locals: any }) {
  if (!isAdminRequest(cookies, locals?.runtime?.env)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const body = await request.json()
  const { title, url, description, icon, category } = body
  if (!title || !url) return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400 })

  try {
    const data = await createLink({ title, url, description: description || '', icon: icon || '', category: category || '默认' })
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || '数据库错误' }), { status: 500 })
  }
}
