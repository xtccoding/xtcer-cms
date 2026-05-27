# Payload Cloudflare 模板

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/payloadcms/payload/tree/main/templates/with-cloudflare-d1)

**由于大小限制，目前只能部署到付费 Workers。** 此模板配置了最基础的功能，帮助你快速开始。

## 快速开始

此模板可以通过点击上方按钮直接部署到 Cloudflare Workers。

在部署界面中，你可以将代码连接到 Git 提供商（如 GitHub 或 GitLab），为 Workers、D1 数据库和 R2 存储桶命名，并添加所需的环境变量或服务。

## 本地快速启动

要在本地运行此模板，请按以下步骤操作：

### 克隆仓库

点击上方 `Deploy` 按钮后，你需要在本地获取此仓库的独立副本。Cloudflare 会将你的应用连接到 GitHub 等 Git 提供商，你可以从那里访问代码。

### 本地开发

## 工作原理

开箱即用，使用 [`Wrangler`](https://developers.cloudflare.com/workers/wrangler/) 会自动创建本地绑定，帮助你连接远程服务，甚至可以创建 Cloudflare 服务的本地模拟。

我们已为 Payload 预配置了以下内容：

### 集合（Collections）

详情请参阅 [Collections](https://payloadcms.com/docs/configuration/collections) 文档，了解如何扩展此功能。

- #### Users（用户认证）

  用户集合支持认证，可以访问管理面板。

  更多帮助请参阅官方 [Auth Example](https://github.com/payloadcms/payload/tree/main/examples/auth) 或 [Authentication](https://payloadcms.com/docs/authentication/overview#authentication-overview) 文档。

- #### Media（媒体）

  这是启用文件上传的集合。

### 图片存储（R2）

图片将从 R2 存储桶提供服务，你可以进一步配置 CDN 直接为前端提供服务。

### D1 数据库

Worker 可以直接访问 D1 SQLite 数据库，Wrangler 可以在本地连接，注意你不会像其他提供商那样拥有连接字符串。

你可以在数据库适配器中添加 `readReplicas: 'first-primary'` 来启用读副本，然后在 D1 Cloudflare 控制面板中启用。了解更多请参阅 [官方文档](https://payloadcms.com/docs/database/sqlite#d1-read-replicas)。

## 使用 Cloudflare

首先，安装依赖后需要通过以下命令登录 Wrangler：

```bash
pnpm wrangler login
```

这会跳转到 Cloudflare 登录页面，之后你可以本地使用 Wrangler CLI，输入 `pnpm wrangler help` 查看所有可用选项。

Wrangler 非常智能，只需运行 `pnpm dev` 就会自动为本地开发绑定服务。

## 部署

准备部署时，首先确保已创建数据库迁移：

```bash
pnpm payload migrate:create
```

然后运行以下命令：

```bash
pnpm run deploy
```

这将以 `production` 模式启动 Wrangler，运行所有已创建的迁移，构建应用并将打包文件部署到 Cloudflare。

完成！你也可以将这些步骤集成到 CI 流水线中。

## 启用日志

默认情况下 API 日志未启用，因为日志会消耗配额，所以我们将其设为可选。但你可以在 Cloudflare 控制面板中一键启用日志，[查看文档](https://developers.cloudflare.com/workers/observability/logs/workers-logs/#enable-workers-logs)。

### 日志配置

此模板包含一个与 Cloudflare Workers 兼容的自定义控制台日志记录器。Payload 默认使用 `pino-pretty`，它依赖 Node.js API，在 Workers 中不可用，会导致 `fs.write is not implemented` 错误。

`payload.config.ts` 中的自定义日志记录器：

- 通过 `console.*` 方法输出日志，Workers 可以正确处理
- 输出 JSON 格式的日志，方便 Cloudflare 可观测性
- 仅在生产环境中启用（开发环境使用默认的 `pino-pretty` 以获得更好的开发体验）

你可以通过 `PAYLOAD_LOG_LEVEL` 环境变量控制日志级别（如 `debug`、`info`、`warn`、`error`）。

### Diagnostic Channel 错误

如果在可观测性日志中看到 "Failed to publish diagnostic channel message" 错误，这些通常来自 `undici` HTTP 客户端库。模板在 Media 集合中包含 `skipSafeFetch: true`，使用原生 fetch 代替 undici 进行文件上传，有助于减少这些错误。

Cloudflare Workers 默认运行在[无法访问私有 IP 范围的隔离环境](https://developers.cloudflare.com/workers-vpc/examples/route-across-private-services/)中，提供内置的 SSRF 保护，因此使用 `skipSafeFetch` 是安全的。

## 已知问题

### GraphQL

我们正在等待 Workers 上游修复一些 GraphQL [问题](https://github.com/cloudflare/workerd/issues/5175)，因此目前部署时 GraphQL 的完整支持无法保证。

### Worker 大小限制

由于打包[大小限制](https://developers.cloudflare.com/workers/platform/limits/#worker-size)为 3MB，我们建议将此模板部署到付费 Workers 计划。我们正在积极减小打包体积以更好地满足这一指标。

这也适用于你自己的代码，如果导入大量库，你可能会受到打包大小的限制。

## 问题反馈

如有任何问题，请在 [Discord](https://discord.com/invite/payload) 上联系我们或发起 [GitHub 讨论](https://github.com/payloadcms/payload/discussions)。
