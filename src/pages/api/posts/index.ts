import { countPosts, createPost, listPostsPage } from '../../../lib/store'
import { isAdminRequest } from '../../../lib/admin-auth'

export async function GET({ cookies, url, locals }: { cookies: any; url: URL; locals: any }) {
  if (!isAdminRequest(cookies, locals?.runtime?.env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'))
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20')))
  const offset = (page - 1) * limit

  try {
    const [total, data] = await Promise.all([countPosts(), listPostsPage(limit, offset)])
    const totalPages = Math.ceil(total / limit)
    return new Response(JSON.stringify({ data, total, page, totalPages }), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || '数据库错误' }), { status: 500 })
  }
}

export async function POST({ request, cookies, locals }: { request: Request; cookies: any; locals: any }) {
  if (!isAdminRequest(cookies, locals?.runtime?.env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const body = await request.json()
  const { title, content, summary, tags, author } = body

  if (!title) {
    return new Response(JSON.stringify({ error: 'Title is required' }), { status: 400 })
  }

  try {
    const data = await createPost({
      title,
      content: content || '',
      summary: summary || '',
      tags: Array.isArray(tags) ? tags : [],
      author: author || undefined,
    })
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || '数据库错误' }), { status: 500 })
  }
}
