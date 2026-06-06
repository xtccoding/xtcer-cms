import { supabase } from '../../../lib/supabase'

export async function POST({ request }: { request: Request }) {
  try {
    const { slug } = await request.json()
    if (!slug) return new Response(JSON.stringify({ error: 'Missing slug' }), { status: 400 })

    await supabase.rpc('increment_downloads', { slug })
      .catch(() => supabase.from('files').update({ downloads: 0 }).eq('share_slug', slug))

    return new Response(JSON.stringify({ success: true }))
  } catch {
    return new Response(JSON.stringify({ success: true }))
  }
}
