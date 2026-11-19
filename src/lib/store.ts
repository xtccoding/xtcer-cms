/**
 * 数据访问层（唯一允许写 SQL / Drizzle 的地方）。
 *
 * 为什么集中到一层：原来 40 多个文件各自拼 PostgREST 链式查询（共 116 处），
 * 迁到 D1 时如果照原样散落改写，SQL 细节会重复 100 多遍且极易出现偏差。
 * 这里按「表 + 语义」提供函数，页面与 API 只调用，不关心 SQL。
 *
 * JSON 列（posts.tags / feeds.tags / feeds.metadata / assets.tags / site_settings.value）
 * 在库里是 TEXT，读写都在本层完成 parse / stringify，对外仍然返回数组或对象。
 */
import { and, asc, desc, eq, gte, inArray, like, ne, or, sql } from 'drizzle-orm'
import { getDb, jsonText, nowIso, parseJson, type Db } from './db'
import * as s from './schema'

const db = (env?: any) => getDb(env)

function isoOrNull(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'string') return v
  const d = new Date(v as any)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// ---------------------------------------------------------------- posts

const postTags = (row: any) => ({ ...row, tags: parseJson<string[]>(row.tags, []) })

export async function listRecentPosts(limit = 12, env?: any) {
  const rows = await db(env)
    .select({
      id: s.posts.id,
      title: s.posts.title,
      summary: s.posts.summary,
      content: s.posts.content,
      created_at: s.posts.created_at,
      views: s.posts.views,
    })
    .from(s.posts)
    .orderBy(desc(s.posts.created_at))
    .limit(limit)
  return rows
}

export async function listPostsPage(limit: number, offset: number, env?: any) {
  const rows = await db(env)
    .select({
      id: s.posts.id,
      title: s.posts.title,
      summary: s.posts.summary,
      content: s.posts.content,
      created_at: s.posts.created_at,
      views: s.posts.views,
      tags: s.posts.tags,
    })
    .from(s.posts)
    .orderBy(desc(s.posts.created_at))
    .limit(limit)
    .offset(offset)
  return rows.map(postTags)
}

/** 专题页：按多个情报类型批量取（替代 PostgREST 的 .in()）。 */
export async function listFeedsByTypes(types: string[], limit: number, env?: any) {
  if (types.length === 0) return []
  const rows = await db(env)
    .select()
    .from(s.feeds)
    .where(inArray(s.feeds.feed_type, types))
    .orderBy(desc(s.feeds.created_at))
    .limit(limit)
  return rows.map(feedRow)
}

/** 专题页：命中任意一个标签即返回（替代 PostgREST 的 .overlaps()）。 */
export async function listPostsByAnyTag(tags: string[], limit: number, env?: any) {
  if (tags.length === 0) return []
  const where = or(...tags.map((t) => like(s.posts.tags, `%${JSON.stringify(t).slice(1, -1)}%`)))
  const rows = await db(env)
    .select()
    .from(s.posts)
    .where(where)
    .orderBy(desc(s.posts.created_at))
    .limit(limit)
  return rows.map(postTags)
}

export async function countPosts(env?: any) {
  const [row] = await db(env).select({ n: sql<number>`count(*)` }).from(s.posts)
  return Number(row?.n ?? 0)
}

export async function getPost(id: string, env?: any) {
  const row = await db(env).select().from(s.posts).where(eq(s.posts.id, id)).get()
  return row ? postTags(row) : null
}

export async function getPostLite(id: string, env?: any) {
  const row = await db(env)
    .select({ id: s.posts.id, title: s.posts.title, tags: s.posts.tags })
    .from(s.posts)
    .where(eq(s.posts.id, id))
    .get()
  return row ? postTags(row) : null
}

export async function getOtherPosts(id: string, limit = 8, env?: any) {
  return db(env)
    .select({
      id: s.posts.id,
      title: s.posts.title,
      views: s.posts.views,
      created_at: s.posts.created_at,
    })
    .from(s.posts)
    .where(ne(s.posts.id, id))
    .orderBy(desc(s.posts.created_at))
    .limit(limit)
}

