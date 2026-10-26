import {
  type Accessor,
  type ParentProps,
  batch,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  useContext,
} from "solid-js"
import { base64Encode } from "@opencode/util/encode"
import { createTabComposerState } from "@/composer/persistence"
import { Persist, persisted } from "@/runtime/persistence/storage"
import { normalizeAgentList } from "@/runtime/server/global-sync/utils"
import { ServerConnection } from "@/runtime/server/registry"
import { useGlobal } from "@/runtime/server/runtime"
import { useCommand } from "@/shell/commands/command"
import { showToast } from "@/shell/notifications/toast"
import { useOptionalSplitView } from "@/shell/split-view/context"
import { useLayout } from "@/shell/state/layout"
import { useTabs } from "@/shell/tabs/tabs"
import { createWorktree } from "@/workspaces/create"
import {
  BUILTIN_TASKBOARD_AGENTS,
  TaskboardPersistedSchema,
  addCustomAgentProfile,
  appendDiscussionThread,
  bindSessionToIssue,
  buildDiscussionContextXml,
  buildExecutionPromptFromIssue,
  buildSimulatedAgentReply,
  createDefaultTaskboardState,
  createIssue as createIssueModel,
  deleteIssue as deleteIssueModel,
  findIssueBySessionId as findIssueBySessionIdModel,
  parseLeadingAgentMention,
  toggleThreadResolved as toggleThreadResolvedModel,
  updateIssueDetails as updateIssueDetailsModel,
  updateIssueStatus as updateIssueStatusModel,
  updateThreadConclusion as updateThreadConclusionModel,
  type CustomAgentProfile,
  type TaskboardAgentProfile,
  type TaskboardColumnId,
  type TaskboardIssue,
  type TaskboardPriority,
  type TaskboardState,
  type TaskboardViewMode,
} from "./model"

export type TaskboardContextValue = {
  ready: Accessor<boolean>
  state: Accessor<TaskboardState>
  enabled: Accessor<boolean>
  setEnabled: (enabled: boolean) => void
  toggleEnabled: () => void
  viewMode: Accessor<TaskboardViewMode>
  setViewMode: (mode: TaskboardViewMode) => void
  activeIssueId: Accessor<string>
  activeIssue: Accessor<TaskboardIssue | undefined>
  setActiveIssueId: (id: string) => void
  targetAgent: Accessor<string>
  setTargetAgent: (agent: string) => void
  deliveryMode: Accessor<"queue" | "steer">
  setDeliveryMode: (mode: "queue" | "steer") => void
  filterAgent: Accessor<string>
  setFilterAgent: (agent: string) => void
  splitRatio: Accessor<number>
  setSplitRatio: (ratio: number) => void
  busySessionCreation: Accessor<boolean>
  availableAgents: Accessor<ReadonlyArray<TaskboardAgentProfile>>
  openBoard: () => void
  openDiscussion: (issueId?: string) => void
  openSplit: (issueId?: string) => void
  openSessions: () => void
  createIssue: (
    input: {
      title: string
      description?: string
      status?: TaskboardColumnId
      priority?: TaskboardPriority
      assigneeAgent?: string
      worktree?: string
    },
    options?: { openDiscussionImmediately?: boolean },
  ) => TaskboardIssue | undefined
  updateIssueStatus: (issueId: string, status: TaskboardColumnId) => void
  updateIssueDetails: (
    issueId: string,
    patch: Partial<
      Pick<TaskboardIssue, "title" | "description" | "priority" | "assigneeAgent" | "worktree" | "status">
    >,
  ) => void
  deleteIssue: (issueId: string) => void
  sendDiscussionMessage: (rawText: string, options?: { dispatchToServer?: boolean }) => Promise<void>
  toggleThreadResolved: (issueId: string, threadId: string, customConclusion?: string) => void
  updateThreadConclusion: (issueId: string, threadId: string, conclusion: string) => void
  addCustomAgent: (profile: CustomAgentProfile) => void
  spawnOrOpenExecutionSession: (
    issueId?: string,
    options?: { forceNewSession?: boolean; createNewWorktree?: boolean; sendContextPrompt?: boolean },
  ) => Promise<string | undefined>
  injectConclusionsToExecutionSession: (issueId?: string) => Promise<boolean>
  syncExecutionProgressToIssue: (issueId?: string, nextStatus?: TaskboardColumnId) => Promise<void>
  bindExistingSessionToIssue: (
    issueId: string,
    sessionId: string,
    kind?: "discussion" | "execution",
    serverKey?: string,
    directory?: string,
  ) => void
  findIssueBySessionId: (
    sessionId: string | undefined,
  ) => { issue: TaskboardIssue; role: "discussion" | "execution" | "bound" } | undefined
}

