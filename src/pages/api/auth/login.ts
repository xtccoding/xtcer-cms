import type { APIRoute } from 'astro'
import { verifyPassword } from '../../../lib/auth'
import { getUserByUsername, rotateSession, toPublicUser } from '../../../lib/accounts'
import { allowRequest, json, readJson, rejectCrossOrigin } from '../../../lib/http'

/**
 * 用户不存在时也跑一次同样成本的 PBKDF2，
 * 避免「用户名不存在」比「密码错误」返回得明显更快，被人拿去枚举账号。
 */
const DUMMY_HASH = `pbkdf2-sha256$100000$${'0'.repeat(64)}`
const DUMMY_SALT = '0'.repeat(32)

/**
 * POST /api/auth/login
 * body: { username, password }
 *
 * 失败一律返回「用户名或密码错误」，不区分具体原因。
 */
export const POST: APIRoute = async ({ request, locals, cookies, url }) => {
  const crossOrigin = rejectCrossOrigin(request, url)
  if (crossOrigin) return crossOrigin

  const env = (locals as any)?.runtime?.env
  if (!(await allowRequest(env, request, 'login', 10, 600))) {
    return json({ error: '尝试次数过多，请 10 分钟后再试' }, 429)
  }

  const parsed = await readJson(request)
  if (!parsed.ok) return parsed.response

  const username = typeof parsed.data?.username === 'string' ? parsed.data.username.trim() : ''
  const password = typeof parsed.data?.password === 'string' ? parsed.data.password : ''
  if (!username || !password || username.length > 40 || password.length > 200) {
    return json({ error: '用户名或密码错误' }, 401)
  }

  try {
    const user = await getUserByUsername(username, env)
    const ok = user
      ? await verifyPassword(password, user.password_hash, user.password_salt)
      : await verifyPassword(password, DUMMY_HASH, DUMMY_SALT).then(() => false)

    if (!user || !ok) return json({ error: '用户名或密码错误' }, 401)

    await rotateSession(cookies, user.id, env)
    return json({ ok: true, user: toPublicUser(user) })
  } catch (err: any) {
    console.error('[api/auth/login]', err?.message || err)
    return json({ error: '登录失败，请稍后再试' }, 500)
  }
}
