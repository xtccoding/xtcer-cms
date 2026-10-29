import { AwsClient } from 'aws4fetch'
import { createAdminClient } from '../../../lib/supabase-admin'
import { isAdminRequest } from '../../../lib/admin-auth'

/**
 * 大文件分片上传（R2 / S3 Multipart Upload）。
 *
 * 为什么不用 @aws-sdk/client-s3：Worker 里整个文件读进内存会撞 128MB 上限
 * （实测 30MB 通过、50MB 起 `error code: 1102` / HTTP 503）。
 *
 * 为什么不用 SDK 的 Multipart 命令：SDK 检测到 `fetch` 存在就把环境当浏览器，
 * 用 `DOMParser` 解析 S3 的 XML 响应；Workers 没有 DOMParser，补了之后又缺
 * `Node` 常量 —— 在 Workers 上给 SDK 补 DOM 是个无底洞。改用 aws4fetch 只做
 * SigV4 签名、拿原生 Response，UploadId 用正则从 XML 里取，零 DOM 依赖。
 *
 * 协议（三步，全部要求后台登录态）：
 *   POST {action:'init', ...}                 -> { key, uploadId, slug, chunkSize }
 *   PUT  ?key=&uploadId=&part=N  (二进制片)    -> { etag }
 *   POST {action:'complete', ...}             -> files 表记录
 *   POST {action:'abort', key, uploadId}      -> 失败时清理未完成分片
 */

const CHUNK_SIZE = 8 * 1024 * 1024 // 8MB，S3 要求除最后一片外 ≥5MB
const MAX_SIZE = 500 * 1024 * 1024
// key 只允许本端点生成的形态，避免调用方伪造 key 覆盖/删除其它对象
const KEY_RE = /^files\/[a-z0-9]{8,40}\.[a-z0-9]{1,12}$/i

