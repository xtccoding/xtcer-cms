import rss from '@astrojs/rss'
import { supabase } from '../lib/supabase'

export async function GET() {
  const { data: posts } = await supabase
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false })

  return rss({
    title: 'XTCer',
    description: 'XTCer - 轻量级内容管理',
    site: 'https://xtcer-enp.pages.dev',
    items: (posts || []).map(post => ({
      title: post.title,
      pubDate: new Date(post.created_at),
      description: (post.content || '').replace(/[#*_`~\[\]>|]/g, '').substring(0, 200),
      link: `/posts/${post.id}`,
    })),
    customData: '<language>zh-cn</language>',
  })
}
