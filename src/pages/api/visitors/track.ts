import { supabase } from '../../../lib/supabase'

export async function POST({ request }: { request: Request }) {
  const body = await request.json()
  const { ip, path, user_agent, referer } = body

  const { data: blocked } = await supabase
    .from('blacklist')
    .select('id')
    .eq('ip', ip)
    .limit(1)

  if (blocked && blocked.length > 0) {
    return new Response(JSON.stringify({ blocked: true }), { status: 403 })
  }

  await supabase.from('visitors').insert({
    ip: ip || 'unknown',
    path: path || '/',
    user_agent: user_agent || '',
    referer: referer || '',
  })

  return new Response(JSON.stringify({ success: true }))
}
