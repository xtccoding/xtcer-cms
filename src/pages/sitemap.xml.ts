import { supabase } from '../lib/supabase'

const SITE = 'https://xtcer.cn'

export async function GET() {
  const { data: posts } = await supabase
    .from('posts')
    .select('id, created_at, tags')

  const { data: deals } = await supabase
    .from('deals')
    .select('id')

  const { data: feeds } = await supabase
    .from('feeds')
    .select('tags')

  const staticPages = [
    { path: '', changefreq: 'daily', priority: '1.0' },
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
