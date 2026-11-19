import rss from '@astrojs/rss'
import { listAllPosts } from '../lib/store'

export async function GET() {
  // D1 没有 PostgREST 的 max-rows 截断，直接全量取即可。
  const posts = await listAllPosts()

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
