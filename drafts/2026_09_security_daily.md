---
title: "安全日报 | 2026年9月下旬：边界设备成重灾区，AI 基础设施首次挤进 KEV 前列"
summary: "9月下旬安全态势复盘：F5 BIG-IP、Check Point、Cisco ISE、WordPress、MikroTik 集中爆零日且确认在野利用；7 枚新增 KEV 中 3 枚指向 AI 基础设施；附优先级修复清单。"
tags: ["security", "cve", "vulnerability", "supplychain", "zero-day"]
---

# 安全日报 | 2026年9月下旬：边界设备成重灾区，AI 基础设施首次挤进 KEV 前列

9 月下旬这波漏洞披露有个很明显的特征：**集中打网络管理平面、VPN / 防火墙、CMS 和邮件系统**，而且多枚在披露后数小时内就被确认在野利用。如果只挑一件事做，那就是先把暴露在公网的边界设备清一遍。

下面按"必须立即处理"到"本周内处理"排列，全部是已确认在野利用或已有公开 PoC 的。

## 一、必须立即处理（已确认在野利用）

### F5 BIG-IP APM 未授权 RCE（CVE-2026-94127，CVSS 9.8）

OAuth 实现中的堆缓冲区溢出，未授权攻击者可直接实现远程代码执行。影响 **BIG-IP APM 21.1.0、17.1.0–17.5.1**。已加入 CISA KEV（9/22）。

触发条件有前置：目标虚拟服务器需启用 APM 访问策略 + OAuth Authorization Server 配置。watchTowr Labs 已公开复现 PoC。

### Check Point 双漏洞链（CVE-2026-93616 / CVE-2026-85102，均 9.8）

- **CVE-2026-93616**：Security Management Server 目录遍历 + 任意文件上传 → RCE（影响 R82.x / R81.x 等多系列）
- **CVE-2026-85102**：Quantum Security Gateway / Spark 防火墙认证绕过 + RCE

两枚均于 9/22 加入 KEV。管理服务器失守意味着整个策略与设备体系暴露。

### Cisco ISE 认证绕过 → root RCE（CVE-2026-76460，CVSS 9.8）

API 网关认证绕过，可直接拿到 root 权限。已确认在野利用。同期的 **CVE-2026-76461** 是 Cisco Secure Email Gateway（AsyncOS）的 SQL 注入 → 命令执行，已有公开 PoC。

### WordPress Core 未授权路径遍历 → RCE（CVE-2026-87902，CVSS 9.2）

影响 **WordPress Core 4.7.0–7.1.1**，修复版本 7.1.2，9/25 加入 KEV。

利用 `pagename=..%252f` 双编码触发 `get_page_template()` 路径遍历，结合 `pearcmd.php` 实现文件写入。需要注意触发有前置条件（主题含 `page-` 开头目录等），但攻击者已经在披露后数小时内开始扫描——FreeBuf 的报道显示 Patchstack 监测到累计 68 次尝试。

WordPress 装机量太大，这条建议排在前面。

### MikroTik RouterOS 提权链（CVE-2026-86060，CVSS 9.8）

SSH 登录路径参数注入 → 提权，与 CVE-2026-67279 串联构成完整的"接管链"（Bishop Fox 将其命名为 MikroTrick）。9/10 已加入 KEV。RouterOS 7.x 用户请立即升级。

### Issabel PBX 硬编码 JWT 密钥（CVE-2026-89026，CVSS 9.8）

开源 PBX（基于 Asterisk）框架中硬编码的 JWT 密钥，攻击者可直接伪造令牌实现未授权 RCE。Shadowserver 在 9/9 观测到在野利用。PBX 一旦失守，通话内容、内部号码、录音全部暴露。

## 二、本周内处理

| CVE | 组件 | CVSS | 要点 |
|---|---|---|---|
| CVE-2026-65660 | Microsoft SharePoint Server | 8.8 | 代码注入 → RCE，KEV 在野 |
| CVE-2026-48842 | Roundcube Webmail < 1.6.16 | 8.1 | 预认证 SQL 注入，需启用 virtuser_query 插件 |
| CVE-2026-89775 | Linux Kernel KVM ARM64 | 9.3 | 嵌套虚拟化 Guest→Host 逃逸，已修复 6.18.51/7.2.5 |
| CVE-2026-23239 | Linux Kernel espintcp | 7.8 | UAF 竞争 → 本地提权，无需 capability |
| CVE-2026-86350 | Apache Tomcat ≤ 9.0.121 | 9.1 | HTTP/2 请求走私（HPack 头混淆），PoC 已公开 |
| CVE-2026-32996 | Veeam Agent for Windows | 严重 | 本地提权至 SYSTEM，多用户端点风险高 |
| CVE-2026-74849 | ManageEngine ADSelfService Plus | 9.8 | GINA 客户端 RCE（< build 7001） |
| CVE-2026-80155 | Lantronix SLC8000 / EMG 系列 | 10.0 | 认证绕过 + 任意文件写入 → RCE |

