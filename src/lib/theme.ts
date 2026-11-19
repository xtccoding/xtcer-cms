/**
 * 站点主题令牌（可在后台「外观」里实时调整，写入 site_settings.key = 'theme'）。
 *
 * 设计原则：这里只暴露**与明暗模式无关**的少量令牌（主色 / 强调色 / 圆角 / 字号缩放）。
 * 背景、文本、边框仍由 global.css 的 dark / light 两套变量管理，
 * 避免后台把暗色调色板强行套到浅色模式上导致不可读。
 */
export interface SiteTheme {
  primary: string
  accent: string
  radius: number
  fontScale: number
}

export const THEME_DEFAULTS: SiteTheme = {
  primary: '#2997ff',
  accent: '#bf5af2',
  radius: 12,
  fontScale: 1,
}

const HEX = /^#[0-9a-fA-F]{6}$/

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

export function normalizeTheme(raw: unknown): SiteTheme {
  const t = (raw && typeof raw === 'object' ? raw : {}) as Partial<SiteTheme>
  return {
    primary: typeof t.primary === 'string' && HEX.test(t.primary) ? t.primary.toLowerCase() : THEME_DEFAULTS.primary,
    accent: typeof t.accent === 'string' && HEX.test(t.accent) ? t.accent.toLowerCase() : THEME_DEFAULTS.accent,
    radius: Number.isFinite(Number(t.radius)) ? clamp(Number(t.radius), 0, 28) : THEME_DEFAULTS.radius,
    fontScale: Number.isFinite(Number(t.fontScale)) ? clamp(Number(t.fontScale), 0.85, 1.25) : THEME_DEFAULTS.fontScale,
  }
}

/** 把 #rrggbb 压暗 percent（0–100），用于推导 hover 色。 */
function shade(hex: string, percent: number): string {
  const n = parseInt(hex.slice(1), 16)
  const f = 1 - percent / 100
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)))
  const r = c((n >> 16) & 255)
  const g = c((n >> 8) & 255)
  const b = c(n & 255)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/**
 * 生成注入到 <head> 末尾的 CSS 变量覆盖（服务端渲染，无闪烁）。
 *
 * 选择器用 `html:root` / `html:root.light` 而不是 `:root`：
 * global.css 里浅色模式是 `:root.light`（0,2,0），普通 `:root`（0,1,0）压不过它，
 * 而注入样式的先后顺序在 Astro 里不保证。提高特异性后与顺序无关，明暗两套都能覆盖。
 */
export function themeCss(theme: SiteTheme): string {
  const r = theme.radius
  const vars = [
    `--primary:${theme.primary}`,
    `--primary-hover:${shade(theme.primary, 16)}`,
    `--accent:${theme.accent}`,
    `--radius:${r}px`,
    `--radius-sm:${Math.max(2, r - 4)}px`,
    `--radius-lg:${r + 8}px`,
    `--font-scale:${theme.fontScale}`,
  ].join(';')
  return `html:root,html:root.light{${vars}}`
}
