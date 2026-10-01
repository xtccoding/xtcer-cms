import rss from '@astrojs/rss'
import { fetchAll } from '../lib/query'

export async function GET() {
  // 用 fetchAll 分页拉全量：PostgREST max-rows=1000 会截断，文章已 1041 篇。
  const posts = await fetchAll<{
    id: string
    title: string
    content: string | null
    created_at: string
  }>('posts', 'id, title, content, created_at', {
    order: { column: 'created_at', ascending: false },
  })

  return rss({
    title: 'XTCer',
    description: 'XTCer - 技术文章、云服务优惠、AI情报与安全漏洞实时推送',
    site: 'https://xtcer.cn',
    items: posts.map(post => ({
      title: post.title,
      pubDate: new Date(post.created_at),
      description: (post.content || '').replace(/[#*_`~\[\]>|]/g, '').substring(0, 200),
      link: `/posts/${post.id}`,
    })),
    customData: '<language>zh-cn</language>',
  })
}
