import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3'
import { DOMParser as XmlDOMParser } from '@xmldom/xmldom'
import { createAdminClient } from '../../../lib/supabase-admin'
import { isAdminRequest } from '../../../lib/admin-auth'

/**
 * ⚠️ Cloudflare Workers 没有 DOMParser，而 @aws-sdk/client-s3 检测到 `fetch` 存在时
 * 会把运行环境判定为「浏览器」，用 DOMParser 解析 S3 的 XML 响应。
 * CreateMultipartUpload 必须从响应 XML 里取 UploadId，缺了会直接抛
 * `DOMParser is not defined`（实测 500）。原来的 PutObject 不解析响应体，所以一直没暴露。
 * 这里在模块加载时注入 polyfill，早于任何 handler 调用。
 */
if (typeof (globalThis as any).DOMParser === 'undefined') {
  (globalThis as any).DOMParser = XmlDOMParser
}

/**
 * 大文件分片上传（S3 Multipart Upload）。
 *
 * 背景：原实现把整个文件塞进 Worker —— `request.formData()` 缓冲一份、
 * `file.arrayBuffer()` 再一份、SHA-256 与 S3 签名各持有一份，
 * 50MB 左右就撞上 Cloudflare Workers 的 **128MB 内存上限**，
 * 返回 `error code: 1102` / HTTP 503（实测 30MB 过、50MB 挂）。
 *
 * 分片后每次请求只处理 CHUNK（8MB），Worker 内存占用恒定在 ~30MB，
 * 与文件总大小无关，上限只受 R2 单对象（5TB）和片数（10000）约束。
 *
 * 协议（三步，全部要求后台登录态）：
 *   POST  {action:'init', filename, size, contentType, slug, password, expires}
 *         -> { key, uploadId, slug, chunkSize }
 *   PUT   ?key=&uploadId=&part=N   (body = 二进制片)
 *         -> { etag }
 *   POST  {action:'complete', key, uploadId, parts:[{PartNumber,ETag}], ...meta}
 *         -> files 表记录
 *   POST  {action:'abort', key, uploadId}   // 失败时清理，避免残留分片
 */

const CHUNK_SIZE = 8 * 1024 * 1024 // 8MB，S3 要求除最后一片外 ≥5MB
const MAX_SIZE = 500 * 1024 * 1024 // 500MB
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
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
  return { s3, bucket, publicUrl }
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

      const ext = (filename.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'bin'
      const key = `files/${Date.now().toString(36)}${randomSlug(8)}.${ext}`

      const created = await cfg.s3.send(
        new CreateMultipartUploadCommand({
          Bucket: cfg.bucket,
          Key: key,
          ContentType: contentType,
          CacheControl: 'public, max-age=31536000',
          ContentDisposition: `inline; filename="${filename.replace(/["\\\r\n]/g, '_')}"`,
        })
      )
      if (!created.UploadId) return json({ error: 'Failed to create multipart upload' }, 500)

      return json({ key, uploadId: created.UploadId, slug, chunkSize: CHUNK_SIZE })
    }

    if (action === 'complete') {
      const key = String(body.key || '')
      const uploadId = String(body.uploadId || '')
      const parts = Array.isArray(body.parts) ? body.parts : []
      if (!KEY_RE.test(key)) return json({ error: 'Invalid key' }, 400)
      if (!uploadId) return json({ error: 'Missing uploadId' }, 400)
      if (parts.length === 0) return json({ error: 'Missing parts' }, 400)

      await cfg.s3.send(
        new CompleteMultipartUploadCommand({
          Bucket: cfg.bucket,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: {
            Parts: parts
              .map((p: any) => ({ PartNumber: Number(p.PartNumber), ETag: String(p.ETag || '') }))
              .sort((a: any, b: any) => a.PartNumber - b.PartNumber),
          },
        })
      )

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
      await cfg.s3.send(
        new AbortMultipartUploadCommand({ Bucket: cfg.bucket, Key: key, UploadId: uploadId })
      )
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
    // 单片 8MB：Worker 内存占用恒定，不受文件总大小影响
    const buf = new Uint8Array(await request.arrayBuffer())
    if (buf.byteLength === 0) return json({ error: 'Empty part' }, 400)

    const res = await cfg.s3.send(
      new UploadPartCommand({
        Bucket: cfg.bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: part,
        Body: buf,
        ContentLength: buf.byteLength,
      })
    )

    return json({ etag: res.ETag, part })
  } catch (err: any) {
    return json({ error: err?.message || 'Part upload failed' }, 500)
  }
}
