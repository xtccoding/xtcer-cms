---
name: xtcer-cms
description: Operate the xtcer.cn content site — publish/manage articles (posts), manage tags, push deals/feeds, and collect information online. Use when the user asks to publish an article, write content for the site, tag posts, list/manage posts, push deals or feeds, or operate xtcer.cn content. Load whenever working in this repository.
---

# XTCer CMS Operations

## Site overview

- Live site: `https://xtcer.cn` — Astro SSR + Supabase (PostgreSQL) + Cloudflare Pages.
- Content modules: **posts** (articles, Markdown + tags + summary + views), **deals** (cloud offers), **feeds** (8-category intel stream), **links** (nav), **files** (shared files), **gallery** (images).
- Admin UI: `https://xtcer.cn/admin` (password protected).
- API Base URL: `https://xtcer.cn`.

## Authentication

Two methods (either works for POST/PUT/PATCH/DELETE):

1. **Cookie auth (recommended, verified):** send `Cookie: admin_auth=<ADMIN_PASSWORD>`.
   - ADMIN_PASSWORD for this site: `ctooctooctoo`
   - GET `/api/posts` requires the cookie (X-Feed-Key alone is rejected for GET).
2. **X-Feed-Key header:** `X-Feed-Key: <FEED_API_KEY>` (shared Hermes + Junier key; value not stored in this repo — ask the user if needed).

Every request also sends `Content-Type: application/json`.

## Endpoints

| Path | Method | Auth | Notes |
|------|--------|------|-------|
| `/api/posts` | GET | Cookie | Paginated list: `?page=&limit=` (max 100) → `{ data, total, page, totalPages }` |
| `/api/posts` | POST | Cookie / Key | Create article. Body: `{ title, content, summary?, tags?[], author? }` |
| `/api/posts/:id` | GET | Public | Article detail |
| `/api/posts/:id` | PATCH | Cookie / Key | Update; `{ tags: [...], mode: "set"|"add"|"remove" }` for tagging; also title/content/summary |
| `/api/posts/:id` | PUT / DELETE | Cookie / Key | Update / delete |
| `/api/posts/batch-delete` | POST | Cookie / Key | Bulk delete: `{ ids: [...] }` (max 200 per call). -> `{ success, deleted, requested, missing[] }` |
| `/api/posts/tags` | PATCH | Cookie / Key | Batch tag: `{ items: [{id, tags[]}], mode }` (max 100) |
| `/api/posts/views` | POST | Public | Increment view count |
| `/api/ai/tag` | POST | Cookie | Server-side AI tags all untagged posts (or `{id}`, or `{force:true}`) |
| `/api/ai` | POST | Cookie | AI assistant: `{ action: "tag"|"polish"|"expand"|"summarize"|"title"|"translate-en"|"translate-zh", title?, content? }` |
| `/api/deals/batch` | POST | Cookie / Key | Upsert deals: `{ deals: [{ provider, product, price, price_cny, config, category, region }] }` |
| `/api/feeds/batch` | POST | Cookie / Key | Upsert feeds: `{ type, items: [{ title, url, source, summary, tags[], priority }] }` |
| `/api/search` | GET | Public | Full-text search |
| `/api/settings` | GET/POST | GET pub / POST auth | Site settings (banner, particles) |
| `/api/gallery` | POST | Cookie / Key | Image upload |
| `/api/upload` | POST | Cookie / Key | File upload |

## Article workflow

1. **Research** — use websearch/web tools to gather fresh, citable facts. Site focus: AI, cloud, security, dev tools, automation, monetization, crypto, productivity. Prefer recent (same-year) information.
2. **Write** — Chinese-first content (site audience is Chinese). Markdown with `#` title, `##` sections, code blocks, lists. Length: 1500-4000 chars. Include a `summary` (~100 chars).
3. **Tag** — 3-7 lowercase English hyphenated tags, reuse the vocabulary below. Attach `tags` in the POST body.
4. **Publish** — `POST /api/posts` with cookie. Capture returned `id`.
5. **Verify** — `GET /api/posts/:id` (public) or `GET /api/posts` (cookie) to confirm.

### Existing tag vocabulary

```
ai, llm, chatgpt, claude, openai, huggingface, gpt, gemini, deepseek
security, cve, vulnerability, exploit, rce, xss, zero-day
crypto, bitcoin, ethereum, defi, airdrop, web3
github, opensource, python, rust, typescript, go
vps, cloud, deal, tool, devtool, productivity, api
docker, linux, kubernetes, serverless, database, sql, redis, nginx
astro, react, vue, nodejs, tailwind, supabase, firebase
aws, azure, gcp, cf
browser-use, automation, tutorial, saas, ecommerce, seo, monetization
```

## Example: publish an article (PowerShell)

```powershell
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$cookie = New-Object System.Net.Cookie("admin_auth","<ADMIN_PASSWORD>","/","xtcer.cn")
$session.Cookies.Add($cookie)
$body = @{
  title = "文章标题"
  content = "Markdown 正文..."
  summary = "摘要..."
  tags = @("ai","llm","tutorial")
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri "https://xtcer.cn/api/posts" -Method POST -WebSession $session -ContentType "application/json" -Body $body
```

## Example: list posts (cookie)

```powershell
Invoke-RestMethod -Uri "https://xtcer.cn/api/posts?page=1&limit=20" -WebSession $session
```

## Example: tag a post

```powershell
$body = '{"tags":["ai","llm","openai"],"mode":"add"}'
Invoke-RestMethod -Uri "https://xtcer.cn/api/posts/<ID>" -Method PATCH -WebSession $session -ContentType "application/json" -Body $body
```

## Notes / pitfalls

- `GET /api/posts` returns 401 without the cookie — do not rely on X-Feed-Key for reads.
- `GET /api/posts` is paginated: `?page=&limit=` (limit max 100) and returns
  `{ data, total, page, totalPages }`. **Do not fetch everything at once** — the
  full library is ~1000 posts / ~13MB, so always page through it.
- **Cloudflare blocks bare Python/curl-default user agents on POST.** Set a browser
  `User-Agent` header (e.g. Chrome) or the write request returns **403 Forbidden**.
  Reads via curl work without it; writes from Python do not.
- Admin UI has bulk delete: checkboxes + "全选本页" + "选中 test" + "批量删除",
  plus a "全库搜索" button that hits `/api/search` across all pages.
- Keep tags lowercase English (site uses them for tag index pages / interlinking).
- Do not delete posts unless explicitly asked. Only titles that are exactly
  `test` / `测试` / `test_cookie_auth` (or start with `test_` / `test-`) are
  safe test artifacts — articles *about* testing ("渗透测试", "自动化测试",
  "基准测试") are real content and must NOT be deleted.
- Draft library lives at `../../../../../_content/article/` (outside this repo) for reference material.