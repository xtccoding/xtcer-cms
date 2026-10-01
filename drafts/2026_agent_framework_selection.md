# AI Agent 框架选型实战 2026：LangGraph、CrewAI、OpenAI Agents SDK 怎么选

## 为什么 2026 年还要纠结框架

2026 年做 AI Agent 已经不再问"要不要做"，而是问"用哪个框架做"。Gartner 预测到 2026 年底，40% 的企业应用会内嵌任务型 Agent，而一年前这个数字还不到 5%——八倍的增长，几乎都不是从零手写的，全都建立在某一个 Agent 框架之上。

问题是：2026 年框架阵营已经收敛成几个名字，LangGraph、CrewAI、OpenAI Agents SDK、Microsoft Agent Framework、Claude Agent SDK。它们不是同一个思路的三种实现，而是在架构层面就互相反对。选错框架，等于让整个团队在一两年内把代码重写一遍。

本文用一个真实调研类 Agent 作为贯穿案例，分别用 LangGraph、CrewAI、OpenAI Agents SDK 实现，最后给出按故障模式选型的决策矩阵。

## 先看结论：三种思路的底层分歧

| 框架 | 心智模型 | 控制流 | 持久化/恢复 | 学习曲线 | 最适合 |
|------|---------|--------|------------|---------|--------|
| LangGraph | 状态图（节点+边） | 完全显式，可循环可分支 | 每节点 checkpoint，可断点续跑 | 陡 | 长任务、有审计要求、要扛崩溃 |
| CrewAI | 角色化 Agent 团队 | 顺序/层级，Flows 可编排 | Flows 有状态，粒度较粗 | 平缓 | 内容流水线、快速原型、角色分工 |
| OpenAI Agents SDK | Agent 之间互相移交 | 模型运行时决定 | Sessions 记忆，无原生 checkpoint | 很平缓 | 简单到中等复杂度的多 Agent |

一句话记忆：**LangGraph 是状态机，CrewAI 是项目简报，OpenAI SDK 是函数调用链。**

## 实战案例：做一个"调研 + 出摘要"的 Agent

目标：输入一个技术主题，Agent 先上网搜资料，再汇总成带来源的结构化摘要。三个框架各写一遍。

### 1. LangGraph：把流程画成图

LangGraph 从 2025 年 10 月发布 1.0，2026 年 5 月迭代到 1.2。它的核心是把 Agent 变成显式的有向图：每个节点是一段逻辑，边（包括条件边）决定走向。最值钱的是 checkpointer——每执行完一个节点就把状态快照到内存、SQLite 或 Postgres，按 `thread_id` 隔离。

这意味着：崩溃了从最后一个完成的节点续跑，而不是从头再来；`interrupt()` 可以在执行到一半挂起等人审批，`Command(resume=...)` 再继续——人工介入变成框架原语而不是业务代码里的临时补丁。

```python
from typing import TypedDict
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import InMemorySaver
from langchain_openai import ChatOpenAI
from langchain_community.tools import DuckDuckGoSearchRun

class State(TypedDict):
    topic: str
    notes: list
    report: str

llm = ChatOpenAI(model="gpt-4o")

def research(state: State) -> State:
    """搜索节点：把结果追加到 notes"""
    search = DuckDuckGoSearchRun()
    notes = state["notes"] + [search.run(state["topic"])]
    return {"notes": notes}

def write_report(state: State) -> State:
    """汇总节点：把 notes 交给 LLM 生成摘要"""
    merged = "\n\n".join(state["notes"])
    resp = llm.invoke(f"基于以下资料，输出 200 字结构化摘要并列出来源：\n{merged}")
    return {"report": resp.content}

# 搭建图
workflow = StateGraph(State)
workflow.add_node("research", research)
workflow.add_node("write_report", write_report)
workflow.set_entry_point("research")
workflow.add_edge("research", "write_report")
workflow.add_edge("write_report", END)

# 用 checkpointer 编译：支持中断/恢复
app = workflow.compile(checkpointer=InMemorySaver())

result = app.invoke(
    {"topic": "2026 开源大模型", "notes": [], "report": ""},
    config={"configurable": {"thread_id": "session-1"}},
)
print(result["report"])
```

生产环境里把 `InMemorySaver` 换成 `PostgresSaver`，每次都传 `thread_id`，再用 `astream_events` 做流式输出。LangGraph 在 Uber、LinkedIn、Klarna、Replit 已经跑了一年多，月 PyPI 下载量超 4000 万。

### 2. CrewAI：像写项目简报一样定义团队

