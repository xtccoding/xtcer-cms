import { defineMiddleware } from 'astro:middleware'
import { supabase } from './lib/supabase'
import { setRuntimeEnv } from './lib/runtime-env'

/**
 * 边缘缓存策略。
 *
 * 背景：Cloudflare 默认对所有 SSR 响应返回 `cf-cache-status: DYNAMIC`，
 * 即**完全不缓存**。每个访客、每次刷新都要真实执行 SSR 并打回 Supabase，
 * 实测 TTFB 1.5–3.5s，且随并发波动。这是「站点变慢」的主因，与项目体量无关。
 *
 * 这里的做法：给公开的匿名可读页面加 `s-maxage`（仅 CDN 边缘缓存，浏览器不缓存），
 * 配合 `stale-while-revalidate` 让缓存过期后先返回旧内容、后台异步刷新，
 * 访客永远命中边缘节点 → TTFB 降到几十毫秒。
 *
 * 注意：**不能给 /admin 和 /api 加**（含登录态与写操作），它们必须保持 no-store。
 */
function cacheControlFor(path: string): string | null {
  // 后台、API、登录登出：一律不缓存
  if (
    path.startsWith('/admin') ||
    path.startsWith('/api/') ||
    path === '/api'
  ) {
    return 'no-store'
  }

  // SPA 短链 / 静态导流页：跟随内容，短缓存
  if (path.startsWith('/s/')) {
    return 'public, s-maxage=600, stale-while-revalidate=86400'
  }

  // 文章详情页：内容基本不变，长缓存（改稿后由后台 purge 或等过期）
  if (/^\/posts\/[^/]+$/.test(path)) {
    return 'public, s-maxage=3600, stale-while-revalidate=86400'
  }

  // 列表/聚合/频道页：5 分钟边缘缓存，过期后 1 小时内后台刷新
  if (
    path === '/' ||
    path === '/posts' ||
    path === '/feeds' ||
    path === '/deals' ||
    path === '/about' ||
    path === '/contact' ||
    path === '/privacy' ||
    path === '/tos' ||
    path.startsWith('/tags') ||
    path.startsWith('/topics') ||
    path.startsWith('/authors')
  ) {
    return 'public, s-maxage=300, stale-while-revalidate=3600'
  }

  // 其它公开页面的兜底：短暂边缘缓存
  return 'public, s-maxage=120, stale-while-revalidate=600'
}

/** 给响应补上 Cache-Control（仅当上游没显式设置时）。 */
function applyCacheControl(response: Response, path: string): Response {
  // 只缓存成功响应：重定向(3xx)、报错(4xx/5xx) 一律不缓存，
  // 否则一个 302/404 会被边缘缓存整整一小时（文章被删或改 ID 后会很麻烦）。
  if (response.status !== 200) {
    if (!response.headers.has('cache-control') && response.status >= 400) {
      const headers = new Headers(response.headers)
      headers.set('cache-control', 'no-store')
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }
    return response
  }

  const value = cacheControlFor(path)
  if (!value) return response
  // 已有显式缓存策略（如静态资源 immutable）则不覆盖
  if (response.headers.has('cache-control')) return response

  const headers = new Headers(response.headers)
  headers.set('cache-control', value)
  // 让 CDN 缓存按 URL 区分（含 query，如 /posts?page=2 各自独立缓存）
  headers.append('vary', 'Accept-Encoding')

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname

  // Preserve the current request's runtime env for shared server-side helpers.
  const runtimeEnv = (context.locals as any)?.runtime?.env
  setRuntimeEnv(runtimeEnv)

  // Get custom admin path from env
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
        if (!headers.has('cache-control')) headers.set('cache-control', 'no-store')
        return new Response(newHtml, { status: response.status, headers })
      }

      return response
    }
  }
  
  // Skip tracking for API and admin routes
  if (context.request.method !== 'GET' || path.startsWith('/api/') || path.startsWith('/admin')) {
    return applyCacheControl(await next(), path)
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

  return applyCacheControl(response, path)
})
