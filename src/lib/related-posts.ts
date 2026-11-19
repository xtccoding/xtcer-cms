import { listPostCandidates } from './store'

interface RelatedPost {
  id: string
  title: string
  summary: string | null
  created_at: string
  views: number
  tags: string[]
  score: number
}

export async function getRelatedPosts(
  currentId: string,
  currentTags: string[],
  limit = 5
): Promise<RelatedPost[]> {
  if (!currentTags || currentTags.length === 0) {
    const rows = await listPostCandidates(currentId, limit)
    return rows.map(p => ({ ...p, tags: p.tags || [], score: 0 }))
  }

  // 先取最近 30 篇作为候选，再在内存里按标签重合度 + 时间新近度 + 热度打分。
  // （SQLite 没有 Postgres 的数组 overlaps，且候选量很小，内存打分更直观。）
  const candidates = await listPostCandidates(currentId, 30)

  const scored = candidates
    .map(p => {
      const postTags = p.tags || []
      const overlap = currentTags.filter(t => postTags.includes(t)).length
      const recency = 1 / (1 + (Date.now() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24))
      const popularity = Math.log2((p.views || 0) + 2)
      const score = overlap * 10 + recency * 2 + popularity
      return { ...p, tags: postTags, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return scored
}
