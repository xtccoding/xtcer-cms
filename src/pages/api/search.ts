import { supabase } from '../../lib/supabase'

export async function GET({ url, request }: { url: URL; request: Request }) {
  const q = url.searchParams.get('q')?.trim()
  const type = url.searchParams.get('type')?.trim() // post, feed, deal, all
  const page = parseInt(url.searchParams.get('page') || '1')
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100)
  const sort = url.searchParams.get('sort') || 'time' // time, relevance
  const order = url.searchParams.get('order') || 'desc' // asc, desc
  
  // Check if request is from Hermes bot
  const userAgent = request.headers.get('user-agent') || ''
  const isBot = userAgent.includes('Hermes') || userAgent.includes('Junier') || userAgent.includes('bot')
  
  if (!q || q.length < 2) {
    return new Response(JSON.stringify({ 
      results: [], 
      total: 0,
      page: 1,
      limit,
      query: q 
    }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  }

  const pattern = `%${q}%`
  const offset = (page - 1) * limit
  const types = type ? type.split(',') : ['post', 'feed', 'deal']

  try {
    const results: any[] = []
    let totalCount = 0

    // Search posts
    if (types.includes('post')) {
      const { data, count } = await supabase
        .from('posts')
        .select('id, title, content, summary, created_at, views', { count: 'exact' })
        .or(`title.ilike.${pattern},content.ilike.${pattern},summary.ilike.${pattern}`)
        .order('created_at', { ascending: order === 'asc' })
        .range(offset, offset + limit - 1)

      if (data) {
        results.push(...data.map(p => ({
          type: 'post',
          id: p.id,
          title: p.title,
          desc: p.summary || (p.content || '').replace(/[#*_`~\[\]>|]/g, '').substring(0, 150),
          url: `/posts/${p.id}`,
          time: p.created_at,
          views: p.views || 0,
          relevance: calculateRelevance(q, p.title, p.content)
        })))
        totalCount += count || 0
      }
    }

    // Search feeds
    if (types.includes('feed')) {
      const { data, count } = await supabase
        .from('feeds')
        .select('id, feed_type, title, url, summary, priority, published_at, created_at', { count: 'exact' })
        .or(`title.ilike.${pattern},summary.ilike.${pattern},tags.cs.{${q}}`)
        .order('published_at', { ascending: order === 'asc', nullsFirst: false })
        .range(offset, offset + limit - 1)

      if (data) {
        results.push(...data.map(f => ({
          type: 'feed',
          id: f.id,
          title: f.title,
          desc: f.summary || f.feed_type,
          url: f.url || '#',
          time: f.published_at || f.created_at,
          feed_type: f.feed_type,
          priority: f.priority,
          relevance: calculateRelevance(q, f.title, f.summary)
        })))
        totalCount += count || 0
      }
    }

    // Search deals
    if (types.includes('deal')) {
      const { data, count } = await supabase
        .from('deals')
        .select('id, provider, product, price, price_cny, config, category, region, url, notes, is_active', { count: 'exact' })
        .or(`provider.ilike.${pattern},product.ilike.${pattern},config.ilike.${pattern},notes.ilike.${pattern}`)
        .eq('is_active', true)
        .order('price_cny', { ascending: order === 'asc', nullsFirst: false })
        .range(offset, offset + limit - 1)

      if (data) {
        results.push(...data.map(d => ({
          type: 'deal',
          id: d.id,
          title: `${d.provider} - ${d.product}`,
          desc: `${d.price} · ${d.config || d.category} · ${d.region || 'cn'}`,
          url: d.url || '/deals',
          time: null,
          price: d.price,
          price_cny: d.price_cny,
          category: d.category,
          relevance: calculateRelevance(q, `${d.provider} ${d.product}`, d.notes)
        })))
        totalCount += count || 0
      }
    }

    // Sort by relevance if requested
    if (sort === 'relevance') {
      results.sort((a, b) => order === 'desc' ? b.relevance - a.relevance : a.relevance - b.relevance)
    }

    // Format response for bot compatibility
    const response: any = {
      results: results.slice(0, limit),
      total: totalCount,
      page,
      limit,
      query: q,
      type: types,
      sort,
      order
    }

    // Add summary for bot
    if (isBot) {
      response.summary = {
        posts: results.filter(r => r.type === 'post').length,
        feeds: results.filter(r => r.type === 'feed').length,
        deals: results.filter(r => r.type === 'deal').length,
        top_results: results.slice(0, 3).map(r => ({
          type: r.type,
          title: r.title,
          url: r.url
        }))
      }
    }

    return new Response(JSON.stringify(response), { 
      headers: { 'Content-Type': 'application/json; charset=utf-8' } 
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ 
      error: err.message || 'Search failed',
      results: [],
      total: 0 
    }), { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  }
}

// Calculate relevance score
function calculateRelevance(query: string, title: string = '', content: string = ''): number {
  const q = query.toLowerCase()
  const t = title.toLowerCase()
  const c = (content || '').toLowerCase()
  
  let score = 0
  
  // Exact match in title (highest priority)
  if (t === q) score += 100
  // Title starts with query
  else if (t.startsWith(q)) score += 80
  // Title contains query
  else if (t.includes(q)) score += 60
  
  // Content contains query
  if (c.includes(q)) score += 20
  
  // Word boundary matches
  const words = q.split(/\s+/)
  words.forEach(word => {
    if (word && t.includes(word)) score += 10
    if (word && c.includes(word)) score += 2
  })
  
  return score
}
