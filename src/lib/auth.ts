/**
 * 用户账号的密码学工具（纯函数，不碰数据库）。
 *
 * 安全设计：
 * - 密码用 PBKDF2-SHA256 + 每人独立 16 字节随机盐，迭代 10 万次。
 *   库里永远没有明文密码；即使拖库，也必须在离线环境逐个爆破。
 * - 会话 token 是 32 字节 CSPRNG 随机值，**数据库只存它的 SHA-256**。
 *   库被读走也无法拼出可用的 Cookie。
 * - 所有比较走恒定时间实现，避免通过响应耗时侧信道逐字符猜摘要。
 * - 只依赖 Web Crypto（Workers / Node 18+ 原生支持），不引第三方依赖。
 */

/** 用户登录态 Cookie 名（与后台 admin_auth 完全隔离）。 */
export const USER_COOKIE = 'xt_user'

/** 登录态有效期（秒）。 */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30

/** PBKDF2 迭代次数。写进摘要前缀，将来提高次数时老密码仍可校验。 */
const PBKDF2_ITERATIONS = 100_000

/** 用户名：2–20 位，字母 / 数字 / 下划线 / 中文。 */
const USERNAME_RE = /^[A-Za-z0-9_\u4e00-\u9fa5]{2,20}$/

export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 72

function toHex(bytes: Uint8Array): string {
  let out = ''
  for (const b of bytes) out += b.toString(16).padStart(2, '0')
  return out
}

function fromHex(hex: string): Uint8Array {
  const clean = hex.length % 2 === 0 ? hex : `0${hex}`
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

/** 生成 n 字节密码学随机数的十六进制串。 */
export function randomHex(bytes = 32): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return toHex(buf)
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return toHex(new Uint8Array(digest))
}

/** 恒定时间字符串比较（长度不同也走完整循环，避免提前返回）。 */
export function timingSafeEqual(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < max; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0
}

/** PBKDF2-SHA256 派生摘要。 */
async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  )
  return toHex(new Uint8Array(bits))
}

/** 生成新密码的盐与摘要。 */
export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const saltBytes = new Uint8Array(16)
  crypto.getRandomValues(saltBytes)
  const salt = toHex(saltBytes)
  const hash = await derive(password, saltBytes, PBKDF2_ITERATIONS)
  return { hash: `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${hash}`, salt }
}

/** 校验密码。格式不认识 / 迭代次数异常一律 fail closed。 */
export async function verifyPassword(
  password: string,
  storedHash: string,
  saltHex: string,
): Promise<boolean> {
  const parts = storedHash.split('$')
  if (parts.length !== 3 || parts[0] !== 'pbkdf2-sha256') return false
  const iterations = Number.parseInt(parts[1], 10)
  if (!Number.isFinite(iterations) || iterations < 10_000 || iterations > 1_000_000) return false
  const expected = parts[2]
  if (!/^[0-9a-f]{64}$/i.test(expected) || !/^[0-9a-f]{32}$/i.test(saltHex)) return false
  const actual = await derive(password, fromHex(saltHex), iterations)
  return timingSafeEqual(actual, expected)
}

/** 校验用户名，返回 trim 后的原样（保留大小写）；非法返回 null。 */
export function validateUsername(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const username = input.trim()
  if (!USERNAME_RE.test(username)) return null
  return username
}

/**
 * 校验密码。返回错误文案或 null（null = 通过）。
 * 只做长度与可见字符检查：不强制复杂度，但拒绝纯空白和超长输入（防 DoS）。
 */
export function validatePassword(input: unknown): string | null {
  if (typeof input !== 'string') return '密码格式不正确'
  if (input.length < PASSWORD_MIN) return `密码至少 ${PASSWORD_MIN} 位`
  if (input.length > PASSWORD_MAX) return `密码最多 ${PASSWORD_MAX} 位`
  if (!input.trim()) return '密码不能全是空格'
  if (/[\x00-\x1F\x7F]/.test(input)) return '密码不能包含控制字符'
  return null
}
