import type { APIRoute } from 'astro'
import { hashPassword, validatePassword, validateUsername } from '../../../lib/auth'
import { createUser, rotateSession } from '../../../lib/accounts'
import { allowRequest, json, readJson, rejectCrossOrigin } from '../../../lib/http'

/**
 * POST /api/auth/register
 * body: { username, password }
 *
 * 安全要点：
 * - 同源校验 + 必须 application/json（挡掉表单式 CSRF）
 * - 每 IP 每小时最多 5 次注册
 * - 用户名 / 密码服务端重新校验（不信任前端 maxlength / pattern）
 * - 密码只存 PBKDF2 摘要
 */
export const POST: APIRoute = async ({ request, locals, cookies, url }) => {
  const crossOrigin = rejectCrossOrigin(request, url)
  if (crossOrigin) return crossOrigin

  const env = (locals as any)?.runtime?.env
  if (!(await allowRequest(env, request, 'register', 5, 3600))) {
    return json({ error: '注册太频繁，请稍后再试' }, 429)
  }

  const parsed = await readJson(request)
  if (!parsed.ok) return parsed.response

  const username = validateUsername(parsed.data?.username)
  if (!username) return json({ error: '用户名需 2–20 位，仅限中英文、数字、下划线' }, 400)

  const passwordError = validatePassword(parsed.data?.password)
  if (passwordError) return json({ error: passwordError }, 400)

  const password = String(parsed.data.password)
  if (password.toLowerCase() === username.toLowerCase()) {
    return json({ error: '密码不能和用户名相同' }, 400)
  }

  try {
    const { hash, salt } = await hashPassword(password)
    const created = await createUser({ username, passwordHash: hash, passwordSalt: salt }, env)
    if (!created) return json({ error: '该用户名已被占用，换一个试试' }, 409)

    await rotateSession(cookies, created.id, env)
    return json({ ok: true, user: created })
  } catch (err: any) {
    console.error('[api/auth/register]', err?.message || err)
    return json({ error: '注册失败，请稍后再试' }, 500)
  }
}