CrewAI 的心智模型是"角色分工"。你给每个 Agent 定义 role、goal、backstory，把任务交给 Crew 去跑。2026 年的 CrewAI 已经原生支持 MCP 和 A2A 协议，月执行量约 4.5 亿次，对外称覆盖六成美国财富 500 强。

```python
from crewai import Agent, Task, Crew, Process

researcher = Agent(
    role="调研员",
    goal="搜索并整理 {topic} 的最新资料",
    backstory="你是严谨的科技记者，只引用可信来源。",
    tools=[],  # 可挂 WebSearchTool / MCP 工具
)

writer = Agent(
    role="撰稿人",
    goal="把调研结果写成 200 字结构化摘要",
    backstory="你擅长把复杂信息提炼成清晰摘要。",
)

research_task = Task(
    description="搜索 {topic} 并整理 3 条关键信息",
    agent=researcher,
    expected_output="3 条带来源的关键信息",
)

write_task = Task(
    description="基于调研结果写 200 字摘要",
    agent=writer,
    expected_output="结构化中文摘要",
)

crew = Crew(
    agents=[researcher, writer],
    tasks=[research_task, write_task],
    process=Process.sequential,
)
print(crew.kickoff(inputs={"topic": "2026 开源大模型"}))
```

CrewAI 最快的地方在"从空文件到能演示"。但如果业务流有强制的固定顺序（比如合规要求某一步必须在另一步之前），Crew 让 Agent 自己商量顺序，这是拿不出证据的——这时候要用 Flows 层把顺序钉死。成熟模式是：**外面 Flows，里面 Crews**，该灵活的地方灵活，该确定的地方确定。

### 3. OpenAI Agents SDK：Agent 移交 Agent

OpenAI Agents SDK 是当年 Swarm 实验的正统继任者。核心概念极小：Agent 就是"指令 + 工具"，Agent 之间通过 handoff 互相移交，模型决定何时移交，事后看 trace 复盘。上手最快，一个多 Agent 移交链二十行以内就能跑起来。

```python
from agents import Agent, Runner
from agents.mcp import MCPServerStdio

agent_a = Agent(
    name="Researcher",
    instructions="搜索给定主题的最新资料，然后移交给 SummaryAgent 汇总。",
)
agent_b = Agent(
    name="SummaryAgent",
    instructions="把收到的资料写成 200 字中文摘要。",
    handoffs=[agent_a],  # 支持互相移交
)

result = Runner.run_sync(agent_b, "2026 开源大模型")
print(result.final_output)
```

SDK 自带内置 tracing，对原型阶段足够干净；通过 LiteLLM 适配器可以接 Claude 或本地模型。注意它只有 Sessions（对话记忆），没有原生 checkpoint——进程中途死掉就是重放，不是续跑。

## 决策矩阵：按故障模式选型

别先比功能表，先问一个问题：**这个工作流如果中途挂了，后果是什么？**

- 如果答案是"重新跑一遍会重复扣款/重复发单"，你需要节点级 checkpoint——**LangGraph**，没有之一。
- 如果答案是"重跑一遍没人注意"，这个约束不成立，别为它买单，用 **CrewAI** 快速交付。
- 如果流程画得出来、是有限状态，LangGraph 的显式图更容易测试、举证、维护。
- 如果问题真正开放、工具密集，一个图上堆无数特殊分支会变成技术债，Claude Agent SDK 的有界循环（bounded loop）是更好的抽象。
- 已深度绑定 OpenAI 生态，选 OpenAI Agents SDK；绑定 Azure/Microsoft 生态，选 Microsoft Agent Framework（MAF，AutoGen + Semantic Kernel 的合并后继，核心是 CodeAct：模型写 Python 在沙箱微虚拟机里执行）。

**两个反直觉的结论：**

1. **没有全能冠军。** 正确姿势往往是多框架并存：受监管、长流程的用 LangGraph；内部协作、赶时间的用 CrewAI；开放式的探索用模型驱动的有界循环。
2. **真正的战场是状态、重试、死锁，而不是框架名字。** 团队在选型上花的每一分钟，如果没花在定义状态、错误处理、死锁防护上，都是在为将来还债。

## 上手建议

按这个顺序体验，概念是能迁移的：先花一个下午用 OpenAI Agents SDK 感受问题长什么样；遇到"这活儿真是一个分工团队"再上 CrewAI；等到"这个 Agent 必须能崩溃、暂停、原地复活"，就毕业到 LangGraph。

选型没有标准答案，但有标准问题：**你害怕的故障模式是什么？** 其他都是可以改的偏好。