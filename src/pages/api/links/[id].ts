import { supabase } from '../../../lib/supabase'
import { isAdminRequest } from '../../../lib/admin-auth'

export async function PUT({ params, request, cookies, locals }: { params: { id: string }; request: Request; cookies: any; locals: any }) {
  if (!isAdminRequest(cookies, locals?.runtime?.env)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const body = await request.json()
  const { data, error } = await supabase
    .from('links')
    .update(body)
    .eq('id', params.id)
    .select().single()

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
}

export async function DELETE({ params, cookies, locals }: { params: { id: string }; cookies: any; locals: any }) {
  if (!isAdminRequest(cookies, locals?.runtime?.env)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const { error } = await supabase.from('links').delete().eq('id', params.id)
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  return new Response(JSON.stringify({ success: true }))
}
