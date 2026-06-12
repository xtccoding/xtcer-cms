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
  const { data: allPosts } = await supabase
    .from('posts')
    .select('id, title, summary, created_at, views, tags')
    .neq('id', currentId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (!allPosts || allPosts.length === 0) return []

  const scored = allPosts
    .map(p => {
      const postTags = p.tags || []
      const overlap = currentTags.filter(t => postTags.includes(t)).length
      const recency = 1 / (1 + (Date.now() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24))
      const popularity = Math.log2((p.views || 0) + 2)
      const score = overlap * 10 + recency * 2 + popularity
      return { ...p, tags: postTags, score }
    })
    .filter(p => p.score > 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return scored
}
