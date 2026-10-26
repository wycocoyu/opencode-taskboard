import { Schema } from "effect"
import { Persistence } from "@/runtime/persistence/schema"

export type TaskboardColumnId = "backlog" | "todo" | "in_progress" | "review" | "done"
export type TaskboardPriority = "P0" | "P1" | "P2"
export type TaskboardViewMode = "sessions" | "board" | "discussion" | "split"

export const TASKBOARD_COLUMNS: ReadonlyArray<{
  id: TaskboardColumnId
  title: string
  badgeClass: string
}> = [
  { id: "backlog", title: "待规划", badgeClass: "bg-gray-500/20 text-gray-300 border-gray-500/30" },
  { id: "todo", title: "待开始", badgeClass: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  { id: "in_progress", title: "进行中", badgeClass: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  { id: "review", title: "待验收", badgeClass: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  { id: "done", title: "已完成", badgeClass: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
]

export type TaskboardAgentProfile = {
  id: string
  name: string
  roleLabel: string
  description: string
  mode: "primary" | "subagent"
  badgeClass: string
}

export const BUILTIN_TASKBOARD_AGENTS: ReadonlyArray<TaskboardAgentProfile> = [
  {
    id: "plan",
    name: "@plan · 实现规划师",
    roleLabel: "只读规划",
    description: "拆解架构接缝、数据库 Schema 与实施步骤",
    mode: "primary",
    badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/35",
  },
  {
    id: "reviewer",
    name: "@reviewer · 代码审查员",
    roleLabel: "对抗冷审",
    description: "核查破坏面、并发竞态与是否过度设计",
    mode: "subagent",
    badgeClass: "bg-purple-500/15 text-purple-300 border-purple-500/35",
  },
  {
    id: "build",
    name: "@build · 编码执行 Agent",
    roleLabel: "全工具读写",
    description: "评估改动文件行数，或直接接手 Worktree 落地代码",
    mode: "primary",
    badgeClass: "bg-blue-500/15 text-blue-300 border-blue-500/35",
  },
  {
    id: "coder",
    name: "@coder · 专职编码子 Agent",
    roleLabel: "跨文件实施",
    description: "复杂代码实施、跨文件行为修改、修 bug 与补测试",
    mode: "subagent",
    badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/35",
  },
  {
    id: "gpt-sol",
    name: "@gpt-sol · 异构参谋",
    roleLabel: "异构冷审",
    description: "异构只读参谋与方案独立冷审、疑难根因诊断",
    mode: "subagent",
    badgeClass: "bg-cyan-500/15 text-cyan-300 border-cyan-500/35",
  },
  {
    id: "explore",
    name: "@explore · 代码库探路员",
    roleLabel: "快速检索",
    description: "并行定位文件、符号与调用链",
    mode: "subagent",
    badgeClass: "bg-indigo-500/15 text-indigo-300 border-indigo-500/35",
  },
]

const ReplySchema = Persistence.struct({
  id: Schema.String,
  agent: Schema.String,
  text: Schema.String,
  createdAt: Schema.Number,
})

const DiscussionThreadSchema = Persistence.struct({
  id: Schema.String,
  author: Schema.String,
  targetAgent: Schema.String,
  question: Schema.String,
  replies: Persistence.array(ReplySchema),
  conclusion: Schema.String,
  resolved: Schema.Boolean,
  createdAt: Schema.Number,
})

const IssueSchema = Persistence.struct({
  id: Schema.String,
  title: Schema.String,
  description: Schema.String,
  status: Schema.Literals(["backlog", "todo", "in_progress", "review", "done"]),
  priority: Schema.Literals(["P0", "P1", "P2"]),
  assigneeAgent: Schema.String,
  worktree: Schema.String,
  discussionSessionId: Persistence.optional(Schema.String),
  executionSessionId: Persistence.optional(Schema.String),
  boundSessionIds: Persistence.array(Schema.String),
  serverKey: Persistence.optional(Schema.String),
  directory: Persistence.optional(Schema.String),
  discussionThreads: Persistence.array(DiscussionThreadSchema),
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
})

const CustomAgentSchema = Persistence.struct({
  id: Schema.String,
  name: Schema.String,
  roleLabel: Schema.String,
  description: Schema.String,
  mode: Schema.Literals(["primary", "subagent"]),
})

export const TaskboardPersistedSchema = Persistence.struct({
  enabled: Schema.Boolean,
  viewMode: Schema.Literals(["sessions", "board", "discussion", "split"]),
  activeIssueId: Schema.String,
  targetAgent: Schema.String,
  deliveryMode: Schema.Literals(["queue", "steer"]),
  filterAgent: Schema.String,
  splitRatio: Schema.Number,
  issues: Persistence.array(IssueSchema),
  customAgents: Persistence.array(CustomAgentSchema),
})

export type TaskboardReply = typeof ReplySchema.Type
export type TaskboardDiscussionThread = typeof DiscussionThreadSchema.Type
export type TaskboardIssue = typeof IssueSchema.Type
export type CustomAgentProfile = typeof CustomAgentSchema.Type
export type TaskboardState = typeof TaskboardPersistedSchema.Type

export function createDefaultTaskboardState(): TaskboardState {
  const now = 1761446400000
  return {
    enabled: true,
    viewMode: "sessions",
    activeIssueId: "OC-101",
    targetAgent: "plan",
    deliveryMode: "queue",
    filterAgent: "all",
    splitRatio: 0.46,
    customAgents: [],
    issues: [
      {
        id: "OC-101",
        title: "在 SessionSidebar 顶栏接入项目看板与 @多Agent 需求讨论",
        description:
          "1. 在 SessionSidebar (+ 新建会话下方) 增加「项目看板」与「需求讨论」常驻入口\n2. 支持单会话内 @plan / @reviewer / @build / @coder 角色切换与讨论串标为结论折叠\n3. 支持左屏需求讨论、右屏绑定真实执行 Session 的双屏联动",
        status: "in_progress",
        priority: "P0",
        assigneeAgent: "build",
        worktree: ".worktrees/oc-101",
        boundSessionIds: [],
        createdAt: now - 3600_000 * 5,
        updatedAt: now - 600_000,
        discussionThreads: [
          {
            id: "t-101-1",
            author: "老板 (Cocoyu)",
            targetAgent: "plan",
            question:
              "@plan 我们不想新开外部浏览器或独立软件看看板，怎么在 OpenCode 内最自然地把看板、需求讨论与编码会话串起来？",
            replies: [
              {
                id: "r-101-1",
                agent: "plan",
                text: "直接在 SessionSidebar 顶部（+ 新建会话下方）挂载「📋 项目」与「💬 讨论」入口，并通过双屏联动（左屏需求讨论 @多Agent，右屏真实 OpenCode 执行会话）实现同窗协同。",
                createdAt: now - 3600_000 * 4,
              },
            ],
            conclusion:
              "在 SessionSidebar 顶部挂载「项目看板」与「需求讨论」入口，左屏讨论 @多Agent 与右屏真实执行 Session 同屏联动。",
            resolved: true,
            createdAt: now - 3600_000 * 4,
          },
          {
            id: "t-101-2",
            author: "老板 (Cocoyu)",
            targetAgent: "reviewer",
            question: "@reviewer 需求讨论室里多轮来回辩论后，转给执行会话写代码时怎么防止上下文膨胀和废弃方案干扰？",
            replies: [
              {
                id: "r-101-2",
                agent: "reviewer",
                text: "借鉴 Qoder 讨论室折叠协议：每个讨论串支持点击「标为结论并折叠 (Resolve & Fold)」，构造 <discussion_context> 时只注入已收敛的【根问题 + 最终结论】，省去中间辩论噪音。",
                createdAt: now - 3600_000 * 3,
              },
            ],
            conclusion: "讨论串支持「标为结论并折叠」，仅将已收敛的【根问题 + 最终结论】封装进 <discussion_context> 注入执行会话。",
            resolved: true,
            createdAt: now - 3600_000 * 3,
          },
          {
            id: "t-101-3",
            author: "老板 (Cocoyu)",
            targetAgent: "build",
            question: "@build 评估一下右屏绑定执行会话怎么和现有的 SplitWorkbench 结合？",
            replies: [
              {
                id: "r-101-3",
                agent: "build",
                text: "双屏联动模式下，左屏固定渲染当前 Issue 的 @多Agent 需求讨论室，右屏直接挂载原生 SplitWorkbench 渲染绑定的真实 OpenCode Session，支持一键将最新讨论结论注入右侧会话。",
                createdAt: now - 3600_000 * 2,
              },
            ],
            conclusion: "",
            resolved: false,
            createdAt: now - 3600_000 * 2,
          },
        ],
      },
      {
        id: "OC-102",
        title: "实现 Qoder 同款 @Agent 角色提及弹窗与自定义 Agent 注册",
        description:
          "支持在讨论输入框与原生 Composer 键入 @ 弹出 Agent | 成员 菜单，自动同步 opencode.json 配置的 @plan / @reviewer / @coder / @gpt-sol / @build。",
        status: "todo",
        priority: "P0",
        assigneeAgent: "plan",
        worktree: ".worktrees/oc-102",
        boundSessionIds: [],
        createdAt: now - 3600_000 * 4,
        updatedAt: now - 1200_000,
        discussionThreads: [
          {
            id: "t-102-1",
            author: "老板 (Cocoyu)",
            targetAgent: "plan",
            question: "@plan 弹窗里的 Agent 列表怎么和本机 opencode.json 里的自定义 Agent 保持一致？",
            replies: [
              {
                id: "r-102-1",
                agent: "plan",
                text: "直接读取当前连接 Server 的 ctx.data.agent.list()，自动合并内置角色与用户在弹窗里新增的自定义角色。",
                createdAt: now - 3600_000 * 3,
              },
            ],
            conclusion: "通过 ctx.data.agent.list() 实时读取 Server 已注册 Agent 并合并自定义角色。",
            resolved: true,
            createdAt: now - 3600_000 * 3,
          },
        ],
      },
      {
        id: "OC-103",
        title: "支持讨论串「标为结论 (Resolve & Fold)」与增量 Context 注入",
        description:
          "将已达成共识的讨论串压缩为 [根问题 + 最终结论]，并支持一键作为 <discussion_context> 发送或预填到绑定的执行 Session。",
        status: "in_progress",
        priority: "P1",
        assigneeAgent: "reviewer",
        worktree: ".worktrees/oc-103",
        boundSessionIds: [],
        createdAt: now - 3600_000 * 3,
        updatedAt: now - 1800_000,
        discussionThreads: [],
      },
      {
        id: "OC-104",
        title: "Issue 卡片一键创建/绑定真实执行 Session 并在左栏显示 Issue 徽标",
        description:
          "为 Issue 绑定讨论会话或编码执行会话后，在 SessionSidebar 会话列表行展示对应的 OC-xxx 徽标，点击可联动打开。",
        status: "review",
        priority: "P1",
        assigneeAgent: "coder",
        worktree: ".worktrees/oc-104",
        boundSessionIds: [],
        createdAt: now - 3600_000 * 2,
        updatedAt: now - 2400_000,
        discussionThreads: [],
      },
      {
        id: "OC-105",
        title: "REA 逆向 Qoder 0.4.11 协作消息 SQLite 与多 Agent 通信协议",
        description: "已提取 collaboration-message-cache.sqlite 表结构与 <discussion_context> bootstrap/delta 增量协议。",
        status: "done",
        priority: "P0",
        assigneeAgent: "reviewer",
        worktree: "main",
        boundSessionIds: [],
        createdAt: now - 3600_000 * 6,
        updatedAt: now - 3600_000,
        discussionThreads: [],
      },
    ],
  }
}

export function nextIssueId(issues: ReadonlyArray<TaskboardIssue>): string {
  let maxNum = 100
  for (const item of issues) {
    const match = item.id.match(/^OC-(\d+)$/i)
    if (match) {
      const parsed = Number.parseInt(match[1]!, 10)
      if (Number.isFinite(parsed) && parsed > maxNum) maxNum = parsed
    }
  }
  return `OC-${maxNum + 1}`
}

export function createIssue(
  state: TaskboardState,
  input: {
    title: string
    description?: string
    status?: TaskboardColumnId
    priority?: TaskboardPriority
    assigneeAgent?: string
    worktree?: string
    seedDiscussion?: boolean
  },
): TaskboardState {
  const id = nextIssueId(state.issues)
  const now = Date.now()
  const title = input.title.trim() || "未命名需求议题"
  const description =
    input.description?.trim() || "1. 明确需求背景与边界\n2. 在讨论室收敛技术方案后绑定执行会话落地"
  const agent = input.assigneeAgent || "plan"
  const worktree = input.worktree?.trim() || `.worktrees/${id.toLowerCase()}`

  const initialThreads: TaskboardDiscussionThread[] = input.seedDiscussion
    ? [
        {
          id: `t-${now}`,
          author: "老板 (Cocoyu)",
          targetAgent: agent,
          question: `@${agent} 请针对新议题「${title}」给出初步拆解方案与关键实施步骤。`,
          replies: [
            {
              id: `r-${now}`,
              agent,
              text: buildSimulatedAgentReply(agent, title, description, "queue"),
              createdAt: now,
            },
          ],
          conclusion: "",
          resolved: false,
          createdAt: now,
        },
      ]
    : []

  const created: TaskboardIssue = {
    id,
    title,
    description,
    status: input.status ?? "backlog",
    priority: input.priority ?? "P1",
    assigneeAgent: agent,
    worktree,
    boundSessionIds: [],
    discussionThreads: initialThreads,
    createdAt: now,
    updatedAt: now,
  }

  return {
    ...state,
    activeIssueId: id,
    targetAgent: agent,
    issues: [created, ...state.issues],
  }
}

export function updateIssueStatus(
  state: TaskboardState,
  issueId: string,
  status: TaskboardColumnId,
): TaskboardState {
  const now = Date.now()
  return {
    ...state,
    issues: state.issues.map((issue) => (issue.id === issueId ? { ...issue, status, updatedAt: now } : issue)),
  }
}

export function updateIssueDetails(
  state: TaskboardState,
  issueId: string,
  patch: Partial<Pick<TaskboardIssue, "title" | "description" | "priority" | "assigneeAgent" | "worktree" | "status">>,
): TaskboardState {
  const now = Date.now()
  return {
    ...state,
    issues: state.issues.map((issue) =>
      issue.id === issueId
        ? {
            ...issue,
            ...patch,
            updatedAt: now,
          }
        : issue,
    ),
  }
}

export function deleteIssue(state: TaskboardState, issueId: string): TaskboardState {
  const remaining = state.issues.filter((issue) => issue.id !== issueId)
  const nextActive =
    state.activeIssueId === issueId ? (remaining[0]?.id ?? "") : state.activeIssueId
  return {
    ...state,
    activeIssueId: nextActive,
    issues: remaining,
  }
}

export function appendDiscussionThread(
  state: TaskboardState,
  issueId: string,
  input: {
    id?: string
    author?: string
    targetAgent: string
    question: string
    replyText: string
  },
): TaskboardState {
  const now = Date.now()
  const threadId = input.id ?? `t-${now}-${Math.random().toString(36).slice(2, 6)}`
  const newThread: TaskboardDiscussionThread = {
    id: threadId,
    author: input.author ?? "老板 (Cocoyu)",
    targetAgent: input.targetAgent,
    question: input.question,
    replies: [
      {
        id: `r-${now}`,
        agent: input.targetAgent,
        text: input.replyText,
        createdAt: now,
      },
    ],
    conclusion: "",
    resolved: false,
    createdAt: now,
  }

  return {
    ...state,
    issues: state.issues.map((issue) =>
      issue.id === issueId
        ? {
            ...issue,
            updatedAt: now,
            discussionThreads: [...issue.discussionThreads, newThread],
          }
        : issue,
    ),
  }
}

export function updateThreadReplyText(
  state: TaskboardState,
  issueId: string,
  threadId: string,
  agent: string,
  text: string,
): TaskboardState {
  const now = Date.now()
  return {
    ...state,
    issues: state.issues.map((issue) => {
      if (issue.id !== issueId) return issue
      return {
        ...issue,
        updatedAt: now,
        discussionThreads: issue.discussionThreads.map((thread) => {
          if (thread.id !== threadId) return thread
          return {
            ...thread,
            replies: [
              {
                id: thread.replies[0]?.id ?? `r-${now}`,
                agent,
                text,
                createdAt: now,
              },
            ],
          }
        }),
      }
    }),
  }
}

export function toggleThreadResolved(
  state: TaskboardState,
  issueId: string,
  threadId: string,
  customConclusion?: string,
): TaskboardState {
  const now = Date.now()
  return {
    ...state,
    issues: state.issues.map((issue) => {
      if (issue.id !== issueId) return issue
      return {
        ...issue,
        updatedAt: now,
        discussionThreads: issue.discussionThreads.map((thread) => {
          if (thread.id !== threadId) return thread
          const nextResolved = !thread.resolved
          const fallbackConclusion =
            thread.replies[thread.replies.length - 1]?.text.split("\n").find((line) => line.trim().length > 0) ??
            thread.question
          const conclusion =
            customConclusion?.trim() ||
            thread.conclusion.trim() ||
            fallbackConclusion.replace(/^【[^】]+】\s*/, "").trim()
          return {
            ...thread,
            resolved: nextResolved,
            conclusion: nextResolved ? conclusion : thread.conclusion,
          }
        }),
      }
    }),
  }
}

export function updateThreadConclusion(
  state: TaskboardState,
  issueId: string,
  threadId: string,
  conclusion: string,
): TaskboardState {
  const now = Date.now()
  return {
    ...state,
    issues: state.issues.map((issue) => {
      if (issue.id !== issueId) return issue
      return {
        ...issue,
        updatedAt: now,
        discussionThreads: issue.discussionThreads.map((thread) =>
          thread.id === threadId ? { ...thread, conclusion, resolved: true } : thread,
        ),
      }
    }),
  }
}

export function buildDiscussionContextXml(
  issue: TaskboardIssue,
  mode: "bootstrap" | "delta" = "delta",
): string {
  const resolvedThreads = issue.discussionThreads.filter((t) => t.resolved)
  const header = `<discussion_context mode="${mode}" issue="${issue.id}" worktree="${issue.worktree}">`
  const issueSpec = [
    `  <issue_spec title="${escapeXmlAttr(issue.title)}" priority="${issue.priority}" status="${issue.status}">`,
    ...issue.description.split("\n").map((line) => `    ${line}`),
    `  </issue_spec>`,
  ].join("\n")

  const conclusions =
    resolvedThreads.length > 0
      ? resolvedThreads
          .map(
            (t, idx) =>
              `  <folded_conclusion index="${idx + 1}" agent="@${t.targetAgent}">\n    [根问题] ${t.question}\n    [已收敛结论] ${t.conclusion}\n  </folded_conclusion>`,
          )
          .join("\n")
      : `  <!-- 暂无已折叠结论，在讨论串点击「标为结论并折叠」后自动提炼注入 -->`

  return [header, issueSpec, conclusions, `</discussion_context>`].join("\n")
}

export function buildExecutionPromptFromIssue(issue: TaskboardIssue, extraInstruction?: string): string {
  const xml = buildDiscussionContextXml(issue, "bootstrap")
  const tail =
    extraInstruction?.trim() ||
    `请根据上述议题 (${issue.id}: ${issue.title}) 与已收敛的讨论结论开始实施代码修改，并在完成后运行相关验证。`
  return `${xml}\n\n${tail}`
}

export function buildIssueComposerDraft(issue: TaskboardIssue): string {
  const lines = [
    `[${issue.id}] ${issue.title}（优先级：${issue.priority}）`,
    ...(issue.description.trim() ? ["", "需求描述与验收标准：", issue.description.trim()] : []),
  ]
  return lines.join("\n")
}

export function unbindSessionFromIssue(
  state: TaskboardState,
  issueId: string,
  sessionId: string,
): TaskboardState {
  const now = Date.now()
  return {
    ...state,
    issues: state.issues.map((issue) => {
      if (issue.id !== issueId) return issue
      const remaining = issue.boundSessionIds.filter((id) => id !== sessionId)
      return {
        ...issue,
        executionSessionId:
          issue.executionSessionId === sessionId ? remaining[0] : issue.executionSessionId,
        discussionSessionId:
          issue.discussionSessionId === sessionId ? undefined : issue.discussionSessionId,
        boundSessionIds: remaining,
        updatedAt: now,
      }
    }),
  }
}

export function bindSessionToIssue(
  state: TaskboardState,
  issueId: string,
  binding: {
    kind: "discussion" | "execution"
    sessionId: string
    serverKey?: string
    directory?: string
    worktree?: string
  },
): TaskboardState {
  const now = Date.now()
  return {
    ...state,
    issues: state.issues.map((issue) => {
      if (issue.id !== issueId) return issue
      const boundSet = new Set(issue.boundSessionIds)
      boundSet.add(binding.sessionId)
      return {
        ...issue,
        discussionSessionId: binding.kind === "discussion" ? binding.sessionId : issue.discussionSessionId,
        executionSessionId: binding.kind === "execution" ? binding.sessionId : issue.executionSessionId,
        boundSessionIds: [...boundSet],
        serverKey: binding.serverKey ?? issue.serverKey,
        directory: binding.directory ?? issue.directory,
        worktree: binding.worktree ?? issue.worktree,
        updatedAt: now,
      }
    }),
  }
}

export function findIssueBySessionId(
  state: TaskboardState,
  sessionId: string | undefined,
): { issue: TaskboardIssue; role: "discussion" | "execution" | "bound" } | undefined {
  if (!sessionId) return undefined
  for (const issue of state.issues) {
    if (issue.executionSessionId === sessionId) {
      return { issue, role: "execution" }
    }
    if (issue.discussionSessionId === sessionId) {
      return { issue, role: "discussion" }
    }
    if (issue.boundSessionIds.includes(sessionId)) {
      return { issue, role: "bound" }
    }
  }
  return undefined
}

export function addCustomAgentProfile(
  state: TaskboardState,
  profile: CustomAgentProfile,
): TaskboardState {
  const cleanId = profile.id.trim().replace(/^@/, "").toLowerCase()
  if (!cleanId) return state
  const filtered = state.customAgents.filter((a) => a.id !== cleanId)
  return {
    ...state,
    targetAgent: cleanId,
    customAgents: [
      ...filtered,
      {
        ...profile,
        id: cleanId,
        name: profile.name.startsWith("@") ? profile.name : `@${cleanId} · ${profile.name}`,
      },
    ],
  }
}

export function parseLeadingAgentMention(
  text: string,
  availableAgentIds: ReadonlyArray<string>,
): { agent: string | undefined; cleanText: string } {
  const trimmed = text.trim()
  const match = trimmed.match(/^@([a-zA-Z0-9_-]+)\s*([\s\S]*)$/)
  if (!match) return { agent: undefined, cleanText: trimmed }
  const candidate = match[1]!.toLowerCase()
  const found = availableAgentIds.find((id) => id.toLowerCase() === candidate)
  if (!found) return { agent: undefined, cleanText: trimmed }
  return {
    agent: found,
    cleanText: (match[2] ?? "").trim(),
  }
}

export function buildSimulatedAgentReply(
  agent: string,
  issueTitle: string,
  question: string,
  delivery: "queue" | "steer",
): string {
  const normalized = agent.toLowerCase()
  if (normalized === "plan") {
    return `【@plan 架构拆解 · delivery=${delivery}】\n针对「${issueTitle}」与当前问题：\n1. 模块接缝：将纯状态变换与 <discussion_context> 协议收敛在 model.ts，UI 与运行时联动通过 Controller 适配。\n2. 实施建议：确认无误后可点击本串右上角「📌 标为结论并折叠」，自动提取结论注入右侧绑定执行会话。`
  }
  if (normalized === "reviewer" || normalized === "gpt-sol") {
    return `【@${agent} 对抗冷审 · delivery=${delivery}】\n1. 必要性与破坏面核查：改动不破坏现有 SessionSidebar 单屏与 SplitWorkbench 三分屏行为，默认会话流零侵入。\n2. 风险提示：仅将已标记「✅ 标为结论」的条目注入 <discussion_context>，防止未定稿的讨论噪音污染编码上下文。`
  }
  if (normalized === "build" || normalized === "coder") {
    return `【@${agent} 编码实施评估 · delivery=${delivery}】\n已读取议题「${issueTitle}」及讨论室收敛结论。点击右上角「⚡ 绑定并打开执行会话」或「🪟 双屏联动」，即可在右侧真实 OpenCode 会话中直接改码并跑测试。`
  }
  return `【@${agent} 协同响应 · delivery=${delivery}】\n已针对「${question.slice(0, 60)}」完成分析，可随时将本条标记为结论并同步给绑定执行会话。`
}

function escapeXmlAttr(raw: string): string {
  return raw.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
