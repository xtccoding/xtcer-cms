import { createAdminClient } from '../../../lib/supabase-admin'

export async function POST({ request, locals }: { request: Request; locals: any }) {
  try {
    const { slug, password } = await request.json()
    if (!slug || !password) return new Response(JSON.stringify({ error: 'Missing params' }), { status: 400 })

    // RLS 收紧后 anon 无法读 files 表；密码验证走 service_role 客户端
    const admin = createAdminClient(locals?.runtime?.env)
    if (!admin) return new Response(JSON.stringify({ error: 'File service unavailable' }), { status: 503 })

    const { data: file } = await admin
      .from('files')
      .select('url, password, expires_at')
      .eq('share_slug', slug)
      .single()

    if (!file) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })
    if (file.expires_at && new Date(file.expires_at) < new Date()) return new Response(JSON.stringify({ error: 'Expired' }), { status: 410 })
    if (file.password !== password) return new Response(JSON.stringify({ error: 'Wrong password' }), { status: 403 })

    return new Response(JSON.stringify({ url: file.url }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}
