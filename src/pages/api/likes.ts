import { supabase } from '../../lib/supabase'
import {
  JSON_HEADERS,
  getClientIp,
  hashIp,
  resolveSalt,
  validateTarget,
  isTableMissing,
} from '../../lib/interactions'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

/**
 * GET → 返回全站点赞数映射 { "<target>": count }。
 * 一次性取出所有 target 后在 JS 里聚合，避免 /deals 页 332 张卡各发一次请求。
 * 表不存在（用户还没执行 interactions.sql）时返回空对象，前端按 0 处理。
 */
export async function GET() {
  // 已知限制：PostgREST 默认 max-rows=1000，这里拉全表后在 JS 里聚合，
  // 点赞记录超过 1000 行后计数会静默少算。点赞量接近上限时需改为视图 / RPC 聚合。
  const { data, error } = await supabase.from('deal_likes').select('target')

  if (error) {
    if (isTableMissing(error)) return json({})
    return json({ error: error.message }, 500)
  }

  const counts: Record<string, number> = {}
  for (const row of data || []) {
    const target = (row as { target?: unknown }).target
    if (typeof target !== 'string') continue
    counts[target] = (counts[target] || 0) + 1
  }
  return json(counts)
}

/**
 * POST { target } → 幂等点赞，返回 { count, liked }。
 *
 * 安全：
 * - target 经 validateTarget 白名单校验，非法直接 400。
 * - 请求体 JSON 解析失败 try/catch 兜 400，不抛 500。
 * - 数据库写入只走 PostgREST（supabase-js），无任何 SQL 字符串拼接。
 * - IP 仅以 SHA-256(salt+ip) 哈希入库。
 *
 * 幂等：靠唯一约束 (target, ip_hash) + upsert(ignoreDuplicates)，
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

  const { error: insertError } = await supabase
    .from('deal_likes')
    .upsert(
      { target, ip_hash: ipHash },
      { onConflict: 'target,ip_hash', ignoreDuplicates: true }
    )

  if (insertError) {
    // 表不存在 → 优雅降级：告诉前端隐藏按钮，而不是报错。
    if (isTableMissing(insertError)) return json({ count: 0, liked: false, disabled: true })
    return json({ error: insertError.message }, 500)
  }

  const { count, error: countError } = await supabase
    .from('deal_likes')
    .select('id', { count: 'exact', head: true })
    .eq('target', target)

  if (countError) {
    if (isTableMissing(countError)) return json({ count: 0, liked: true, disabled: true })
    return json({ error: countError.message }, 500)
  }

  return json({ count: count || 0, liked: true })
}
