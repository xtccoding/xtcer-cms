import { supabase } from '../../../lib/supabase'

export async function GET({ params }: { params: { id: string } }) {
  const { id } = params
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) {
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })
  }

  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function PUT({ params, request, cookies }: { params: { id: string }; request: Request; cookies: any }) {
  const auth = cookies.get('admin_auth')
  if (!auth) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { id } = params
  const body = await request.json()
  const { title, content } = body

  const { data, error } = await supabase
    .from('posts')
    .update({ title, content })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function DELETE({ params, cookies }: { params: { id: string }; cookies: any }) {
  const auth = cookies.get('admin_auth')
  if (!auth) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { id } = params
  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', id)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  return new Response(JSON.stringify({ success: true }))
}
