import { supabase } from '../../../lib/supabase'

export async function GET({ cookies }: { cookies: any }) {
  const auth = cookies.get('admin_auth')
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const { data } = await supabase.from('links').select('*').order('sort_order', { ascending: true })
  return new Response(JSON.stringify(data || []), { headers: { 'Content-Type': 'application/json' } })
}

export async function POST({ request, cookies }: { request: Request; cookies: any }) {
  const auth = cookies.get('admin_auth')
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const body = await request.json()
  const { title, url, description, icon, category } = body
  if (!title || !url) return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400 })

  const { data, error } = await supabase
    .from('links')
    .insert({ title, url, description: description || '', icon: icon || '', category: category || '默认' })
    .select().single()

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
}
