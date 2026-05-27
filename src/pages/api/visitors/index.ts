import { supabase } from '../../../lib/supabase'

export async function GET({ cookies, url }: { cookies: any; url: URL }) {
  const auth = cookies.get('admin_auth')
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const range = url.searchParams.get('range') || '7d'
  const days = range === '1d' ? 1 : range === '30d' ? 30 : 7
  const since = new Date(Date.now() - days * 86400000).toISOString()

  const { data: visits } = await supabase
    .from('visitors')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false })

  const { data: allVisits } = await supabase
    .from('visitors')
    .select('ip, created_at')
    .gte('created_at', since)

  const uniqueIps = new Set(allVisits?.map(v => v.ip) || [])

  const pathCounts: Record<string, number> = {}
  allVisits?.forEach(v => {
    pathCounts[v.path] = (pathCounts[v.path] || 0) + 1
  })
  const topPages = Object.entries(pathCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([path, count]) => ({ path, count }))

  const hourlyCounts: Record<string, number> = {}
  allVisits?.forEach(v => {
    const hour = new Date(v.created_at).getHours()
    hourlyCounts[hour] = (hourlyCounts[hour] || 0) + 1
  })

  return new Response(JSON.stringify({
    total: allVisits?.length || 0,
    unique: uniqueIps.size,
    recent: visits?.slice(0, 50) || [],
    topPages,
    hourlyCounts,
  }), { headers: { 'Content-Type': 'application/json' } })
}
