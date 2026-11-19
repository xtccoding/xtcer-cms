import type { APIRoute } from 'astro'
import { getSetting, listSettings, upsertSetting } from '../../lib/store'
import { isAdminRequest } from '../../lib/admin-auth'

export const GET: APIRoute = async ({ url }) => {
  const key = url.searchParams.get('key')

  try {
    if (key) {
      const value = await getSetting(key)
      if (value === null) {
        return new Response(JSON.stringify({ error: 'Setting not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      return new Response(JSON.stringify(value), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Get all settings
    const rows = await listSettings()
    const settings: Record<string, any> = {}
    rows.forEach(item => {
      settings[item.key] = item.value
    })

    return new Response(JSON.stringify(settings), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || '数据库错误' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  if (!isAdminRequest(cookies, locals?.runtime?.env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const body = await request.json()
    const { key, value } = body

    if (!key || value === undefined) {
      return new Response(JSON.stringify({ error: 'key and value are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    await upsertSetting(key, value)

    return new Response(JSON.stringify({ key, value }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
