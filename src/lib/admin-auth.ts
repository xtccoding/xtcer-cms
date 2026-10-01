import { getRuntimeEnv } from './runtime-env'

/** 后台口令解析与校验（服务端专用）。
 *
 * 与页面里散落的 `runtimeEnv?.ADMIN_PASSWORD || import.meta.env.ADMIN_PASSWORD`
 * 保持完全一致的语义，只是抽成函数以便「页面 + API」共用同一份逻辑。
 *
 * 注意：读取构建期变量必须用静态成员访问（`import.meta.env.ADMIN_PASSWORD`），
 * 动态整体访问在 astro dev 下会抛 "Dynamic access of import.meta.env is not supported"。
 */

/** 后台登录 Cookie 名（与 /admin/login 保持一致）。 */
export const ADMIN_COOKIE = 'admin_auth'

/** 读取后台口令：优先 Cloudflare runtime env，其次构建期 env。未配置返回 null。 */
export function resolveAdminPassword(env: any): string | null {
  let buildValue: unknown
  try {
    buildValue = import.meta.env.ADMIN_PASSWORD
  } catch {
    buildValue = undefined
  }

  const password = env?.ADMIN_PASSWORD ?? buildValue
  if (typeof password !== 'string' || password.length === 0) return null
  return password
}

/** 校验请求是否来自已登录的后台会话，Cookie 值必须与 ADMIN_PASSWORD 完全一致。 */
export function isAdminRequest(
  cookies: { get(name: string): { value?: string } | undefined },
  env?: any
): boolean {
  const effectiveEnv = env ?? getRuntimeEnv()
  const password = resolveAdminPassword(effectiveEnv)
  if (!password) return false
  return cookies?.get?.(ADMIN_COOKIE)?.value === password
}

/** 校验外部 feed key；未设置密钥时 fail closed，空值绝不可能通过。 */
export function isFeedApiRequest(request: Request, env?: any): boolean {
  let buildValue: unknown
  try {
    buildValue = import.meta.env.FEED_API_KEY
  } catch {
    buildValue = undefined
  }
  const effectiveEnv = env ?? getRuntimeEnv()
  const configured = effectiveEnv?.FEED_API_KEY ?? buildValue
  if (typeof configured !== 'string' || configured.length === 0) return false
  return request.headers.get('X-Feed-Key') === configured
}

/** 只给设计为机器推送的专用端点用；通用管理 CRUD 不应调用。 */
export function isAdminOrFeedRequest(
  cookies: { get(name: string): { value?: string } | undefined },
  request: Request,
  env?: any
): boolean {
  return isAdminRequest(cookies, env) || isFeedApiRequest(request, env)
}