export async function listPostCandidates(excludeId: string, limit = 30, env?: any) {
  const rows = await db(env)
    .select({
      id: s.posts.id,
      title: s.posts.title,
      summary: s.posts.summary,
      created_at: s.posts.created_at,
      views: s.posts.views,
      tags: s.posts.tags,
    })
    .from(s.posts)
    .where(ne(s.posts.id, excludeId))
    .orderBy(desc(s.posts.created_at))
    .limit(limit)
  return rows.map(postTags)
}

export async function listPostsByTag(tag: string, limit: number, offset = 0, env?: any) {
  const rows = await db(env)
    .select()
    .from(s.posts)
    .where(like(s.posts.tags, `%${JSON.stringify(tag).slice(1, -1)}%`))
    .orderBy(desc(s.posts.created_at))
    .limit(limit)
    .offset(offset)
  return rows.map(postTags)
}

export async function countPostsByTag(tag: string, env?: any) {
  const [row] = await db(env)
    .select({ n: sql<number>`count(*)` })
    .from(s.posts)
    .where(like(s.posts.tags, `%${JSON.stringify(tag).slice(1, -1)}%`))
  return Number(row?.n ?? 0)
}

export async function listPostsByAuthor(author: string, limit: number, offset = 0, env?: any) {
  const rows = await db(env)
    .select()
    .from(s.posts)
    .where(eq(s.posts.author, author))
    .orderBy(desc(s.posts.created_at))
    .limit(limit)
    .offset(offset)
  return rows.map(postTags)
}

export async function countPostsByAuthor(author: string, env?: any) {
  const [row] = await db(env)
    .select({ n: sql<number>`count(*)` })
    .from(s.posts)
    .where(eq(s.posts.author, author))
  return Number(row?.n ?? 0)
}

export async function listAllPosts(env?: any) {
  const rows = await db(env).select().from(s.posts).orderBy(desc(s.posts.created_at))
  return rows.map(postTags)
}

export async function createPost(input: any, env?: any) {
  const now = nowIso()
  const row = await db(env)
    .insert(s.posts)
    .values({
      title: input.title,
      summary: input.summary ?? null,
      content: input.content ?? '',
      tags: jsonText(input.tags ?? []),
      author: input.author ?? null,
      created_at: now,
      updated_at: now,
    })
    .returning()
    .get()
  return postTags(row)
}

export async function updatePost(id: string, patch: Record<string, any>, env?: any) {
  const values: any = { ...patch }
  if (values.tags !== undefined) values.tags = jsonText(values.tags)
  const row = await db(env)
    .update(s.posts)
    .set(values)
    .where(eq(s.posts.id, id))
    .returning()
    .get()
  return row ? postTags(row) : null
}

export async function deletePost(id: string, env?: any) {
  await db(env).delete(s.posts).where(eq(s.posts.id, id))
}

export async function existingPostIds(ids: string[], env?: any) {
  if (ids.length === 0) return []
  const rows = await db(env).select({ id: s.posts.id }).from(s.posts).where(inArray(s.posts.id, ids))
  return rows.map((r) => r.id)
}

export async function deletePosts(ids: string[], env?: any) {
  if (ids.length === 0) return
  await db(env).delete(s.posts).where(inArray(s.posts.id, ids))
}

export async function getPostTagsMap(ids: string[], env?: any) {
  const map = new Map<string, string[]>()
  if (ids.length === 0) return map
  const rows = await db(env)
    .select({ id: s.posts.id, tags: s.posts.tags })
    .from(s.posts)
    .where(inArray(s.posts.id, ids))
  for (const r of rows) map.set(r.id, parseJson<string[]>(r.tags, []))
  return map
}

