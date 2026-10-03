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
 * ⚠️ 关键坑：**只加 `Cache-Control: s-maxage` 是不够的**。
 * Cloudflare Pages/Workers 的 SSR 响应默认不进 CDN 缓存 —— 默认 Cache Level
 * 只按「文件扩展名」缓存静态资源，HTML 不在其列。实测线上加了 s-maxage 之后
 * 响应头依然是 `cf-cache-status: DYNAMIC`，一次都没命中。
 * 真正生效的办法是在 Worker 里用 **Cache API**（`caches.default`）显式存取，
 * 见下方 onRequest 中的 `edgeCache` 部分。静态资源（/_astro/*）则由
 * Cloudflare 自身的静态缓存处理，无需干预。
 *
 * 这里定义的是各路径的缓存时长（同时作为 Cache API 的 TTL 依据）。
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
  // 不设 Vary：公开页对任何 Accept-Encoding 渲染结果一致，
  // Cloudflare 会在边缘透明处理压缩。设了反而会让 Cache API 的键匹配变复杂。

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

  const cfCtx = (context.locals as any)?.runtime?.ctx

  // ---- 访客统计 ----
  // ⚠️ 必须放在缓存查找**之前**：命中边缘缓存时不会再执行页面逻辑，
  // 但这次访问仍然应该被记录，否则统计会严重偏低（只有未命中的才被计数）。
  // 写入通过 waitUntil 异步执行，不阻塞响应。
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

  if (cfCtx?.waitUntil) {
    cfCtx.waitUntil(insertPromise)
  }

  // ---- 边缘缓存查找（Cache API）----
  // 见文件顶部说明：SSR 响应必须显式走 Cache API 才会真正被边缘缓存。
  const cacheControl = cacheControlFor(path)
  const edgeCache = (globalThis as any).caches?.default
  const canCache = !!cacheControl && cacheControl !== 'no-store' && !!edgeCache

  let cacheKey: Request | null = null
  let dbg = `caches=${typeof (globalThis as any).caches} default=${!!edgeCache} canCache=${canCache} ctx=${!!cfCtx} waitUntil=${!!cfCtx?.waitUntil}`
  if (canCache) {
    // 缓存键只用 URL（不带 Cookie / UA 等）：公开页对所有访客渲染一致，
    // 这样命中率最高，也避免登录态请求污染缓存。
    cacheKey = new Request(context.url.toString(), { method: 'GET' })
    try {
      const hit = await edgeCache.match(cacheKey)
      if (hit) {
        // ⚠️ 不能直接 `return hit`。Cache API 返回的 Response **headers 是不可变的**，
        // 而 Astro 在中间件返回后还会改这个响应（删内部 ROUTE_TYPE header、
        // attachCookiesToResponse 写 cookie），一改就抛
        // `TypeError: Can't modify immutable headers` → 整页 500。
        // 所以必须用一份可变的 headers 重建 Response。
        const hitBuf = await hit.arrayBuffer()
        const hitHeaders = new Headers(hit.headers)
        hitHeaders.set('x-cache-dbg', `${dbg} HIT`)
        return new Response(hitBuf, {
          status: hit.status,
          statusText: hit.statusText,
          headers: hitHeaders,
        })
      }
      dbg += ' MISS'
    } catch (e: any) {
      dbg += ` matchERR:${e?.message}`
      console.error('[edge cache match]', e?.message || e)
    }
  }

  const response = await next()
  const final = applyCacheControl(response, path)

  // 只把 200 写进缓存（3xx/4xx/5xx 一律不缓存）
  if (cacheKey && cfCtx?.waitUntil && final.status === 200) {
    // ⚠️ 先把 body 读成 buffer 再缓存，**不要用 `final.clone()`**。
    // clone 会 tee 出两条流，其中一条交给后台的 put()，另一条返回给客户端；
    // 实测这条 tee 出来的分支在 waitUntil 里读到的是**空内容**，
    // 结果缓存里存的是空响应，之后所有命中缓存的请求都返回 0 字节。
    // 读成 ArrayBuffer 后各建一个 Response，彻底绕开流的生命周期问题。
    const buf = await final.arrayBuffer()
    const headers = new Headers(final.headers)

    // 【临时诊断】put 走 waitUntil（不阻塞响应），靠下一次请求的 HIT 验证是否生效
    dbg += ' put=scheduled'
    cfCtx.waitUntil(
      edgeCache
        .put(cacheKey, new Response(buf, { status: 200, headers }))
        .catch((e: any) => console.error('[edge cache put]', e?.message || e)),
    )
    headers.set('x-cache-dbg', dbg)

    return new Response(buf, { status: 200, headers })
  }

  return final
})
