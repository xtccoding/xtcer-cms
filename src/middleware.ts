import { defineMiddleware } from 'astro:middleware'

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next()

  if (context.request.method === 'GET' && !context.url.pathname.startsWith('/api/') && !context.url.pathname.startsWith('/admin')) {
    const ip = context.request.headers.get('cf-connecting-ip') ||
               context.request.headers.get('x-forwarded-for') ||
               context.request.headers.get('x-real-ip') ||
               'unknown'

    const ua = context.request.headers.get('user-agent') || ''
    const referer = context.request.headers.get('referer') || ''

    try {
      const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL
      const supabaseKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY

      if (supabaseUrl && supabaseKey) {
        fetch(`${supabaseUrl}/rest/v1/visitors`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            ip: String(ip).substring(0, 45),
            path: context.url.pathname,
            user_agent: ua.substring(0, 500),
            referer: referer.substring(0, 500),
          }),
        }).catch(() => {})
      }
    } catch {}
  }

  return response
})