/** AI 打标用：取一批还没有标签的文章（D1 里空标签存的是 '[]'）。 */
export async function listUntaggedPosts(limit: number, env?: any) {
  const rows = await db(env)
    .select({ id: s.posts.id, title: s.posts.title, content: s.posts.content, tags: s.posts.tags })
    .from(s.posts)
    .where(or(eq(s.posts.tags, '[]'), eq(s.posts.tags, ''), sql`${s.posts.tags} IS NULL`))
    .orderBy(desc(s.posts.created_at))
    .limit(limit)
  return rows.map(postTags)
}

/** 原子自增，避免「读-改-写」并发丢计数。 */
export async function incrementPostViews(id: string, env?: any) {
  const row = await db(env)
    .update(s.posts)
    .set({ views: sql`${s.posts.views} + 1` })
    .where(eq(s.posts.id, id))
    .returning({ views: s.posts.views })
    .get()
  return row?.views ?? null
}

// ---------------------------------------------------------------- links

export async function listLinks(env?: any) {
  return db(env).select().from(s.links).orderBy(asc(s.links.sort_order))
}

export async function countLinks(env?: any) {
  const [row] = await db(env).select({ n: sql<number>`count(*)` }).from(s.links)
  return Number(row?.n ?? 0)
}

export async function countDeals(env?: any) {
  const [row] = await db(env).select({ n: sql<number>`count(*)` }).from(s.deals)
  return Number(row?.n ?? 0)
}

export async function createLink(input: any, env?: any) {
  return db(env)
    .insert(s.links)
    .values({
      title: input.title,
      url: input.url,
      description: input.description ?? null,
      icon: input.icon ?? null,
      category: input.category ?? '默认',
      sort_order: input.sort_order ?? 0,
    })
    .returning()
    .get()
}

export async function updateLink(id: string, patch: Record<string, any>, env?: any) {
  return db(env).update(s.links).set(patch).where(eq(s.links.id, id)).returning().get()
}

export async function deleteLink(id: string, env?: any) {
  await db(env).delete(s.links).where(eq(s.links.id, id))
}

// ---------------------------------------------------------------- deals

export async function listDeals(opts: { includeExpired?: boolean; category?: string | null; region?: string | null } = {}, env?: any) {
  const today = new Date().toISOString().slice(0, 10)
  const where: any[] = [eq(s.deals.is_active, 1)]
  if (!opts.includeExpired) {
    where.push(or(sql`${s.deals.expiry} IS NULL`, gte(s.deals.expiry, today)))
  }
  if (opts.category) where.push(eq(s.deals.category, opts.category))
  if (opts.region) where.push(eq(s.deals.region, opts.region))
  return db(env)
    .select()
    .from(s.deals)
    .where(and(...where))
    .orderBy(sql`${s.deals.price_cny} IS NULL`, asc(s.deals.price_cny))
}

export async function listAllDeals(env?: any) {
  return db(env).select().from(s.deals).orderBy(desc(s.deals.created_at))
}

const dealBool = (v: any) => (typeof v === 'boolean' ? (v ? 1 : 0) : v)

export async function createDeal(input: any, env?: any) {
  const now = nowIso()
  return db(env)
    .insert(s.deals)
    .values({ ...input, is_active: dealBool(input.is_active ?? 1), created_at: now, updated_at: now })
    .returning()
    .get()
}

export async function upsertDeal(input: any, env?: any) {
  const now = nowIso()
  const values = { ...input, is_active: dealBool(input.is_active ?? 1), updated_at: now }
  return db(env)
    .insert(s.deals)
    .values({ ...values, created_at: now })
    .onConflictDoUpdate({ target: [s.deals.provider, s.deals.product], set: values })
    .returning()
    .get()
}

export async function updateDeal(id: string, patch: Record<string, any>, env?: any) {
  const values: any = { ...patch }
  if (values.is_active !== undefined) values.is_active = dealBool(values.is_active)
  return db(env).update(s.deals).set(values).where(eq(s.deals.id, id)).returning().get()
}

export async function deleteDeal(id: string, env?: any) {
  await db(env).delete(s.deals).where(eq(s.deals.id, id))
}