Roundcube 那条特别提醒一句：**它只在启用了 `virtuser_query` 插件时受影响**，先确认插件状态再决定修复优先级，但升级到 1.6.16 / 1.7.1 以上不亏。

## 三、三条值得关注的趋势

### 1. AI 基础设施第一次成规模地进入 KEV

CISA 在 9 月 2 日一次性新增 7 枚 KEV，其中 **3 枚直接指向 AI 基础设施**：

- **CVE-2026-49869（Kestra OSS，CVSS 10.0）**：工作流引擎命令注入
- **CVE-2026-59822（BerriAI LiteLLM，CVSS 8.6）**：LLM 网关认证不当
- **CVE-2026-0768（Langflow，CVSS 9.8）**：RCE，已确认在野利用

这个比例不正常。过去的 KEV 几乎被路由器、VPN、办公套件承包，AI 组件挤进前三说明一件事：**AI 基础设施的部署速度已经跑在了它的安全成熟度前面。** 大量 AI 工作流平台（Kestra、Langflow、LiteLLM）被部署在内网并拥有高权限，却缺少与传统中间件同等强度的加固习惯。

### 2. 单点 CVSS 分数掩盖了链式利用的真实风险

SonicWall SMA1000 那组（CVE-2026-83548 SSRF 10.0 + CVE-2026-83549 命令注入 7.8）是典型：单独看 7.8 那枚不算最致命，但和 SSRF 串起来就是**未授权 root 级 RCE**。评估补丁优先级时，只看单个 CVE 的分数会漏掉真正危险的组合。

### 3. 供应链攻击从"投毒"升级到"寄生"

- **被入侵的 GitHub Actions 工作流在恢复运行后继续投递 Mini Shai-Hulud 恶意软件**——清理了 CI 配置不代表清干净了，恶意负载会在工作流重新启用时再次触发。
- **TeamPCP 供应链攻击团伙两名嫌疑人在澳大利亚被捕**，涉案组织超 1000 家，手法包括恶意更新包投毒、水坑攻击、凭证窃取。
- **JFrog Artifactory 认证绕过（CVE-2026-82329）** 的实际用途是**上传恶意制品污染下游**——攻击者拿到管理员级仓库权限后，通过篡改元数据让下游项目自动拉取恶意依赖。

对使用 CI/CD 的团队，这几条合起来的建议是：**审查工作流时不能只看配置文件，要连带检查制品完整性和历史签名。**

## 四、其他值得知道的事件

- **Bitget 交易所被盗约 3.516 亿美元**，交易所称疑似朝鲜相关攻击者攻破后端。
- **Cloudflare 修复了一个容器越界读取缺陷**：多租户隔离失效，单个容器可读到相邻客户的磁盘残留数据。已修复，但多租户平台值得自查同类问题。
- **McKesson 数据泄露**：勒索团伙 ShinyHunters 声称窃取 2.84 亿条患者记录，索要 5500 万美元赎金，可能是史上最大的医疗数据泄露之一。
- **macOS 恶意软件 PamStealer 升级**：新增实时 C2 载荷解密与多层持久化。
- **Sality 僵尸网络被捣毁**：存活 23 年后，国际执法机构查封其核心 C2 基础设施。

## 五、优先级清单

**48 小时内（P0）**

1. F5 BIG-IP APM → 打补丁 + 限制管理接口来源
2. Check Point 管理服务器 / 网关 → 打补丁 + 审计异常文件
3. Cisco ISE → 打补丁 + 审计 API 日志
4. WordPress Core → 升级到 7.1.2
5. MikroTik RouterOS → 升级 + 更换管理凭证

**一周内（P1）**

6. Roundcube → 确认 virtuser_query 插件状态并升级
7. Linux 内核 → 更新（KVM / espintcp 两条）
8. Apache Tomcat → 升级到 9.0.122+
9. SharePoint / Exchange → 应用最新月度补丁
10. Veeam Agent for Windows → 升级

**两周内（P2）**

11. AI 基础设施（Langflow / Kestra / LiteLLM）→ 升级 + 审计工作流
12. CI/CD 供应链 → 审查工作流与制品完整性
13. 排查信息窃取木马 → 清理浏览器 Cookie、启用 MFA

## 结语

9 月下旬这波最值得记住的不是某个具体 CVE，而是三个结构性信号：**边界和管理平面依然是最好用的入口；AI 基础设施正在快速积累风险敞口；供应链攻击已经从"投毒一次"变成"长期寄生"。**

对个人和中小团队，务实做法是：**先把公网暴露的边界设备补齐，再管 AI 组件，最后是内核和终端。** 优先级按"暴露面 × 权限"排，而不是按 CVSS 分数排。
