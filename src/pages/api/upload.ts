import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { supabase } from '../../lib/supabase'

function isAuthenticated(cookies: any, request: Request, env: any): boolean {
  const cookieAuth = cookies.get('admin_auth')
  if (cookieAuth) return true
  const feedKey = request.headers.get('X-Feed-Key')
  const validKey = env?.FEED_API_KEY || import.meta.env.FEED_API_KEY
  if (feedKey && feedKey === validKey) return true
  return false
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
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
  const publicUrl = env.R2_PUBLIC_URL || import.meta.env.R2_PUBLIC_URL || 'https://img.xtcer.cn'

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return new Response(JSON.stringify({ error: 'R2 not configured' }), { status: 500 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), { status: 400 })
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
    if (!allowedTypes.includes(file.type)) {
      return new Response(JSON.stringify({ error: 'Invalid file type. Allowed: JPG, PNG, GIF, WebP, SVG' }), { status: 400 })
    }

    if (file.size > 10 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'File too large. Max 10MB' }), { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)

    const hash = await sha256(arrayBuffer)
    const hashShort = hash.substring(0, 12)
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const key = `uploads/${hashShort}.${ext}`

    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    })

    // Dedup: check if hash already exists in Supabase
    const { data: existing } = await supabase
      .from('assets')
      .select('url, key')
      .eq('content_hash', hash)
      .limit(1)

    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({
        url: existing[0].url,
        key: existing[0].key,
        size: file.size,
        hash,
        deduplicated: true,
      }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
    }

    // Upload to R2
    await s3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: uint8Array,
      ContentType: file.type,
      CacheControl: 'public, max-age=31536000',
    }))

    const url = `${publicUrl}/${key}`
    let thumbnailUrl: string | null = null

    // Handle thumbnail upload
    const thumbFile = formData.get('thumbnail') as File | null
    if (thumbFile && thumbFile.size > 0) {
      const thumbKey = `thumbs/${hashShort}.webp`
      const thumbBuffer = new Uint8Array(await thumbFile.arrayBuffer())
      await s3.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: thumbKey,
        Body: thumbBuffer,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000',
      }))
      thumbnailUrl = `${publicUrl}/${thumbKey}`
    }

    // Save metadata to Supabase (only hash-based key, no original filename)
    await supabase.from('assets').insert({
      key,
      url,
      thumbnail_url: thumbnailUrl,
      filename: `${hashShort}.${ext}`,
      content_type: file.type,
      size: file.size,
      content_hash: hash,
    })

    return new Response(JSON.stringify({
      url,
      key,
      thumbnail_url: thumbnailUrl,
      size: file.size,
      hash,
      deduplicated: false,
    }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Upload failed' }), { status: 500 })
  }
}
