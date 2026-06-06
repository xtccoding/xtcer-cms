import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { supabase } from '../../../lib/supabase'

function randomSlug(len = 8): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'
  let s = ''
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

export async function POST({ request, locals }: { request: Request; locals: any }) {
  const env = locals?.runtime?.env || {}
  const validKey = env.UPLOAD_API_KEY || import.meta.env.UPLOAD_API_KEY
  if (!validKey) return new Response(JSON.stringify({ error: 'UPLOAD_API_KEY not configured' }), { status: 500 })

  const auth = request.headers.get('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth
  if (token !== validKey) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

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
    if (!file) return new Response(JSON.stringify({ error: 'No file' }), { status: 400 })
    if (file.size > 100 * 1024 * 1024) return new Response(JSON.stringify({ error: 'Max 100MB' }), { status: 400 })

    const customSlug = (formData.get('slug') as string || '').trim()
    const password = (formData.get('password') as string || '').trim() || null
    const expiresIn = parseInt(formData.get('expires') as string || '0')
    const slug = customSlug || randomSlug()

    const { data: existingSlug } = await supabase.from('files').select('id').eq('share_slug', slug).limit(1)
    if (existingSlug && existingSlug.length > 0) {
      return new Response(JSON.stringify({ error: 'Slug already exists' }), { status: 409 })
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

    const siteUrl = new URL(request.url).origin
    return new Response(JSON.stringify({
      ...inserted,
      share_url: `${siteUrl}/s/${slug}`,
    }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}

export async function DELETE({ request, locals }: { request: Request; locals: any }) {
  const env = locals?.runtime?.env || {}
  const validKey = env.UPLOAD_API_KEY || import.meta.env.UPLOAD_API_KEY
  if (!validKey) return new Response(JSON.stringify({ error: 'UPLOAD_API_KEY not configured' }), { status: 500 })

  const auth = request.headers.get('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth
  if (token !== validKey) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const accountId = env.R2_ACCOUNT_ID || import.meta.env.R2_ACCOUNT_ID
  const accessKeyId = env.R2_ACCESS_KEY_ID || import.meta.env.R2_ACCESS_KEY_ID
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY || import.meta.env.R2_SECRET_ACCESS_KEY
  const bucketName = env.R2_BUCKET_NAME || import.meta.env.R2_BUCKET_NAME || 'xtcer-assets'

  try {
    const { id, slug } = await request.json()
    if (!id && !slug) return new Response(JSON.stringify({ error: 'Provide id or slug' }), { status: 400 })

    let query = supabase.from('files').select('id, key')
    if (id) query = query.eq('id', id)
    else query = query.eq('share_slug', slug)
    const { data: file } = query.single ? await query.single() : await query.limit(1).maybeSingle()

    if (!file) return new Response(JSON.stringify({ error: 'File not found' }), { status: 404 })

    if (file.key && accountId && accessKeyId && secretAccessKey) {
      const s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
      })
      await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: file.key }))
    }

    await supabase.from('files').delete().eq('id', file.id)
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}
