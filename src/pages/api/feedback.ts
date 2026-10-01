import { supabase } from '../../lib/supabase'
import {
  JSON_HEADERS,
  getClientIp,
  hashIp,
  resolveSalt,
  validateMessage,
  sanitizeOptionalText,
  isTableMissing,
  CONTACT_MAX_LEN,
  PATH_MAX_LEN,
} from '../../lib/interactions'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

/**
 * POST { message, contact?, path? } → 校验后入库，返回 { ok: true }。
 *
 * 安全：
 * - message 经 validateMessage（剥离控制字符、trim、长度 1–500），非法 400。
 * - 请求体 JSON 解析失败 try/catch 兜 400，不抛 500。
 * - 写入只走 PostgREST，无 SQL 字符串拼接。
 * - message 仅入库，绝不在任何公开页面回显 / 渲染（消除存储型 XSS）。
 * - IP 仅以 SHA-256(salt+ip) 哈希入库。
 */
export async function POST({ request, locals }: { request: Request; locals: any }) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid json' }, 400)
  }

  const message = validateMessage(body?.message)
  if (!message) return json({ error: 'invalid message' }, 400)

  const contact = sanitizeOptionalText(body?.contact, CONTACT_MAX_LEN)
  const path = sanitizeOptionalText(body?.path, PATH_MAX_LEN)

  // fail closed：未配置 LIKE_SALT 时不写库（避免用公开盐做假匿名化）。
  const salt = resolveSalt(locals?.runtime?.env)
  if (!salt) {
    console.error('[feedback] LIKE_SALT not configured — endpoint disabled')
    return json({ error: 'unavailable' }, 503)
  }

  const ip = getClientIp(request)
  const ipHash = await hashIp(ip, salt)

  const { error } = await supabase
    .from('feedback')
    .insert({ message, contact, ip_hash: ipHash, path })

  if (error) {
    // 表不存在（用户还没执行 interactions.sql）→ 明确告知暂不可用。
    if (isTableMissing(error)) return json({ error: 'unavailable' }, 503)
    return json({ error: error.message }, 500)
  }

  return json({ ok: true })
}
