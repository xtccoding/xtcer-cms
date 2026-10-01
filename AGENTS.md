# AGENTS.md

XTCer CMS — Astro SSR + Supabase + Cloudflare Pages content site at `https://xtcer.cn`.

## Operating the site

To publish/manage content on xtcer.cn, load the **xtcer-cms** skill
(`.opencode/skills/xtcer-cms/SKILL.md`). It documents auth, API endpoints,
tag vocabulary, and the full research → write → publish → verify workflow.

Key facts:

- **Auth:** Cookie `admin_auth=ctooctooctoo` works for all management APIs.
- **Publish:** `POST https://xtcer.cn/api/posts` with `{ title, content, summary, tags[] }`.
- **Content language:** Chinese-first; tags lowercase English hyphenated.
- **Draft library (reference only):** `C:\Users\ctooc\Desktop\workspace\_content\article\`.
- **Site API guide:** `hermes-api-guide.md` (legacy Hermes manual).

## Local development

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # astro build
```

Deploy is automatic on `git push origin main` via Cloudflare Pages
(remote: `git@github.com:xtccoding/xtcer-cms.git`).

## Conventions

- Chinese content for posts; code blocks in articles may be any language.
- Never hardcode secrets; secrets live in Cloudflare Pages env vars
  (`ADMIN_PASSWORD`, `FEED_API_KEY`, `PUBLIC_SUPABASE_ANON_KEY`).
- `.env` holds only PUBLIC_ Supabase values (safe for local dev).