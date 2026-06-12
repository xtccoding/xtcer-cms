# XTCer CMS API — 文章打标操作手册

## 认证

所有 API 请求需要在 Header 中携带密钥：

```
X-Feed-Key: <你的 FEED_API_KEY>
Content-Type: application/json
```

Base URL: `https://xtcer.cn`

---

## 一、获取所有文章（读）

```
GET /api/posts
Cookie: admin_auth=<ADMIN_PASSWORD>
```

返回文章列表 JSON 数组，每篇包含 `id, title, content, summary, tags, views, created_at`。

> 注意：此接口需要 cookie 认证，不支持 X-Feed-Key。hermes 如需读取文章列表，建议直接查 Supabase。

---

## 二、单篇文章打标（PATCH）

给一篇文章设置/追加/移除标签，**不影响标题和内容**。

```
PATCH /api/posts/:id
X-Feed-Key: <key>

{
  "tags": ["ai", "llm", "chatgpt"],
  "mode": "set"
}
```

### mode 说明

| mode | 行为 |
|------|------|
| `set` | 覆盖已有标签（默认） |
| `add` | 追加新标签，保留已有 |
| `remove` | 移除指定标签 |

### 响应

```json
{
  "id": "abc-123",
  "title": "文章标题",
  "tags": ["ai", "llm", "chatgpt"]
}
```

---

## 三、批量打标（PATCH）

一次给多篇文章打标，最多 100 条/次。

```
PATCH /api/posts/tags
X-Feed-Key: <key>

{
  "items": [
    { "id": "文章ID-1", "tags": ["ai", "llm"] },
    { "id": "文章ID-2", "tags": ["security", "cve"] }
  ],
  "mode": "set"
}
```

### 响应

```json
{
  "updated": 2,
  "total": 2,
  "results": [
    { "id": "文章ID-1", "status": "ok", "tags": ["ai", "llm"] },
    { "id": "文章ID-2", "status": "ok", "tags": ["security", "cve"] }
  ]
}
```

---

## 四、AI 自动打标（服务端生成）

让 XTCer 服务端的 AI 根据文章内容自动生成标签。

### 4a. 批量给所有无标签文章打标

```
POST /api/ai/tag
Cookie: admin_auth=<ADMIN_PASSWORD>

{}
```

- 空 body = 自动给所有 `tags` 为空的文章打标
- `{ "id": "xxx" }` = 只处理指定文章
- `{ "force": true }` = 强制重新打标（含已有标签的）

### 4b. 单篇 AI 生成标签（不自动写入）

```
POST /api/ai
Cookie: admin_auth=<ADMIN_PASSWORD>

{
  "action": "tag",
  "title": "文章标题",
  "content": "文章内容..."
}
```

返回 `{ "result": "ai,llm,chatgpt,openai", "model": "qwen-3-235b-a22b-instruct-2507" }`

---

## 五、发文章时带标签（POST）

```
POST /api/posts
X-Feed-Key: <key>

{
  "title": "文章标题",
  "content": "文章内容",
  "summary": "摘要（可选）",
  "tags": ["ai", "llm"]
}
```

`tags` 字段可选，不传默认为空数组 `[]`，不会报错。

---

## 六、Hermes 自动打标推荐流程

### 方案 A：发文章时直接打标（最优）

hermes 每次发文章时，在 POST body 里带上 `tags` 字段即可。标签由 hermes 根据文章内容自行判断。

### 方案 B：发文章后追加标签

1. hermes 调用 `POST /api/posts` 发文章（不带 tags）
2. 拿到返回的 `id`
3. 调用 `PATCH /api/posts/:id` 补上标签

### 方案 C：定时批量补标

hermes 定时（如每天一次）调用 `POST /api/ai/tag`（需 cookie 认证），让服务端 AI 给所有无标签文章自动打标。

---

## 七、标签命名规范

- 全部小写英文
- 用连字符 `-` 连接多词（如 `zero-day`、`open-source`）
- 每篇 3-7 个标签
- 优先复用已有标签（见下方词库）

### 已有标签词库

```
ai, llm, chatgpt, claude, openai, huggingface, gpt, gemini, deepseek
security, cve, vulnerability, exploit, rce, xss, zero-day
crypto, bitcoin, ethereum, defi, airdrop, web3
github, opensource, python, rust, typescript, go
vps, cloud, deal, tool, devtool, productivity, api
docker, linux, kubernetes, serverless, database, sql, redis, nginx
astro, react, vue, nodejs, tailwind, supabase, firebase
aws, azure, gcp, cf
```

---

## 八、完整示例：hermes 发文 + 打标

```bash
# 1. 发文章
curl -X POST https://xtcer.cn/api/posts \
  -H "Content-Type: application/json" \
  -H "X-Feed-Key: YOUR_KEY" \
  -d '{
    "title": "GPT-5 发布：多模态能力大幅提升",
    "content": "OpenAI 今日正式发布 GPT-5...",
    "summary": "OpenAI 发布 GPT-5，多模态能力显著提升。",
    "tags": ["ai", "gpt", "openai", "llm"]
  }'

# 返回: { "id": "xxx", "title": "...", "tags": ["ai","gpt","openai","llm"], ... }
```

```bash
# 2. 如果忘了打标，事后补
curl -X PATCH https://xtcer.cn/api/posts/文章ID \
  -H "Content-Type: application/json" \
  -H "X-Feed-Key: YOUR_KEY" \
  -d '{"tags": ["ai", "gpt", "openai"], "mode": "add"}'
```

```bash
# 3. 批量补标
curl -X PATCH https://xtcer.cn/api/posts/tags \
  -H "Content-Type: application/json" \
  -H "X-Feed-Key: YOUR_KEY" \
  -d '{
    "items": [
      {"id": "id-1", "tags": ["ai", "gpt"]},
      {"id": "id-2", "tags": ["security", "cve"]}
    ],
    "mode": "add"
  }'
```
