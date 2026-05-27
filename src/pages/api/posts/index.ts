import { supabase } from '../../../lib/supabase'

export async function GET({ cookies }: { cookies: any }) {
  const auth = cookies.get('admin_auth')
  if (!auth) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function POST({ request, cookies }: { request: Request; cookies: any }) {
  const auth = cookies.get('admin_auth')
  if (!auth) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const body = await request.json()
  const { title, content } = body

  if (!title) {
    return new Response(JSON.stringify({ error: 'Title is required' }), { status: 400 })
  }

  const { data, error } = await supabase
    .from('posts')
    .insert({ title, content: content || '' })
    .select()
    .single()

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  })
}
