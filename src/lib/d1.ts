/**
 * D1 上的 supabase 兼容查询层。
 *
 * 为什么要写这个：全站 46 处 `supabase.from(...)` 分布在 50 个文件里。
 * 与其把每处都改写成 SQL，不如在 D1 之上做一层 **与 supabase-js 同形的查询构造器**，
 * 这样 `src/lib/supabase.ts` 只要换成 re-export，46 处调用点一行都不用动。
 *
 * 支持的方法（按实际用到的统计）：
 *   select(列, {count, head}) / insert / update / upsert(行, {onConflict, ignoreDuplicates}) / delete
 *   eq neq gt gte lt lte like ilike is in or not contains overlaps filter match
 *   order limit range single maybeSingle
 *   rpc('increment_downloads', {slug})
 *
 * 返回形态与 supabase 一致：{ data, error, count }
 *
 * 安全：表名、列名一律用白名单校验（来自 d1-schema.mjs），**绝不拼接用户输入**；
 * 所有值都走绑定参数。列清单里出现非法标识符直接抛错，不做「尽力而为」的清洗。
 */
import { TABLES, T, sqliteType } from './d1-schema.mjs'

type Row = Record<string, any>
type Filter = { sql: string; params: any[] }

export interface DbError {
  message: string
  code: string
  details: string | null
  hint: string | null
}

export interface DbResult<T = any> {
  data: T
  error: DbError | null
  count?: number | null
}

function makeError(message: string, code = 'D1_ERROR', details: string | null = null, hint: string | null = null): DbError {
  return { message, code, details, hint }
}

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

function assertTable(table: string): string {
  if (!table || !Object.prototype.hasOwnProperty.call(TABLES, table)) {
    throw new Error(`未知的表: ${table}`)
  }
  return table
}

/** 列名白名单校验。允许 * 与 "a, b, c" 形式。 */
function parseColumns(table: string, raw: string): string[] {
  const spec = String(raw ?? '*').trim()
  if (spec === '*' || spec === '') return ['*']
  const known = TABLES[table].columns
  const out: string[] = []
  for (const piece of spec.split(',')) {
    const name = piece.trim()
    if (!name) continue
    if (!IDENT_RE.test(name)) throw new Error(`非法列名: ${piece}`)
    if (!Object.prototype.hasOwnProperty.call(known, name)) {
      throw new Error(`表 ${table} 没有列 ${name}`)
    }
    out.push(name)
  }
  if (!out.length) return ['*']
  return out
}

function assertColumn(table: string, name: string): string {
  if (!IDENT_RE.test(name)) throw new Error(`非法列名: ${name}`)
  if (!Object.prototype.hasOwnProperty.call(TABLES[table].columns, name)) {
    throw new Error(`表 ${table} 没有列 ${name}`)
  }
  return name
}

/** 表里是否真有这个列（用于「迁移过来的库缺列」时给出清晰报错） */
function isArrayColumn(table: string, col: string): boolean {
  return TABLES[table]?.columns?.[col]?.type === T.ARRAY
}

// ---------------------------------------------------------------- 序列化

function encodeValue(table: string, col: string, val: any): any {
  if (val === undefined) return null
  if (val === null) return null
  const t = TABLES[table]?.columns?.[col]?.type
  if (t === T.ARRAY || t === T.JSON) {
    if (typeof val === 'string') return val
    try {
      return JSON.stringify(val)
    } catch {
      return String(val)
    }
  }
  if (t === T.BOOL) return val ? 1 : 0
  if (t === T.INT) return typeof val === 'boolean' ? (val ? 1 : 0) : val
  return val
}

function decodeRow(table: string, row: Row | null): Row | null {
  if (!row) return row
  const cols = TABLES[table]?.columns || {}
  const out: Row = {}
  for (const key of Object.keys(row)) {
    const v = row[key]
    const t = cols[key]?.type
    if (v === null || v === undefined) {
      out[key] = null
      continue
    }
    if (t === T.ARRAY || t === T.JSON) {
      if (typeof v === 'string') {
        try {
          out[key] = JSON.parse(v)
        } catch {
          out[key] = v
        }
      } else out[key] = v
    } else if (t === T.BOOL) {
      out[key] = v === 1 || v === '1' || v === true
    } else {
      out[key] = v
    }
  }
  return out
}

// ---------------------------------------------------------------- or 语法解析

