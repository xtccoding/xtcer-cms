import { defineMiddleware } from 'astro:middleware'
import { supabase } from './lib/supabase'

export const onRequest = defineMiddleware(async (context, next) => {
  // Skip API and admin routes, and non-GET requests
  if (context.request.method !== 'GET' || context.url.pathname.startsWith('/api/') || context.url.pathname.startsWith('/admin')) {
    return next()
  }

  // Skip static assets
  const path = context.url.pathname
  if (path.includes('.') && !path.endsWith('.html') && !path.endsWith('/')) {
    return next()
  }

  const response = await next()

  // Track visitor asynchronously (don't block response)
  const ip = context.request.headers.get('cf-connecting-ip') ||
             context.request.headers.get('x-forwarded-for') ||
             context.request.headers.get('x-real-ip') ||
             'unknown'

  const ua = context.request.headers.get('user-agent') || ''
  const referer = context.request.headers.get('referer') || ''
  const country = context.request.headers.get('cf-ipcountry') || ''

  // Fire and forget - don't await
  supabase.from('visitors').insert({
    ip: String(ip).substring(0, 45),
    path: path,
    user_agent: ua.substring(0, 500),
    referer: referer.substring(0, 500),
    country: country.substring(0, 10),
  }).then(({ error }) => {
    if (error) console.error('[visitor tracking]', error.message)
  })

  return response
})
