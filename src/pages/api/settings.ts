import type { APIRoute } from 'astro'
import { supabase } from '../../lib/supabase'

export const GET: APIRoute = async ({ url }) => {
  const key = url.searchParams.get('key')
  
  if (key) {
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', key)
      .single()
    
    if (error || !data) {
      return new Response(JSON.stringify({ error: 'Setting not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    return new Response(JSON.stringify(data.value), {
      headers: { 'Content-Type': 'application/json' }
    })
  }
  
  // Get all settings
  const { data, error } = await supabase
    .from('site_settings')
    .select('key, value')
  
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  
  const settings: Record<string, any> = {}
  data?.forEach(item => {
    settings[item.key] = item.value
  })
  
  return new Response(JSON.stringify(settings), {
    headers: { 'Content-Type': 'application/json' }
  })
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const runtimeEnv = (globalThis as any)?.runtime?.env
  const ADMIN_PASSWORD = runtimeEnv?.ADMIN_PASSWORD || import.meta.env.ADMIN_PASSWORD
  
  // Check auth: try cookie first, then Authorization header
  const cookieAuth = cookies.get('admin_auth')?.value
  const authHeader = request.headers.get('Authorization')?.replace('Bearer ', '')
  
  if (cookieAuth !== ADMIN_PASSWORD && authHeader !== ADMIN_PASSWORD) {
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
    
    const { data, error } = await supabase
      .from('site_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      .select()
      .single()
    
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
