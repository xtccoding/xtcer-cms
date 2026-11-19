import { addLike, countLikes, listLikeTargets } from '../../lib/store'
import {
  JSON_HEADERS,
  getClientIp,
  hashIp,
  resolveSalt,
  validateTarget,
} from '../../lib/interactions'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

/**
 * GET → 返回全站点赞数映射 { "<target>": count }。
 * 一次性取出所有 target 后在 JS 里聚合，避免 /deals 页 332 张卡各发一次请求。
 */
export async function GET() {
  try {
    const targets = await listLikeTargets()
    const counts: Record<string, number> = {}
    for (const target of targets) {
      if (typeof target !== 'string') continue
      counts[target] = (counts[target] || 0) + 1
    }
    return json(counts)
  } catch {
    return json({})
  }
}

/**
 * POST { target } → 幂等点赞，返回 { count, liked }。
 *
 * 安全：
 * - target 经 validateTarget 白名单校验，非法直接 400。
 * - 请求体 JSON 解析失败 try/catch 兜 400，不抛 500。
 * - IP 仅以 SHA-256(salt+ip) 哈希入库。
 *
 * 幂等：靠唯一约束 (target, ip_hash) + INSERT OR IGNORE，
 * 重复点赞不报错、不重复计数。
 */
export async function POST({ request, locals }: { request: Request; locals: any }) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid json' }, 400)
  }

  const target = validateTarget(body?.target)
  if (!target) return json({ error: 'invalid target' }, 400)

  // fail closed：未配置 LIKE_SALT 时不写库（避免用公开盐做假匿名化）。
  const salt = resolveSalt(locals?.runtime?.env)
  if (!salt) {
    console.error('[likes] LIKE_SALT not configured — endpoint disabled')
    return json({ count: 0, liked: false, disabled: true })
  }

  const ip = getClientIp(request)
  const ipHash = await hashIp(ip, salt)

  try {
    await addLike(target, ipHash)
    const count = await countLikes(target)
    return json({ count, liked: true })
  } catch (e: any) {
    return json({ error: e?.message || 'db error' }, 500)
  }
}