const TaskboardContext = createContext<TaskboardContextValue>()

export function useTaskboard() {
  const ctx = useContext(TaskboardContext)
  if (!ctx) throw new Error("useTaskboard must be used within a TaskboardProvider")
  return ctx
}

export function useOptionalTaskboard() {
  return useContext(TaskboardContext)
}

export function TaskboardProvider(props: ParentProps) {
  const global = useGlobal()
  const layout = useLayout()
  const tabs = useTabs()
  const command = useCommand()
  const split = useOptionalSplitView()

  const [persistedState, setPersistedState, , ready] = persisted(
    Persist.global("taskboard.v2"),
    TaskboardPersistedSchema,
    createDefaultTaskboardState(),
  )

  const [busySessionCreation, setBusySessionCreation] = createSignal(false)

  const state = createMemo<TaskboardState>(() => ({
    enabled: Boolean(persistedState.enabled),
    viewMode: persistedState.viewMode,
    activeIssueId: persistedState.activeIssueId,
    targetAgent: persistedState.targetAgent,
    deliveryMode: persistedState.deliveryMode,
    filterAgent: persistedState.filterAgent,
    splitRatio: Math.min(0.7, Math.max(0.28, persistedState.splitRatio || 0.46)),
    issues: [...persistedState.issues],
    customAgents: [...persistedState.customAgents],
  }))

  const commitState = (next: TaskboardState) => {
    batch(() => {
      setPersistedState("enabled", next.enabled)
      setPersistedState("viewMode", next.viewMode)
      setPersistedState("activeIssueId", next.activeIssueId)
      setPersistedState("targetAgent", next.targetAgent)
      setPersistedState("deliveryMode", next.deliveryMode)
      setPersistedState("filterAgent", next.filterAgent)
      setPersistedState("splitRatio", next.splitRatio)
      setPersistedState("issues", next.issues)
      setPersistedState("customAgents", next.customAgents)
    })
  }

  const resolveActiveServerAndDirectory = (): {
    conn: ServerConnection.Any | undefined
    serverKey: ServerConnection.Key
    directory: string
  } => {
    const route = layout.route()
    if (route.type === "session") {
      const conn = global.servers.list().find((item) => ServerConnection.key(item) === route.server)
      const ctx = conn ? global.ensureServerCtx(conn) : undefined
      const dir =
        ctx?.data.session.get(route.sessionId)?.location.directory ??
        ctx?.projects.last() ??
        ctx?.projects.list()[0]?.worktree ??
        ""
      return { conn, serverKey: route.server, directory: dir }
    }

    const selection = layout.home.selection()
    const conn =
      global.servers.list().find((item) => ServerConnection.key(item) === selection.server) ??
      global.servers.list().find((item) => ServerConnection.builtin(item)) ??
      global.servers.list()[0]
    const serverKey = conn ? ServerConnection.key(conn) : ServerConnection.Key.make("local")
    const projects = conn ? global.ensureServerCtx(conn).projects : undefined
    const project =
      projects?.list().find((item) => item.worktree === selection.directory) ??
      projects?.list().find((item) => item.worktree === projects.last()) ??
      projects?.list()[0]
    return {
      conn,
      serverKey,
      directory: project?.worktree ?? selection.directory ?? "",
    }
  }

  const availableAgents = createMemo<ReadonlyArray<TaskboardAgentProfile>>(() => {
    const byId = new Map<string, TaskboardAgentProfile>()
    for (const builtin of BUILTIN_TASKBOARD_AGENTS) {
      byId.set(builtin.id.toLowerCase(), builtin)
    }

    try {
      const { conn, directory } = resolveActiveServerAndDirectory()
      if (conn && directory) {
        const ctx = global.ensureServerCtx(conn)
        const serverAgents = normalizeAgentList(ctx.data.location.agent.list({ directory }) ?? [])
        for (const item of serverAgents) {
          if (item.hidden) continue
          const canonicalId =
            item.name.toLowerCase() === "plan"
              ? "plan"
              : item.name.toLowerCase() === "build"
                ? "build"
                : item.name
          const key = canonicalId.toLowerCase()
          const existing = byId.get(key)
          byId.set(key, {
            id: canonicalId,
            name: existing?.name ?? `@${canonicalId}`,
            roleLabel: existing?.roleLabel ?? (item.mode === "primary" ? "主会话 Agent" : "子 Agent"),
            description: item.description ?? existing?.description ?? "OpenCode 已配置 Agent",
            mode: item.mode === "primary" ? "primary" : "subagent",
            badgeClass: existing?.badgeClass ?? "bg-sky-500/15 text-sky-300 border-sky-500/35",
          })
        }
      }
    } catch {}

    for (const custom of state().customAgents) {
      const canonicalId = custom.id.trim().replace(/^@/, "").toLowerCase()
      byId.set(canonicalId, {
        id: canonicalId,
        name: custom.name,
        roleLabel: custom.roleLabel,
        description: custom.description,
        mode: custom.mode,
        badgeClass: "bg-rose-500/15 text-rose-300 border-rose-500/35",
      })
    }

    return [...byId.values()]
  })

  const resolveCanonicalAgentId = (raw: string | undefined): string => {
    const trimmed = (raw ?? "").trim().replace(/^@/, "")
    if (!trimmed) return "plan"
    const matched = availableAgents().find((a) => a.id.toLowerCase() === trimmed.toLowerCase())
    if (matched) return matched.id
    return trimmed.toLowerCase()
  }

  createEffect(() => {
    if (!ready()) return
    const curTarget = persistedState.targetAgent
    const normalizedTarget = resolveCanonicalAgentId(curTarget)
    if (curTarget !== normalizedTarget) {
      setPersistedState("targetAgent", normalizedTarget)
    }
    const needsIssueFix = persistedState.issues.some(
      (item) => item.assigneeAgent !== resolveCanonicalAgentId(item.assigneeAgent),
    )
    if (needsIssueFix) {
      setPersistedState(
        "issues",
        persistedState.issues.map((item) => ({
          ...item,
          assigneeAgent: resolveCanonicalAgentId(item.assigneeAgent),
        })),
      )
    }
  })

  const fillExecutionSessionComposer = async (
    serverKey: ServerConnection.Key,
    directory: string,
    sessionId: string,
    text: string,
    options?: { onlyIfEmpty?: boolean },
  ) => {
    const tab = tabs.addSessionTab({ server: serverKey, sessionId })
    tabs.select(tab)
    if (split && split.count() > 1) {
      split.setLayoutCount(1)
    }
    const { conn } = resolveActiveServerAndDirectory()
    const targetConn =
      global.servers.list().find((item) => ServerConnection.key(item) === serverKey) ?? conn
    if (!targetConn || !directory) return
    const ctx = global.ensureServerCtx(targetConn)
    const composerState = createTabComposerState(tabs, tab, ctx.sdk.scope, {
      dir: base64Encode(directory),
      id: sessionId,
    })
    await composerState.ready.promise
    if (options?.onlyIfEmpty) {
      const existingText = composerState
        .current()
        .map((part) => ("content" in part ? part.content : ""))
        .join("")
        .trim()
      if (existingText.length > 0) return
    }
    composerState.set(
      [{ type: "text", content: text, start: 0, end: text.length }],
      text.length,
    )
  }

  const activeIssue = createMemo<TaskboardIssue | undefined>(() => {
    const current = state()
    return current.issues.find((i) => i.id === current.activeIssueId) ?? current.issues[0]
  })

  const setEnabled = (enabled: boolean) => {
    batch(() => {
      setPersistedState("enabled", enabled)
      if (!enabled) {
        setPersistedState("viewMode", "sessions")
      }
    })
  }

  const toggleEnabled = () => {
    const next = !state().enabled
    batch(() => {
      setPersistedState("enabled", next)
      setPersistedState("viewMode", next ? "board" : "sessions")
    })
    showToast({
      title: next ? "✅ 已开启项目 Issue 看板与讨论模块" : "已关闭项目 Issue 看板与讨论模块",
      description: next
        ? "可通过看板右上角「停用模块」或快捷键 ⌘⇧K 随时关闭"
        : "默认不再注入侧栏与主工作区，按 ⌘⇧K 可随时开启",
    })
  }

  const setViewMode = (mode: TaskboardViewMode) => {
    setPersistedState("viewMode", mode)
  }

  const setActiveIssueId = (id: string) => {
    setPersistedState("activeIssueId", id)
  }

  const setTargetAgent = (agent: string) => {
    setPersistedState("targetAgent", resolveCanonicalAgentId(agent))
  }

  const setDeliveryMode = (mode: "queue" | "steer") => {
    setPersistedState("deliveryMode", mode)
  }

  const setFilterAgent = (agent: string) => {
    setPersistedState("filterAgent", agent)
  }

  const setSplitRatio = (ratio: number) => {
    setPersistedState("splitRatio", Math.min(0.7, Math.max(0.28, ratio)))
  }

  const openBoard = () => {
    setViewMode("board")
  }

  const openDiscussion = (issueId?: string) => {
    batch(() => {
      if (issueId) setActiveIssueId(issueId)
      setViewMode("discussion")
    })
  }

  const openSplit = (issueId?: string) => {
    batch(() => {
      if (issueId) setActiveIssueId(issueId)
      setViewMode("split")
    })
    const targetIssue = issueId ? state().issues.find((i) => i.id === issueId) : activeIssue()
    if (!targetIssue) return
    if (targetIssue.executionSessionId) {
      const { conn, serverKey, directory } = resolveActiveServerAndDirectory()
      const srv = targetIssue.serverKey ? ServerConnection.Key.make(targetIssue.serverKey) : serverKey
      const ctx = conn ? global.ensureServerCtx(conn) : undefined
      const targetDir =
        targetIssue.directory ||
        directory ||
        ctx?.projects.last() ||
        ctx?.projects.list()[0]?.worktree ||
        ""
      void fillExecutionSessionComposer(
        srv,
        targetDir,
        targetIssue.executionSessionId,
        buildExecutionPromptFromIssue(targetIssue),
        { onlyIfEmpty: true },
      )
    } else {
      void spawnOrOpenExecutionSession(targetIssue.id, { sendContextPrompt: true })
    }
  }

  const openSessions = () => {
    setViewMode("sessions")
  }

  command.register("taskboard", () => [
    {
      id: "taskboard.toggleEnabled",
      title: state().enabled ? "关闭并隐藏项目 Issue 看板模块" : "开启项目 Issue 看板模块 (实验性)",
      category: "View",
      keybind: "mod+shift+k",
      onSelect: () => toggleEnabled(),
    },
    {
      id: "taskboard.openBoard",
      title: "打开项目 Issue 看板",
      category: "View",
      onSelect: () => {
        setEnabled(true)
        openBoard()
      },
    },
    {
      id: "taskboard.openDiscussion",
      title: "打开 @多Agent 需求讨论室",
      category: "View",
      keybind: "mod+shift+d",
      onSelect: () => {
        setEnabled(true)
        openDiscussion()
      },
    },
    {
      id: "taskboard.openSplit",
      title: "切换左讨论 + 右执行双屏联动",
      category: "View",
      keybind: "mod+shift+l",
      onSelect: () => {
        if (!state().enabled) {
          setEnabled(true)
          openSplit()
          return
        }
        if (state().viewMode === "split") {
          openSessions()
        } else {
          openSplit()
        }
      },
    },
  ])

  const createIssue: TaskboardContextValue["createIssue"] = (input, options) => {
    const next = createIssueModel(state(), {
      ...input,
      seedDiscussion: true,
    })
    commitState({
      ...next,
      viewMode: options?.openDiscussionImmediately ? "discussion" : "board",
    })
    const created = next.issues[0]
    if (created) {
      showToast({
        title: `已创建议题 ${created.id}`,
        description: options?.openDiscussionImmediately
          ? `已进入 ${created.id} 的 @多Agent 需求讨论室`
          : created.title,
      })
    }
    return created
  }

  const updateIssueStatus: TaskboardContextValue["updateIssueStatus"] = (issueId, status) => {
    commitState(updateIssueStatusModel(state(), issueId, status))
  }

  const updateIssueDetails: TaskboardContextValue["updateIssueDetails"] = (issueId, patch) => {
    commitState(updateIssueDetailsModel(state(), issueId, patch))
  }

  const deleteIssue: TaskboardContextValue["deleteIssue"] = (issueId) => {
    commitState(deleteIssueModel(state(), issueId))
    showToast({
      title: `已删除议题 ${issueId}`,
    })
  }

  const sendDiscussionMessage: TaskboardContextValue["sendDiscussionMessage"] = async (rawText) => {
    const issue = activeIssue()
    if (!issue) return
    const text = rawText.trim()
    if (!text) return

    const agentIds = availableAgents().map((a) => a.id)
    const parsed = parseLeadingAgentMention(text, agentIds)
    const chosenAgent = resolveCanonicalAgentId(parsed.agent ?? state().targetAgent ?? "plan")
    const delivery = state().deliveryMode
    const cleanBody = parsed.cleanText || text.replace(/^@[a-zA-Z0-9_-]+\s*/, "") || text
    const formattedQuestion = `@${chosenAgent} ${cleanBody}`

    const threadId = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const initialReply = buildSimulatedAgentReply(chosenAgent, issue.title, cleanBody, delivery)

    const withThread = appendDiscussionThread(state(), issue.id, {
      id: threadId,
      author: "老板 (Cocoyu)",
      targetAgent: chosenAgent,
      question: formattedQuestion,
      replyText: initialReply,
    })
    commitState({
      ...withThread,
      targetAgent: chosenAgent,
    })
  }

  const toggleThreadResolved: TaskboardContextValue["toggleThreadResolved"] = (
    issueId,
    threadId,
    customConclusion,
  ) => {
    const next = toggleThreadResolvedModel(state(), issueId, threadId, customConclusion)
    commitState(next)
    const updatedIssue = next.issues.find((i) => i.id === issueId)
    const updatedThread = updatedIssue?.discussionThreads.find((t) => t.id === threadId)
    showToast({
      title: updatedThread?.resolved ? "✅ 已标为结论并折叠" : "已展开完整讨论串",
      description: updatedThread?.resolved
        ? "该结论已加入 <discussion_context>，可一键注入右侧执行会话"
        : undefined,
    })
  }

  const updateThreadConclusion: TaskboardContextValue["updateThreadConclusion"] = (
    issueId,
    threadId,
    conclusion,
  ) => {
    commitState(updateThreadConclusionModel(state(), issueId, threadId, conclusion))
  }

  const addCustomAgent: TaskboardContextValue["addCustomAgent"] = (profile) => {
    commitState(addCustomAgentProfile(state(), profile))
    showToast({
      title: `已添加角色 @${profile.id.replace(/^@/, "")}`,
      description: profile.description,
    })
  }

  const spawnOrOpenExecutionSession: TaskboardContextValue["spawnOrOpenExecutionSession"] = async (
    issueId,
    options,
  ) => {
    const targetId = issueId ?? state().activeIssueId
    const issue = state().issues.find((i) => i.id === targetId) ?? activeIssue()
    if (!issue) return undefined

    setActiveIssueId(issue.id)

    const { conn, serverKey, directory } = resolveActiveServerAndDirectory()
    if (!conn) {
      setViewMode("split")
      return issue.executionSessionId
    }

    const ctx = global.ensureServerCtx(conn)
    const baseDir = issue.directory || directory || ctx.projects.last() || ctx.projects.list()[0]?.worktree || ""

    if (issue.executionSessionId && !options?.forceNewSession) {
      const srv = issue.serverKey ? ServerConnection.Key.make(issue.serverKey) : serverKey
      setViewMode("split")
      await fillExecutionSessionComposer(
        srv,
        baseDir,
        issue.executionSessionId,
        buildExecutionPromptFromIssue(issue),
        { onlyIfEmpty: !options?.sendContextPrompt },
      )
      if (options?.sendContextPrompt) {
        showToast({
          title: `📝 已将 ${issue.id} 上下文填入右侧输入框`,
          description: "请确认或补充后手动点击发送",
        })
      }
      return issue.executionSessionId
    }

    setBusySessionCreation(true)
    try {
      let targetDir = baseDir
      let worktreeLabel = issue.worktree

      if (options?.createNewWorktree && baseDir) {
        try {
          const branchName = `feat/${issue.id.toLowerCase()}`
          const createdDir = await createWorktree({
            api: ctx.sdk.api,
            data: ctx.data,
            directory: baseDir,
            branch: branchName,
          })
          targetDir = createdDir
          worktreeLabel = createdDir
        } catch {}
      }

      if (!targetDir) {
        setViewMode("split")
        return undefined
      }

      ctx.projects.open(targetDir)
      ctx.projects.touch(targetDir)

      const created = ctx.data.session.create({
        agent: "build",
        location: { directory: targetDir },
      })
      await created.request

      const sessionTitle = `[${issue.id}] ${issue.title}`
      await ctx.sdk.api.session
        .update({
          sessionID: created.id,
          title: sessionTitle,
        })
        .catch(() => undefined)

      const existingSession = ctx.data.session.get(created.id)
      if (existingSession) {
        ctx.data.session.remember({ ...existingSession, title: sessionTitle })
      }

      let nextState = bindSessionToIssue(state(), issue.id, {
        kind: "execution",
        sessionId: created.id,
        serverKey,
        directory: targetDir,
        worktree: worktreeLabel,
      })
      if (issue.status === "backlog" || issue.status === "todo") {
        nextState = updateIssueStatusModel(nextState, issue.id, "in_progress")
      }
      commitState({
        ...nextState,
        viewMode: "split",
      })

      const promptPayload = buildExecutionPromptFromIssue(issue)
      await fillExecutionSessionComposer(serverKey, targetDir, created.id, promptPayload)

      showToast({
        title: `⚡ 已为 ${issue.id} 绑定会话并填入输入框`,
        description: "上下文已填入右侧输入框，请确认后手动发送",
      })

      return created.id
    } catch (err) {
      setViewMode("split")
      showToast({
        title: "已切换到双屏联动视图",
        description: err instanceof Error ? err.message : undefined,
      })
      return undefined
    } finally {
      setBusySessionCreation(false)
    }
  }

  const injectConclusionsToExecutionSession: TaskboardContextValue["injectConclusionsToExecutionSession"] = async (
    issueId,
  ) => {
    const targetId = issueId ?? state().activeIssueId
    const issue = state().issues.find((i) => i.id === targetId) ?? activeIssue()
    if (!issue) return false

    if (!issue.executionSessionId) {
      const createdId = await spawnOrOpenExecutionSession(issue.id, { sendContextPrompt: true })
      return !!createdId
    }

    const { conn, serverKey, directory } = resolveActiveServerAndDirectory()
    if (!conn) return false
    const ctx = global.ensureServerCtx(conn)
    const srv = issue.serverKey ? ServerConnection.Key.make(issue.serverKey) : serverKey
    const targetDir =
      issue.directory || directory || ctx.projects.last() || ctx.projects.list()[0]?.worktree || ""
    const xml = buildDiscussionContextXml(issue, "delta")
    const draftText = `${xml}\n\n请基于以上最新收敛的讨论结论继续执行议题 ${issue.id}（${issue.title}）。`
    try {
      await fillExecutionSessionComposer(srv, targetDir, issue.executionSessionId, draftText)
      showToast({
        title: `📝 已将 ${issue.id} 最新结论填入右侧输入框`,
        description: `共填入 ${issue.discussionThreads.filter((t) => t.resolved).length} 条已折叠结论，请手动发送`,
      })
      return true
    } catch {
      return false
    }
  }

  const syncExecutionProgressToIssue: TaskboardContextValue["syncExecutionProgressToIssue"] = async (
    issueId,
    nextStatus = "review",
  ) => {
    const targetId = issueId ?? state().activeIssueId
    const issue = state().issues.find((i) => i.id === targetId) ?? activeIssue()
    if (!issue) return

    let next = updateIssueStatusModel(state(), issue.id, nextStatus)
    next = appendDiscussionThread(next, issue.id, {
      author: "系统回写 (Execution Sync)",
      targetAgent: "build",
      question: `@build 同步执行会话 (${issue.executionSessionId ?? issue.worktree}) 的实施进度到看板`,
      replyText: `已将执行会话最新改动同步回议题 ${issue.id}，看板状态更新为「${
        nextStatus === "done" ? "已完成" : "待验收"
      }」。`,
    })
    commitState(next)

    showToast({
      title: `📤 已回写 ${issue.id} 进度到项目看板`,
      description: `议题状态已推进至「${nextStatus === "done" ? "已完成" : "待验收"}」`,
    })
  }

  const bindExistingSessionToIssue: TaskboardContextValue["bindExistingSessionToIssue"] = (
    issueId,
    sessionId,
    kind = "execution",
    serverKey,
    directory,
  ) => {
    commitState(
      bindSessionToIssue(state(), issueId, {
        kind,
        sessionId,
        serverKey,
        directory,
      }),
    )
    showToast({
      title: `🔗 已将会话绑定到 ${issueId}`,
      description: kind === "execution" ? "已设为编码执行会话" : "已设为需求讨论会话",
    })
  }

  const findIssueBySessionId: TaskboardContextValue["findIssueBySessionId"] = (sessionId) =>
    findIssueBySessionIdModel(state(), sessionId)

  const value: TaskboardContextValue = {
    ready,
    state,
    enabled: () => state().enabled,
    setEnabled,
    toggleEnabled,
    viewMode: () => (state().enabled ? state().viewMode : "sessions"),
    setViewMode,
    activeIssueId: () => state().activeIssueId,
    activeIssue,
    setActiveIssueId,
    targetAgent: () => state().targetAgent,
    setTargetAgent,
    deliveryMode: () => state().deliveryMode,
    setDeliveryMode,
    filterAgent: () => state().filterAgent,
    setFilterAgent,
    splitRatio: () => state().splitRatio,
    setSplitRatio,
    busySessionCreation,
    availableAgents,
    openBoard,
    openDiscussion,
    openSplit,
    openSessions,
    createIssue,
    updateIssueStatus,
    updateIssueDetails,
    deleteIssue,
    sendDiscussionMessage,
    toggleThreadResolved,
    updateThreadConclusion,
    addCustomAgent,
    spawnOrOpenExecutionSession,
    injectConclusionsToExecutionSession,
    syncExecutionProgressToIssue,
    bindExistingSessionToIssue,
    findIssueBySessionId,
  }

  return <TaskboardContext.Provider value={value}>{props.children}</TaskboardContext.Provider>
}