// ---------------------------------------------------------------- feeds

const feedRow = (row: any) => ({
  ...row,
  tags: parseJson<string[] | null>(row.tags, []),
  metadata: parseJson<Record<string, any> | null>(row.metadata, null),
})

export async function countFeeds(env?: any) {
  const [row] = await db(env).select({ n: sql<number>`count(*)` }).from(s.feeds)
  return Number(row?.n ?? 0)
}

export async function countFeedsByType(type: string, env?: any) {
  const [row] = await db(env)
    .select({ n: sql<number>`count(*)` })
    .from(s.feeds)
    .where(eq(s.feeds.feed_type, type))
  return Number(row?.n ?? 0)
}

export async function listFeedsPage(opts: { limit: number; offset: number; type?: string | null }, env?: any) {
  const where = opts.type ? eq(s.feeds.feed_type, opts.type) : undefined
  const rows = await db(env)
    .select()
    .from(s.feeds)
    .where(where)
    .orderBy(desc(s.feeds.created_at))
    .limit(opts.limit)
    .offset(opts.offset)
  return rows.map(feedRow)
}

export async function listRecentFeeds(limit = 12, env?: any) {
  const rows = await db(env).select().from(s.feeds).orderBy(desc(s.feeds.created_at)).limit(limit)
  return rows.map(feedRow)
}

export async function listFeedsByPriority(opts: { limit: number; type?: string | null; priority?: string | null }, env?: any) {
  const where: any[] = []
  if (opts.type) where.push(eq(s.feeds.feed_type, opts.type))
  if (opts.priority) where.push(eq(s.feeds.priority, opts.priority))
  const rows = await db(env)
    .select()
    .from(s.feeds)
    .where(where.length ? and(...where) : undefined)
    .orderBy(sql`${s.feeds.published_at} IS NULL`, desc(s.feeds.published_at))
    .limit(opts.limit)
  return rows.map(feedRow)
}

export async function listAllFeeds(env?: any) {
  const rows = await db(env).select().from(s.feeds).orderBy(desc(s.feeds.created_at))
  return rows.map(feedRow)
}

export async function listFeedTags(env?: any) {
  const rows = await db(env).select({ tags: s.feeds.tags }).from(s.feeds)
  return rows.map((r) => parseJson<string[]>(r.tags, []))
}

export async function listFeedsByTag(tag: string, limit: number, offset = 0, env?: any) {
  const rows = await db(env)
    .select()
    .from(s.feeds)
    .where(like(s.feeds.tags, `%${JSON.stringify(tag).slice(1, -1)}%`))
    .orderBy(sql`${s.feeds.published_at} IS NULL`, desc(s.feeds.published_at))
    .limit(limit)
    .offset(offset)
  return rows.map(feedRow)
}

export async function countFeedsByTag(tag: string, env?: any) {
  const [row] = await db(env)
    .select({ n: sql<number>`count(*)` })
    .from(s.feeds)
    .where(like(s.feeds.tags, `%${JSON.stringify(tag).slice(1, -1)}%`))
  return Number(row?.n ?? 0)
}

export async function listFeedsByTypeForTopic(type: string, limit: number, env?: any) {
  const rows = await db(env)
    .select()
    .from(s.feeds)
    .where(eq(s.feeds.feed_type, type))
    .orderBy(desc(s.feeds.created_at))
    .limit(limit)
  return rows.map(feedRow)
}

export async function createFeed(input: any, env?: any) {
  const now = nowIso()
  const row = await db(env)
    .insert(s.feeds)
    .values(feedValues(input, now))
    .returning()
    .get()
  return feedRow(row)
}

export async function upsertFeed(input: any, env?: any) {
  const now = nowIso()
  const values = feedValues(input, now)
  const row = await db(env)
    .insert(s.feeds)
    .values(values)
    .onConflictDoUpdate({ target: [s.feeds.feed_type, s.feeds.title], set: values })
    .returning()
    .get()
  return feedRow(row)
}

