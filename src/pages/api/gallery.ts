import { deleteAsset, deleteAssetByKey, queryAssets, updateAsset } from '../../lib/store'
import { isAdminRequest } from '../../lib/admin-auth'

export async function GET({ cookies, request, locals, url }: { cookies: any; request: Request; locals: any; url: URL }) {
  if (!isAdminRequest(cookies, locals?.runtime?.env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  try {
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200)
    const search = url.searchParams.get('q')?.trim()
    const tag = url.searchParams.get('tag')?.trim()
    const dateFrom = url.searchParams.get('from')
    const dateTo = url.searchParams.get('to')

    const { files, total, allTags, totalSize } = await queryAssets({
      page, limit, search, tag, dateFrom, dateTo,
    })

    return new Response(JSON.stringify({
      files,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      totalSize,
      allTags,
    }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Gallery query failed' }), { status: 500 })
  }
}

export async function PUT({ request, cookies, locals }: { request: Request; cookies: any; locals: any }) {
  if (!isAdminRequest(cookies, locals?.runtime?.env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  try {
    const body = await request.json()
    const { id, tags, filename } = body
    if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 })

    const updates: any = {}
    if (tags !== undefined) updates.tags = tags
    if (filename !== undefined) updates.filename = filename

    const data = await updateAsset(id, updates)
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}

export async function DELETE({ request, cookies, locals }: { request: Request; cookies: any; locals: any }) {
  if (!isAdminRequest(cookies, locals?.runtime?.env)) {
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

    if (id) await deleteAsset(id)
    else if (key) await deleteAssetByKey(key)

    return new Response(JSON.stringify({ success: true }))
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Delete failed' }), { status: 500 })
  }
}
