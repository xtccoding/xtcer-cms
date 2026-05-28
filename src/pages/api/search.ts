import { supabase } from '../../lib/supabase'

export async function GET({ url }: { url: URL }) {
  const q = url.searchParams.get('q')?.trim()
  if (!q || q.length < 2) {
    return new Response(JSON.stringify({ results: [] }), { headers: { 'Content-Type': 'application/json' } })
  }

  const pattern = `%${q}%`
  const limit = 20

  const [postsRes, feedsRes, dealsRes] = await Promise.all([
    supabase.from('posts').select('id, title, content, created_at').or(`title.ilike.${pattern},content.ilike.${pattern}`).limit(limit),
    supabase.from('feeds').select('id, feed_type, title, url, summary, created_at').or(`title.ilike.${pattern},summary.ilike.${pattern}`).limit(limit),
    supabase.from('deals').select('id, provider, product, price, config, category, url').or(`provider.ilike.${pattern},product.ilike.${pattern},config.ilike.${pattern},notes.ilike.${pattern}`).eq('is_active', true).limit(limit),
  ])

  const results = [
    ...(postsRes.data || []).map(p => ({
      type: 'post',
      id: p.id,
      title: p.title,
      desc: (p.content || '').replace(/[#*_`~\[\]>|]/g, '').substring(0, 100),
      url: `/posts/${p.id}`,
      time: p.created_at,
    })),
    ...(feedsRes.data || []).map(f => ({
      type: 'feed',
      id: f.id,
      title: f.title,
      desc: f.summary || f.feed_type,
      url: f.url || '#',
      time: f.created_at,
    })),
    ...(dealsRes.data || []).map(d => ({
      type: 'deal',
      id: d.id,
      title: `${d.provider} - ${d.product}`,
      desc: `${d.price} · ${d.config || d.category}`,
      url: d.url || '/deals',
      time: null,
    })),
  ]

  return new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json' } })
}
