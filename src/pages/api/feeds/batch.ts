import { supabase } from '../../../lib/supabase'

function isAuthenticated(cookies: any, request: Request): boolean {
  const cookieAuth = cookies.get('admin_auth')
  if (cookieAuth) return true
  const feedKey = request.headers.get('X-Feed-Key')
  if (feedKey && feedKey === import.meta.env.FEED_API_KEY) return true
  return false
}

function normalizeUrl(url: string): string {
  return url
    .replace(/\/$/, '')
    .replace(/#\w+$/, '')
    .replace(/\?.*$/, '')
    .toLowerCase()
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
  const { feeds } = body
  if (!Array.isArray(feeds) || feeds.length === 0) {
    return new Response(JSON.stringify({ error: 'feeds array required' }), { status: 400 })
  }

  const oneDayAgo = new Date(Date.now() - 86400000).toISOString()
  const results = { inserted: 0, updated: 0, skipped: 0 }

  for (const item of feeds) {
    const { feed_type, title, url: feedUrl, source, priority, metadata } = item
    if (!feed_type || !title) { results.skipped++; continue }

    const insertData: any = {
      feed_type, title, source,
      priority: priority || 'normal',
      metadata: metadata || {},
      updated_at: new Date().toISOString(),
    }
    if (feedUrl) {
      insertData.url = feedUrl
      insertData.normalized_url = normalizeUrl(feedUrl)
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

    // Layer 2: URL normalized dedup
    if (insertData.normalized_url) {
      const { data: existing } = await supabase
        .from('feeds')
        .select('id')
        .eq('feed_type', feed_type)
        .eq('normalized_url', insertData.normalized_url)
        .limit(1)

      if (existing && existing.length > 0) {
        await supabase.from('feeds').update({
          ...insertData, updated_at: new Date().toISOString()
        }).eq('id', existing[0].id)
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
            source: source ? `${source}` : r.source,
            metadata: { ...(r as any).metadata, ...metadata },
            updated_at: new Date().toISOString(),
          }).eq('id', r.id)
          results.updated++
          merged = true
          break
        }
      }
    }

    if (!merged) {
      const { error: insertErr } = await supabase.from('feeds').insert(insertData)
      if (insertErr) results.skipped++
      else results.inserted++
    }
  }

  return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } })
}
