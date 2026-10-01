/**
 * 后台口令解析与校验（服务端专用）。
 *
 * 与页面里散落的 `runtimeEnv?.ADMIN_PASSWORD || import.meta.env.ADMIN_PASSWORD`
 * 保持完全一致的语义，只是抽成函数以便「页面 + API」共用同一份逻辑。
 *
 * 注意：读取构建期变量必须用**静态成员访问**（`import.meta.env.ADMIN_PASSWORD`），
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

/**
 * 校验请求是否来自已登录的后台会话。
 * cookies 需为 AstroCookies（有 .get(name) 方法）。
 */
export function isAdminRequest(cookies: { get(name: string): { value?: string } | undefined }, env: any): boolean {
  const password = resolveAdminPassword(env)
  if (!password) return false
  return cookies.get(ADMIN_COOKIE)?.value === password
}
