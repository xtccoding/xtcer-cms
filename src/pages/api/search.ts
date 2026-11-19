import { searchDeals, searchFeeds, searchPosts } from '../../lib/store'

export async function GET({ url, request }: { url: URL; request: Request }) {
  const q = url.searchParams.get('q')?.trim()
  const type = url.searchParams.get('type')?.trim()
  const page = parseInt(url.searchParams.get('page') || '1')
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100)
  const sort = url.searchParams.get('sort') || 'time'
  const order = url.searchParams.get('order') || 'desc'
  const format = url.searchParams.get('format') || 'json'
  
  const userAgent = request.headers.get('user-agent') || ''
  const isBot = /bot|crawler|spider|GPTBot|ChatGPT|CCBot|anthropic|Claude|Perplexity|YouBot|Bytespider/i.test(userAgent)
  
  if (!q || q.length < 2) {
    return new Response(JSON.stringify({ 
      results: [], 
      total: 0,
      page: 1,
      limit,
      query: q 
    }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  }

  const offset = (page - 1) * limit
  const types = type ? type.split(',') : ['post', 'feed', 'deal']
  const asc = order === 'asc'

  try {
    const results: any[] = []
    let totalCount = 0

    if (types.includes('post')) {
      const { rows, total } = await searchPosts(q, limit, offset, asc)
      results.push(...rows.map(p => ({
        type: 'post',
        id: p.id,
        title: p.title,
        desc: p.summary || (p.content || '').replace(/[#*_`~\[\]>|]/g, '').substring(0, 150),
        url: `/posts/${p.id}`,
        time: p.created_at,
        views: p.views || 0,
        tags: p.tags || [],
        relevance: calculateRelevance(q, p.title, p.content ?? undefined)
      })))
      totalCount += total
    }

    if (types.includes('feed')) {
      const { rows, total } = await searchFeeds(q, limit, offset, asc)
      results.push(...rows.map(f => ({
        type: 'feed',
        id: f.id,
        title: f.title,
        desc: f.summary || f.feed_type,
        url: f.url || '#',
        time: f.published_at || f.created_at,
        feed_type: f.feed_type,
        priority: f.priority ?? undefined,
        tags: f.tags || [],
        relevance: calculateRelevance(q, f.title, f.summary ?? undefined)
      })))
      totalCount += total
    }

    if (types.includes('deal')) {
      const { rows, total } = await searchDeals(q, limit, offset, asc)
      results.push(...rows.map(d => ({
        type: 'deal',
        id: d.id,
        title: `${d.provider} - ${d.product}`,
        desc: `${d.price} · ${d.config || d.category} · ${d.region || 'cn'}`,
        url: d.url || '/deals',
        time: null,
        price: d.price,
        price_cny: d.price_cny,
        category: d.category,
        relevance: calculateRelevance(q, `${d.provider} ${d.product}`, d.notes ?? undefined)
      })))
      totalCount += total
    }

    if (sort === 'relevance') {
      results.sort((a, b) => order === 'desc' ? b.relevance - a.relevance : a.relevance - b.relevance)
    } else {
      results.sort((a, b) => {
        const timeA = a.time ? new Date(a.time).getTime() : 0
        const timeB = b.time ? new Date(b.time).getTime() : 0
        return order === 'desc' ? timeB - timeA : timeA - timeB
      })
    }

    const sliced = results.slice(0, limit)

    // Structured JSON-LD response for AI crawlers
    if (format === 'jsonld' || isBot) {
      const jsonld = {
        "@context": "https://schema.org",
        "@type": "SearchResultsPage",
        "query": q,
        "totalResults": totalCount,
        "currentPage": page,
        "resultsPerPage": limit,
        "dateModified": new Date().toISOString(),
        "publisher": {
          "@type": "Organization",
          "name": "XTCer",
          "url": "https://xtcer.cn"
        },
        "about": {
          "@type": "Thing",
          "name": q
        },
        "hasPart": sliced.map(r => {
          if (r.type === 'post') {
            return {
              "@type": "Article",
              "headline": r.title,
              "description": r.desc,
              "url": `https://xtcer.cn${r.url}`,
              "datePublished": r.time,
              "keywords": (r.tags || []).join(', '),
              "interactionStatistic": {
                "@type": "InteractionCounter",
                "interactionType": "https://schema.org/ReadAction",
                "userInteractionCount": r.views
              }
            }
          }
          if (r.type === 'feed') {
            return {
              "@type": "NewsArticle",
              "headline": r.title,
              "description": r.desc,
              "url": r.url.startsWith('http') ? r.url : `https://xtcer.cn${r.url}`,
              "datePublished": r.time,
              "keywords": (r.tags || []).join(', '),
              "articleSection": r.feed_type
            }
          }
          return {
            "@type": "Product",
            "name": r.title,
            "description": r.desc,
            "url": r.url.startsWith('http') ? r.url : `https://xtcer.cn${r.url}`,
            "offers": r.price ? {
              "@type": "Offer",
              "price": r.price_cny || 0,
              "priceCurrency": "CNY",
              "description": r.price
            } : undefined
          }
        })
      }

      return new Response(JSON.stringify(jsonld), { 
        headers: { 
          'Content-Type': 'application/ld+json; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        } 
      })
    }

    // Standard JSON response
    const response: any = {
      results: sliced,
      total: totalCount,
      page,
      limit,
      query: q,
      type: types,
      sort,
      order,
      _links: {
        self: `/api/search?q=${encodeURIComponent(q)}&page=${page}&limit=${limit}`,
        next: sliced.length === limit ? `/api/search?q=${encodeURIComponent(q)}&page=${page + 1}&limit=${limit}` : null,
        jsonld: `/api/search?q=${encodeURIComponent(q)}&page=${page}&limit=${limit}&format=jsonld`
      }
    }

    return new Response(JSON.stringify(response), { 
      headers: { 
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      } 
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ 
      error: err.message || 'Search failed',
      results: [],
      total: 0 
    }), { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  }
}

function calculateRelevance(query: string, title: string = '', content: string = ''): number {
  const q = query.toLowerCase()
  const t = title.toLowerCase()
  const c = (content || '').toLowerCase()
  
  let score = 0
  
  if (t === q) score += 100
  else if (t.startsWith(q)) score += 80
  else if (t.includes(q)) score += 60
  
  if (c.includes(q)) score += 20
  
  const words = q.split(/\s+/)
  words.forEach(word => {
    if (word && t.includes(word)) score += 10
    if (word && c.includes(word)) score += 2
  })
  
  return score
}
