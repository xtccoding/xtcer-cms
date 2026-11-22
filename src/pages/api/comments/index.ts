import {
  createComment,
  isBlacklisted,
  listComments,
  getPost,
  type CommentRow,
} from '../../../lib/store'
import {
  JSON_HEADERS,
  isValidUuid,
  getClientIp,
  hashIp,
  resolveSalt,
} from '../../../lib/interactions'
import { allowRequest, readJson, rejectCrossOrigin } from '../../../lib/http'

const AUTHOR_MAX = 24
const CONTENT_MIN = 2
const CONTENT_MAX = 1000
const RATE_LIMIT = 5
const RATE_WINDOW_SEC = 600

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

/** 去控制字符 + trim + 长度校验。 */
function cleanText(input: unknown, min: number, max: number): string | null {
  if (typeof input !== 'string') return null
  // 允许换行（\n \r）与制表符，其余 C0/C1 控制字符剥掉
  const s = input
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '')
    .replace(/\r\n/g, '\n')
    .trim()
  if (s.length < min || s.length > max) return null
  return s
}

/**
 * GET /api/comments?post=<postId>
 * 返回该文章的可见评论（按时间升序），只暴露公开字段。
 */
export async function GET({ url, locals }: { url: URL; locals: any }) {
  const postId = url.searchParams.get('post') || ''
  if (!isValidUuid(postId)) return json({ comments: [] })

  try {
    const rows = await listComments(postId, locals?.runtime?.env)
    return json({ comments: rows })
  } catch (e: any) {
    console.error('[comments] GET failed:', e?.message || e)
    return json({ comments: [] })
  }
}

/**
 * POST /api/comments
 * body: { post, author, content, parent? }
 *
 * 安全链：
 *  1. 同源校验（防 CSRF）
 *  2. 限流 5 条 / 10 分钟 / IP（D1 固定窗口）
 *  3. 文章必须存在（防往任意 ID 灌评论）
 *  4. 内容/昵称长度与控制字符校验
 *  5. IP 黑名单
 *  6. IP 只存 SHA-256(salt+ip)
 */
export async function POST({ request, url, locals }: { request: Request; url: URL; locals: any }) {
  const env = locals?.runtime?.env

  const crossOrigin = rejectCrossOrigin(request, url)
  if (crossOrigin) return crossOrigin

  const parsed = await readJson(request)
  if (!parsed.ok) return parsed.response
  const body: any = parsed.data

  const postId = typeof body?.post === 'string' ? body.post : ''
  if (!isValidUuid(postId)) return json({ error: 'invalid post' }, 400)

  const author = cleanText(body?.author, 1, AUTHOR_MAX)
  if (!author) return json({ error: 'invalid author' }, 400)

  const content = cleanText(body?.content, CONTENT_MIN, CONTENT_MAX)
  if (!content) return json({ error: 'invalid content' }, 400)

  // 单层回复：parent 必须是该文章下的可见评论，否则忽略（当作顶层）
  let parentId: string | null = null
  if (typeof body?.parent === 'string' && isValidUuid(body.parent)) {
    parentId = body.parent
  }

  const salt = resolveSalt(env)
  if (!salt) {
    console.error('[comments] LIKE_SALT not configured — endpoint disabled')
    return json({ error: 'unavailable' }, 503)
  }

  const ip = getClientIp(request)
  const ipHash = await hashIp(ip, salt)

  // 限流（fail open：限流基础设施异常不阻断）
  const allowed = await allowRequest(env, request, 'comment', RATE_LIMIT, RATE_WINDOW_SEC)
  if (!allowed) return json({ error: 'too many comments, slow down' }, 429)

  try {
    if (await isBlacklisted(ip, env)) return json({ error: 'forbidden' }, 403)

    // 文章必须存在（同时拿到真实 id，避免大小写/格式差异）
    const post = await getPost(postId)
    if (!post) return json({ error: 'post not found' }, 404)

    // parent 必须属于同一篇文章
    if (parentId) {
      const siblings = await listComments(postId, env)
      if (!siblings.some((c: CommentRow) => c.id === parentId)) parentId = null
    }

    const row = await createComment(
      { post_id: post.id, parent_id: parentId, author, content, ip_hash: ipHash },
      env,
    )

    return json({
      ok: true,
      comment: {
        id: row.id,
        post_id: row.post_id,
        parent_id: row.parent_id,
        author: row.author,
        content: row.content,
        created_at: row.created_at,
      },
    }, 201)
  } catch (e: any) {
    console.error('[comments] POST failed:', e?.message || e)
    return json({ error: 'db error' }, 500)
  }
}
