import { supabase } from '../../../lib/supabase'

function isAuthenticated(cookies: any, request: Request): boolean {
  const cookieAuth = cookies.get('admin_auth')
  if (cookieAuth) return true
  const feedKey = request.headers.get('X-Feed-Key')
  if (feedKey && feedKey === process.env.FEED_API_KEY) return true
  return false
}

function normalizeUrl(url: string): string {
  return url.replace(/\/$/, '').replace(/#\w+$/, '').replace(/\?.*$/, '').toLowerCase()
}

function urlHash(url: string): string {
  let hash = 0
  const normalized = normalizeUrl(url)
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash) + normalized.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

function extractKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff\s]/g, '').split(/\s+/).filter(w => w.length > 2).sort().join(' ')
}

function similarity(a: string, b: string): number {
  const setA = new Set(extractKey(a).split(' '))
  const setB = new Set(extractKey(b).split(' '))
  const intersection = [...setA].filter(x => setB.has(x))
  return intersection.length / Math.max(setA.size, setB.size, 1)
}

export async function POST({ request, cookies }: { request: Request; cookies: any }) {
  if (!isAuthenticated(cookies, request)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const body = await request.json()

  // Support both formats:
  // Hermes: { type: "ai_monetization", items: [...] }
  // Legacy: { feeds: [...] }
  let feedType: string | null = null
  let items: any[] = []

  if (body.type && Array.isArray(body.items)) {
    feedType = body.type
    items = body.items
  } else if (Array.isArray(body.feeds)) {
    items = body.feeds
  } else {
    return new Response(JSON.stringify({ error: 'Expected { type, items } or { feeds }' }), { status: 400 })
  }

  const oneDayAgo = new Date(Date.now() - 86400000).toISOString()
  const results = { inserted: 0, updated: 0, skipped: 0, errors: [] as string[] }

  for (const item of items) {
    const feed_type = feedType || item.feed_type
    const { title, url: feedUrl, source, summary, tags, priority, metadata, published_at } = item
    if (!feed_type || !title) { results.skipped++; continue }

    const now = new Date().toISOString()
    const insertData: any = {
      feed_type, title, source, summary, tags,
      priority: priority || 'normal',
      metadata: metadata || {},
      published_at: published_at || now,
      updated_at: now,
    }
    if (feedUrl) {
      insertData.url = feedUrl
      insertData.normalized_url = normalizeUrl(feedUrl)
      insertData.url_hash = urlHash(feedUrl)
    }

    // Layer 1: UNIQUE(feed_type, title) upsert
    const { data, error } = await supabase
      .from('feeds')
      .upsert(insertData, { onConflict: 'feed_type,title' })
      .select()

    if (!error && data && data.length > 0) {
      results.inserted++
      continue
    }

    // Layer 2: url_hash dedup
    if (insertData.url_hash) {
      const { data: existing } = await supabase
        .from('feeds')
        .select('id')
        .eq('feed_type', feed_type)
        .eq('url_hash', insertData.url_hash)
        .limit(1)

      if (existing && existing.length > 0) {
        await supabase.from('feeds').update({ ...insertData, updated_at: now }).eq('id', existing[0].id)
        results.updated++
        continue
      }
    }

    // Layer 3: Title fuzzy match (same feed_type, last 24h)
    const { data: recent } = await supabase
      .from('feeds')
      .select('id, title')
      .eq('feed_type', feed_type)
      .gte('created_at', oneDayAgo)
      .limit(100)

    let merged = false
    if (recent) {
      for (const r of recent) {
        if (similarity(r.title, title) > 0.6) {
          await supabase.from('feeds').update({
            summary: summary || (r as any).summary,
            tags: tags || (r as any).tags,
            updated_at: now,
          }).eq('id', r.id)
          results.updated++
          merged = true
          break
        }
      }
    }

    if (!merged) {
      const { error: insertErr } = await supabase.from('feeds').insert(insertData)
      if (insertErr) { results.skipped++; results.errors.push(insertErr.message) }
      else results.inserted++
    }
  }

  return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } })
}
