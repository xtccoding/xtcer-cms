import { supabase } from '../../../lib/supabase'

export async function PUT({ params, request, cookies }: { params: { id: string }; request: Request; cookies: any }) {
  const auth = cookies.get('admin_auth')
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const body = await request.json()
  const { data, error } = await supabase
    .from('links')
    .update(body)
    .eq('id', params.id)
    .select().single()

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
}

export async function DELETE({ params, cookies }: { params: { id: string }; cookies: any }) {
  const auth = cookies.get('admin_auth')
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const { error } = await supabase.from('links').delete().eq('id', params.id)
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  return new Response(JSON.stringify({ success: true }))
}