export async function updateFeed(id: string, patch: Record<string, any>, env?: any) {
  const values: any = { ...patch }
  if (values.tags !== undefined) values.tags = values.tags === null ? null : jsonText(values.tags)
  if (values.metadata !== undefined) values.metadata = values.metadata === null ? null : jsonText(values.metadata)
  const row = await db(env).update(s.feeds).set(values).where(eq(s.feeds.id, id)).returning().get()
  return row ? feedRow(row) : null
}

export async function deleteFeed(id: string, env?: any) {
  await db(env).delete(s.feeds).where(eq(s.feeds.id, id))
}

export async function findFeedByUrlHash(type: string, urlHash: string, env?: any) {
  return db(env)
    .select({ id: s.feeds.id })
    .from(s.feeds)
    .where(and(eq(s.feeds.feed_type, type), eq(s.feeds.url_hash, urlHash)))
    .limit(1)
    .get()
}

export async function listRecentFeedsOfType(type: string, sinceIso: string, limit = 100, env?: any) {
  return db(env)
    .select({ id: s.feeds.id, title: s.feeds.title, summary: s.feeds.summary, tags: s.feeds.tags })
    .from(s.feeds)
    .where(and(eq(s.feeds.feed_type, type), gte(s.feeds.created_at, sinceIso)))
    .orderBy(desc(s.feeds.created_at))
    .limit(limit)
}

function feedValues(input: any, now: string) {
  return {
    feed_type: input.feed_type,
    title: input.title,
    url: input.url ?? null,
    normalized_url: input.normalized_url ?? null,
    source: input.source ?? null,
    summary: input.summary ?? null,
    tags: input.tags === undefined || input.tags === null ? null : jsonText(input.tags),
    priority: input.priority ?? 'normal',
    metadata: input.metadata === undefined || input.metadata === null ? null : jsonText(input.metadata),
    url_hash: input.url_hash ?? null,
    published_at: input.published_at ?? now,
    created_at: now,
    updated_at: now,
  }
}

// ---------------------------------------------------------------- assets

export async function listAssets(opts: { limit: number; offset: number; tag?: string | null }, env?: any) {
  const where = opts.tag ? like(s.assets.tags, `%${JSON.stringify(opts.tag).slice(1, -1)}%`) : undefined
  const [rows, counted] = await Promise.all([
    db(env)
      .select()
      .from(s.assets)
      .where(where)
      .orderBy(desc(s.assets.created_at))
      .limit(opts.limit)
      .offset(opts.offset),
    db(env).select({ n: sql<number>`count(*)` }).from(s.assets).where(where),
  ])
  return {
    rows: rows.map((r) => ({ ...r, tags: parseJson<string[]>(r.tags, []) })),
    total: Number(counted[0]?.n ?? 0),
  }
}

export async function listAssetTags(env?: any) {
  const rows = await db(env).select({ tags: s.assets.tags }).from(s.assets)
  return rows.map((r) => parseJson<string[]>(r.tags, []))
}

export async function findAssetsByHash(hash: string, env?: any) {
  return db(env).select().from(s.assets).where(eq(s.assets.content_hash, hash))
}

export async function createAsset(input: any, env?: any) {
  return db(env)
    .insert(s.assets)
    .values({
      key: input.key,
      url: input.url,
      thumbnail_url: input.thumbnail_url ?? null,
      filename: input.filename ?? null,
      content_type: input.content_type ?? null,
      size: input.size ?? null,
      content_hash: input.content_hash ?? null,
      tags: jsonText(input.tags ?? []),
    })
    .returning()
    .get()
}

export async function updateAssetThumbnail(hash: string, thumbnailUrl: string, env?: any) {
  await db(env).update(s.assets).set({ thumbnail_url: thumbnailUrl }).where(eq(s.assets.content_hash, hash))
}

