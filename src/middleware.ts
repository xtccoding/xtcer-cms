import { defineMiddleware } from 'astro:middleware'
import { supabase } from './lib/supabase'

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next()

  if (context.request.method === 'GET' && !context.url.pathname.startsWith('/api/') && !context.url.pathname.startsWith('/admin')) {
    const ip = context.request.headers.get('cf-connecting-ip') ||
               context.request.headers.get('x-forwarded-for') ||
               context.request.headers.get('x-real-ip') ||
               'unknown'

    const ua = context.request.headers.get('user-agent') || ''
    const referer = context.request.headers.get('referer') || ''

    const { error } = await supabase.from('visitors').insert({
      ip: String(ip).substring(0, 45),
      path: context.url.pathname,
      user_agent: ua.substring(0, 500),
      referer: referer.substring(0, 500),
    })

    if (error) console.error('[visitor tracking]', error.message)
  }

  return response
})
