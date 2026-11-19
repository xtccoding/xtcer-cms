import { incrementPostViews } from '../../../lib/store'

export async function POST({ request }: { request: Request }) {
  const { id } = await request.json()

  if (!id) {
    return new Response(JSON.stringify({ error: 'id required' }), { status: 400 })
  }

  try {
    const views = await incrementPostViews(id)
    if (views === null) {
      return new Response(JSON.stringify({ error: 'id required' }), { status: 404 })
    }
    return new Response(JSON.stringify({ views }))
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || '数据库错误' }), { status: 500 })
  }
}