export async function deleteAssets(ids: string[], env?: any) {
  if (ids.length === 0) return
  await db(env).delete(s.assets).where(inArray(s.assets.id, ids))
}

/** 图库检索：文件名/哈希搜索 + 标签 + 时间范围 + 分页，同时返回筛选用的全部标签。 */
export async function queryAssets(opts: {
  page: number
  limit: number
  search?: string | null
  tag?: string | null
  dateFrom?: string | null
  dateTo?: string | null
}, env?: any) {
  const where: any[] = []
  if (opts.search) {
    const pattern = `%${opts.search}%`
    where.push(or(like(s.assets.filename, pattern), like(s.assets.content_hash, pattern)))
  }
  if (opts.tag) where.push(like(s.assets.tags, `%${JSON.stringify(opts.tag).slice(1, -1)}%`))
  if (opts.dateFrom) where.push(gte(s.assets.created_at, opts.dateFrom))
  if (opts.dateTo) where.push(sql`${s.assets.created_at} <= ${opts.dateTo + 'T23:59:59'}`)
  const filter = where.length ? and(...where) : undefined

  const offset = (opts.page - 1) * opts.limit
  const [rows, counted, all] = await Promise.all([
    db(env).select().from(s.assets).where(filter).orderBy(desc(s.assets.created_at)).limit(opts.limit).offset(offset),
    db(env).select({ n: sql<number>`count(*)` }).from(s.assets).where(filter),
    db(env).select({ tags: s.assets.tags }).from(s.assets),
  ])

  const allTags = [...new Set(all.flatMap((a) => parseJson<string[]>(a.tags, [])))].sort()
  return {
    files: rows.map((r) => ({ ...r, tags: parseJson<string[]>(r.tags, []) })),
    total: Number(counted[0]?.n ?? 0),
    allTags,
    totalSize: rows.reduce((sum, f) => sum + (f.size || 0), 0),
  }
}

export async function updateAsset(id: string, patch: Record<string, any>, env?: any) {
  const values: any = { ...patch }
  if (values.tags !== undefined) values.tags = jsonText(values.tags)
  return db(env).update(s.assets).set(values).where(eq(s.assets.id, id)).returning().get()
}

export async function deleteAsset(id: string, env?: any) {
  await db(env).delete(s.assets).where(eq(s.assets.id, id))
}

export async function deleteAssetByKey(key: string, env?: any) {
  await db(env).delete(s.assets).where(eq(s.assets.key, key))
}

// ---------------------------------------------------------------- files

export async function getFileBySlug(slug: string, env?: any) {
  return db(env).select().from(s.files).where(eq(s.files.share_slug, slug)).get()
}

export async function getFileById(id: string, env?: any) {
  return db(env).select().from(s.files).where(eq(s.files.id, id)).get()
}

export async function fileSlugExists(slug: string, excludeId?: string, env?: any) {
  const where = excludeId
    ? and(eq(s.files.share_slug, slug), ne(s.files.id, excludeId))
    : eq(s.files.share_slug, slug)
  const row = await db(env).select({ id: s.files.id }).from(s.files).where(where).limit(1).get()
  return !!row
}

export async function countFiles(env?: any) {
  const [row] = await db(env).select({ n: sql<number>`count(*)` }).from(s.files)
  return Number(row?.n ?? 0)
}

export async function listFiles(env?: any) {
  return db(env).select().from(s.files).orderBy(desc(s.files.created_at))
}

/** 后台文件管理分页 + 文件名搜索。 */
export async function listFilesPage(opts: { limit: number; offset: number; q?: string | null }, env?: any) {
  const where = opts.q ? like(s.files.filename, `%${opts.q}%`) : undefined
  const [rows, counted] = await Promise.all([
    db(env).select().from(s.files).where(where).orderBy(desc(s.files.created_at)).limit(opts.limit).offset(opts.offset),
    db(env).select({ n: sql<number>`count(*)` }).from(s.files).where(where),
  ])
  return { rows, total: Number(counted[0]?.n ?? 0) }
}

