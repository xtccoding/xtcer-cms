import { supabase } from '../../../lib/supabase'

export async function GET({ cookies }: { cookies: any }) {
  const auth = cookies.get('admin_auth')
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const { data } = await supabase.from('blacklist').select('*').order('created_at', { ascending: false })
  return new Response(JSON.stringify(data || []), { headers: { 'Content-Type': 'application/json' } })
}

export async function POST({ request, cookies }: { request: Request; cookies: any }) {
  const auth = cookies.get('admin_auth')
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const body = await request.json()
  const { ip, reason } = body
  if (!ip) return new Response(JSON.stringify({ error: 'IP required' }), { status: 400 })

  const { data, error } = await supabase
    .from('blacklist')
    .insert({ ip, reason: reason || '' })
    .select().single()

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
}

export async function DELETE({ url, cookies }: { url: URL; cookies: any }) {
  const auth = cookies.get('admin_auth')
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const id = url.searchParams.get('id')
  if (!id) return new Response(JSON.stringify({ error: 'ID required' }), { status: 400 })

  await supabase.from('blacklist').delete().eq('id', id)
  return new Response(JSON.stringify({ success: true }))
}
