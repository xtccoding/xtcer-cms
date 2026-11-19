/**
 * API 端点的通用安全工具：统一 JSON 响应、限长读体、同源校验、限流、日期。
 *
 * 这些是「所有写接口都要过一遍」的关卡，集中一处避免每个端点各写一遍而漏掉某项。
 */
import { getClientIp } from './interactions'

export const JSON_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

/** 请求体上限：账号类接口只收两个短字段，8 KB 已经非常宽松。 */
const BODY_MAX_BYTES = 8 * 1024

export type JsonRead =
  | { ok: true; data: any }
  | { ok: false; response: Response }

/**
 * 读取 JSON 请求体。任何异常都转成 4xx，不抛 500：
 * - 必须是 application/json（阻止 HTML 表单直接跨站 POST —— 表单发不出这个类型）
 * - Content-Length / 实际长度超限 → 413
 * - JSON 解析失败 → 400
 */
export async function readJson(request: Request): Promise<JsonRead> {
  const contentType = request.headers.get('content-type') || ''
  if (!contentType.toLowerCase().includes('application/json')) {
    return { ok: false, response: json({ error: 'unsupported content type' }, 415) }
  }

  const declared = Number.parseInt(request.headers.get('content-length') || '0', 10)
  if (Number.isFinite(declared) && declared > BODY_MAX_BYTES) {
    return { ok: false, response: json({ error: 'payload too large' }, 413) }
  }

  let text: string
  try {
    text = await request.text()
  } catch {
    return { ok: false, response: json({ error: 'invalid body' }, 400) }
  }
  if (text.length > BODY_MAX_BYTES) {
    return { ok: false, response: json({ error: 'payload too large' }, 413) }
  }

  try {
    return { ok: true, data: JSON.parse(text || '{}') }
  } catch {
    return { ok: false, response: json({ error: 'invalid json' }, 400) }
  }
}

/**
 * 同源校验（CSRF 第二道防线）。
 *
 * - 浏览器发起的跨站 POST 一定带 Origin，host 不同直接拒绝。
 * - 老浏览器 / 非浏览器客户端可能没有 Origin：此时看 Sec-Fetch-Site，
 *   只要它不是 same-origin / same-site / none（例如 cross-site），也拒绝。
 * 配合 HttpOnly + SameSite=Lax 的 Cookie，普通 CSRF 无法携带登录态。
 */
export function isSameOrigin(request: Request, url: URL): boolean {
  const origin = request.headers.get('origin')
  if (origin) {
    try {
      return new URL(origin).host === url.host
    } catch {
      return false
    }
  }
  const site = request.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'same-site' && site !== 'none') {
    return false
  }
  return true
}

/** 供 API 统一拒绝跨站写请求。 */
export function rejectCrossOrigin(request: Request, url: URL): Response | null {
  if (isSameOrigin(request, url)) return null
  return json({ error: 'cross-origin request rejected' }, 403)
}

/**
 * 固定窗口限流。返回 true 表示放行。
 *
 * key 传「动作 + IP」的明文即可，本函数内部会先 SHA-256 再入库 ——
 * 数据库里不出现明文 IP。
 *
 * fail open：D1 绑定缺失时放行（此时所有账号功能本来也用不了，
 * 没必要再伪装成 429 让人误以为是限流）。
 */
export async function allowRequest(
  env: any,
  request: Request,
  action: string,
  limit: number,
  windowSec: number,
): Promise<boolean> {
  const d1 = env?.DB
  if (!d1) return true

  const key = await sha256HexLocal(`${action}:${getClientIp(request)}`)
  const now = Math.floor(Date.now() / 1000)
  const windowStart = now - (now % windowSec)

  try {
    await d1
      .prepare(
        `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
         ON CONFLICT(key) DO UPDATE SET
           count = CASE WHEN window_start = ? THEN count + 1 ELSE 1 END,
           window_start = ?`,
      )
      .bind(key, windowStart, windowStart, windowStart)
      .run()

    const row: any = await d1
      .prepare('SELECT count FROM rate_limits WHERE key = ?')
      .bind(key)
      .first()

    // 顺手清理过期窗口，避免表无限增长（每次写只删一点点）
    if (windowStart % 3600 === 0) {
      await d1
        .prepare('DELETE FROM rate_limits WHERE window_start < ?')
        .bind(windowStart - 86_400)
        .run()
    }

    return Number(row?.count ?? 0) <= limit
  } catch {
    // 限流基础设施异常时不阻断正常用户
    return true
  }
}

async function sha256HexLocal(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  let hex = ''
  for (const b of new Uint8Array(digest)) hex += b.toString(16).padStart(2, '0')
  return hex
}

/** 站点时区（中国无夏令时，固定 +8 即可）。 */
const TZ_OFFSET_MIN = 8 * 60

/** 返回站点时区下的 YYYY-MM-DD。 */
export function siteDay(date: Date = new Date()): string {
  return new Date(date.getTime() + TZ_OFFSET_MIN * 60_000).toISOString().slice(0, 10)
}

/** 返回站点时区下某天的前一天（用于连签判定）。 */
export function previousDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** 站点时区下某天的偏移日期（-13 表示 13 天前）。 */
export function shiftDay(day: string, offset: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}