export async function createFile(input: any, env?: any) {
  return db(env)
    .insert(s.files)
    .values({
      key: input.key,
      url: input.url,
      filename: input.filename,
      content_type: input.content_type ?? null,
      size: input.size ?? null,
      share_slug: input.share_slug,
      password: input.password ?? null,
      downloads: input.downloads ?? 0,
      expires_at: isoOrNull(input.expires_at),
    })
    .returning()
    .get()
}

export async function updateFile(id: string, patch: Record<string, any>, env?: any) {
  const values: any = { ...patch }
  if (values.expires_at !== undefined) values.expires_at = isoOrNull(values.expires_at)
  return db(env).update(s.files).set(values).where(eq(s.files.id, id)).returning().get()
}

export async function deleteFile(id: string, env?: any) {
  await db(env).delete(s.files).where(eq(s.files.id, id))
}

export async function incrementFileDownloads(slug: string, env?: any) {
  await db(env)
    .update(s.files)
    .set({ downloads: sql`${s.files.downloads} + 1` })
    .where(eq(s.files.share_slug, slug))
}

// ---------------------------------------------------------------- deal_likes

export async function listLikeTargets(env?: any) {
  const rows = await db(env).select({ target: s.dealLikes.target }).from(s.dealLikes)
  return rows.map((r) => r.target)
}

export async function hasLiked(target: string, ipHash: string, env?: any) {
  const row = await db(env)
    .select({ id: s.dealLikes.id })
    .from(s.dealLikes)
    .where(and(eq(s.dealLikes.target, target), eq(s.dealLikes.ip_hash, ipHash)))
    .limit(1)
    .get()
  return !!row
}

export async function addLike(target: string, ipHash: string, env?: any) {
  await db(env)
    .insert(s.dealLikes)
    .values({ target, ip_hash: ipHash, created_at: nowIso() })
    .onConflictDoNothing()
}

export async function countLikes(target: string, env?: any) {
  const [row] = await db(env)
    .select({ n: sql<number>`count(*)` })
    .from(s.dealLikes)
    .where(eq(s.dealLikes.target, target))
  return Number(row?.n ?? 0)
}

// ---------------------------------------------------------------- feedback

export async function createFeedback(input: { message: string; contact?: string | null; ip_hash?: string | null; path?: string | null }, env?: any) {
  return db(env)
    .insert(s.feedback)
    .values({
      message: input.message,
      contact: input.contact ?? null,
      ip_hash: input.ip_hash ?? null,
      path: input.path ?? null,
      handled: 0,
      created_at: nowIso(),
    })
    .returning()
    .get()
}

export async function listFeedback(env?: any) {
  return db(env).select().from(s.feedback).orderBy(desc(s.feedback.created_at))
}

export async function setFeedbackHandled(id: string, handled: boolean, env?: any) {
  return db(env).update(s.feedback).set({ handled: handled ? 1 : 0 }).where(eq(s.feedback.id, id)).returning().get()
}

export async function deleteFeedback(id: string, env?: any) {
  await db(env).delete(s.feedback).where(eq(s.feedback.id, id))
}

// ---------------------------------------------------------------- blacklist

export async function listBlacklist(env?: any) {
  return db(env).select().from(s.blacklist).orderBy(desc(s.blacklist.created_at))
}

export async function countBlacklist(env?: any) {
  const [row] = await db(env).select({ n: sql<number>`count(*)` }).from(s.blacklist)
  return Number(row?.n ?? 0)
}

export async function isBlacklisted(ip: string, env?: any) {
  const row = await db(env).select({ id: s.blacklist.id }).from(s.blacklist).where(eq(s.blacklist.ip, ip)).limit(1).get()
  return !!row
}

export async function addBlacklist(ip: string, reason?: string | null, env?: any) {
  return db(env)
    .insert(s.blacklist)
    .values({ ip, reason: reason ?? null, created_at: nowIso() })
    .onConflictDoUpdate({ target: s.blacklist.ip, set: { reason: reason ?? null } })
    .returning()
    .get()
}

