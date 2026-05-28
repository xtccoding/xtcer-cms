import { defineConfig } from 'astro/config'
import cloudflare from '@astrojs/cloudflare'

export default defineConfig({
  site: 'https://xtcer.cn',
  output: 'server',
  adapter: cloudflare(),
})
