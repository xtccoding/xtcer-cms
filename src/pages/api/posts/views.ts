import { supabase } from '../../../lib/supabase'

export async function POST({ request }: { request: Request }) {
  const { id } = await request.json()

  if (!id) {
    return new Response(JSON.stringify({ error: 'id required' }), { status: 400 })
  }

  const { data: post } = await supabase
    .from('posts')
    .select('views')
    .eq('id', id)
    .single()

  const newViews = (post?.views || 0) + 1

  const { error } = await supabase
    .from('posts')
    .update({ views: newViews })
    .eq('id', id)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  return new Response(JSON.stringify({ views: newViews }))
}