export async function deleteBlacklist(id: string, env?: any) {
  await db(env).delete(s.blacklist).where(eq(s.blacklist.id, id))
}

// ---------------------------------------------------------------- site_settings

export async function getSetting<T = any>(key: string, env?: any): Promise<T | null> {
  const row = await db(env).select({ value: s.siteSettings.value }).from(s.siteSettings).where(eq(s.siteSettings.key, key)).get()
  if (!row) return null
  return parseJson<T>(row.value, null as any)
}

export async function listSettings(env?: any) {
  const rows = await db(env).select().from(s.siteSettings)
  return rows.map((r) => ({ ...r, value: parseJson<any>(r.value, null) }))
}

export async function upsertSetting(key: string, value: unknown, env?: any) {
  const now = nowIso()
  return db(env)
    .insert(s.siteSettings)
    .values({ key, value: jsonText(value), created_at: now, updated_at: now })
    .onConflictDoUpdate({ target: s.siteSettings.key, set: { value: jsonText(value), updated_at: now } })
    .returning()
    .get()
}

export async function upsertSettings(entries: Record<string, unknown>, env?: any) {
  for (const [key, value] of Object.entries(entries)) {
    await upsertSetting(key, value, env)
  }
}

// ---------------------------------------------------------------- 搜索

export async function searchPosts(q: string, limit: number, offset: number, asc_ = false, env?: any) {
  const pattern = `%${q}%`
  const where = or(like(s.posts.title, pattern), like(s.posts.content, pattern), like(s.posts.summary, pattern))
  const [rows, counted] = await Promise.all([
    db(env)
      .select({
        id: s.posts.id,
        title: s.posts.title,
        content: s.posts.content,
        summary: s.posts.summary,
        created_at: s.posts.created_at,
        views: s.posts.views,
        tags: s.posts.tags,
      })
      .from(s.posts)
      .where(where)
      .orderBy(asc_ ? asc(s.posts.created_at) : desc(s.posts.created_at))
      .limit(limit)
      .offset(offset),
    db(env).select({ n: sql<number>`count(*)` }).from(s.posts).where(where),
  ])
  return { rows: rows.map(postTags), total: Number(counted[0]?.n ?? 0) }
}

export async function searchFeeds(q: string, limit: number, offset: number, asc_ = false, env?: any) {
  const pattern = `%${q}%`
  const where = or(
    like(s.feeds.title, pattern),
    like(s.feeds.summary, pattern),
    like(s.feeds.tags, pattern),
  )
  const [rows, counted] = await Promise.all([
    db(env)
      .select()
      .from(s.feeds)
      .where(where)
      .orderBy(sql`${s.feeds.published_at} IS NULL`, asc_ ? asc(s.feeds.published_at) : desc(s.feeds.published_at))
      .limit(limit)
      .offset(offset),
    db(env).select({ n: sql<number>`count(*)` }).from(s.feeds).where(where),
  ])
  return { rows: rows.map(feedRow), total: Number(counted[0]?.n ?? 0) }
}

export async function searchDeals(q: string, limit: number, offset: number, asc_ = false, env?: any) {
  const pattern = `%${q}%`
  const where = and(
    eq(s.deals.is_active, 1),
    or(
      like(s.deals.provider, pattern),
      like(s.deals.product, pattern),
      like(s.deals.config, pattern),
      like(s.deals.notes, pattern),
    ),
  )
  const [rows, counted] = await Promise.all([
    db(env)
      .select()
      .from(s.deals)
      .where(where)
      .orderBy(sql`${s.deals.price_cny} IS NULL`, asc_ ? asc(s.deals.price_cny) : desc(s.deals.price_cny))
      .limit(limit)
      .offset(offset),
    db(env).select({ n: sql<number>`count(*)` }).from(s.deals).where(where),
  ])
  return { rows, total: Number(counted[0]?.n ?? 0) }
}
