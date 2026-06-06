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

export const POST: APIRoute = async ({ request }) => {
  const runtimeEnv = (globalThis as any)?.runtime?.env
  const ADMIN_PASSWORD = runtimeEnv?.ADMIN_PASSWORD || import.meta.env.ADMIN_PASSWORD
  
  // Get cookie from request headers
  const cookieHeader = request.headers.get('cookie') || ''
  const cookieMatch = cookieHeader.match(/admin_auth=([^;]+)/)
  const cookieAuth = cookieMatch ? cookieMatch[1] : null
  
  // Get Authorization header
  const authHeader = request.headers.get('Authorization')
  const headerAuth = authHeader ? authHeader.replace('Bearer ', '') : null
  
  // Check if either auth matches
  const isAuthenticated = cookieAuth === ADMIN_PASSWORD || headerAuth === ADMIN_PASSWORD
  
  if (!isAuthenticated) {
    return new Response(JSON.stringify({ 
      error: 'Unauthorized',
      debug: { 
        hasCookie: !!cookieAuth, 
        hasHeader: !!headerAuth,
        cookieLength: cookieAuth?.length || 0,
        passwordLength: ADMIN_PASSWORD?.length || 0,
        cookieValue: cookieAuth,
        headerValue: headerAuth
      }
    }), {
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