/**
 * 解析 PostgREST 的 or 字符串，例如：
 *   'expiry.is.null,expiry.gte.2026-01-01'
 *   'title.ilike.%a%,summary.ilike.%b%,tags.cs.{x}'
 *
 * 值里可能自带逗号（如 ilike.%a,b%），所以不能无脑 split(',')：
 * 按逗号切开后，把「不匹配 列.算子. 形状」的片段并回上一段。
 */
function splitOrClause(raw: string): string[] {
  const parts = raw.split(',')
  const out: string[] = []
  for (const p of parts) {
    const looksLikeTerm = /^[A-Za-z_][A-Za-z0-9_]*\.[a-z]+\./.test(p.trim())
    if (!out.length || looksLikeTerm) out.push(p)
    else out[out.length - 1] += ',' + p
  }
  return out.filter((s) => s.trim().length > 0)
}

// ---------------------------------------------------------------- 查询构造器

export type BindingGetter = () => D1Database | null

class QueryBuilder<T = any> implements PromiseLike<DbResult<T>> {
  private table: string
  private getBinding: BindingGetter

  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' | null = null
  private columns = '*'
  private payload: Row | Row[] | null = null
  private onConflict: string | null = null
  private ignoreDuplicates = false
  private returning = false

  private filters: Filter[] = []
  private orders: string[] = []
  private limitN: number | null = null
  private offsetN: number | null = null
  private wantCount = false
  private headOnly = false
  private singleMode: 'single' | 'maybeSingle' | null = null

  private cached: Promise<DbResult<T>> | null = null

  constructor(table: string, getBinding: BindingGetter) {
    this.table = assertTable(table)
    this.getBinding = getBinding
  }

  // -------- 写操作入口

  insert(payload: Row | Row[]) {
    this.op = 'insert'
    this.payload = payload
    return this
  }

  update(payload: Row) {
    this.op = 'update'
    this.payload = payload
    return this
  }

  upsert(payload: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = 'upsert'
    this.payload = payload
    this.onConflict = opts.onConflict || null
    this.ignoreDuplicates = !!opts.ignoreDuplicates
    return this
  }

  delete() {
    this.op = 'delete'
    return this
  }

  select(columns: string = '*', opts: { count?: string; head?: boolean } = {}) {
    if (this.op === null) {
      this.op = 'select'
      this.columns = columns
    } else {
      // insert().select() / update().select() —— 要求回传写入后的行
      this.returning = true
      if (columns && columns !== '*') this.columns = columns
    }
    if (opts?.count) this.wantCount = true
    if (opts?.head) this.headOnly = true
    return this
  }

  // -------- 过滤

  private pushFilter(sql: string, params: any[]) {
    this.filters.push({ sql, params })
    return this
  }

  private cmp(col: string, sqlOp: string, value: any) {
    assertColumn(this.table, col)
    const arr = isArrayColumn(this.table, col)
    // 数组列与标量比较时，值要按 JSON 编码（如 tags.eq.{} → '[]'）
    const encoded = arr && typeof value === 'object' && value !== null ? JSON.stringify(value) : encodeValue(this.table, col, value)
    if (encoded === null) {
      // PostgREST 里 eq null 等价于 IS NULL
      if (sqlOp === '=') return this.pushFilter(`${col} IS NULL`, [])
      return this.pushFilter(`${col} ${sqlOp} NULL`, [])
    }
    return this.pushFilter(`${col} ${sqlOp} ?`, [encoded])
  }

  eq(col: string, value: any) {
    return this.cmp(col, '=', value)
  }
  neq(col: string, value: any) {
    return this.cmp(col, '!=', value)
  }
  gt(col: string, value: any) {
    return this.cmp(col, '>', value)
  }
  gte(col: string, value: any) {
    return this.cmp(col, '>=', value)
  }
  lt(col: string, value: any) {
    return this.cmp(col, '<', value)
  }
  lte(col: string, value: any) {
    return this.cmp(col, '<=', value)
  }

  like(col: string, pattern: string) {
    assertColumn(this.table, col)
    return this.pushFilter(`${col} LIKE ?`, [pattern])
  }

  /** SQLite 的 LIKE 对 ASCII 天然大小写不敏感，中文则本来就区分不了大小写 */
  ilike(col: string, pattern: string) {
    assertColumn(this.table, col)
    return this.pushFilter(`${col} LIKE ?`, [pattern])
  }

