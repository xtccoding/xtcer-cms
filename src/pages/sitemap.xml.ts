import { supabase } from '../lib/supabase'

export async function GET() {
  const { data: posts } = await supabase
    .from('posts')
    .select('id, created_at')

  const staticPages = ['', 'about', 'contact', 'privacy', 'tos']

  const urls = [
    ...staticPages.map(p => `https://xtcer-enp.pages.dev/${p}`),
    ...(posts || []).map(p => `https://xtcer-enp.pages.dev/posts/${p.id}`),
  ]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url><loc>${url}</loc></url>`).join('\n')}
</urlset>`

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml' },
  })
}
