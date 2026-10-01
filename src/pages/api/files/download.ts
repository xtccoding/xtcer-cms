import { supabase } from '../../../lib/supabase'

export async function POST({ request }: { request: Request }) {
  try {
    const { slug } = await request.json()
    if (!slug) return new Response(JSON.stringify({ error: 'Missing slug' }), { status: 400 })

    // increment_downloads is SECURITY DEFINER, so anon can call it via RPC
    // without needing direct UPDATE access on files table.
    // Old fallback (from('files').update) would fail under tightened RLS — removed.
    await supabase.rpc('increment_downloads', { slug })

    return new Response(JSON.stringify({ success: true }))
  } catch {
    return new Response(JSON.stringify({ success: true }))
  }
}
