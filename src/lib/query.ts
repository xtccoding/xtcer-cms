import { supabase } from './supabase'

/**
 * Supabase PostgREST 默认 `max-rows = 1000`：一次性 select 超过 1000 行会被**静默截断**，
 * 既不会报错也不会提示。需要全量数据时（sitemap / 标签聚合 / RSS）必须用本函数按
 * range 分页拉取，否则数据一过 1000 条就悄悄丢。
 *
 * 实测：posts 已有 1041 行，直接 `.select('*')` 只能拿到 1000 行。
 */
export async function fetchAll<T = any>(
  table: string,
  select = '*',
  options: {
    order?: { column: string; ascending?: boolean }
    pageSize?: number
  } = {}
): Promise<T[]> {
  const pageSize = options.pageSize ?? 1000
  const all: T[] = []
  let offset = 0

  for (;;) {
    // 用 any 规避 Database 泛型对动态表名的约束（表名来自本文件内的调用方，非用户输入）
    let query = (supabase as any).from(table).select(select).range(offset, offset + pageSize - 1)
    if (options.order) {
      query = query.order(options.order.column, { ascending: options.order.ascending ?? false })
    }

    const { data, error } = await query
    if (error) {
      console.error(`[fetchAll] ${table} offset=${offset}: ${error.message}`)
      break
    }
    if (!data || data.length === 0) break

    all.push(...(data as T[]))
    // 返回不足一页 → 已到末尾
    if (data.length < pageSize) break
    offset += pageSize
  }

  return all
}

/**
 * 精确行数，**不受 max-rows 影响**（`head: true` 只取 count 不取行）。
 * 用于首页/后台的「共 N 篇」这类统计，避免显示被截断的 1000。
 */
export async function countRows(table: string): Promise<number> {
  const { count, error } = await (supabase as any)
    .from(table)
    .select('id', { count: 'exact', head: true })

  if (error) {
    console.error(`[countRows] ${table}: ${error.message}`)
    return 0
  }
  return count ?? 0
}
