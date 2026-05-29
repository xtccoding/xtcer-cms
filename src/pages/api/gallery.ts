import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3'

function isAuthenticated(cookies: any, request: Request, env: any): boolean {
  const cookieAuth = cookies.get('admin_auth')
  if (cookieAuth) return true
  const feedKey = request.headers.get('X-Feed-Key')
  const validKey = env?.FEED_API_KEY || import.meta.env.FEED_API_KEY
  if (feedKey && feedKey === validKey) return true
  return false
}

export async function GET({ cookies, locals, url }: { cookies: any; locals: any; url: URL }) {
  if (!isAuthenticated(cookies, new Request(''), locals?.runtime?.env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const env = locals?.runtime?.env || {}
  const accountId = env.R2_ACCOUNT_ID || import.meta.env.R2_ACCOUNT_ID
  const accessKeyId = env.R2_ACCESS_KEY_ID || import.meta.env.R2_ACCESS_KEY_ID
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY || import.meta.env.R2_SECRET_ACCESS_KEY
  const bucketName = env.R2_BUCKET_NAME || import.meta.env.R2_BUCKET_NAME || 'xtcer-assets'
  const publicUrl = env.R2_PUBLIC_URL || import.meta.env.R2_PUBLIC_URL || 'https://img.xtcer.cn'

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return new Response(JSON.stringify({ error: 'R2 not configured', missing: { accountId: !accountId, accessKeyId: !accessKeyId, secretAccessKey: !secretAccessKey } }), { status: 500 })
  }

  try {
    const prefix = url.searchParams.get('prefix') || 'uploads/'
    const continuationToken = url.searchParams.get('token') || undefined
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200)

    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    })

    const { Contents, IsTruncated, NextContinuationToken } = await s3.send(new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
      MaxKeys: limit,
      ContinuationToken: continuationToken,
    }))

    const files = (Contents || []).map(obj => ({
      key: obj.Key,
      url: `${publicUrl}/${obj.Key}`,
      size: obj.Size,
      lastModified: obj.LastModified,
    }))

    return new Response(JSON.stringify({
      files,
      hasMore: IsTruncated,
      nextToken: NextContinuationToken,
    }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'R2 query failed' }), { status: 500 })
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

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return new Response(JSON.stringify({ error: 'R2 not configured' }), { status: 500 })
  }

  let key: string | null = null
  try { const body = await request.json(); key = body.key } catch {}
  if (!key) return new Response(JSON.stringify({ error: 'Missing key' }), { status: 400 })

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })

  await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }))

  return new Response(JSON.stringify({ success: true }))
}
