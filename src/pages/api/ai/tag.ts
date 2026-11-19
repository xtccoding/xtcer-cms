import { getPost, listUntaggedPosts, updatePost } from '../../../lib/store'
import { isAdminRequest } from '../../../lib/admin-auth'

const CEREBRAS_KEY = import.meta.env.CEREBRAS_API_KEY || ''
const MODELS = ['gpt-oss-120b', 'zai-glm-4.7', 'qwen-3-235b-a22b-instruct-2507', 'llama3.1-8b']

async function callCerebras(model: string, prompt: string, content: string) {
  if (!CEREBRAS_KEY) throw new Error('CEREBRAS_API_KEY not configured')
  const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Authorization': `Bearer ${CEREBRAS_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content },
      ],
      temperature: 0.3,
      max_tokens: 200,
    }),
  })
  if (!res.ok) throw new Error(`Model ${model} failed: ${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

const TAG_PROMPT = `你是一个技术文章标签生成器。根据以下文章标题和内容，生成 3-7 个最相关的英文标签（小写，用逗号分隔）。

标签要求：
- 优先使用这些已有标签（如果相关）：ai, llm, chatgpt, claude, openai, huggingface, gpt, gemini, deepseek, security, cve, vulnerability, exploit, rce, xss, zero-day, crypto, bitcoin, ethereum, defi, airdrop, web3, github, opensource, python, rust, typescript, go, vps, cloud, deal, tool, devtool, productivity, api, docker, linux, kubernetes, serverless, database, sql, redis, nginx, astro, react, vue, nodejs, tailwind, supabase, firebase, aws, azure, gcp, cf
- 如果没有合适的已有标签，可以新增英文小写标签
- 标签用英文，不要用中文
- 直接输出标签列表，不要加任何解释，格式：tag1,tag2,tag3`

async function generateTags(title: string, content: string): Promise<string[]> {
  const input = `标题：${title}\n\n内容：${(content || '').substring(0, 2000)}`
  for (const model of MODELS) {
    try {
      const result = await callCerebras(model, TAG_PROMPT, input)
      if (result) {
        return result
          .split(/[,，\n]/)
          .map((t: string) => t.trim().toLowerCase().replace(/[^a-z0-9\-]/g, ''))
          .filter((t: string) => t.length > 0 && t.length < 30)
          .slice(0, 7)
      }
    } catch { continue }
  }
  return []
}

export async function POST({ request, cookies, locals }: { request: Request; cookies: any; locals: any }) {
  if (!isAdminRequest(cookies, locals?.runtime?.env)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { id } = body

  let posts: any[]
  if (id) {
    const post = await getPost(id)
    posts = post ? [post] : []
  } else {
    posts = await listUntaggedPosts(50)
  }

  if (!posts || posts.length === 0) return new Response(JSON.stringify({ message: '没有需要打标的文章', tagged: 0 }))

  let tagged = 0
  const results = []

  for (const post of posts) {
    const tags = await generateTags(post.title, post.content || '')
    if (tags.length === 0) {
      results.push({ id: post.id, title: post.title, status: 'failed' })
      continue
    }

    try {
      await updatePost(post.id, { tags })
      tagged++
      results.push({ id: post.id, title: post.title, status: 'ok', tags })
    } catch (e: any) {
      results.push({ id: post.id, title: post.title, status: 'error', error: e?.message })
    }
  }

  return new Response(JSON.stringify({ tagged, total: posts.length, results }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}
