import { fetchAll } from '../lib/query'

const SITE = 'https://xtcer.cn'

export async function GET() {
  // ⚠️ 必须用 fetchAll 分页拉取：PostgREST max-rows=1000 会把直接 select 静默截断，
  // 文章已 1041 篇 —— 之前 sitemap 里有 41 篇永远进不去。
  const posts = await fetchAll<{ id: string; created_at: string; tags: string[] | null }>(
    'posts',
    'id, created_at, tags',
    { order: { column: 'created_at', ascending: false } }
  )

  const feeds = await fetchAll<{ tags: string[] | null }>('feeds', 'tags')

  const staticPages = [
    { path: '', changefreq: 'daily', priority: '1.0' },
    { path: 'posts', changefreq: 'daily', priority: '0.9' },
    { path: 'deals', changefreq: 'daily', priority: '0.8' },
    { path: 'feeds', changefreq: 'daily', priority: '0.8' },
    { path: 'tags', changefreq: 'weekly', priority: '0.8' },
    { path: 'about', changefreq: 'monthly', priority: '0.5' },
    { path: 'contact', changefreq: 'monthly', priority: '0.5' },
    { path: 'privacy', changefreq: 'yearly', priority: '0.3' },
    { path: 'tos', changefreq: 'yearly', priority: '0.3' },
  ]

  const topicPages = ['ai', 'security', 'deals', 'github', 'crypto', 'tools']

  const allTags = new Set<string>()
  for (const post of posts || []) {
    for (const t of post.tags || []) allTags.add(t)
  }
  for (const feed of feeds || []) {
    for (const t of feed.tags || []) allTags.add(t)
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticPages.map(p => `  <url>
    <loc>${SITE}/${p.path}</loc>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n')}
${topicPages.map(t => `  <url>
    <loc>${SITE}/topics/${t}</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`).join('\n')}
${[...allTags].map(t => `  <url>
    <loc>${SITE}/tags/${encodeURIComponent(t.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, ''))}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`).join('\n')}
${(posts || []).map(p => `  <url>
    <loc>${SITE}/posts/${p.id}</loc>
    <lastmod>${new Date(p.created_at).toISOString()}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('\n')}
</urlset>`

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  })
}
