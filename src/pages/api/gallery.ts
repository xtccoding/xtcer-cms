import { supabase } from '../../lib/supabase'

function isAuthenticated(cookies: any, request: Request, env: any): boolean {
  const cookieAuth = cookies?.get?.('admin_auth')?.value
  if (cookieAuth) return true
  const feedKey = request?.headers?.get?.('X-Feed-Key')
  const validKey = env?.FEED_API_KEY || import.meta.env.FEED_API_KEY
  if (feedKey && feedKey === validKey) return true
  return false
}

export async function GET({ cookies, request, locals, url }: { cookies: any; request: Request; locals: any; url: URL }) {
  if (!isAuthenticated(cookies, request, locals?.runtime?.env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  try {
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200)
    const offset = (page - 1) * limit
    const search = url.searchParams.get('q')?.trim()
    const tag = url.searchParams.get('tag')?.trim()
    const dateFrom = url.searchParams.get('from')
    const dateTo = url.searchParams.get('to')

    let query = supabase.from('assets').select('*', { count: 'exact' })

    // Search by filename or content_hash
    if (search) {
      query = query.or(`filename.ilike.%${search}%,content_hash.ilike.%${search}%`)
    }

    // Filter by tag
    if (tag) {
      query = query.contains('tags', [tag])
    }

    // Date range
    if (dateFrom) query = query.gte('created_at', dateFrom)
    if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59')

    const { data: files, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      return new Response(JSON.stringify({ error: error.message, code: error.code }), { status: 500 })
    }

    // Get all unique tags for filter UI
    const { data: allAssets } = await supabase.from('assets').select('tags')
    const allTags = [...new Set((allAssets || []).flatMap(a => a.tags || []))].sort()

    const totalSize = (files || []).reduce((sum, f) => sum + (f.size || 0), 0)

    return new Response(JSON.stringify({
      files: files || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
      totalSize,
      allTags,
    }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Gallery query failed' }), { status: 500 })
  }
}

export async function PUT({ request, cookies, locals }: { request: Request; cookies: any; locals: any }) {
  if (!isAuthenticated(cookies, request, locals?.runtime?.env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  try {
    const body = await request.json()
    const { id, tags } = body
    if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 })

    const { data, error } = await supabase
      .from('assets')
      .update({ tags: tags || [] })
      .eq('id', id)
      .select()
      .single()

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}

export async function DELETE({ request, cookies, locals }: { request: Request; cookies: any; locals: any }) {
  if (!isAuthenticated(cookies, request, locals?.runtime?.env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const env = locals?.runtime?.env || {}
  const accountId = env.R2_ACCOUNT_ID || import.meta.env.R2_ACCOUNT_ID
  const accessKeyId = env.R2_ACCESS_KEY_ID || import.meta.env.R2_ACCESS_KEY_ID
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY || import.meta.env.R2_SECRET_ACCESS_KEY
  const bucketName = env.R2_BUCKET_NAME || import.meta.env.R2_BUCKET_NAME || 'xtcer-assets'

  let key: string | null = null
  let id: string | null = null
  try { const body = await request.json(); key = body.key; id = body.id } catch {}
  if (!key && !id) return new Response(JSON.stringify({ error: 'Missing key or id' }), { status: 400 })

  try {
    if (accountId && accessKeyId && secretAccessKey && key) {
      const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3')
      const s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
      })
      await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }))
    }

    const query = supabase.from('assets').delete()
    if (id) { await query.eq('id', id) }
    else if (key) { await query.eq('key', key) }

    return new Response(JSON.stringify({ success: true }))
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Delete failed' }), { status: 500 })
  }
}
