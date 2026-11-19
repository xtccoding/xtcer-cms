/**
 * D1 + Drizzle 客户端。
 *
 * D1 绑定只能从请求期环境拿（`Astro.locals.runtime.env`），而 middleware 已经把它
 * 写进了 `runtime-env.ts`，所以这里默认从 `getRuntimeEnv()` 取，调用方无感。
 *
 * 拿不到 `DB` 时抛错（fail loud）：静默返回空数组会让「数据库没绑上」伪装成
 * 「没有数据」，在后台尤其危险。
 */
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1'
import * as schema from './schema'
import { getRuntimeEnv } from './runtime-env'

export type Db = DrizzleD1Database<typeof schema>

const cache = new WeakMap<object, Db>()

export function getDb(env?: any): Db {
  const e = env ?? getRuntimeEnv()
  const d1 = e?.DB
  if (!d1) {
    throw new Error(
      'D1 绑定 DB 未配置：请检查 wrangler.toml 的 [[d1_databases]] 与 Pages 项目绑定',
    )
  }
  const hit = cache.get(d1)
  if (hit) return hit
  const db = drizzle(d1, { schema })
  cache.set(d1, db)
  return db
}

/** 后台统计等「可以容忍失败」的场景用：绑定缺失时返回 null 而不是抛错。 */
export function getDbOrNull(env?: any): Db | null {
  const e = env ?? getRuntimeEnv()
  return e?.DB ? getDb(e) : null
}

/** 统一时间戳：定长毫秒精度 ISO 8601（保证 TEXT 排序即时间排序）。 */
export function nowIso(): string {
  return new Date().toISOString()
}

/** JSON 列兜底解析。 */
export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    const v = JSON.parse(raw)
    return (v ?? fallback) as T
  } catch {
    return fallback
  }
}

/** JSON 列序列化。 */
export function jsonText(value: unknown): string {
  return JSON.stringify(value ?? null)
}