  is(col: string, value: null | boolean) {
    assertColumn(this.table, col)
    if (value === null) return this.pushFilter(`${col} IS NULL`, [])
    return this.pushFilter(`${col} IS ?`, [value ? 1 : 0])
  }

  in(col: string, values: any[]) {
    assertColumn(this.table, col)
    if (!Array.isArray(values) || values.length === 0) {
      // 空集合：PostgREST 返回空结果，这里用恒假表达式保持语义
      return this.pushFilter('0 = 1', [])
    }
    const placeholders = values.map(() => '?').join(', ')
    return this.pushFilter(
      `${col} IN (${placeholders})`,
      values.map((v) => encodeValue(this.table, col, v))
    )
  }

  /** 数组列包含某个/某些元素：EXISTS (SELECT 1 FROM json_each(col) WHERE value = ?) */
  contains(col: string, values: any) {
    assertColumn(this.table, col)
    const list = Array.isArray(values) ? values : [values]
    if (!list.length) return this.pushFilter('1 = 1', [])
    const conds = list.map(() => 'value = ?').join(' OR ')
    return this.pushFilter(
      `EXISTS (SELECT 1 FROM json_each(${col}) WHERE ${conds})`,
      list
    )
  }

  /** 数组列与给定集合有交集 */
  overlaps(col: string, values: any[]) {
    assertColumn(this.table, col)
    if (!Array.isArray(values) || !values.length) return this.pushFilter('0 = 1', [])
    const placeholders = values.map(() => '?').join(', ')
    return this.pushFilter(
      `EXISTS (SELECT 1 FROM json_each(${col}) WHERE value IN (${placeholders}))`,
      values
    )
  }

  /** 精确匹配多个列 */
  match(obj: Row) {
    for (const [k, v] of Object.entries(obj || {})) this.eq(k, v)
    return this
  }

  /** 通用 filter(col, operator, value) */
  filter(col: string, operator: string, value: any) {
    switch (operator) {
      case 'eq':
        return this.eq(col, value)
      case 'neq':
        return this.neq(col, value)
      case 'gt':
        return this.gt(col, value)
      case 'gte':
        return this.gte(col, value)
      case 'lt':
        return this.lt(col, value)
      case 'lte':
        return this.lte(col, value)
      case 'like':
        return this.like(col, value)
      case 'ilike':
        return this.ilike(col, value)
      case 'is':
        return this.is(col, value)
      case 'in':
        return this.in(col, value)
      default:
        throw new Error(`不支持的 filter 算子: ${operator}`)
    }
  }

  not(col: string, operator: string, value: any) {
    assertColumn(this.table, col)
    const before = this.filters.length
    ;(this as any)[operator](col, value)
    const added = this.filters.splice(before, this.filters.length - before)[0]
    if (!added) return this
    return this.pushFilter(`NOT (${added.sql})`, added.params)
  }

