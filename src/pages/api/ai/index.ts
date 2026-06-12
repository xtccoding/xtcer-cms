import { supabase } from '../../../lib/supabase'

const CEREBRAS_KEY = 'csk-j8f8wmwhehryvm54ke95d388rmnnjm5nwvr2ckf6jmj2rv32'
const MODELS = ['gpt-oss-120b', 'zai-glm-4.7', 'qwen-3-235b-a22b-instruct-2507', 'llama3.1-8b']

async function callCerebras(model: string, prompt: string, content: string) {
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
      temperature: 0.7,
      max_tokens: 8000,
    }),
  })
  if (!res.ok) throw new Error(`Model ${model} failed: ${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

export async function POST({ request, cookies }: { request: Request; cookies: any }) {
  const auth = cookies.get('admin_auth')
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const body = await request.json()
  const { action, content, title } = body

  if (!content && action !== 'summary') {
    return new Response(JSON.stringify({ error: '内容不能为空' }), { status: 400 })
  }

  let prompt = ''
  if (action === 'polish') {
    prompt = '你是一个专业的中文内容编辑。请润色以下文章内容，保持原意但让表达更流畅、专业。保留 Markdown 格式。直接输出润色后的内容，不要加任何解释。'
  } else if (action === 'expand') {
    prompt = '你是一个专业的中文内容创作者。请扩展以下文章内容，添加更多细节、例子和解释，使内容更丰富。保留 Markdown 格式。直接输出扩展后的内容，不要加任何解释。'
  } else if (action === 'summarize') {
    prompt = '你是一个专业的内容摘要生成器。请为以下文章生成一段简洁的中文摘要（100字以内），用于网站首页展示。直接输出摘要，不要加任何解释。'
  } else if (action === 'title') {
    prompt = '你是一个专业的标题创作者。请根据以下文章内容生成5个吸引人的中文标题，每个标题一行。直接输出标题，不要加任何解释。'
  } else if (action === 'translate-en') {
    prompt = '你是一个专业的翻译。请将以下中文内容翻译成英文，保留 Markdown 格式。直接输出翻译后的内容，不要加任何解释。'
  } else if (action === 'translate-zh') {
    prompt = '你是一个专业的翻译。请将以下英文内容翻译成中文，保留 Markdown 格式。直接输出翻译后的内容，不要加任何解释。'
  } else if (action === 'tag') {
    prompt = `你是一个技术文章标签生成器。根据以下文章标题和内容，生成 3-7 个最相关的英文标签（小写，用逗号分隔）。

标签要求：
- 优先使用这些已有标签（如果相关）：ai, llm, chatgpt, claude, openai, huggingface, gpt, gemini, deepseek, security, cve, vulnerability, exploit, rce, xss, zero-day, crypto, bitcoin, ethereum, defi, airdrop, web3, github, opensource, python, rust, typescript, go, vps, cloud, deal, tool, devtool, productivity, api, docker, linux, kubernetes, serverless, database, sql, redis, nginx, astro, react, vue, nodejs, tailwind, supabase, firebase, aws, azure, gcp, cf
- 如果没有合适的已有标签，可以新增英文小写标签
- 标签用英文，不要用中文
- 直接输出标签列表，不要加任何解释，格式：tag1,tag2,tag3`
  } else {
    return new Response(JSON.stringify({ error: '未知操作' }), { status: 400 })
  }

  for (const model of MODELS) {
    try {
      const result = await callCerebras(model, prompt, content || title || '')
      if (result) {
        return new Response(JSON.stringify({ result, model }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
      }
    } catch (e) {
      continue
    }
  }

  return new Response(JSON.stringify({ error: '所有模型都不可用，请稍后再试' }), { status: 503 })
}
