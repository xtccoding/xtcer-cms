/**
 * 互动功能（点赞 / 提意见）共用的纯函数工具集。
 *
 * 设计原则：
 * - 只依赖 Web 标准 API（Web Crypto / TextEncoder），不引入任何 npm 依赖。
 * - 所有校验都是「白名单 + 长度上限」，绝不信任前端传入的数据。
 * - 该文件不涉及任何 SQL 拼接：数据库访问一律走 PostgREST（见各 api/*.ts）。
 */

/** 控制字符：C0 控制符（保留 \t=0x09、\n=0x0A、\r=0x0D）+ DEL(0x7F)。 */
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g

/** target 合法形态：标准 UUID，或纯 [A-Za-z0-9_-] 短标识（slug）。 */
const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const SLUG_RE = /^[A-Za-z0-9_-]+$/

/** 各字段长度上限（与前端 maxlength 保持一致）。 */
export const TARGET_MAX_LEN = 64
export const MESSAGE_MIN_LEN = 1
export const MESSAGE_MAX_LEN = 500
export const CONTACT_MAX_LEN = 128
export const PATH_MAX_LEN = 256

/** 统一 JSON 响应头。 */
export const JSON_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
}

/**
 * 从请求头解析客户端 IP。
 * 优先 Cloudflare 的 cf-connecting-ip，其次 x-forwarded-for 的第一段，最后回退 'unknown'。
 */
export function getClientIp(request: Request): string {
  const cf = request.headers.get('cf-connecting-ip')
  if (cf && cf.trim()) return cf.trim()

  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return 'unknown'
}

/**
 * 计算 SHA-256(salt + ip) 的十六进制摘要。
 * 仅存哈希值，绝不落库明文 IP。
 */
export async function hashIp(ip: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${ip}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(digest)
  let hex = ''
  for (const b of bytes) hex += b.toString(16).padStart(2, '0')
  return hex
}

/**
 * 读取构建期注入的盐。
 * 必须用**静态成员访问** `import.meta.env.LIKE_SALT`：
 * Vite 的 module runner 把 `import.meta.env` 定义成 getter，
 * 动态整体访问（如 `(import.meta as any).env`）在 dev 下会抛
 * "Dynamic access of import.meta.env is not supported"，导致 handler 500。
 */
function readBuildSalt(): unknown {
  try {
    return import.meta.env.LIKE_SALT
  } catch {
    return undefined
  }
}

/**
 * 解析哈希盐：优先 Cloudflare runtime env，其次构建期 env。
 *
 * fail closed：未配置时返回 null（**不提供任何公开兜底值**）。
 * 若用公开常量当盐，配合 deal_likes 对 anon 开放的 SELECT，攻击者可用公开盐
 * 暴力枚举 IPv4（空间仅 2^32）反解 ip_hash，等于没做匿名化。
 * 调用方拿到 null 时应禁用功能并记录明确原因。
 */
export function resolveSalt(env: any): string | null {
  const salt = env?.LIKE_SALT ?? readBuildSalt()
  if (typeof salt !== 'string' || salt.trim().length === 0) return null
  return salt
}

/**
 * 校验并规范化 target。非法返回 null。
 * 规则：字符串、trim 后长度 1–64、且匹配 UUID 或 ^[A-Za-z0-9_-]+$。
 */
export function validateTarget(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const target = input.trim()
  if (target.length === 0 || target.length > TARGET_MAX_LEN) return null
  if (!UUID_RE.test(target) && !SLUG_RE.test(target)) return null
  return target
}

/** 判断是否为标准 UUID 字符串（后台按 id 操作记录时用）。 */
export function isValidUuid(input: unknown): input is string {
  return typeof input === 'string' && UUID_RE.test(input)
}

/**
 * 校验并清理 message。非法返回 null。
 * 规则：字符串、剥离控制字符、trim 后长度 1–500。
 */
export function validateMessage(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const cleaned = input.replace(CONTROL_CHARS, '').trim()
  if (cleaned.length < MESSAGE_MIN_LEN || cleaned.length > MESSAGE_MAX_LEN) return null
  return cleaned
}

/**
 * 清理可选文本字段（contact / path）。
 * 非字符串 → null；清洗后为空 → null；超长 → 截断到 maxLen。
 */
export function sanitizeOptionalText(input: unknown, maxLen: number): string | null {
  if (typeof input !== 'string') return null
  const cleaned = input.replace(CONTROL_CHARS, '').trim()
  if (cleaned.length === 0) return null
  return cleaned.slice(0, maxLen)
}

/**
 * 判断 PostgREST 错误是否为「表不存在」。
 * 用于在用户尚未执行 interactions.sql 时优雅降级，而不是报 500 / 白屏。
 *
 * 注意：只精确匹配「表缺失」，不要放宽成 /does not exist|not found/ ——
 * 否则 `column "xxx" does not exist`（Postgres 42703，列名拼错）也会被误判成
 * 表缺失，被静默降级，掩盖真实的列名错误。
 */
export function isTableMissing(error: any): boolean {
  if (!error) return false
  const code = String(error.code || '')
  const message = String(error.message || '')
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    /could not find the table|relation .+ does not exist/i.test(message)
  )
}
