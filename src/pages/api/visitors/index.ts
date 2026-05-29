import { supabase } from '../../../lib/supabase'

export async function GET({ cookies, url }: { cookies: any; url: URL }) {
  const auth = cookies.get('admin_auth')
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const range = url.searchParams.get('range') || '7d'
  const days = range === '1d' ? 1 : range === '30d' ? 30 : 7
  const since = new Date(Date.now() - days * 86400000).toISOString()

  const search = url.searchParams.get('ip')?.trim()
  const page = parseInt(url.searchParams.get('page') || '1')
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200)
  const offset = (page - 1) * limit

  // Stats query (all matching records for counting)
  let statsQuery = supabase
    .from('visitors')
    .select('ip, path, created_at', { count: 'exact' })
    .gte('created_at', since)

  if (search) {
    statsQuery = statsQuery.ilike('ip', `%${search}%`)
  }

  const { data: allVisits, count: totalCount } = await statsQuery

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

  // Paginated recent visits
  let recentQuery = supabase
    .from('visitors')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (search) {
    recentQuery = recentQuery.ilike('ip', `%${search}%`)
  }

  const { data: recent } = await recentQuery

  return new Response(JSON.stringify({
    total: totalCount || 0,
    unique: uniqueIps.size,
    recent: recent || [],
    topPages,
    hourlyCounts,
    page,
    limit,
    totalPages: Math.ceil((totalCount || 0) / limit),
  }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
}
