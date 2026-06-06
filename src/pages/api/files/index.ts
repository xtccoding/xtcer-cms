import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { supabase } from '../../../lib/supabase'

function isAuthenticated(cookies: any, request: Request, env: any): boolean {
  const cookieAuth = cookies?.get?.('admin_auth')?.value
  if (cookieAuth) return true
  return false
}

function randomSlug(len = 8): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'
  let s = ''
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

export async function GET({ cookies, request, locals, url }: { cookies: any; request: Request; locals: any; url: URL }) {
  if (!isAuthenticated(cookies, request, locals?.runtime?.env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  try {
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200)
    const offset = (page - 1) * limit
    const q = (url.searchParams.get('q') || '').trim()

    let query = supabase
      .from('files')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (q) query = query.ilike('filename', `%${q}%`)

    const { data: files, count, error } = await query

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

    return new Response(JSON.stringify({
      files: files || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}

export async function POST({ request, cookies, locals }: { request: Request; cookies: any; locals: any }) {
  if (!isAuthenticated(cookies, request, locals?.runtime?.env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const env = locals?.runtime?.env || {}
  const accountId = env.R2_ACCOUNT_ID || import.meta.env.R2_ACCOUNT_ID
  const accessKeyId = env.R2_ACCESS_KEY_ID || import.meta.env.R2_ACCESS_KEY_ID
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY || import.meta.env.R2_SECRET_ACCESS_KEY
  const bucketName = env.R2_BUCKET_NAME || import.meta.env.R2_BUCKET_NAME || 'xtcer-assets'
  const publicUrl = env.R2_PUBLIC_URL || import.meta.env.R2_PUBLIC_URL || 'https://oss.xtcer.cn'

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return new Response(JSON.stringify({ error: 'R2 not configured' }), { status: 500 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const customSlug = (formData.get('slug') as string || '').trim()
    const password = (formData.get('password') as string || '').trim() || null
    const expiresIn = parseInt(formData.get('expires') as string || '0')

    if (!file) return new Response(JSON.stringify({ error: 'No file' }), { status: 400 })
    if (file.size > 100 * 1024 * 1024) return new Response(JSON.stringify({ error: 'Max 100MB' }), { status: 400 })

    const slug = customSlug || randomSlug()

    // Check slug uniqueness
    const { data: existingSlug } = await supabase.from('files').select('id').eq('share_slug', slug).limit(1)
    if (existingSlug && existingSlug.length > 0) {
      return new Response(JSON.stringify({ error: 'Slug already exists, choose another' }), { status: 409 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
    const hash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 12)
    const ext = file.name.split('.').pop() || 'bin'
    const key = `files/${hash}.${ext}`

    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    })

    await s3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: new Uint8Array(arrayBuffer),
      ContentType: file.type || 'application/octet-stream',
      CacheControl: 'public, max-age=31536000',
      ContentDisposition: `inline; filename="${file.name}"`,
    }))

    const url = `${publicUrl}/${key}`
    const expiresAt = expiresIn > 0 ? new Date(Date.now() + expiresIn * 3600000).toISOString() : null

    const { data: inserted, error: insertError } = await supabase.from('files').insert({
      key,
      url,
      filename: file.name,
      content_type: file.type || 'application/octet-stream',
      size: file.size,
      share_slug: slug,
      password,
      expires_at: expiresAt,
    }).select().single()

    if (insertError) return new Response(JSON.stringify({ error: insertError.message }), { status: 500 })

    return new Response(JSON.stringify(inserted), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}

export async function PUT({ request, cookies, locals }: { request: Request; cookies: any; locals: any }) {
  if (!isAuthenticated(cookies, request, locals?.runtime?.env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  try {
    const body = await request.json()
    const { id, share_slug, password, expires_at } = body
    if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 })

    const updates: any = {}
    if (share_slug !== undefined) {
      const { data: existing } = await supabase.from('files').select('id').eq('share_slug', share_slug).neq('id', id).limit(1)
      if (existing && existing.length > 0) {
        return new Response(JSON.stringify({ error: 'Slug already exists' }), { status: 409 })
      }
      updates.share_slug = share_slug
    }
    if (password !== undefined) updates.password = password || null
    if (expires_at !== undefined) updates.expires_at = expires_at || null

    const { data, error } = await supabase.from('files').update(updates).eq('id', id).select().single()
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

  try {
    const { id } = await request.json()
    if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 })

    const { data: file } = await supabase.from('files').select('key').eq('id', id).single()
    if (file?.key && accountId && accessKeyId && secretAccessKey) {
      const s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
      })
      await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: file.key }))
    }

    await supabase.from('files').delete().eq('id', id)
    return new Response(JSON.stringify({ success: true }))
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}
