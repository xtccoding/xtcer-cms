/**
 * 请求期的 Cloudflare 运行时环境（bindings + 环境变量）。
 *
 * 为什么要这个：`src/lib/supabase.ts` 是个**模块级单例**，被 50 个文件 import，
 * 而 D1 绑定只能从 `Astro.locals.runtime.env` 拿到 —— 单例在 import 期拿不到它。
 * 所以在 middleware 里把 env 塞进来，查询层再从这里取。
 *
 * 模块级缓存是否安全？**安全。** bindings 是「每次部署恒定」的，同一个 isolate 里
 * 所有请求拿到的是同一个 env 对象，不存在请求间串号的问题。
 * 每次请求都覆盖写，是为了兼容 dev（platformProxy）下首个请求 env 可能还没就绪的情况。
 */

let currentEnv: any = null

export function setRuntimeEnv(env: any): void {
  if (env && typeof env === 'object') currentEnv = env
}

export function getRuntimeEnv(): any {
  return currentEnv
}
