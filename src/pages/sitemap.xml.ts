import { supabase } from '../lib/supabase'

const SITE = 'https://xtcer.cn'

export async function GET() {
  const { data: posts } = await supabase
    .from('posts')
    .select('id, created_at')

  const { data: deals } = await supabase
    .from('deals')
    .select('id')

  const staticPages = [
    { path: '', changefreq: 'daily', priority: '1.0' },
    { path: 'deals', changefreq: 'daily', priority: '0.8' },
    { path: 'feeds', changefreq: 'daily', priority: '0.8' },
    { path: 'about', changefreq: 'monthly', priority: '0.5' },
    { path: 'contact', changefreq: 'monthly', priority: '0.5' },
    { path: 'privacy', changefreq: 'yearly', priority: '0.3' },
    { path: 'tos', changefreq: 'yearly', priority: '0.3' },
  ]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticPages.map(p => `  <url>
    <loc>${SITE}/${p.path}</loc>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
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
