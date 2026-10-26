import { For, Show, createMemo, createSignal, type ParentProps } from "solid-js"
import { Icon } from "@opencode/ui/icon"
import { useLayout } from "@/shell/state/layout"
import { useOptionalTaskboard, useTaskboard } from "./controller"
import {
  TASKBOARD_COLUMNS,
  type TaskboardColumnId,
  type TaskboardIssue,
  type TaskboardPriority,
} from "./model"

export function TaskboardSidebarNav() {
  const taskboard = useOptionalTaskboard()
  const layout = useLayout()
  if (!taskboard) return null

  const activeSessionBinding = createMemo(() => {
    const r = layout.route()
    if (r.type !== "session") return undefined
    return taskboard.findIssueBySessionId(r.sessionId)
  })

  const inProgressCount = createMemo(
    () => taskboard.state().issues.filter((i) => i.status === "in_progress").length,
  )

  return (
    <Show when={taskboard.enabled()}>
      <div data-slot="taskboard-sidebar-nav" class="flex flex-col gap-1 pt-0.5 pb-1">
        <div class="flex items-center gap-1">
          <button
            type="button"
            data-action="sidebar-open-taskboard"
            aria-pressed={taskboard.viewMode() === "board"}
            onClick={() => {
              if (taskboard.viewMode() === "board") {
                taskboard.openSessions()
              } else {
                taskboard.openBoard()
              }
            }}
            class="flex h-7 min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border px-2.5 text-[12px] leading-4 transition-colors"
            classList={{
              "border-v2-background-bg-accent/55 bg-v2-background-bg-accent/15 text-v2-text-text-base [font-weight:560] shadow-2xs":
                taskboard.viewMode() === "board",
              "border-v2-border-border-base/60 bg-v2-background-bg-base/45 text-v2-text-text-muted hover:border-v2-border-border-strong hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base":
                taskboard.viewMode() !== "board",
            }}
          >
            <span class="flex min-w-0 items-center gap-1.5">
              <Icon name="checklist" size="small" class="shrink-0 text-v2-icon-icon-muted" />
              <span class="truncate">项目 Issue 看板</span>
            </span>
            <span class="flex shrink-0 items-center gap-1 font-mono text-[11px] leading-3 text-v2-text-text-faint">
              <Show when={activeSessionBinding()}>
                {(bound) => (
                  <span class="rounded bg-indigo-500/20 px-1 py-0.25 text-[10px] text-indigo-300">
                    {bound().issue.id}
                  </span>
                )}
              </Show>
              <span>
                {inProgressCount()}/{taskboard.state().issues.length}
              </span>
            </span>
          </button>
        </div>
      </div>
    </Show>
  )
}

