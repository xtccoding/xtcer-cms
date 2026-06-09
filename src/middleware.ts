import { defineMiddleware } from 'astro:middleware'
import { supabase } from './lib/supabase'

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname
  
  // Get custom admin path from env
  const runtimeEnv = (context.locals as any)?.runtime?.env
  const customAdminPath = runtimeEnv?.ADMIN_PATH || import.meta.env.ADMIN_PATH
  
  // If custom admin path is set
  if (customAdminPath && customAdminPath !== '/admin') {
    const cleanCustomPath = customAdminPath.startsWith('/') ? customAdminPath : `/${customAdminPath}`
    
    // Block direct access to /admin (return 404)
    if (path === '/admin' || path.startsWith('/admin/')) {
      return new Response('Not Found', { status: 404 })
    }
    
    // Rewrite custom path to /admin (internal, browser stays at custom path)
    if (path === cleanCustomPath || path.startsWith(cleanCustomPath + '/')) {
      const newPath = path.replace(cleanCustomPath, '/admin')
      const rewrittenReq = new Request(new URL(newPath + context.url.search, context.url.origin), context.request)
      const response = await next(rewrittenReq)

      // Rewrite redirects: /admin/... -> customPath/...
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (location) {
          const newLocation = location.replace('/admin', cleanCustomPath)
          const headers = new Headers(response.headers)
          headers.set('location', newLocation)
          return new Response(null, { status: response.status, headers })
        }
      }

      // Rewrite HTML body: replace /admin/ with custom path
      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('text/html')) {
        const html = await response.text()
        const newHtml = html.replaceAll('/admin/', `${cleanCustomPath}/`).replaceAll('"/admin"', `"${cleanCustomPath}"`)
        const headers = new Headers(response.headers)
        headers.delete('content-length')
        return new Response(newHtml, { status: response.status, headers })
      }

      return response
    }
  }
  
  // Skip tracking for API and admin routes
  if (context.request.method !== 'GET' || path.startsWith('/api/') || path.startsWith('/admin')) {
    return next()
  }

  // Skip non-HTML files
  if (path.includes('.') && !path.endsWith('.html') && !path.endsWith('/')) {
    return next()
  }

  const response = await next()

  // Track visitor
  const ip = context.request.headers.get('cf-connecting-ip') ||
             context.request.headers.get('x-forwarded-for') ||
             context.request.headers.get('x-real-ip') ||
             'unknown'

  const ua = context.request.headers.get('user-agent') || ''
  const referer = context.request.headers.get('referer') || ''
  const country = context.request.headers.get('cf-ipcountry') || ''

  const insertPromise = supabase.from('visitors').insert({
    ip: String(ip).substring(0, 45),
    path: path,
    user_agent: ua.substring(0, 500),
    referer: referer.substring(0, 500),
    country: country.substring(0, 10),
  }).then(({ error }) => {
    if (error) console.error('[visitor tracking]', error.message)
  })

  const cfCtx = (context.locals as any)?.runtime?.ctx
  if (cfCtx?.waitUntil) {
    cfCtx.waitUntil(insertPromise)
  }

  return response
})
