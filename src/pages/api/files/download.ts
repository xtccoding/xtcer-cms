import { incrementFileDownloads } from '../../../lib/store'

async function incrementDownloads(slug: string) {
  // D1 没有 PostgREST 的 RPC，直接 UPDATE 计数即可；文件表只在本端点自增。
  await incrementFileDownloads(slug)
}

export async function POST({ request }: { request: Request }) {
  try {
    const { slug } = await request.json()
    if (!slug) return new Response(JSON.stringify({ error: 'Missing slug' }), { status: 400 })

    await incrementDownloads(slug)

    return new Response(JSON.stringify({ success: true }))
  } catch {
    return new Response(JSON.stringify({ success: true }))
  }
}