export function TaskboardWorkbench(props: ParentProps) {
  const taskboard = useTaskboard()
  const layout = useLayout()

  const [drawerIssueId, setDrawerIssueId] = createSignal<string | null>(null)
  const [createModalOpen, setCreateModalOpen] = createSignal(false)
  const [createDefaultCol, setCreateDefaultCol] = createSignal<TaskboardColumnId>("backlog")
  const [draggedIssueId, setDraggedIssueId] = createSignal<string | null>(null)
  const [dragOverColumn, setDragOverColumn] = createSignal<TaskboardColumnId | null>(null)

  const activeSessionId = createMemo(() => {
    const r = layout.route()
    return r.type === "session" ? r.sessionId : undefined
  })

  const activeSessionBinding = createMemo(() => {
    const sid = activeSessionId()
    if (!sid) return undefined
    return taskboard.findIssueBySessionId(sid)
  })

  const drawerIssue = createMemo(() => {
    const id = drawerIssueId()
    if (!id) return undefined
    return taskboard.state().issues.find((i) => i.id === id)
  })

  const openCreateModal = (col: TaskboardColumnId = "backlog") => {
    setCreateDefaultCol(col)
    setCreateModalOpen(true)
  }

  return (
    <Show when={taskboard.enabled()} fallback={props.children}>
      <div
        data-slot="taskboard-workbench-host"
        data-view-mode={taskboard.viewMode()}
        class="relative flex size-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden [font-family:var(--v2-font-family-sans)]"
      >
        {/* Mode 0: Normal Sessions View (with bound Issue bar if active session is linked to an Issue) */}
        <Show when={taskboard.viewMode() !== "board"}>
          <Show when={activeSessionBinding()}>
            {(binding) => (
              <div
                data-slot="taskboard-bound-session-banner"
                class="mx-[var(--shell-inline-inset,8px)] mt-[var(--shell-top-inset,8px)] flex h-8 shrink-0 items-center justify-between gap-2 rounded-lg border border-v2-border-border-base/80 bg-v2-background-bg-layer-02/80 px-3 text-[12px] leading-4"
              >
                <div class="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      taskboard.setActiveIssueId(binding().issue.id)
                      setDrawerIssueId(binding().issue.id)
                    }}
                    class="rounded bg-indigo-500/20 px-1.5 py-0.5 font-mono text-[11px] [font-weight:600] text-indigo-300 ring-1 ring-inset ring-indigo-500/35 hover:bg-indigo-500/30"
                    title="点击查看或编辑该 Issue 详情与绑定会话"
                  >
                    {binding().issue.id}
                  </button>
                  <span class="truncate text-v2-text-text-base [font-weight:520]">
                    {binding().issue.title}
                  </span>
                  <select
                    aria-label="更新绑定 Issue 状态"
                    value={binding().issue.status}
                    onChange={(e) =>
                      taskboard.updateIssueStatus(
                        binding().issue.id,
                        e.currentTarget.value as TaskboardColumnId,
                      )
                    }
                    class="h-6 shrink-0 rounded border border-v2-border-border-base/80 bg-v2-background-bg-base px-1.5 text-[11px] text-v2-text-text-base focus:outline-none"
                  >
                    <For each={TASKBOARD_COLUMNS}>
                      {(col) => <option value={col.id}>{col.title}</option>}
                    </For>
                  </select>
                </div>

                <div class="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    data-action="banner-fill-issue-draft"
                    onClick={() =>
                      void taskboard.fillIssueToSessionComposer(binding().issue.id, activeSessionId())
                    }
                    class="rounded-md border border-v2-border-border-base/80 bg-v2-background-bg-base px-2 py-1 text-[11px] text-v2-text-text-base transition-colors hover:bg-v2-overlay-simple-overlay-hover"
                    title="将当前 Issue 标题与需求描述填入底部输入框（不会自动发送）"
                  >
                    📝 填入需求到输入框
                  </button>
                  <Show when={activeSessionId()}>
                    {(sid) => (
                      <button
                        type="button"
                        data-action="banner-unbind-session"
                        onClick={() => taskboard.unbindSessionFromIssue(binding().issue.id, sid())}
                        class="rounded-md border border-v2-border-border-base/80 bg-v2-background-bg-base px-2 py-1 text-[11px] text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
                        title="解除当前会话与该 Issue 的绑定"
                      >
                        解绑
                      </button>
                    )}
                  </Show>
                  <button
                    type="button"
                    data-action="banner-open-board"
                    onClick={() => taskboard.openBoard()}
                    class="rounded-md bg-v2-background-bg-accent/20 px-2 py-1 text-[11px] [font-weight:540] text-v2-text-text-base ring-1 ring-inset ring-v2-background-bg-accent/40 hover:bg-v2-background-bg-accent/30"
                  >
                    📋 打开看板
                  </button>
                </div>
              </div>
            )}
          </Show>

          <div class="flex size-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {props.children}
          </div>
        </Show>

        {/* Mode 1: Pure Project Issue Kanban Board + Session Binding */}
        <Show when={taskboard.viewMode() === "board"}>
          <div
            data-slot="taskboard-board-view"
            class="flex size-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-[var(--shell-inline-inset,8px)] pb-[var(--shell-bottom-inset,8px)] pt-[var(--shell-top-inset,8px)]"
          >
            <div class="flex size-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-v2-border-border-base/80 bg-v2-background-bg-base">
              <TaskboardHeaderBar onOpenCreate={() => openCreateModal("backlog")} />

              <div
                data-slot="taskboard-columns"
                class="flex min-h-0 flex-1 items-stretch gap-3 overflow-x-auto overflow-y-hidden p-3.5"
              >
                <For each={TASKBOARD_COLUMNS}>
                  {(col) => {
                    const columnIssues = createMemo(() => {
                      const filter = taskboard.filterAgent()
                      return taskboard
                        .state()
                        .issues.filter(
                          (item) =>
                            item.status === col.id &&
                            (filter === "all" || item.assigneeAgent.toLowerCase() === filter.toLowerCase()),
                        )
                    })

                    return (
                      <div
                        data-slot="taskboard-column"
                        data-column-id={col.id}
                        onDragOver={(e) => {
                          e.preventDefault()
                          setDragOverColumn(col.id)
                        }}
                        onDragLeave={() => {
                          if (dragOverColumn() === col.id) setDragOverColumn(null)
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          const id = draggedIssueId()
                          setDraggedIssueId(null)
                          setDragOverColumn(null)
                          if (id) taskboard.updateIssueStatus(id, col.id)
                        }}
                        class="flex w-72 shrink-0 flex-col overflow-hidden rounded-xl border transition-colors"
                        classList={{
                          "border-v2-background-bg-accent bg-v2-background-bg-accent/5":
                            dragOverColumn() === col.id,
                          "border-v2-border-border-base/70 bg-v2-background-bg-deep/55":
                            dragOverColumn() !== col.id,
                        }}
                      >
                        <div class="flex h-10 shrink-0 items-center justify-between border-b border-v2-border-border-base/60 px-3">
                          <div class="flex items-center gap-2">
                            <span class="text-[13px] [font-weight:580] text-v2-text-text-base">
                              {col.title}
                            </span>
                            <span class="rounded-full bg-v2-overlay-simple-overlay-hover px-2 py-0.5 font-mono text-[11px] leading-3 text-v2-text-text-muted">
                              {columnIssues().length}
                            </span>
                          </div>
                          <button
                            type="button"
                            data-action={`column-add-${col.id}`}
                            onClick={() => openCreateModal(col.id)}
                            class="flex size-6 items-center justify-center rounded-md text-v2-icon-icon-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
                            title={`在「${col.title}」新建 Issue`}
                          >
                            <Icon name="plus" size="small" />
                          </button>
                        </div>

                        <div class="flex-1 space-y-2.5 overflow-y-auto p-2.5">
                          <For each={columnIssues()}>
                            {(issue) => (
                              <KanbanIssueCard
                                issue={issue}
                                onSelect={() => {
                                  taskboard.setActiveIssueId(issue.id)
                                  setDrawerIssueId(issue.id)
                                }}
                                onDragStart={() => setDraggedIssueId(issue.id)}
                              />
                            )}
                          </For>
                        </div>
                      </div>
                    )
                  }}
                </For>
              </div>
            </div>
          </div>
        </Show>

        {/* Issue Detail & Session Binding Drawer */}
        <Show when={drawerIssue()}>
          {(issue) => (
            <IssueDetailDrawer issue={issue()} onClose={() => setDrawerIssueId(null)} />
          )}
        </Show>

        {/* Create New Issue Modal */}
        <Show when={createModalOpen()}>
          <CreateIssueModal
            defaultColumn={createDefaultCol()}
            onClose={() => setCreateModalOpen(false)}
          />
        </Show>
      </div>
    </Show>
  )
}

