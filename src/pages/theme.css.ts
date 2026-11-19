import type { APIRoute } from 'astro'
import { getSetting } from '../lib/store'
import { THEME_DEFAULTS, normalizeTheme, themeCss } from '../lib/theme'

/**
 * 全站外观令牌样式表（/theme.css）。
 *
 * 后台「外观 → 主题」把 { primary, accent, radius, fontScale } 写进 site_settings.theme，
 * 这里读出来生成 CSS 变量覆盖 global.css。单独成文件是为了配合边缘缓存：
 * HTML 缓存 5 分钟、文章页 1 小时，而这里只缓存 60 秒，改完主题一分钟内全站生效。
 * 读库失败时返回默认值，宁可外观回落也不能让页面挂掉。
 */
export const prerender = false

export const GET: APIRoute = async () => {
  let theme = THEME_DEFAULTS
  try {
    theme = normalizeTheme(await getSetting('theme'))
  } catch (e: any) {
    console.error('[theme.css]', e?.message || e)
  }

  return new Response(themeCss(theme), {
    headers: {
      'Content-Type': 'text/css; charset=utf-8',
      'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=600',
    },
  })
}
