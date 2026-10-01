/**
 * 服务端专用 Supabase 客户端（service_role）。
 *
 * ⚠️ 只允许在服务端使用：Astro 页面 frontmatter 与 /api/* 路由。
 *    绝不可被任何 `<script>` 客户端脚本 import —— service_role key 会绕过
 *    全部 RLS，一旦进浏览器 bundle 等于把整库读写权限公开。
 *
 * 为什么需要它：`feedback` 表故意只给 anon INSERT、不给 SELECT
 * （anon key 会打进浏览器 bundle，等于公开）。后台要读反馈，只能走
 * 服务端持有的 service_role key。
 *
 * 为什么 key 不能带 PUBLIC_ 前缀：Astro 只会把 `PUBLIC_*` 注入客户端，
 * 其余变量在客户端代码里取到 undefined，这是最后一道保险。
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

/** 读取构建期注入的 service_role key。静态成员访问，见 admin-auth.ts 注释。 */
function readBuildServiceKey(): unknown {
  try {
    return import.meta.env.SUPABASE_SERVICE_ROLE_KEY
  } catch {
    return undefined
  }
}

function readBuildSupabaseUrl(): unknown {
  try {
    return import.meta.env.PUBLIC_SUPABASE_URL
  } catch {
    return undefined
  }
}

/** 解析 service_role key：优先 Cloudflare runtime env，其次构建期 env。未配置返回 null。 */
export function resolveServiceRoleKey(env: any): string | null {
  const key = env?.SUPABASE_SERVICE_ROLE_KEY ?? readBuildServiceKey()
  if (typeof key !== 'string' || key.trim().length === 0) return null
  return key.trim()
}

/**
 * 创建绕过 RLS 的管理客户端。
 *
 * fail closed：未配置 SUPABASE_SERVICE_ROLE_KEY 时返回 null，
 * 调用方必须显式处理「未配置」并给出配置指引，不得回退到 anon key
 * （anon 读不到 feedback，回退只会得到一张空表，反而误导）。
 */
export function createAdminClient(env: any): SupabaseClient<Database> | null {
  if (typeof window !== 'undefined') {
    throw new Error('[supabase-admin] 禁止在浏览器端创建 service_role 客户端')
  }

  const key = resolveServiceRoleKey(env)
  if (!key) return null

  const url = env?.PUBLIC_SUPABASE_URL ?? readBuildSupabaseUrl()
  if (typeof url !== 'string' || url.length === 0) return null

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