function TaskboardHeaderBar(props: { onOpenCreate: () => void }) {
  const taskboard = useTaskboard()

  return (
    <header class="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-v2-border-border-base/70 bg-v2-background-bg-layer-02/50 px-4">
      <div class="flex min-w-0 items-center gap-3">
        <div class="flex items-center gap-2">
          <Icon name="checklist" size="small" class="text-v2-icon-icon-muted" />
          <span class="text-[13px] [font-weight:600] text-v2-text-text-base">
            项目 Issue 看板 · 会话绑定
          </span>
        </div>

        <span class="hidden truncate text-[12px] text-v2-text-text-faint xl:inline">
          拖拽卡片流转状态 · 支持一键绑定现有会话或新建绑定会话（仅预填输入框，绝不自动发送）
        </span>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <select
          aria-label="按负责 Agent 筛选"
          value={taskboard.filterAgent()}
          onChange={(e) => taskboard.setFilterAgent(e.currentTarget.value)}
          class="h-7 rounded-lg border border-v2-border-border-base/80 bg-v2-background-bg-base px-2 text-[12px] text-v2-text-text-base focus:outline-none"
        >
          <option value="all">全部负责 Agent</option>
          <For each={taskboard.availableAgents()}>
            {(agent) => <option value={agent.id}>{agent.name}</option>}
          </For>
        </select>

        <button
          type="button"
          data-action="taskboard-new-issue"
          onClick={props.onOpenCreate}
          class="flex h-7 items-center gap-1 rounded-lg bg-v2-background-bg-accent px-3 text-[12px] [font-weight:560] text-white transition-opacity hover:opacity-90"
        >
          <Icon name="plus" size="small" />
          <span>新建 Issue</span>
        </button>

        <button
          type="button"
          data-action="taskboard-back-to-sessions"
          onClick={() => taskboard.openSessions()}
          class="flex h-7 items-center rounded-lg border border-v2-border-border-base/80 px-2.5 text-[12px] text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
        >
          返回会话
        </button>

        <button
          type="button"
          data-action="taskboard-disable-module"
          onClick={() => taskboard.setEnabled(false)}
          class="flex h-7 items-center rounded-lg border border-v2-border-border-base/80 px-2.5 text-[12px] text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-state-fg-danger"
          title="隐藏侧栏看板入口（后续可按 ⌘⇧K 随时重新打开）"
        >
          隐藏入口 (⌘⇧K)
        </button>
      </div>
    </header>
  )
}

