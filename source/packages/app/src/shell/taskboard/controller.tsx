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
  buildIssueComposerDraft,
  buildSimulatedAgentReply,
  createDefaultTaskboardState,
  createIssue as createIssueModel,
  deleteIssue as deleteIssueModel,
  findIssueBySessionId as findIssueBySessionIdModel,
  parseLeadingAgentMention,
  toggleThreadResolved as toggleThreadResolvedModel,
  unbindSessionFromIssue as unbindSessionFromIssueModel,
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

export type BoundSessionSummary = {
  id: string
  title: string
  directory: string
}

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
  recentSessions: Accessor<ReadonlyArray<BoundSessionSummary>>
  getSessionTitle: (sessionId: string) => string
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
    options?: { openDiscussionImmediately?: boolean; bindActiveSession?: boolean },
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
    options?: {
      forceNewSession?: boolean
      createNewWorktree?: boolean
      sendContextPrompt?: boolean
      openInSplitPane?: boolean
    },
  ) => Promise<string | undefined>
  openBoundSession: (
    issueId: string,
    sessionId?: string,
    options?: { inSplitPane?: boolean; fillComposer?: boolean },
  ) => Promise<string | undefined>
  fillIssueToSessionComposer: (issueId: string, sessionId?: string) => Promise<boolean>
  injectConclusionsToExecutionSession: (issueId?: string) => Promise<boolean>
  syncExecutionProgressToIssue: (issueId?: string, nextStatus?: TaskboardColumnId) => Promise<void>
  bindActiveSessionToIssue: (issueId: string) => boolean
  bindExistingSessionToIssue: (
    issueId: string,
    sessionId: string,
    kind?: "discussion" | "execution",
    serverKey?: string,
    directory?: string,
  ) => void
  unbindSessionFromIssue: (issueId: string, sessionId: string) => void
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
    Persist.global("taskboard.kanban.v1"),
    TaskboardPersistedSchema,
    createDefaultTaskboardState(),
  )

  const [busySessionCreation, setBusySessionCreation] = createSignal(false)

  const state = createMemo<TaskboardState>(() => ({
    enabled: Boolean(persistedState.enabled),
    viewMode: persistedState.viewMode === "board" ? "board" : "sessions",
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
      setPersistedState("viewMode", next.viewMode === "board" ? "board" : "sessions")
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

  const recentSessions = createMemo<ReadonlyArray<BoundSessionSummary>>(() => {
    try {
      const { conn } = resolveActiveServerAndDirectory()
      if (!conn) return []
      const ctx = global.ensureServerCtx(conn)
      return ctx.data.session
        .list()
        .filter((item) => !item.parentID)
        .slice(0, 30)
        .map((item) => ({
          id: item.id,
          title: item.title?.trim() || item.id,
          directory: item.location.directory,
        }))
    } catch {
      return []
    }
  })

  const getSessionTitle = (sessionId: string): string => {
    try {
      const { conn } = resolveActiveServerAndDirectory()
      if (!conn) return sessionId
      const ctx = global.ensureServerCtx(conn)
      const found = ctx.data.session.get(sessionId)
      return found?.title?.trim() || sessionId
    } catch {
      return sessionId
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
    options?: { onlyIfEmpty?: boolean; inSplitPane?: boolean },
  ) => {
    const { conn } = resolveActiveServerAndDirectory()
    const targetConn =
      global.servers.list().find((item) => ServerConnection.key(item) === serverKey) ?? conn
    const ctx = targetConn ? global.ensureServerCtx(targetConn) : undefined
    const resolvedDir =
      directory ||
      ctx?.data.session.get(sessionId)?.location.directory ||
      ctx?.projects.last() ||
      ctx?.projects.list()[0]?.worktree ||
      ""

    if (options?.inSplitPane && split) {
      split.openSessionInSplit({
        server: serverKey,
        sessionId,
        directory: resolvedDir,
      })
    } else {
      const tab = tabs.addSessionTab({ server: serverKey, sessionId })
      tabs.select(tab)
    }

    if (!targetConn || !resolvedDir || !ctx) return
    const tab = tabs.addSessionTab({ server: serverKey, sessionId })
    const composerState = createTabComposerState(tabs, tab, ctx.sdk.scope, {
      dir: base64Encode(resolvedDir),
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
      title: next ? "✅ 已开启项目 Issue 看板" : "已关闭项目 Issue 看板",
      description: next
        ? "可通过看板右上角「隐藏看板」或快捷键 ⌘⇧K 随时切换"
        : "已隐藏侧栏看板入口，按 ⌘⇧K 可重新开启",
    })
  }

  const setViewMode = (mode: TaskboardViewMode) => {
    setPersistedState("viewMode", mode === "board" ? "board" : "sessions")
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
      setViewMode("board")
    })
  }

  const openSplit = (issueId?: string) => {
    if (issueId) setActiveIssueId(issueId)
    void spawnOrOpenExecutionSession(issueId, { sendContextPrompt: false })
  }

  const openSessions = () => {
    setViewMode("sessions")
  }

  command.register("taskboard", () => [
    {
      id: "taskboard.toggleBoard",
      title: state().viewMode === "board" ? "返回会话工作区" : "打开项目 Issue 看板",
      category: "View",
      keybind: "mod+shift+k",
      onSelect: () => {
        if (!state().enabled) {
          setEnabled(true)
          openBoard()
          return
        }
        if (state().viewMode === "board") {
          openSessions()
        } else {
          openBoard()
        }
      },
    },
    {
      id: "taskboard.toggleEnabled",
      title: state().enabled ? "隐藏项目 Issue 看板入口" : "显示项目 Issue 看板入口",
      category: "View",
      onSelect: () => toggleEnabled(),
    },
  ])

  const createIssue: TaskboardContextValue["createIssue"] = (input, options) => {
    let next = createIssueModel(state(), {
      ...input,
      seedDiscussion: false,
    })
    const created = next.issues[0]
    if (created && options?.bindActiveSession) {
      const route = layout.route()
      if (route.type === "session") {
        const { directory } = resolveActiveServerAndDirectory()
        next = bindSessionToIssue(next, created.id, {
          kind: "execution",
          sessionId: route.sessionId,
          serverKey: route.server,
          directory,
        })
      }
    }
    commitState({
      ...next,
      viewMode: "board",
    })
    if (created) {
      showToast({
        title: `已创建议题 ${created.id}`,
        description: created.title,
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
    commitState(toggleThreadResolvedModel(state(), issueId, threadId, customConclusion))
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
  }

  const openBoundSession: TaskboardContextValue["openBoundSession"] = async (
    issueId,
    sessionId,
    options,
  ) => {
    const issue = state().issues.find((i) => i.id === issueId)
    if (!issue) return undefined
    const targetSessionId = sessionId ?? issue.executionSessionId ?? issue.boundSessionIds[0]
    if (!targetSessionId) return undefined

    setActiveIssueId(issue.id)
    setViewMode("sessions")

    const { serverKey, directory } = resolveActiveServerAndDirectory()
    const srv = issue.serverKey ? ServerConnection.Key.make(issue.serverKey) : serverKey
    const targetDir = issue.directory || directory

    if (options?.fillComposer) {
      await fillExecutionSessionComposer(
        srv,
        targetDir,
        targetSessionId,
        buildIssueComposerDraft(issue),
        { inSplitPane: options.inSplitPane },
      )
      showToast({
        title: `📝 已打开关联会话并填入 ${issue.id} 需求`,
        description: "草稿已填入底部输入框，请确认后手动点击发送",
      })
    } else if (options?.inSplitPane && split) {
      split.openSessionInSplit({
        server: srv,
        sessionId: targetSessionId,
        directory: targetDir,
      })
    } else {
      const tab = tabs.addSessionTab({ server: srv, sessionId: targetSessionId })
      tabs.select(tab)
    }

    return targetSessionId
  }

  const fillIssueToSessionComposer: TaskboardContextValue["fillIssueToSessionComposer"] = async (
    issueId,
    sessionId,
  ) => {
    const issue = state().issues.find((i) => i.id === issueId)
    if (!issue) return false
    const route = layout.route()
    const targetSessionId =
      sessionId ??
      (route.type === "session" ? route.sessionId : undefined) ??
      issue.executionSessionId ??
      issue.boundSessionIds[0]
    if (!targetSessionId) return false

    const { serverKey, directory } = resolveActiveServerAndDirectory()
    const srv = issue.serverKey ? ServerConnection.Key.make(issue.serverKey) : serverKey
    await fillExecutionSessionComposer(
      srv,
      issue.directory || directory,
      targetSessionId,
      buildIssueComposerDraft(issue),
    )
    showToast({
      title: `📝 已将 ${issue.id} 需求填入输入框`,
      description: "不会自动发送，请按需补充或 @子Agent 后手动发送",
    })
    return true
  }

  const spawnOrOpenExecutionSession: TaskboardContextValue["spawnOrOpenExecutionSession"] = async (
    issueId,
    options,
  ) => {
    const targetId = issueId ?? state().activeIssueId
    const issue = state().issues.find((i) => i.id === targetId) ?? activeIssue()
    if (!issue) return undefined

    setActiveIssueId(issue.id)

    const existingSessionId = issue.executionSessionId ?? issue.boundSessionIds[0]
    if (existingSessionId && !options?.forceNewSession) {
      return openBoundSession(issue.id, existingSessionId, {
        inSplitPane: options?.openInSplitPane,
        fillComposer: Boolean(options?.sendContextPrompt),
      })
    }

    const { conn, serverKey, directory } = resolveActiveServerAndDirectory()
    if (!conn) return undefined

    const ctx = global.ensureServerCtx(conn)
    const baseDir = issue.directory || directory || ctx.projects.last() || ctx.projects.list()[0]?.worktree || ""

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

      if (!targetDir) return undefined

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
        viewMode: "sessions",
      })

      await fillExecutionSessionComposer(
        serverKey,
        targetDir,
        created.id,
        buildIssueComposerDraft(issue),
        { inSplitPane: options?.openInSplitPane },
      )

      showToast({
        title: `⚡ 已为 ${issue.id} 创建绑定会话`,
        description: "需求描述已填入会话输入框（不会自动发送），请确认后手动发送",
      })

      return created.id
    } catch (err) {
      showToast({
        title: "创建绑定会话失败",
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
    return fillIssueToSessionComposer(targetId)
  }

  const syncExecutionProgressToIssue: TaskboardContextValue["syncExecutionProgressToIssue"] = async (
    issueId,
    nextStatus = "review",
  ) => {
    const targetId = issueId ?? state().activeIssueId
    const issue = state().issues.find((i) => i.id === targetId) ?? activeIssue()
    if (!issue) return

    commitState(updateIssueStatusModel(state(), issue.id, nextStatus))

    showToast({
      title: `📤 已更新 ${issue.id} 看板状态`,
      description: `当前状态已设为「${
        nextStatus === "done"
          ? "已完成"
          : nextStatus === "review"
            ? "待验收"
            : nextStatus === "in_progress"
              ? "进行中"
              : nextStatus === "todo"
                ? "待开始"
                : "待规划"
      }」`,
    })
  }

  const bindActiveSessionToIssue: TaskboardContextValue["bindActiveSessionToIssue"] = (issueId) => {
    const route = layout.route()
    if (route.type !== "session") {
      showToast({
        title: "当前未打开活跃会话",
        description: "请先在左侧选择一个会话，或直接点击「+ 新建绑定会话」",
      })
      return false
    }
    const { directory } = resolveActiveServerAndDirectory()
    commitState(
      bindSessionToIssue(state(), issueId, {
        kind: "execution",
        sessionId: route.sessionId,
        serverKey: route.server,
        directory,
      }),
    )
    showToast({
      title: `🔗 已将当前会话绑定到 ${issueId}`,
      description: getSessionTitle(route.sessionId),
    })
    return true
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
      description: getSessionTitle(sessionId),
    })
  }

  const unbindSessionFromIssue: TaskboardContextValue["unbindSessionFromIssue"] = (issueId, sessionId) => {
    commitState(unbindSessionFromIssueModel(state(), issueId, sessionId))
    showToast({
      title: `已解除 ${issueId} 与会话的绑定`,
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
    recentSessions,
    getSessionTitle,
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
    openBoundSession,
    fillIssueToSessionComposer,
    injectConclusionsToExecutionSession,
    syncExecutionProgressToIssue,
    bindActiveSessionToIssue,
    bindExistingSessionToIssue,
    unbindSessionFromIssue,
    findIssueBySessionId,
  }

  return <TaskboardContext.Provider value={value}>{props.children}</TaskboardContext.Provider>
}