function randomSlug(len = 8): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'
  let s = ''
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function r2Config(locals: any) {
  const env = locals?.runtime?.env || {}
  const accountId = env.R2_ACCOUNT_ID || import.meta.env.R2_ACCOUNT_ID
  const accessKeyId = env.R2_ACCESS_KEY_ID || import.meta.env.R2_ACCESS_KEY_ID
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY || import.meta.env.R2_SECRET_ACCESS_KEY
  const bucket = env.R2_BUCKET_NAME || import.meta.env.R2_BUCKET_NAME || 'xtcer-assets'
  const publicUrl = env.R2_PUBLIC_URL || import.meta.env.R2_PUBLIC_URL || 'https://oss.xtcer.cn'
  if (!accountId || !accessKeyId || !secretAccessKey) return null

  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: 's3',
    region: 'auto',
  })
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucket}`
  return { client, endpoint, bucket, publicUrl }
}

/** key 里的 `/` 要保留，其余段按需编码 */
function objectUrl(endpoint: string, key: string, query = ''): string {
  const path = key.split('/').map(encodeURIComponent).join('/')
  return `${endpoint}/${path}${query}`
}

function xmlTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  return m ? m[1].trim() : null
}

/** RFC 5987 编码文件名，避免中文直接塞进头里触发 ByteString 错误 */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\\r\n]/g, '_')
  const encoded = encodeURIComponent(filename)
  return `inline; filename="${ascii}"; filename*=UTF-8''${encoded}`
}

export async function POST({ request, cookies, locals }: { request: Request; cookies: any; locals: any }) {
  if (!isAdminRequest(cookies, locals?.runtime?.env)) return json({ error: 'Unauthorized' }, 401)

  const cfg = r2Config(locals)
  if (!cfg) return json({ error: 'R2 not configured' }, 500)
  const supabase = createAdminClient(locals?.runtime?.env)
  if (!supabase) return json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, 500)

  let body: any
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const action = body.action

  try {
    if (action === 'init') {
      const filename = String(body.filename || '').trim()
      const size = Number(body.size || 0)
      const contentType = String(body.contentType || 'application/octet-stream')
      if (!filename) return json({ error: 'Missing filename' }, 400)
      if (!Number.isFinite(size) || size <= 0) return json({ error: 'Invalid size' }, 400)
      if (size > MAX_SIZE) return json({ error: `Max ${MAX_SIZE / 1024 / 1024}MB` }, 400)

      const customSlug = String(body.slug || '').trim()
      const slug = customSlug || randomSlug()
      const { data: existing } = await supabase.from('files').select('id').eq('share_slug', slug).limit(1)
      if (existing && existing.length > 0) return json({ error: 'Slug already exists, choose another' }, 409)

      const ext =
        (filename.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'bin'
      const key = `files/${Date.now().toString(36)}${randomSlug(8)}.${ext}`

      const res = await cfg.client.fetch(objectUrl(cfg.endpoint, key, '?uploads'), {
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000',
          'Content-Disposition': contentDisposition(filename),
        },
      })
      const xml = await res.text()
      if (!res.ok) return json({ error: `Init failed: ${res.status} ${xml.slice(0, 200)}` }, 500)

      const uploadId = xmlTag(xml, 'UploadId')
      if (!uploadId) return json({ error: `No UploadId in response: ${xml.slice(0, 200)}` }, 500)

      return json({ key, uploadId, slug, chunkSize: CHUNK_SIZE })
    }

    if (action === 'complete') {
      const key = String(body.key || '')
      const uploadId = String(body.uploadId || '')
      const parts = Array.isArray(body.parts) ? body.parts : []
      if (!KEY_RE.test(key)) return json({ error: 'Invalid key' }, 400)
      if (!uploadId) return json({ error: 'Missing uploadId' }, 400)
      if (parts.length === 0) return json({ error: 'Missing parts' }, 400)

      const partsXml = parts
        .map((p: any) => ({ PartNumber: Number(p.PartNumber), ETag: String(p.ETag || '') }))
        .sort((a: any, b: any) => a.PartNumber - b.PartNumber)
        .map((p: any) => `<Part><PartNumber>${p.PartNumber}</PartNumber><ETag>${p.ETag}</ETag></Part>`)
        .join('')

      const res = await cfg.client.fetch(
        objectUrl(cfg.endpoint, key, `?uploadId=${encodeURIComponent(uploadId)}`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/xml' },
          body: `<CompleteMultipartUpload>${partsXml}</CompleteMultipartUpload>`,
        }
      )
      const xml = await res.text()
      if (!res.ok) return json({ error: `Complete failed: ${res.status} ${xml.slice(0, 200)}` }, 500)

      const filename = String(body.filename || '').trim()
      const size = Number(body.size || 0)
      const contentType = String(body.contentType || 'application/octet-stream')
      const slug = String(body.slug || '').trim() || randomSlug()
      const password = String(body.password || '').trim() || null
      const expiresIn = parseInt(String(body.expires ?? '0'), 10) || 0
      const expiresAt = expiresIn > 0 ? new Date(Date.now() + expiresIn * 3600000).toISOString() : null
      const url = `${cfg.publicUrl}/${key}`

      const { data: inserted, error: insertError } = await supabase
        .from('files')
        .insert({
          key,
          url,
          filename: filename || key.split('/').pop(),
          content_type: contentType,
          size,
          share_slug: slug,
          password,
          expires_at: expiresAt,
        })
        .select()
        .single()

      if (insertError) return json({ error: insertError.message }, 500)
      return json(inserted)
    }

    if (action === 'abort') {
      const key = String(body.key || '')
      const uploadId = String(body.uploadId || '')
      if (!KEY_RE.test(key) || !uploadId) return json({ error: 'Invalid key or uploadId' }, 400)
      const res = await cfg.client.fetch(
        objectUrl(cfg.endpoint, key, `?uploadId=${encodeURIComponent(uploadId)}`),
        { method: 'DELETE' }
      )
      if (!res.ok && res.status !== 404) return json({ error: `Abort failed: ${res.status}` }, 500)
      return json({ success: true })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (err: any) {
    return json({ error: err?.message || 'Multipart upload failed' }, 500)
  }
}

export async function PUT({ request, cookies, locals, url }: { request: Request; cookies: any; locals: any; url: URL }) {
  if (!isAdminRequest(cookies, locals?.runtime?.env)) return json({ error: 'Unauthorized' }, 401)

  const cfg = r2Config(locals)
  if (!cfg) return json({ error: 'R2 not configured' }, 500)

  const key = url.searchParams.get('key') || ''
  const uploadId = url.searchParams.get('uploadId') || ''
  const part = parseInt(url.searchParams.get('part') || '0', 10)

  if (!KEY_RE.test(key)) return json({ error: 'Invalid key' }, 400)
  if (!uploadId) return json({ error: 'Missing uploadId' }, 400)
  if (!(part >= 1 && part <= 10000)) return json({ error: 'Invalid part number' }, 400)

  try {
    // 单片 8MB：Worker 内存占用恒定，与文件总大小无关
    const buf = new Uint8Array(await request.arrayBuffer())
    if (buf.byteLength === 0) return json({ error: 'Empty part' }, 400)

    const res = await cfg.client.fetch(
      objectUrl(cfg.endpoint, key, `?partNumber=${part}&uploadId=${encodeURIComponent(uploadId)}`),
      { method: 'PUT', body: buf, headers: { 'Content-Type': 'application/octet-stream' } }
    )
    if (!res.ok) {
      const text = await res.text()
      return json({ error: `Part ${part} failed: ${res.status} ${text.slice(0, 200)}` }, 500)
    }
    // 响应体为空，ETag 只在头里；CompleteMultipartUpload 需要带引号的原样值
    return json({ etag: res.headers.get('ETag'), part })
  } catch (err: any) {
    return json({ error: err?.message || 'Part upload failed' }, 500)
  }
}