function KanbanIssueCard(props: {
  issue: TaskboardIssue
  onSelect: () => void
  onDragStart: () => void
}) {
  const taskboard = useTaskboard()

  const agentInfo = createMemo(
    () =>
      taskboard
        .availableAgents()
        .find((a) => a.id.toLowerCase() === props.issue.assigneeAgent.toLowerCase()) ?? {
        id: props.issue.assigneeAgent,
        name: `@${props.issue.assigneeAgent}`,
        roleLabel: "Agent",
        description: "",
        mode: "subagent" as const,
        badgeClass: "bg-blue-500/15 text-blue-300 border-blue-500/35",
      },
  )

  const boundIds = createMemo(() => {
    const ids = new Set<string>(props.issue.boundSessionIds)
    if (props.issue.executionSessionId) ids.add(props.issue.executionSessionId)
    if (props.issue.discussionSessionId) ids.add(props.issue.discussionSessionId)
    return [...ids]
  })

  const primarySessionId = createMemo(() => boundIds()[0])

  return (
    <div
      draggable={true}
      data-slot="taskboard-issue-card"
      data-issue-id={props.issue.id}
      onDragStart={props.onDragStart}
      onClick={props.onSelect}
      class="group cursor-pointer space-y-2.5 rounded-xl border border-v2-border-border-base/75 bg-v2-background-bg-base p-3 shadow-2xs transition-all hover:border-v2-border-border-focus"
    >
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-1.5">
          <span class="font-mono text-[12px] [font-weight:600] text-v2-text-text-base">
            {props.issue.id}
          </span>
          <span class="rounded bg-v2-overlay-simple-overlay-hover px-1.5 py-0.25 font-mono text-[10px] leading-3 text-v2-text-text-muted">
            {props.issue.priority}
          </span>
        </div>
        <span class={`rounded border px-1.5 py-0.5 text-[11px] leading-3 ${agentInfo().badgeClass}`}>
          @{props.issue.assigneeAgent}
        </span>
      </div>

      <div class="text-[13px] leading-[18px] [font-weight:540] text-v2-text-text-base">
        {props.issue.title}
      </div>

      <Show when={props.issue.description.trim()}>
        <p class="line-clamp-2 text-[11px] leading-4 text-v2-text-text-muted">
          {props.issue.description}
        </p>
      </Show>

      <div class="flex flex-wrap items-center gap-1.5">
        <span class="max-w-[160px] truncate rounded border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[11px] leading-3 text-emerald-300">
          🌿 {props.issue.worktree}
        </span>
        <Show
          when={boundIds().length > 0}
          fallback={
            <span class="rounded bg-v2-overlay-simple-overlay-hover px-1.5 py-0.5 text-[10px] leading-3 text-v2-text-text-faint">
              未绑定会话
            </span>
          }
        >
          <span class="rounded border border-indigo-500/30 bg-indigo-500/15 px-1.5 py-0.5 font-mono text-[10px] leading-3 text-indigo-300">
            🔗 已绑定 {boundIds().length} 个会话
          </span>
        </Show>
      </div>

      <div
        class="flex items-center gap-1.5 border-t border-v2-border-border-base/60 pt-2"
        onClick={(e) => e.stopPropagation()}
      >
        <Show
          when={primarySessionId()}
          fallback={
            <>
              <button
                type="button"
                data-action={`card-bind-active-${props.issue.id}`}
                onClick={() => taskboard.bindActiveSessionToIssue(props.issue.id)}
                class="flex-1 rounded-md border border-v2-border-border-base/70 bg-v2-background-bg-deep/60 px-2 py-1 text-[11px] [font-weight:520] text-v2-text-text-base transition-colors hover:bg-v2-overlay-simple-overlay-hover"
                title="将当前正在查看的会话绑定到此 Issue"
              >
                🔗 绑定当前会话
              </button>
              <button
                type="button"
                data-action={`card-spawn-session-${props.issue.id}`}
                disabled={taskboard.busySessionCreation()}
                onClick={() =>
                  void taskboard.spawnOrOpenExecutionSession(props.issue.id, {
                    forceNewSession: true,
                    sendContextPrompt: true,
                  })
                }
                class="flex-1 rounded-md bg-v2-background-bg-accent/20 px-2 py-1 text-[11px] [font-weight:540] text-v2-text-text-base ring-1 ring-inset ring-v2-background-bg-accent/40 transition-colors hover:bg-v2-background-bg-accent/30 disabled:opacity-50"
                title="新建一个绑定会话并将需求填入输入框（不自动发送）"
              >
                + 新建绑定会话
              </button>
            </>
          }
        >
          {(sid) => (
            <>
              <button
                type="button"
                data-action={`card-open-session-${props.issue.id}`}
                onClick={() => void taskboard.openBoundSession(props.issue.id, sid())}
                class="flex-1 rounded-md bg-indigo-500/20 px-2 py-1 text-[11px] [font-weight:540] text-indigo-300 ring-1 ring-inset ring-indigo-500/35 transition-colors hover:bg-indigo-500/30"
                title="跳转到已绑定的会话"
              >
                ⚡ 跳转绑定会话
              </button>
              <button
                type="button"
                data-action={`card-split-session-${props.issue.id}`}
                onClick={() =>
                  void taskboard.openBoundSession(props.issue.id, sid(), { inSplitPane: true })
                }
                class="rounded-md border border-v2-border-border-base/70 bg-v2-background-bg-deep/60 px-2 py-1 text-[11px] text-v2-text-text-base transition-colors hover:bg-v2-overlay-simple-overlay-hover"
                title="在原生分屏中打开该绑定会话"
              >
                🪟 分屏
              </button>
              <button
                type="button"
                data-action={`card-fill-session-${props.issue.id}`}
                onClick={() =>
                  void taskboard.openBoundSession(props.issue.id, sid(), { fillComposer: true })
                }
                class="rounded-md border border-v2-border-border-base/70 bg-v2-background-bg-deep/60 px-2 py-1 text-[11px] text-v2-text-text-base transition-colors hover:bg-v2-overlay-simple-overlay-hover"
                title="打开该会话并将 Issue 需求填入输入框（不自动发送）"
              >
                📝 填输入框
              </button>
            </>
          )}
        </Show>
      </div>
    </div>
  )
}

