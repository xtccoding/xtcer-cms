import { supabase } from '../../lib/supabase'

export async function GET() {
  try {
    const { data, error } = await supabase.from('assets').select('*').limit(5)
    return new Response(JSON.stringify({ data, error: error?.message }), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}
