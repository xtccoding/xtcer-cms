function isAuthenticated(cookies: any, request: Request, env: any): boolean {
  const cookieAuth = cookies.get('admin_auth')
  if (cookieAuth) return true
  const feedKey = request.headers.get('X-Feed-Key')
  const validKey = env?.FEED_API_KEY || import.meta.env.FEED_API_KEY
  if (feedKey && feedKey === validKey) return true
  return false
}

async function r2Fetch(path: string, env: any, method = 'GET', body?: string) {
  const accountId = env.R2_ACCOUNT_ID || import.meta.env.R2_ACCOUNT_ID
  const accessKeyId = env.R2_ACCESS_KEY_ID || import.meta.env.R2_ACCESS_KEY_ID
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY || import.meta.env.R2_SECRET_ACCESS_KEY
  const bucketName = env.R2_BUCKET_NAME || import.meta.env.R2_BUCKET_NAME || 'xtcer-assets'

  // S3v4 signing is complex, use Cloudflare API token instead
  const token = env.R2_API_TOKEN || import.meta.env.R2_API_TOKEN || env.CLOUDFLARE_API_TOKEN || import.meta.env.CLOUDFLARE_API_TOKEN

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/objects${path}`

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  return fetch(url, { method, headers, body })
}

export async function GET({ cookies, locals, url }: { cookies: any; locals: any; url: URL }) {
  if (!isAuthenticated(cookies, new Request(''), locals?.runtime?.env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const env = locals?.runtime?.env || {}
  const accountId = env.R2_ACCOUNT_ID || import.meta.env.R2_ACCOUNT_ID
  const publicUrl = env.R2_PUBLIC_URL || import.meta.env.R2_PUBLIC_URL || 'https://img.xtcer.cn'

  if (!accountId) {
    return new Response(JSON.stringify({ error: 'R2_ACCOUNT_ID not configured' }), { status: 500 })
  }

  try {
    // List objects using S3 API via signed requests
    // Since Cloudflare Workers can't easily do S3v4 signing,
    // we'll use a simpler approach with the R2 public bucket listing
    const bucketName = env.R2_BUCKET_NAME || import.meta.env.R2_BUCKET_NAME || 'xtcer-assets'
    const endpoint = `https://${accountId}.r2.cloudflarestorage.com`

    // Use ListObjectsV2 with query string (S3-compatible)
    const listUrl = `${endpoint}/${bucketName}?list-type=2&prefix=uploads/&max-keys=100`

    // For now, return empty with instructions
    return new Response(JSON.stringify({
      files: [],
      info: 'R2 listing requires S3 signing. Use the upload API to add images, they will appear here once listed.',
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
  const bucketName = env.R2_BUCKET_NAME || import.meta.env.R2_BUCKET_NAME || 'xtcer-assets'

  if (!accountId) {
    return new Response(JSON.stringify({ error: 'R2_ACCOUNT_ID not configured' }), { status: 500 })
  }

  let key: string | null = null
  try { const body = await request.json(); key = body.key } catch {}
  if (!key) return new Response(JSON.stringify({ error: 'Missing key' }), { status: 400 })

  try {
    const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${key}`
    // Delete requires S3 signing, return info for now
    return new Response(JSON.stringify({ error: 'Delete requires S3 API token configuration' }), { status: 501 })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Delete failed' }), { status: 500 })
  }
}