function IssueDetailDrawer(props: { issue: TaskboardIssue; onClose: () => void }) {
  const taskboard = useTaskboard()
  const [selectedSessionToBind, setSelectedSessionToBind] = createSignal("")

  const boundSessionIds = createMemo(() => {
    const ids = new Set<string>(props.issue.boundSessionIds)
    if (props.issue.executionSessionId) ids.add(props.issue.executionSessionId)
    if (props.issue.discussionSessionId) ids.add(props.issue.discussionSessionId)
    return [...ids]
  })

  const unboundRecentSessions = createMemo(() => {
    const bound = new Set(boundSessionIds())
    return taskboard.recentSessions().filter((s) => !bound.has(s.id))
  })

  return (
    <div
      data-slot="taskboard-issue-drawer"
      class="absolute inset-y-0 right-0 z-30 flex w-96 flex-col border-l border-v2-border-border-strong bg-v2-background-bg-base shadow-2xl"
    >
      <div class="flex items-center justify-between border-b border-v2-border-border-base/80 px-4 py-3">
        <div class="flex items-center gap-2">
          <span class="rounded bg-v2-background-bg-accent/20 px-2 py-0.5 font-mono text-[12px] [font-weight:600] text-v2-text-text-base">
            {props.issue.id}
          </span>
          <select
            value={props.issue.status}
            onChange={(e) =>
              taskboard.updateIssueStatus(
                props.issue.id,
                e.currentTarget.value as TaskboardColumnId,
              )
            }
            class="h-7 rounded border border-v2-border-border-base bg-v2-background-bg-deep/60 px-2 text-[12px] text-v2-text-text-base"
          >
            <For each={TASKBOARD_COLUMNS}>
              {(col) => <option value={col.id}>{col.title}</option>}
            </For>
          </select>
        </div>
        <button
          type="button"
          onClick={props.onClose}
          class="rounded px-2 py-1 text-[12px] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
        >
          ✕ 关闭
        </button>
      </div>

      <div class="flex-1 space-y-4 overflow-y-auto p-4">
        <div>
          <label class="mb-1 block text-[11px] text-v2-text-text-muted">议题标题</label>
          <input
            type="text"
            value={props.issue.title}
            onInput={(e) =>
              taskboard.updateIssueDetails(props.issue.id, { title: e.currentTarget.value })
            }
            class="h-8 w-full rounded-lg border border-v2-border-border-base bg-v2-background-bg-deep/50 px-2.5 text-[12px] [font-weight:540] text-v2-text-text-base focus:outline-none"
          />
        </div>

        <div class="grid grid-cols-2 gap-2.5">
          <div>
            <label class="mb-1 block text-[11px] text-v2-text-text-muted">优先级</label>
            <select
              value={props.issue.priority}
              onChange={(e) =>
                taskboard.updateIssueDetails(props.issue.id, {
                  priority: e.currentTarget.value as TaskboardPriority,
                })
              }
              class="h-8 w-full rounded-lg border border-v2-border-border-base bg-v2-background-bg-deep/50 px-2 text-[12px] text-v2-text-text-base"
            >
              <option value="P0">P0 · 紧急</option>
              <option value="P1">P1 · 高优</option>
              <option value="P2">P2 · 常规</option>
            </select>
          </div>

          <div>
            <label class="mb-1 block text-[11px] text-v2-text-text-muted">负责 Agent</label>
            <select
              value={props.issue.assigneeAgent}
              onChange={(e) =>
                taskboard.updateIssueDetails(props.issue.id, {
                  assigneeAgent: e.currentTarget.value,
                })
              }
              class="h-8 w-full rounded-lg border border-v2-border-border-base bg-v2-background-bg-deep/50 px-2 text-[12px] text-v2-text-text-base"
            >
              <For each={taskboard.availableAgents()}>
                {(agent) => <option value={agent.id}>{agent.name}</option>}
              </For>
            </select>
          </div>
        </div>

        <div>
          <label class="mb-1 block text-[11px] text-v2-text-text-muted">Worktree / 分支标识</label>
          <input
            type="text"
            value={props.issue.worktree}
            onInput={(e) =>
              taskboard.updateIssueDetails(props.issue.id, { worktree: e.currentTarget.value })
            }
            class="h-8 w-full rounded-lg border border-v2-border-border-base bg-v2-background-bg-deep/50 px-2.5 font-mono text-[12px] text-v2-text-text-base focus:outline-none"
          />
        </div>

        <div>
          <label class="mb-1 block text-[11px] text-v2-text-text-muted">
            需求描述与验收标准（支持一键填入绑定会话输入框）
          </label>
          <textarea
            rows={4}
            value={props.issue.description}
            onInput={(e) =>
              taskboard.updateIssueDetails(props.issue.id, { description: e.currentTarget.value })
            }
            class="w-full rounded-lg border border-v2-border-border-base bg-v2-background-bg-deep/50 p-2.5 text-[12px] text-v2-text-text-base focus:outline-none"
          />
        </div>

        {/* Session Binding Management Section */}
        <div class="space-y-2.5 rounded-xl border border-indigo-500/30 bg-indigo-950/15 p-3">
          <div class="flex items-center justify-between text-[12px]">
            <span class="[font-weight:580] text-indigo-300">🔗 关联会话管理 (Session Binding)</span>
            <span class="font-mono text-[11px] text-indigo-300">
              {boundSessionIds().length} 个已绑定
            </span>
          </div>

          <Show
            when={boundSessionIds().length > 0}
            fallback={
              <div class="rounded-lg border border-dashed border-v2-border-border-base/70 p-2.5 text-center text-[11px] text-v2-text-text-muted">
                暂未绑定任何会话。您可以在下方一键绑定当前会话、从列表选择已有会话，或直接新建绑定会话。
              </div>
            }
          >
            <div class="space-y-1.5">
              <For each={boundSessionIds()}>
                {(sid) => (
                  <div class="flex items-center justify-between gap-2 rounded-lg border border-v2-border-border-base/70 bg-v2-background-bg-base/80 px-2.5 py-1.5 text-[11px]">
                    <div class="min-w-0 flex-1">
                      <div class="truncate [font-weight:540] text-v2-text-text-base">
                        {taskboard.getSessionTitle(sid)}
                      </div>
                      <div class="truncate font-mono text-[10px] text-v2-text-text-faint">
                        {sid}
                      </div>
                    </div>
                    <div class="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          props.onClose()
                          void taskboard.openBoundSession(props.issue.id, sid)
                        }}
                        class="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[11px] text-indigo-300 hover:bg-indigo-500/30"
                      >
                        跳转
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          props.onClose()
                          void taskboard.openBoundSession(props.issue.id, sid, {
                            inSplitPane: true,
                          })
                        }}
                        class="rounded border border-v2-border-border-base px-1.5 py-0.5 text-[11px] text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover"
                      >
                        分屏
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          props.onClose()
                          void taskboard.openBoundSession(props.issue.id, sid, {
                            fillComposer: true,
                          })
                        }}
                        class="rounded border border-v2-border-border-base px-1.5 py-0.5 text-[11px] text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover"
                        title="填入输入框（不自动发送）"
                      >
                        填输入框
                      </button>
                      <button
                        type="button"
                        onClick={() => taskboard.unbindSessionFromIssue(props.issue.id, sid)}
                        class="rounded px-1.5 py-0.5 text-[11px] text-v2-state-fg-danger hover:bg-v2-overlay-simple-overlay-hover"
                      >
                        解绑
                      </button>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Show>

          <div class="flex gap-1.5 pt-1">
            <select
              aria-label="选择已有会话进行绑定"
              value={selectedSessionToBind()}
              onChange={(e) => setSelectedSessionToBind(e.currentTarget.value)}
              class="h-7 min-w-0 flex-1 rounded-lg border border-v2-border-border-base bg-v2-background-bg-base px-2 text-[11px] text-v2-text-text-base"
            >
              <option value="">选择已有会话绑定到此 Issue...</option>
              <For each={unboundRecentSessions()}>
                {(s) => <option value={s.id}>{s.title}</option>}
              </For>
            </select>
            <button
              type="button"
              disabled={!selectedSessionToBind()}
              onClick={() => {
                const sid = selectedSessionToBind()
                if (!sid) return
                const found = taskboard.recentSessions().find((s) => s.id === sid)
                taskboard.bindExistingSessionToIssue(
                  props.issue.id,
                  sid,
                  "execution",
                  undefined,
                  found?.directory,
                )
                setSelectedSessionToBind("")
              }}
              class="shrink-0 rounded-lg border border-v2-border-border-base bg-v2-background-bg-base px-2.5 text-[11px] text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover disabled:opacity-40"
            >
              绑定所选
            </button>
          </div>

          <div class="grid grid-cols-2 gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => taskboard.bindActiveSessionToIssue(props.issue.id)}
              class="rounded-lg border border-v2-border-border-base bg-v2-background-bg-base py-1.5 text-[11px] [font-weight:540] text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover"
            >
              🔗 绑定当前打开会话
            </button>
            <button
              type="button"
              disabled={taskboard.busySessionCreation()}
              onClick={() => {
                props.onClose()
                void taskboard.spawnOrOpenExecutionSession(props.issue.id, {
                  forceNewSession: true,
                  sendContextPrompt: true,
                })
              }}
              class="rounded-lg bg-indigo-600 py-1.5 text-[11px] [font-weight:560] text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              + 新建绑定会话 (填输入框)
            </button>
          </div>

          <button
            type="button"
            disabled={taskboard.busySessionCreation()}
            onClick={() => {
              props.onClose()
              void taskboard.spawnOrOpenExecutionSession(props.issue.id, {
                forceNewSession: true,
                createNewWorktree: true,
                sendContextPrompt: true,
              })
            }}
            class="w-full rounded-lg border border-emerald-500/35 bg-emerald-500/15 py-1.5 text-[11px] [font-weight:540] text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
          >
            🌿 新建独立 Worktree 并创建绑定会话 (填输入框)
          </button>
        </div>
      </div>

      <div class="flex items-center justify-between border-t border-v2-border-border-base/80 px-4 py-2.5">
        <button
          type="button"
          onClick={() => {
            const id = props.issue.id
            props.onClose()
            taskboard.deleteIssue(id)
          }}
          class="rounded px-2.5 py-1 text-[11px] text-v2-state-fg-danger hover:bg-v2-overlay-simple-overlay-hover"
        >
          删除 Issue
        </button>
        <button
          type="button"
          onClick={props.onClose}
          class="rounded-lg bg-v2-background-bg-accent px-3 py-1 text-[12px] text-white"
        >
          完成
        </button>
      </div>
    </div>
  )
}

