import { defineConfig } from 'astro/config'
import cloudflare from '@astrojs/cloudflare'
import tailwind from '@tailwindcss/vite'

export default defineConfig({
  site: 'https://xtcer.cn',
  output: 'server',
  adapter: cloudflare(),
  vite: {
    plugins: [tailwind()],
  },
})
