const TAG_LINK_MAP: Record<string, string> = {}

export function setTagLinkMap(tags: string[]) {
  for (const tag of tags) {
    const slug = tag.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '')
    TAG_LINK_MAP[tag] = `/tags/${encodeURIComponent(slug)}`
  }
}

export function autoLinkContent(html: string, maxReplacementsPerWord = 1): string {
  const words = Object.keys(TAG_LINK_MAP).sort((a, b) => b.length - a.length)
  if (words.length === 0) return html

  let result = html
  const replaced = new Set<string>()

  for (const word of words) {
    const key = word.toLowerCase()
    if (replaced.has(key)) continue

    const href = TAG_LINK_MAP[word]
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`(?<![<\\/\\w])\\b(${escaped})\\b(?![^<]*>|[^<]*<\\/a>)`, 'i')

    if (regex.test(result)) {
      result = result.replace(regex, `<a href="${href}" rel="tag">$1</a>`)
      replaced.add(key)
    }
  }

  return result
}
