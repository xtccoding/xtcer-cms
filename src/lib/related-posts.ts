import { supabase } from './supabase'

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
    const { data } = await supabase
      .from('posts')
      .select('id, title, summary, created_at, views, tags')
      .neq('id', currentId)
      .order('created_at', { ascending: false })
      .limit(limit)
    return (data || []).map(p => ({ ...p, tags: p.tags || [], score: 0 }))
  }

  const { data: candidates } = await supabase
    .from('posts')
    .select('id, title, summary, created_at, views, tags')
    .neq('id', currentId)
    .overlaps('tags', currentTags)
    .order('created_at', { ascending: false })
    .limit(30)

  if (!candidates || candidates.length === 0) return []

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
