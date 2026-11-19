import { createFeed, findFeedByUrlHash, listRecentFeedsOfType, updateFeed, upsertFeed } from '../../../lib/store'
import { isAdminOrFeedRequest } from '../../../lib/admin-auth'

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

export async function POST({ request, cookies, locals }: { request: Request; cookies: any; locals: any }) {
  if (!isAdminOrFeedRequest(cookies, request, locals?.runtime?.env)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

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
    }
    if (feedUrl) {
      insertData.url = feedUrl
      insertData.normalized_url = normalizeUrl(feedUrl)
      insertData.url_hash = urlHash(feedUrl)
    }

    try {
      // Layer 1: UNIQUE(feed_type, title) upsert
      await upsertFeed(insertData)
      results.inserted++
      continue
    } catch {
      // 落到下一层去重逻辑
    }

    try {
      // Layer 2: url_hash dedup
      if (insertData.url_hash) {
        const existing = await findFeedByUrlHash(feed_type, insertData.url_hash)
        if (existing) {
          await updateFeed(existing.id, { ...insertData, updated_at: now })
          results.updated++
          continue
        }
      }

      // Layer 3: Title fuzzy match (same feed_type, last 24h)
      const recent = await listRecentFeedsOfType(feed_type, oneDayAgo, 100)

      let merged = false
      for (const r of recent) {
        if (similarity(r.title, title) > 0.6) {
          await updateFeed(r.id, {
            summary: summary || r.summary,
            tags: tags || r.tags,
            updated_at: now,
          })
          results.updated++
          merged = true
          break
        }
      }

      if (!merged) {
        await createFeed(insertData)
        results.inserted++
      }
    } catch (e: any) {
      results.skipped++
      results.errors.push(e?.message || 'unknown error')
    }
  }

  return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
}
