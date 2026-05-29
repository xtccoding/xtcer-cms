import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'

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

    // Content hash for deduplication
    const hash = await sha256(arrayBuffer)
    const hashShort = hash.substring(0, 12)
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const key = `uploads/${hashShort}.${ext}`

    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    })

    // Check if file already exists (dedup)
    let existed = false
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }))
      existed = true
    } catch {
      // Not found, will upload
    }

    if (!existed) {
      await s3.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: uint8Array,
        ContentType: file.type,
        CacheControl: 'public, max-age=31536000',
        Metadata: {
          'original-name': encodeURIComponent(file.name),
          'content-hash': hash,
        },
      }))
    }

    const url = `${publicUrl}/${key}`

    return new Response(JSON.stringify({
      url,
      key,
      size: file.size,
      hash,
      deduplicated: existed,
    }), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Upload failed' }), { status: 500 })
  }
}
