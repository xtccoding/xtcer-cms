import rss from '@astrojs/rss'
import { supabase } from '../lib/supabase'

export async function GET() {
  const { data: posts } = await supabase
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false })

  return rss({
    title: 'XTCer',
    description: 'XTCer - 技术文章、云服务优惠、AI情报与安全漏洞实时推送',
    site: 'https://xtcer.cn',
    items: (posts || []).map(post => ({
      title: post.title,
      pubDate: new Date(post.created_at),
      description: (post.content || '').replace(/[#*_`~\[\]>|]/g, '').substring(0, 200),
      link: `/posts/${post.id}`,
    })),
    customData: '<language>zh-cn</language>',
  })
}