function CreateIssueModal(props: { defaultColumn: TaskboardColumnId; onClose: () => void }) {
  const taskboard = useTaskboard()

  const [title, setTitle] = createSignal("")
  const [desc, setDesc] = createSignal("")
  const [col, setCol] = createSignal<TaskboardColumnId>(props.defaultColumn)
  const [priority, setPriority] = createSignal<TaskboardPriority>("P1")
  const [agent, setAgent] = createSignal("build")

  const submit = (bindActiveSession: boolean) => {
    taskboard.createIssue(
      {
        title: title().trim() || "未命名需求议题",
        description: desc(),
        status: col(),
        priority: priority(),
        assigneeAgent: agent(),
      },
      { bindActiveSession },
    )
    props.onClose()
  }

  return (
    <div
      data-slot="taskboard-create-modal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
      onClick={props.onClose}
    >
      <div
        class="w-full max-w-lg overflow-hidden rounded-xl border border-v2-border-border-strong bg-v2-background-bg-base shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="flex items-center justify-between border-b border-v2-border-border-base/80 px-4 py-3">
          <span class="text-[13px] [font-weight:580] text-v2-text-text-base">
            ➕ 新建项目 Issue
          </span>
          <button
            type="button"
            onClick={props.onClose}
            class="text-[12px] text-v2-text-text-muted hover:text-v2-text-text-base"
          >
            ✕
          </button>
        </div>

        <div class="space-y-3 p-4">
          <div>
            <label class="mb-1 block text-[11px] text-v2-text-text-muted">Issue 标题</label>
            <input
              type="text"
              data-slot="create-issue-title"
              placeholder="例如：抽离纯 Issue 看板并支持多会话绑定与跳转"
              value={title()}
              onInput={(e) => setTitle(e.currentTarget.value)}
              class="h-9 w-full rounded-lg border border-v2-border-border-base bg-v2-background-bg-deep/50 px-3 text-[12px] text-v2-text-text-base focus:outline-none"
            />
          </div>

          <div>
            <label class="mb-1 block text-[11px] text-v2-text-text-muted">
              需求背景与验收标准（后续可一键填入绑定会话输入框）
            </label>
            <textarea
              rows={3}
              data-slot="create-issue-desc"
              placeholder="描述需求目标、边界条件与验收标准..."
              value={desc()}
              onInput={(e) => setDesc(e.currentTarget.value)}
              class="w-full rounded-lg border border-v2-border-border-base bg-v2-background-bg-deep/50 p-2.5 text-[12px] text-v2-text-text-base focus:outline-none"
            />
          </div>

          <div class="grid grid-cols-3 gap-2.5">
            <div>
              <label class="mb-1 block text-[11px] text-v2-text-text-muted">初始列</label>
              <select
                value={col()}
                onChange={(e) => setCol(e.currentTarget.value as TaskboardColumnId)}
                class="h-8 w-full rounded-lg border border-v2-border-border-base bg-v2-background-bg-deep/50 px-2 text-[12px] text-v2-text-text-base"
              >
                <For each={TASKBOARD_COLUMNS}>
                  {(c) => <option value={c.id}>{c.title}</option>}
                </For>
              </select>
            </div>

            <div>
              <label class="mb-1 block text-[11px] text-v2-text-text-muted">优先级</label>
              <select
                value={priority()}
                onChange={(e) => setPriority(e.currentTarget.value as TaskboardPriority)}
                class="h-8 w-full rounded-lg border border-v2-border-border-base bg-v2-background-bg-deep/50 px-2 text-[12px] text-v2-text-text-base"
              >
                <option value="P0">P0 · 紧急</option>
                <option value="P1">P1 · 高优</option>
                <option value="P2">P2 · 常规</option>
              </select>
            </div>

            <div>
              <label class="mb-1 block text-[11px] text-v2-text-text-muted">负责 Agent</label>
              <select
                value={agent()}
                onChange={(e) => setAgent(e.currentTarget.value)}
                class="h-8 w-full rounded-lg border border-v2-border-border-base bg-v2-background-bg-deep/50 px-2 text-[12px] text-v2-text-text-base"
              >
                <For each={taskboard.availableAgents()}>
                  {(a) => <option value={a.id}>{a.name}</option>}
                </For>
              </select>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 border-t border-v2-border-border-base/80 bg-v2-background-bg-deep/60 px-4 py-3">
          <button
            type="button"
            onClick={props.onClose}
            class="rounded-lg border border-v2-border-border-base px-3 py-1.5 text-[12px] text-v2-text-text-muted hover:text-v2-text-text-base"
          >
            取消
          </button>
          <button
            type="button"
            data-action="submit-issue-and-bind"
            onClick={() => submit(true)}
            class="rounded-lg bg-indigo-600 px-3 py-1.5 text-[12px] [font-weight:560] text-white hover:bg-indigo-500"
          >
            创建并绑定当前会话
          </button>
          <button
            type="button"
            data-action="submit-issue-only"
            onClick={() => submit(false)}
            class="rounded-lg bg-v2-background-bg-accent px-3 py-1.5 text-[12px] [font-weight:560] text-white hover:opacity-90"
          >
            仅创建到看板
          </button>
        </div>
      </div>
    </div>
  )
}