  /**
   * PostgREST 的 or 语法。
   *   .or('a.ilike.%x%,b.eq.y')
   *   .or('expiry.is.null,expiry.gte.2026-01-01')
   *   .or('tags.is.null,tags.eq.{}')
   *   .or('title.ilike.%q%,tags.cs.{q}')
   */
  or(raw: string) {
    const terms = splitOrClause(String(raw))
    const sqls: string[] = []
    const params: any[] = []
    for (const term of terms) {
      const m = term.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\.([a-z]+)\.(.*)$/s)
      if (!m) throw new Error(`无法解析 or 片段: ${term}`)
      const [, col, operator, rawValue] = m
      assertColumn(this.table, col)
      const f = this.buildOrTerm(col, operator, rawValue)
      sqls.push(f.sql)
      params.push(...f.params)
    }
    if (!sqls.length) return this.pushFilter('1 = 1', [])
    return this.pushFilter(`(${sqls.join(' OR ')})`, params)
  }

  private buildOrTerm(col: string, operator: string, rawValue: string): Filter {
    const isArr = isArrayColumn(this.table, col)
    switch (operator) {
      case 'is': {
        if (rawValue === 'null') return { sql: `${col} IS NULL`, params: [] }
        if (rawValue === 'true') return { sql: `${col} IS 1`, params: [] }
        if (rawValue === 'false') return { sql: `${col} IS 0`, params: [] }
        return { sql: `${col} IS ?`, params: [rawValue] }
      }
      case 'eq': {
        // 数组列的 {} 表示空数组
        if (isArr && rawValue === '{}') return { sql: `${col} = '[]'`, params: [] }
        return { sql: `${col} = ?`, params: [rawValue] }
      }
      case 'neq':
        return { sql: `${col} != ?`, params: [rawValue] }
      case 'gt':
        return { sql: `${col} > ?`, params: [rawValue] }
      case 'gte':
        return { sql: `${col} >= ?`, params: [rawValue] }
      case 'lt':
        return { sql: `${col} < ?`, params: [rawValue] }
      case 'lte':
        return { sql: `${col} <= ?`, params: [rawValue] }
      case 'like':
      case 'ilike':
        return { sql: `${col} LIKE ?`, params: [rawValue] }
      case 'cs': {
        // tags.cs.{x} —— 数组包含
        const inner = rawValue.replace(/^\{/, '').replace(/\}$/, '')
        const vals = inner.length ? inner.split(',').map((s) => s.trim()) : []
        if (!vals.length) return { sql: '1 = 1', params: [] }
        const conds = vals.map(() => 'value = ?').join(' OR ')
        return { sql: `EXISTS (SELECT 1 FROM json_each(${col}) WHERE ${conds})`, params: vals }
      }
      case 'in': {
        const inner = rawValue.replace(/^\(/, '').replace(/\)$/, '')
        const vals = inner.length ? inner.split(',').map((s) => s.trim()) : []
        if (!vals.length) return { sql: '0 = 1', params: [] }
        return { sql: `${col} IN (${vals.map(() => '?').join(', ')})`, params: vals }
      }
      default:
        throw new Error(`or 里不支持的算子: ${operator}`)
    }
  }

  // -------- 排序 / 分页

  order(column: string, opts: { ascending?: boolean } = {}) {
    assertColumn(this.table, column)
    const dir = opts?.ascending === false ? 'DESC' : 'ASC'
    this.orders.push(`${column} ${dir}`)
    return this
  }

  limit(n: number) {
    this.limitN = Number(n)
    return this
  }

  range(from: number, to: number) {
    this.offsetN = Number(from)
    this.limitN = Number(to) - Number(from) + 1
    return this
  }

  // -------- 终态

  single(): QueryBuilder<any> {
    this.singleMode = 'single'
    return this as any
  }

  maybeSingle(): QueryBuilder<any> {
    this.singleMode = 'maybeSingle'
    return this as any
  }

  // -------- 执行

  private buildWhere(): { sql: string; params: any[] } {
    if (!this.filters.length) return { sql: '', params: [] }
    const sql = ' WHERE ' + this.filters.map((f) => f.sql).join(' AND ')
    return { sql, params: this.filters.flatMap((f) => f.params) }
  }

  private async run(): Promise<DbResult<any>> {
    const db = this.getBinding()
    if (!db) {
      return {
        data: null,
        error: makeError(
          'D1 绑定未就绪：Pages 项目缺少变量名为 DB 的 D1 绑定',
          'D1_NOT_BOUND',
          '在 Cloudflare Pages → Settings → Bindings 添加 D1 database，变量名必须是 DB'
        ),
        count: null,
      }
    }

    try {
      switch (this.op) {
        case 'select':
          return await this.runSelect(db)
        case 'insert':
          return await this.runInsert(db)
        case 'upsert':
          return await this.runUpsert(db)
        case 'update':
          return await this.runUpdate(db)
        case 'delete':
          return await this.runDelete(db)
        default:
          return { data: null, error: makeError('未指定操作（select/insert/update/upsert/delete）'), count: null }
      }
    } catch (err: any) {
      const message = err?.message || String(err)
      // 把常见的 SQLite 报错翻译成人话
      if (/no such table/i.test(message)) {
        return { data: null, error: makeError(message, 'NO_SUCH_TABLE', 'D1 里还没有这张表，先跑 database/d1-schema.sql'), count: null }
      }
      if (/no such column/i.test(message)) {
        return { data: null, error: makeError(message, 'NO_SUCH_COLUMN', '表结构与代码不一致，重新跑 database/d1-schema.sql'), count: null }
      }
      if (/UNIQUE constraint failed/i.test(message)) {
        return { data: null, error: makeError(message, '23505', '违反唯一约束'), count: null }
      }
      return { data: null, error: makeError(message), count: null }
    }
  }

  private async runSelect(db: D1Database): Promise<DbResult<any>> {
    const cols = parseColumns(this.table, this.columns)
    const where = this.buildWhere()
    const selectList = cols[0] === '*' ? '*' : cols.join(', ')

    let count: number | null = null
    if (this.wantCount) {
      const row = await db
        .prepare(`SELECT COUNT(*) AS c FROM ${this.table}${where.sql}`)
        .bind(...where.params)
        .first<{ c: number }>()
      count = row ? Number(row.c) : 0
    }

    if (this.headOnly) {
      return { data: null, error: null, count }
    }

    let sql = `SELECT ${selectList} FROM ${this.table}${where.sql}`
    if (this.orders.length) sql += ` ORDER BY ${this.orders.join(', ')}`
    if (this.limitN !== null) sql += ` LIMIT ${Math.max(0, this.limitN)}`
    else if (this.offsetN !== null) sql += ` LIMIT -1`
    if (this.offsetN !== null) sql += ` OFFSET ${Math.max(0, this.offsetN)}`

    const res = await db.prepare(sql).bind(...where.params).all<Row>()
    let rows = (res.results || []).map((r) => decodeRow(this.table, r))

    if (this.singleMode) {
      if (!rows.length) {
        if (this.singleMode === 'maybeSingle') return { data: null, error: null, count }
        return {
          data: null,
          error: makeError('JSON object requested, multiple (or no) rows returned', 'PGRST116', '结果为空，但用了 .single()'),
          count,
        }
      }
      if (rows.length > 1) {
        return {
          data: null,
          error: makeError('JSON object requested, multiple (or no) rows returned', 'PGRST116', `返回了 ${rows.length} 行，但用了 .single()`),
          count,
        }
      }
      return { data: rows[0], error: null, count }
    }

    return { data: rows, error: null, count }
  }

  /** 构造插入用的列/值对，缺 id 时自动生成 uuid */
  private prepareRows(rows: Row[]): { cols: string[]; rows: any[][] } {
    const tableCols = TABLES[this.table].columns
    const hasId = Object.prototype.hasOwnProperty.call(tableCols, 'id')

    // 先生成 id，再收集列名 —— 顺序反了会导致自动生成的 id 被漏掉
    const prepared = rows.map((r) => {
      const row: Row = { ...r }
      if (hasId && (row.id === undefined || row.id === null || row.id === '')) {
        row.id = crypto.randomUUID()
      }
      return row
    })

    // 只保留表里真实存在的列
    const cols = new Set<string>()
    for (const r of prepared) {
      for (const k of Object.keys(r)) {
        if (Object.prototype.hasOwnProperty.call(tableCols, k)) cols.add(k)
      }
    }
    const colList = [...cols]

    const values = prepared.map((r) => colList.map((c) => encodeValue(this.table, c, r[c])))

    return { cols: colList, rows: values }
  }

  private async runInsert(db: D1Database): Promise<DbResult<any>> {
    const rows = Array.isArray(this.payload) ? this.payload : [this.payload as Row]
    if (!rows.length) return { data: this.returning ? [] : null, error: null }

    const { cols, rows: valueRows } = this.prepareRows(rows as Row[])
    if (!cols.length) return { data: null, error: makeError('插入的行没有任何已知列'), count: null }

    const placeholders = `(${cols.map(() => '?').join(', ')})`
    const allPlaceholders = valueRows.map(() => placeholders).join(', ')
    const flat = valueRows.flat()

    let sql = `INSERT INTO ${this.table} (${cols.join(', ')}) VALUES ${allPlaceholders}`
    if (this.returning) sql += ' RETURNING *'

    const stmt = db.prepare(sql).bind(...flat)
    if (this.returning) {
      const res = await stmt.all<Row>()
      const decoded = (res.results || []).map((r) => decodeRow(this.table, r))
      return { data: this.singleMode ? decoded[0] ?? null : decoded, error: null }
    }
    await stmt.run()
    return { data: null, error: null }
  }

  private async runUpsert(db: D1Database): Promise<DbResult<any>> {
    const rows = Array.isArray(this.payload) ? this.payload : [this.payload as Row]
    if (!rows.length) return { data: this.returning ? [] : null, error: null }

    const { cols, rows: valueRows } = this.prepareRows(rows as Row[])
    if (!cols.length) return { data: null, error: makeError('upsert 的行没有任何已知列'), count: null }

    const conflictCols = (this.onConflict || 'id')
      .split(',')
      .map((s) => assertColumn(this.table, s.trim()))

    const placeholders = `(${cols.map(() => '?').join(', ')})`
    const allPlaceholders = valueRows.map(() => placeholders).join(', ')
    const flat = valueRows.flat()

    let sql = `INSERT INTO ${this.table} (${cols.join(', ')}) VALUES ${allPlaceholders}`
    sql += ` ON CONFLICT(${conflictCols.join(', ')})`
    if (this.ignoreDuplicates) {
      sql += ' DO NOTHING'
    } else {
      const updatable = cols.filter((c) => !conflictCols.includes(c))
      sql += updatable.length
        ? ` DO UPDATE SET ${updatable.map((c) => `${c} = excluded.${c}`).join(', ')}`
        : ' DO NOTHING'
    }
    if (this.returning) sql += ' RETURNING *'

    const stmt = db.prepare(sql).bind(...flat)
    if (this.returning) {
      const res = await stmt.all<Row>()
      const decoded = (res.results || []).map((r) => decodeRow(this.table, r))
      return { data: this.singleMode ? decoded[0] ?? null : decoded, error: null }
    }
    await stmt.run()
    return { data: null, error: null }
  }

  private async runUpdate(db: D1Database): Promise<DbResult<any>> {
    const payload = (this.payload || {}) as Row
    const tableCols = TABLES[this.table].columns
    const entries = Object.entries(payload).filter(([k]) =>
      Object.prototype.hasOwnProperty.call(tableCols, k)
    )
    if (!entries.length) return { data: null, error: makeError('update 没有提供任何已知列'), count: null }

    const where = this.buildWhere()
    const setSql = entries.map(([k]) => `${k} = ?`).join(', ')
    const params = entries.map(([k, v]) => encodeValue(this.table, k, v))

    let sql = `UPDATE ${this.table} SET ${setSql}${where.sql}`
    if (this.returning) sql += ' RETURNING *'

    const stmt = db.prepare(sql).bind(...params, ...where.params)
    if (this.returning) {
      const res = await stmt.all<Row>()
      const decoded = (res.results || []).map((r) => decodeRow(this.table, r))
      return { data: this.singleMode ? decoded[0] ?? null : decoded, error: null }
    }
    await stmt.run()
    return { data: null, error: null }
  }

  private async runDelete(db: D1Database): Promise<DbResult<any>> {
    const where = this.buildWhere()
    let sql = `DELETE FROM ${this.table}${where.sql}`
    if (this.returning) sql += ' RETURNING *'

    const stmt = db.prepare(sql).bind(...where.params)
    if (this.returning) {
      const res = await stmt.all<Row>()
      const decoded = (res.results || []).map((r) => decodeRow(this.table, r))
      return { data: this.singleMode ? decoded[0] ?? null : decoded, error: null }
    }
    await stmt.run()
    return { data: null, error: null }
  }

  then<TResult1 = DbResult<T>, TResult2 = never>(
    onfulfilled?: ((value: DbResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    if (!this.cached) this.cached = this.run() as Promise<DbResult<T>>
    return this.cached.then(onfulfilled, onrejected)
  }
}

// ---------------------------------------------------------------- rpc

/** 目前只用到 increment_downloads，其余 RPC 一律报错，避免静默走错 */
async function runRpc(getBinding: BindingGetter, fn: string, args: Row = {}): Promise<DbResult<any>> {
  const db = getBinding()
  if (!db) {
    return {
      data: null,
      error: makeError('D1 绑定未就绪（变量名必须是 DB）', 'D1_NOT_BOUND'),
      count: null,
    }
  }
  try {
    if (fn === 'increment_downloads') {
      if (!args.slug) return { data: null, error: makeError('increment_downloads 需要 slug'), count: null }
      await db
        .prepare('UPDATE files SET downloads = downloads + 1 WHERE share_slug = ?')
        .bind(String(args.slug))
        .run()
      return { data: null, error: null }
    }
    return { data: null, error: makeError(`未实现的 rpc: ${fn}`, 'RPC_NOT_IMPLEMENTED'), count: null }
  } catch (err: any) {
    return { data: null, error: makeError(err?.message || String(err)), count: null }
  }
}

// ---------------------------------------------------------------- 对外接口

export interface Db {
  from<T = any>(table: string): QueryBuilder<T>
  rpc(fn: string, args?: Row): Promise<DbResult<any>>
}

export function createDb(getBinding: BindingGetter): Db {
  return {
    from<T = any>(table: string) {
      return new QueryBuilder<T>(table, getBinding)
    },
    rpc(fn: string, args?: Row) {
      return runRpc(getBinding, fn, args)
    },
  }
}

export { QueryBuilder }
