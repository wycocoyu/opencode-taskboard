import { For, Show, createMemo, createSignal, type ParentProps } from "solid-js"
import { Icon } from "@opencode/ui/icon"
import { Tooltip } from "@opencode/ui/tooltip"
import { useLayout } from "@/shell/state/layout"
import { useOptionalTaskboard, useTaskboard } from "./controller"
import {
  TASKBOARD_COLUMNS,
  buildDiscussionContextXml,
  type TaskboardColumnId,
  type TaskboardIssue,
  type TaskboardPriority,
} from "./model"

export function TaskboardSidebarNav() {
  const taskboard = useOptionalTaskboard()
  if (!taskboard) return null

  const resolvedConclusionsCount = createMemo(() =>
    taskboard
      .state()
      .issues.reduce((acc, issue) => acc + issue.discussionThreads.filter((t) => t.resolved).length, 0),
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
            <span class="truncate">项目</span>
            <span class="rounded bg-v2-overlay-simple-overlay-hover px-1.5 py-0.25 text-[10px] leading-3 text-v2-text-text-faint">
              看板
            </span>
          </span>
          <span class="font-mono text-[11px] leading-3 text-v2-text-text-faint">
            {taskboard.state().issues.length}
          </span>
        </button>

        <button
          type="button"
          data-action="sidebar-open-discussion"
          aria-pressed={taskboard.viewMode() === "discussion" || taskboard.viewMode() === "split"}
          onClick={() => {
            if (taskboard.viewMode() === "discussion") {
              taskboard.openSplit()
            } else if (taskboard.viewMode() === "split") {
              taskboard.openSessions()
            } else {
              taskboard.openDiscussion()
            }
          }}
          class="flex h-7 min-w-0 flex-1 items-center justify-between gap-1.5 rounded-lg border px-2.5 text-[12px] leading-4 transition-colors"
          classList={{
            "border-v2-background-bg-accent/55 bg-v2-background-bg-accent/15 text-v2-text-text-base [font-weight:560] shadow-2xs":
              taskboard.viewMode() === "discussion" || taskboard.viewMode() === "split",
            "border-v2-border-border-base/60 bg-v2-background-bg-base/45 text-v2-text-text-muted hover:border-v2-border-border-strong hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base":
              taskboard.viewMode() !== "discussion" && taskboard.viewMode() !== "split",
          }}
        >
          <span class="flex min-w-0 items-center gap-1.5">
            <Icon name="bubble-5" size="small" class="shrink-0 text-v2-icon-icon-muted" />
            <span class="truncate">讨论</span>
            <span class="rounded bg-v2-overlay-simple-overlay-hover px-1 py-0.25 text-[10px] leading-3 text-v2-text-text-faint">
              @Agent
            </span>
          </span>
          <span class="font-mono text-[10px] leading-3 text-v2-text-text-faint">
            {taskboard.viewMode() === "split" ? "双屏" : `${resolvedConclusionsCount()}结论`}
          </span>
        </button>

        <Tooltip placement="bottom" value="切换左屏 @多Agent 讨论 + 右屏执行会话双屏联动 (⌘⇧L)">
          <button
            type="button"
            data-action="sidebar-toggle-taskboard-split"
            aria-label="切换左讨论右执行双屏联动"
            aria-pressed={taskboard.viewMode() === "split"}
            onClick={() => {
              if (taskboard.viewMode() === "split") {
                taskboard.openSessions()
              } else {
                taskboard.openSplit()
              }
            }}
            class="flex size-7 shrink-0 items-center justify-center rounded-lg border text-[11px] transition-colors"
            classList={{
              "border-v2-background-bg-accent/60 bg-v2-background-bg-accent/20 text-v2-text-text-base":
                taskboard.viewMode() === "split",
              "border-v2-border-border-base/60 bg-v2-background-bg-base/45 text-v2-icon-icon-muted hover:border-v2-border-border-strong hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base":
                taskboard.viewMode() !== "split",
            }}
          >
            <Icon name="split" size="small" />
          </button>
        </Tooltip>
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

  let splitContainerRef: HTMLDivElement | undefined

  const activeSessionBinding = createMemo(() => {
    const r = layout.route()
    if (r.type !== "session") return undefined
    return taskboard.findIssueBySessionId(r.sessionId)
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

  const handleSplitResizerPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)

    const onMove = (moveEvent: PointerEvent) => {
      if (!splitContainerRef) return
      const rect = splitContainerRef.getBoundingClientRect()
      if (rect.width <= 320) return
      const nextRatio = (moveEvent.clientX - rect.left) / rect.width
      taskboard.setSplitRatio(nextRatio)
    }

    const onUp = (upEvent: PointerEvent) => {
      if (target.hasPointerCapture(upEvent.pointerId)) {
        target.releasePointerCapture(upEvent.pointerId)
      }
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
    }

    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
  }

  return (
    <Show when={taskboard.enabled()} fallback={props.children}>
      <div
        ref={splitContainerRef}
        data-slot="taskboard-workbench-host"
        data-view-mode={taskboard.viewMode()}
        class="relative flex size-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden [font-family:var(--v2-font-family-sans)]"
      >
      {/* Mode 0: Normal Sessions View (with bound Issue banner if active session is linked to an Issue) */}
      <Show when={taskboard.viewMode() === "sessions"}>
        <Show when={activeSessionBinding()}>
          {(binding) => (
            <div
              data-slot="taskboard-bound-session-banner"
              class="mx-[var(--shell-inline-inset,8px)] mt-[var(--shell-top-inset,8px)] flex h-8 shrink-0 items-center justify-between gap-2 rounded-lg border border-v2-border-border-base/80 bg-v2-background-bg-layer-02/80 px-3 text-[12px] leading-4"
            >
              <div class="flex min-w-0 items-center gap-2">
                <span class="rounded bg-v2-background-bg-accent/20 px-1.5 py-0.5 font-mono text-[11px] [font-weight:580] text-v2-text-text-base">
                  {binding().issue.id}
                </span>
                <span class="truncate text-v2-text-text-base [font-weight:520]">
                  {binding().issue.title}
                </span>
                <span class="shrink-0 rounded bg-v2-overlay-simple-overlay-hover px-1.5 py-0.5 text-[11px] text-v2-text-text-muted">
                  {binding(). issue.discussionThreads.filter((t) => t.resolved).length} 条讨论结论已生效
                </span>
              </div>

              <div class="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  data-action="banner-open-split-discussion"
                  onClick={() => taskboard.openSplit(binding().issue.id)}
                  class="rounded-md border border-v2-border-border-base/80 bg-v2-background-bg-base px-2 py-1 text-[11px] text-v2-text-text-base transition-colors hover:bg-v2-overlay-simple-overlay-hover"
                >
                  🪟 左屏打开 @多Agent 讨论
                </button>
                <button
                  type="button"
                  data-action="banner-inject-conclusions"
                  onClick={() => void taskboard.injectConclusionsToExecutionSession(binding().issue.id)}
                  class="rounded-md border border-v2-border-border-base/80 bg-v2-background-bg-base px-2 py-1 text-[11px] text-v2-text-text-base transition-colors hover:bg-v2-overlay-simple-overlay-hover"
                >
                  📝 填入结论到输入框
                </button>
                <button
                  type="button"
                  data-action="banner-sync-to-board"
                  onClick={() => void taskboard.syncExecutionProgressToIssue(binding().issue.id, "review")}
                  class="rounded-md bg-v2-background-bg-accent px-2 py-1 text-[11px] [font-weight:540] text-white transition-opacity hover:opacity-90"
                >
                  📤 回写看板 (待验收)
                </button>
                <button
                  type="button"
                  data-action="banner-open-board"
                  onClick={() => taskboard.openBoard()}
                  class="rounded-md px-2 py-1 text-[11px] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
                >
                  📋 看板
                </button>
              </div>
            </div>
          )}
        </Show>

        <div class="flex size-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {props.children}
        </div>
      </Show>

      {/* Mode 1: Full Project Kanban Board */}
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
                        "border-v2-background-bg-accent bg-v2-background-bg-accent/5": dragOverColumn() === col.id,
                        "border-v2-border-border-base/70 bg-v2-background-bg-deep/55": dragOverColumn() !== col.id,
                      }}
                    >
                      <div class="flex h-10 shrink-0 items-center justify-between border-b border-v2-border-border-base/60 px-3">
                        <div class="flex items-center gap-2">
                          <span class="text-[13px] [font-weight:580] text-v2-text-text-base">{col.title}</span>
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
                              onOpenDiscussion={() => taskboard.openDiscussion(issue.id)}
                              onOpenSplit={() => void taskboard.spawnOrOpenExecutionSession(issue.id)}
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

      {/* Mode 2 & 3: Single-Pane Discussion OR Dual-Pane (Left Discussion + Right Real Session) */}
      <Show when={taskboard.viewMode() === "discussion" || taskboard.viewMode() === "split"}>
        <div
          data-slot="taskboard-discussion-split-container"
          class="flex size-full min-h-0 min-w-0 flex-1 flex-row overflow-hidden px-[var(--shell-inline-inset,8px)] pb-[var(--shell-bottom-inset,8px)] pt-[var(--shell-top-inset,8px)]"
        >
          {/* Left Pane: @多Agent Requirement Discussion Room */}
          <section
            data-slot="taskboard-discussion-pane"
            style={{
              flex:
                taskboard.viewMode() === "split"
                  ? `${taskboard.splitRatio()} 1 0%`
                  : "1 1 0%",
            }}
            class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[10px] border border-v2-border-border-base/80 bg-v2-background-bg-base"
          >
            <DiscussionRoomPane
              onOpenIssueDrawer={(issueId) => setDrawerIssueId(issueId)}
              onOpenCreateModal={() => openCreateModal("backlog")}
            />
          </section>

          {/* Resizer + Right Pane: Real OpenCode Execution Session (SplitWorkbench) */}
          <Show when={taskboard.viewMode() === "split"}>
            <div
              role="separator"
              aria-orientation="vertical"
              data-slot="taskboard-split-resizer"
              onPointerDown={handleSplitResizerPointerDown}
              onDblClick={() => taskboard.setSplitRatio(0.46)}
              class="group/tbresizer relative z-10 flex h-full w-2 shrink-0 cursor-col-resize items-center justify-center select-none"
            >
              <div class="h-12 w-1 rounded-full bg-v2-border-border-base/60 transition-all group-hover/tbresizer:h-24 group-hover/tbresizer:bg-v2-background-bg-accent" />
            </div>

            <section
              data-slot="taskboard-execution-pane"
              style={{
                flex: `${Math.max(0.25, 1 - taskboard.splitRatio())} 1 0%`,
              }}
              class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[10px] border border-v2-border-border-base/80 bg-v2-background-bg-base"
            >
              <ExecutionRightPaneHeader />
              <div
                class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                style={{
                  "--shell-inline-inset": "0px",
                  "--shell-top-inset": "0px",
                  "--shell-bottom-inset": "0px",
                }}
              >
                {props.children}
              </div>
            </section>
          </Show>
        </div>
      </Show>

      {/* Issue Detail & Session Binding Drawer */}
      <Show when={drawerIssue()}>
        {(issue) => (
          <IssueDetailDrawer
            issue={issue()}
            onClose={() => setDrawerIssueId(null)}
          />
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
        <div class="flex items-center gap-1 rounded-lg border border-v2-border-border-base/75 bg-v2-background-bg-deep/60 p-0.5">
          <button
            type="button"
            data-action="taskboard-mode-board"
            onClick={() => taskboard.openBoard()}
            class="rounded-md px-2.5 py-1 text-[12px] leading-4 transition-colors"
            classList={{
              "bg-v2-overlay-simple-overlay-pressed text-v2-text-text-base [font-weight:560]":
                taskboard.viewMode() === "board",
              "text-v2-text-text-muted hover:text-v2-text-text-base": taskboard.viewMode() !== "board",
            }}
          >
            📋 项目看板
          </button>
          <button
            type="button"
            data-action="taskboard-mode-discussion"
            onClick={() => taskboard.openDiscussion()}
            class="rounded-md px-2.5 py-1 text-[12px] leading-4 transition-colors"
            classList={{
              "bg-v2-overlay-simple-overlay-pressed text-v2-text-text-base [font-weight:560]":
                taskboard.viewMode() === "discussion",
              "text-v2-text-text-muted hover:text-v2-text-text-base": taskboard.viewMode() !== "discussion",
            }}
          >
            💬 需求讨论 (@多Agent)
          </button>
          <button
            type="button"
            data-action="taskboard-mode-split"
            onClick={() => taskboard.openSplit()}
            class="rounded-md px-2.5 py-1 text-[12px] leading-4 transition-colors"
            classList={{
              "bg-v2-overlay-simple-overlay-pressed text-v2-text-text-base [font-weight:560]":
                taskboard.viewMode() === "split",
              "text-v2-text-text-muted hover:text-v2-text-text-base": taskboard.viewMode() !== "split",
            }}
          >
            🪟 双屏联动 (左讨论 + 右执行)
          </button>
        </div>

        <span class="hidden truncate text-[12px] text-v2-text-text-faint xl:inline">
          拖拽或点击卡片流转状态 · 讨论结论仅自动填入右侧输入框，由您确认后手动发送
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
          返回纯会话
        </button>

        <button
          type="button"
          data-action="taskboard-disable-module"
          onClick={() => taskboard.setEnabled(false)}
          class="flex h-7 items-center rounded-lg border border-v2-border-border-base/80 px-2.5 text-[12px] text-v2-state-fg-danger transition-colors hover:bg-v2-overlay-simple-overlay-hover"
          title="关闭并隐藏看板与讨论模块（后续可按 ⌘⇧K 重新开启）"
        >
          停用模块 (⌘⇧K)
        </button>
      </div>
    </header>
  )
}

function KanbanIssueCard(props: {
  issue: TaskboardIssue
  onSelect: () => void
  onDragStart: () => void
  onOpenDiscussion: () => void
  onOpenSplit: () => void
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

  const resolvedCount = createMemo(() => props.issue.discussionThreads.filter((t) => t.resolved).length)

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
          <span class="font-mono text-[12px] [font-weight:600] text-v2-text-text-base">{props.issue.id}</span>
          <span class="rounded bg-v2-overlay-simple-overlay-hover px-1.5 py-0.25 font-mono text-[10px] leading-3 text-v2-text-text-muted">
            {props.issue.priority}
          </span>
        </div>
        <span class={`rounded border px-1.5 py-0.5 text-[11px] leading-3 ${agentInfo().badgeClass}`}>
          @{props.issue.assigneeAgent}
        </span>
      </div>

      <div class="text-[13px] leading-[18px] [font-weight:540] text-v2-text-text-base">{props.issue.title}</div>

      <div class="flex flex-wrap items-center gap-1.5">
        <span class="rounded border border-purple-500/25 bg-purple-500/10 px-1.5 py-0.5 text-[11px] leading-3 text-purple-300">
          💬 {props.issue.discussionThreads.length} 讨论 · {resolvedCount()} 结论
        </span>
        <span class="max-w-[160px] truncate rounded border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[11px] leading-3 text-emerald-300">
          🌿 {props.issue.worktree}
        </span>
        <Show when={props.issue.executionSessionId}>
          <span class="rounded bg-blue-500/15 px-1.5 py-0.5 font-mono text-[10px] leading-3 text-blue-300">
            ⚡ 已绑定会话
          </span>
        </Show>
      </div>

      <div
        class="flex items-center gap-1.5 border-t border-v2-border-border-base/60 pt-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          data-action={`card-open-discussion-${props.issue.id}`}
          onClick={props.onOpenDiscussion}
          class="flex-1 rounded-md border border-v2-border-border-base/70 bg-v2-background-bg-deep/60 px-2 py-1 text-[11px] [font-weight:520] text-v2-text-text-base transition-colors hover:bg-v2-overlay-simple-overlay-hover"
        >
          💬 @多Agent 讨论
        </button>
        <button
          type="button"
          data-action={`card-open-split-${props.issue.id}`}
          onClick={props.onOpenSplit}
          class="flex-1 rounded-md bg-v2-background-bg-accent/20 px-2 py-1 text-[11px] [font-weight:540] text-v2-text-text-base ring-1 ring-inset ring-v2-background-bg-accent/40 transition-colors hover:bg-v2-background-bg-accent/30"
        >
          🪟 双屏联动执行
        </button>
      </div>
    </div>
  )
}

function DiscussionRoomPane(props: {
  onOpenIssueDrawer: (issueId: string) => void
  onOpenCreateModal: () => void
}) {
  const taskboard = useTaskboard()

  const [contextPreviewOpen, setContextPreviewOpen] = createSignal(false)
  const [mentionPopoverOpen, setMentionPopoverOpen] = createSignal(false)
  const [mentionTab, setMentionTab] = createSignal<"agent" | "member">("agent")
  const [addingCustomAgent, setAddingCustomAgent] = createSignal(false)
  const [customAgentId, setCustomAgentId] = createSignal("")
  const [customAgentRole, setCustomAgentRole] = createSignal("")
  const [customAgentDesc, setCustomAgentDesc] = createSignal("")
  const [composerText, setComposerText] = createSignal("")

  let textareaRef: HTMLTextAreaElement | undefined

  const issue = createMemo(() => taskboard.activeIssue())
  const resolvedCount = createMemo(
    () => issue()?.discussionThreads.filter((t) => t.resolved).length ?? 0,
  )

  const currentAgentProfile = createMemo(() => {
    const target = taskboard.targetAgent()
    return (
      taskboard.availableAgents().find((a) => a.id.toLowerCase() === target.toLowerCase()) ??
      taskboard.availableAgents()[0]
    )
  })

  const selectAgentFromMention = (agentId: string) => {
    taskboard.setTargetAgent(agentId)
    const stripped = composerText().replace(/^@[a-zA-Z0-9_-]+\s*/, "")
    setComposerText(`@${agentId} ${stripped}`)
    setMentionPopoverOpen(false)
    textareaRef?.focus()
  }

  const handleComposerInput = (value: string) => {
    setComposerText(value)
    if (value.endsWith("@")) {
      setMentionPopoverOpen(true)
    }
    const match = value.match(/^@([a-zA-Z0-9_-]+)\b/)
    if (match) {
      const found = taskboard
        .availableAgents()
        .find((a) => a.id.toLowerCase() === match[1]!.toLowerCase())
      if (found) {
        taskboard.setTargetAgent(found.id)
      }
    }
  }

  const submitMessage = async () => {
    const text = composerText().trim()
    if (!text) return
    setComposerText("")
    setMentionPopoverOpen(false)
    await taskboard.sendDiscussionMessage(text)
  }

  const submitCustomAgent = () => {
    const id = customAgentId().trim().replace(/^@/, "")
    if (!id) return
    taskboard.addCustomAgent({
      id,
      name: `@${id} · ${customAgentRole().trim() || "自定义角色"}`,
      roleLabel: customAgentRole().trim() || "自定义 Agent",
      description: customAgentDesc().trim() || "自定义需求讨论与评审角色",
      mode: "subagent",
    })
    setCustomAgentId("")
    setCustomAgentRole("")
    setCustomAgentDesc("")
    setAddingCustomAgent(false)
    selectAgentFromMention(id)
  }

  return (
    <div class="flex size-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {/* Discussion Header */}
      <header class="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-v2-border-border-base/75 bg-v2-background-bg-layer-02/60 px-3.5">
        <div class="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => taskboard.openBoard()}
            class="rounded-md border border-v2-border-border-base/75 bg-v2-background-bg-base px-2 py-1 text-[11px] text-v2-text-text-muted transition-colors hover:text-v2-text-text-base"
            title="返回项目 Issue 看板"
          >
            ← 看板
          </button>

          <select
            aria-label="切换当前讨论的 Issue"
            data-slot="discussion-issue-selector"
            value={issue()?.id ?? ""}
            onChange={(e) => taskboard.setActiveIssueId(e.currentTarget.value)}
            class="h-7 max-w-[260px] truncate rounded-lg border border-v2-border-border-base/80 bg-v2-background-bg-base px-2 text-[12px] [font-weight:560] text-v2-text-text-base focus:outline-none"
          >
            <For each={taskboard.state().issues}>
              {(item) => (
                <option value={item.id}>
                  {item.id} · {item.title}
                </option>
              )}
            </For>
          </select>

          <Show when={issue()}>
            {(cur) => (
              <button
                type="button"
                onClick={() => props.onOpenIssueDrawer(cur().id)}
                class="hidden rounded px-2 py-0.5 text-[11px] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base md:inline-block"
              >
                详情与验收标准
              </button>
            )}
          </Show>
        </div>

        <div class="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            data-action="discussion-toggle-context-preview"
            onClick={() => setContextPreviewOpen((v) => !v)}
            class="flex h-7 items-center gap-1 rounded-lg border border-v2-border-border-base/80 bg-v2-background-bg-base px-2.5 text-[11px] text-v2-text-text-base transition-colors hover:bg-v2-overlay-simple-overlay-hover"
          >
            <span>🧠 上下文折叠</span>
            <span class="rounded bg-emerald-500/20 px-1.5 py-0.25 font-mono text-[10px] text-emerald-300">
              {resolvedCount()} 结论
            </span>
          </button>

          <Show
            when={taskboard.viewMode() === "split"}
            fallback={
              <button
                type="button"
                data-action="discussion-spawn-execution"
                disabled={taskboard.busySessionCreation()}
                onClick={() => void taskboard.spawnOrOpenExecutionSession(issue()?.id)}
                class="flex h-7 items-center gap-1 rounded-lg bg-v2-background-bg-accent px-2.5 text-[11px] [font-weight:560] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <span>⚡ 绑定并右屏打开执行会话</span>
              </button>
            }
          >
            <button
              type="button"
              data-action="discussion-maximize-single"
              onClick={() => taskboard.openDiscussion(issue()?.id)}
              class="flex h-7 items-center rounded-lg border border-v2-border-border-base/80 bg-v2-background-bg-base px-2 text-[11px] text-v2-text-text-muted hover:text-v2-text-text-base"
              title="收起右侧分屏，全屏查看需求讨论"
            >
              单屏讨论
            </button>
          </Show>
        </div>
      </header>

      {/* Role Switcher Roster Bar */}
      <div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-v2-border-border-base/60 bg-v2-background-bg-deep/40 px-3.5 py-1.5 text-[11px]">
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="text-v2-text-text-faint">点名切换角色：</span>
          <For each={taskboard.availableAgents()}>
            {(agent) => (
              <button
                type="button"
                data-action={`roster-agent-${agent.id}`}
                onClick={() => selectAgentFromMention(agent.id)}
                class={`rounded-full border px-2 py-0.5 text-[11px] leading-3 transition-opacity hover:opacity-90 ${agent.badgeClass}`}
                classList={{
                  "ring-1 ring-white/50 [font-weight:580]":
                    taskboard.targetAgent().toLowerCase() === agent.id.toLowerCase(),
                }}
              >
                @{agent.id} · {agent.roleLabel}
              </button>
            )}
          </For>
        </div>
      </div>

      {/* Collapsible <discussion_context> XML Preview Drawer */}
      <Show when={contextPreviewOpen() && issue()}>
        {(cur) => (
          <div
            data-slot="discussion-context-preview"
            class="shrink-0 space-y-1.5 border-b border-purple-500/30 bg-purple-950/15 px-3.5 py-2.5 text-[11px]"
          >
            <div class="flex items-center justify-between">
              <span class="font-semibold text-purple-300">
                🔍 Qoder 同款 `&lt;discussion_context&gt;` 增量与折叠结论预览
              </span>
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void taskboard.injectConclusionsToExecutionSession(cur().id)}
                  class="rounded bg-emerald-600 px-2 py-0.5 text-[11px] text-white hover:bg-emerald-500"
                >
                  📝 填入右侧输入框 (手动发送)
                </button>
                <button
                  type="button"
                  onClick={() => setContextPreviewOpen(false)}
                  class="text-v2-text-text-muted hover:text-v2-text-text-base"
                >
                  ✕
                </button>
              </div>
            </div>
            <pre class="max-h-36 overflow-x-auto whitespace-pre-wrap rounded-lg border border-v2-border-border-base/80 bg-v2-background-bg-deep/80 p-2 font-mono text-[11px] text-emerald-300">
              {buildDiscussionContextXml(cur(), "delta")}
            </pre>
          </div>
        )}
      </Show>

      {/* Discussion Threads Stream */}
      <div data-slot="discussion-thread-list" class="flex-1 space-y-3 overflow-y-auto p-3.5">
        <Show
          when={issue() && (issue()!.discussionThreads.length > 0)}
          fallback={
            <div class="rounded-xl border border-dashed border-v2-border-border-base/80 p-6 text-center">
              <div class="text-[13px] [font-weight:560] text-v2-text-text-base">
                当前议题 ({issue()?.id}) 暂无讨论记录
              </div>
              <p class="mt-1 text-[12px] text-v2-text-text-muted">
                在下方点击或输入 <span class="font-mono text-amber-300">@plan</span>、
                <span class="font-mono text-purple-300">@reviewer</span>、
                <span class="font-mono text-blue-300">@build</span> 即可在单会话内点名不同 Agent 讨论，并将定稿方案标为结论。
              </p>
            </div>
          }
        >
          <For each={issue()!.discussionThreads}>
            {(thread) => {
              const agentObj = createMemo(
                () =>
                  taskboard
                    .availableAgents()
                    .find((a) => a.id.toLowerCase() === thread.targetAgent.toLowerCase()) ?? {
                    id: thread.targetAgent,
                    name: `@${thread.targetAgent}`,
                    roleLabel: "Agent",
                    badgeClass: "bg-blue-500/15 text-blue-300 border-blue-500/35",
                  },
              )

              return (
                <div
                  data-slot="discussion-thread-card"
                  data-thread-id={thread.id}
                  data-resolved={thread.resolved ? "true" : undefined}
                  class="space-y-2.5 rounded-xl border p-3.5 transition-colors"
                  classList={{
                    "border-emerald-500/40 bg-emerald-950/10": thread.resolved,
                    "border-v2-border-border-base/75 bg-v2-background-bg-deep/45": !thread.resolved,
                  }}
                >
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="flex items-center gap-1.5">
                      <span class="rounded bg-v2-overlay-simple-overlay-hover px-2 py-0.5 text-[11px] [font-weight:540] text-v2-text-text-base">
                        👤 {thread.author}
                      </span>
                      <span class="text-[11px] text-v2-text-text-faint">→</span>
                      <span class={`rounded border px-2 py-0.5 text-[11px] leading-3 ${agentObj().badgeClass}`}>
                        {agentObj().name}
                      </span>
                    </div>

                    <button
                      type="button"
                      data-action={`thread-resolve-${thread.id}`}
                      onClick={() => taskboard.toggleThreadResolved(issue()!.id, thread.id)}
                      class="rounded-md border px-2.5 py-1 text-[11px] [font-weight:540] transition-colors"
                      classList={{
                        "border-emerald-500/45 bg-emerald-500/20 text-emerald-300": thread.resolved,
                        "border-v2-border-border-base/80 bg-v2-background-bg-base text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover":
                          !thread.resolved,
                      }}
                    >
                      {thread.resolved ? "✅ 已标为结论并折叠 (点击展开)" : "📌 标为结论并折叠 (Resolve & Fold)"}
                    </button>
                  </div>

                  <div class="border-l-2 border-v2-background-bg-accent/70 pl-2.5 text-[12px] [font-weight:540] text-v2-text-text-base">
                    {thread.question}
                  </div>

                  <Show
                    when={thread.resolved}
                    fallback={
                      <div class="space-y-2 border-l border-v2-border-border-base/70 pl-3">
                        <For each={thread.replies}>
                          {(reply) => (
                            <div class="space-y-1 rounded-lg border border-v2-border-border-base/60 bg-v2-background-bg-base/80 p-2.5">
                              <div class="flex items-center justify-between">
                                <span class="font-mono text-[11px] [font-weight:560] text-v2-text-text-muted">
                                  @{reply.agent}
                                </span>
                                <span class="font-mono text-[10px] text-v2-text-text-faint">
                                  switchAgent(&quot;{reply.agent}&quot;)
                                </span>
                              </div>
                              <div class="whitespace-pre-line text-[12px] leading-[18px] text-v2-text-text-base">
                                {reply.text}
                              </div>
                            </div>
                          )}
                        </For>
                      </div>
                    }
                  >
                    <div class="space-y-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/10 p-2.5">
                      <div class="text-[11px] [font-weight:580] text-emerald-300">
                        🎯 已收敛结论（省去中间辩论过程，自动进入 &lt;discussion_context&gt;）：
                      </div>
                      <input
                        type="text"
                        value={thread.conclusion}
                        onInput={(e) =>
                          taskboard.updateThreadConclusion(issue()!.id, thread.id, e.currentTarget.value)
                        }
                        class="w-full rounded border border-emerald-500/30 bg-v2-background-bg-base/80 px-2 py-1 text-[12px] text-v2-text-text-base focus:outline-none"
                      />
                    </div>
                  </Show>
                </div>
              )
            }}
          </For>
        </Show>
      </div>

      {/* Bottom Composer with Qoder-style @Agent Popover */}
      <div class="relative shrink-0 border-t border-v2-border-border-base/80 bg-v2-background-bg-layer-02/70 p-3">
        <Show when={mentionPopoverOpen()}>
          <div
            data-slot="taskboard-mention-popover"
            class="absolute bottom-28 left-3 z-30 w-80 overflow-hidden rounded-xl border border-v2-border-border-strong bg-v2-background-bg-base shadow-2xl"
          >
            <div class="flex items-center justify-between border-b border-v2-border-border-base/70 bg-v2-background-bg-deep/70 px-3 py-2">
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  data-action="mention-tab-agent"
                  onClick={() => setMentionTab("agent")}
                  class="rounded px-2.5 py-1 text-[11px] [font-weight:560] transition-colors"
                  classList={{
                    "bg-v2-background-bg-accent text-white": mentionTab() === "agent",
                    "text-v2-text-text-muted hover:text-v2-text-text-base": mentionTab() !== "agent",
                  }}
                >
                  Agent ({taskboard.availableAgents().length})
                </button>
                <button
                  type="button"
                  data-action="mention-tab-member"
                  onClick={() => setMentionTab("member")}
                  class="rounded px-2.5 py-1 text-[11px] [font-weight:560] transition-colors"
                  classList={{
                    "bg-v2-background-bg-accent text-white": mentionTab() === "member",
                    "text-v2-text-text-muted hover:text-v2-text-text-base": mentionTab() !== "member",
                  }}
                >
                  成员
                </button>
              </div>
              <button
                type="button"
                onClick={() => setMentionPopoverOpen(false)}
                class="text-[11px] text-v2-text-text-muted hover:text-v2-text-text-base"
              >
                ✕
              </button>
            </div>

            <Show when={mentionTab() === "agent"}>
              <div class="max-h-56 space-y-1 overflow-y-auto p-1.5">
                <For each={taskboard.availableAgents()}>
                  {(agent) => (
                    <button
                      type="button"
                      data-action={`select-mention-agent-${agent.id}`}
                      onClick={() => selectAgentFromMention(agent.id)}
                      class="flex w-full items-start gap-2.5 rounded-lg p-2 text-start transition-colors hover:bg-v2-overlay-simple-overlay-hover"
                    >
                      <span
                        class={`flex size-7 shrink-0 items-center justify-center rounded-lg border font-mono text-[11px] [font-weight:600] uppercase ${agent.badgeClass}`}
                      >
                        {agent.id.slice(0, 2)}
                      </span>
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center justify-between gap-1">
                          <span class="truncate text-[12px] [font-weight:560] text-v2-text-text-base">
                            {agent.name}
                          </span>
                          <span class="shrink-0 font-mono text-[10px] text-v2-text-text-faint">
                            {agent.roleLabel}
                          </span>
                        </div>
                        <p class="truncate text-[11px] text-v2-text-text-muted">{agent.description}</p>
                      </div>
                    </button>
                  )}
                </For>
              </div>
            </Show>

            <Show when={mentionTab() === "member"}>
              <div class="space-y-1 p-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setComposerText((prev) => `@老板(Cocoyu) ${prev}`)
                    setMentionPopoverOpen(false)
                    textareaRef?.focus()
                  }}
                  class="flex w-full items-center gap-2.5 rounded-lg p-2 text-start hover:bg-v2-overlay-simple-overlay-hover"
                >
                  <span class="flex size-7 items-center justify-center rounded-full bg-emerald-500/20 text-[11px] [font-weight:600] text-emerald-300">
                    C
                  </span>
                  <div>
                    <div class="text-[12px] [font-weight:560] text-v2-text-text-base">老板 (Cocoyu)</div>
                    <div class="text-[11px] text-v2-text-text-muted">项目 Owner · 需求拍板</div>
                  </div>
                </button>
              </div>
            </Show>

            <div class="border-t border-v2-border-border-base/70 bg-v2-background-bg-deep/80 p-2">
              <Show
                when={addingCustomAgent()}
                fallback={
                  <button
                    type="button"
                    data-action="open-add-custom-agent"
                    onClick={() => setAddingCustomAgent(true)}
                    class="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-v2-border-border-strong py-1.5 text-[11px] text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover"
                  >
                    <span>+ 添加自定义 Agent</span>
                  </button>
                }
              >
                <div class="space-y-1.5">
                  <div class="flex gap-1.5">
                    <input
                      type="text"
                      placeholder="标识 (如 security)"
                      value={customAgentId()}
                      onInput={(e) => setCustomAgentId(e.currentTarget.value)}
                      class="h-7 flex-1 rounded border border-v2-border-border-base bg-v2-background-bg-base px-2 text-[11px] text-v2-text-text-base"
                    />
                    <input
                      type="text"
                      placeholder="头衔 (如 安全审计)"
                      value={customAgentRole()}
                      onInput={(e) => setCustomAgentRole(e.currentTarget.value)}
                      class="h-7 flex-1 rounded border border-v2-border-border-base bg-v2-background-bg-base px-2 text-[11px] text-v2-text-text-base"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="职责描述..."
                    value={customAgentDesc()}
                    onInput={(e) => setCustomAgentDesc(e.currentTarget.value)}
                    class="h-7 w-full rounded border border-v2-border-border-base bg-v2-background-bg-base px-2 text-[11px] text-v2-text-text-base"
                  />
                  <div class="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAddingCustomAgent(false)}
                      class="rounded px-2 py-1 text-[11px] text-v2-text-text-muted"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      data-action="submit-custom-agent"
                      onClick={submitCustomAgent}
                      class="rounded bg-v2-background-bg-accent px-2.5 py-1 text-[11px] text-white"
                    >
                      保存并 @提及
                    </button>
                  </div>
                </div>
              </Show>
            </div>
          </div>
        </Show>

        <div class="mb-2 flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <button
              type="button"
              data-action="discussion-open-mention-popover"
              onClick={() => setMentionPopoverOpen((v) => !v)}
              class="rounded-md border border-v2-border-border-base/80 bg-v2-background-bg-base px-2 py-0.5 text-[11px] [font-weight:540] text-v2-text-text-base transition-colors hover:bg-v2-overlay-simple-overlay-hover"
            >
              @ 提及切换 Agent
            </button>
            <Show when={currentAgentProfile()}>
              {(prof) => (
                <span class={`rounded border px-2 py-0.5 text-[11px] leading-3 ${prof().badgeClass}`}>
                  当前响应：{prof().name}
                </span>
              )}
            </Show>
          </div>

          <div class="flex items-center gap-1.5 text-[11px]">
            <span class="text-v2-text-text-faint">投递：</span>
            <select
              value={taskboard.deliveryMode()}
              onChange={(e) =>
                taskboard.setDeliveryMode(e.currentTarget.value === "steer" ? "steer" : "queue")
              }
              class="h-6 rounded border border-v2-border-border-base/80 bg-v2-background-bg-base px-1.5 text-[11px] text-v2-text-text-base"
            >
              <option value="queue">queue (排队回复)</option>
              <option value="steer">steer (立即转向)</option>
            </select>
          </div>
        </div>

        <div class="flex gap-2">
          <textarea
            ref={textareaRef}
            rows={2}
            data-slot="discussion-composer-input"
            placeholder="输入 @ 唤起 Agent 菜单，例如：@reviewer 审一下边界风险，或 @plan 拆解实施步骤..."
            value={composerText()}
            onInput={(e) => handleComposerInput(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                void submitMessage()
              } else if (e.key === "Escape") {
                setMentionPopoverOpen(false)
              }
            }}
            class="flex-1 resize-none rounded-lg border border-v2-border-border-base/80 bg-v2-background-bg-base p-2 text-[12px] text-v2-text-text-base placeholder:text-v2-text-text-faint focus:border-v2-border-border-focus focus:outline-none"
          />
          <button
            type="button"
            data-action="discussion-send-message"
            onClick={() => void submitMessage()}
            class="shrink-0 rounded-lg bg-v2-background-bg-accent px-3.5 text-[12px] [font-weight:560] text-white transition-opacity hover:opacity-90"
          >
            发送 ↵
          </button>
        </div>
      </div>
    </div>
  )
}

function ExecutionRightPaneHeader() {
  const taskboard = useTaskboard()
  const issue = createMemo(() => taskboard.activeIssue())
  const resolvedCount = createMemo(
    () => issue()?.discussionThreads.filter((t) => t.resolved).length ?? 0,
  )

  return (
    <header
      data-slot="taskboard-execution-pane-header"
      class="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-v2-border-border-base/75 bg-v2-background-bg-layer-02/60 px-3.5"
    >
      <div class="flex min-w-0 items-center gap-2">
        <span class="shrink-0 rounded border border-emerald-500/35 bg-emerald-500/15 px-2 py-0.5 text-[11px] [font-weight:580] text-emerald-300">
          ⚡ 绑定执行会话
        </span>
        <Show when={issue()}>
          {(cur) => (
            <>
              <span class="font-mono text-[12px] [font-weight:600] text-v2-text-text-base">{cur().id}</span>
              <span class="truncate text-[12px] text-v2-text-text-muted">{cur().title}</span>
              <span class="hidden rounded border border-v2-border-border-base/70 bg-v2-background-bg-deep/60 px-1.5 py-0.5 font-mono text-[10px] text-v2-text-text-faint lg:inline-block">
                🌿 {cur().worktree}
              </span>
            </>
          )}
        </Show>
      </div>

      <div class="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          data-action="split-exec-inject-conclusions"
          onClick={() => void taskboard.injectConclusionsToExecutionSession(issue()?.id)}
          class="rounded-md border border-v2-border-border-base/80 bg-v2-background-bg-base px-2 py-1 text-[11px] text-v2-text-text-base transition-colors hover:bg-v2-overlay-simple-overlay-hover"
          title="将左屏讨论室已折叠的结论填入当前右侧会话输入框（不自动发送）"
        >
          📝 填入 {resolvedCount()} 条结论到输入框
        </button>

        <button
          type="button"
          data-action="split-exec-new-session"
          disabled={taskboard.busySessionCreation()}
          onClick={() =>
            void taskboard.spawnOrOpenExecutionSession(issue()?.id, {
              forceNewSession: true,
              sendContextPrompt: true,
            })
          }
          class="rounded-md border border-v2-border-border-base/80 bg-v2-background-bg-base px-2 py-1 text-[11px] text-v2-text-text-muted transition-colors hover:text-v2-text-text-base disabled:opacity-50"
          title="为当前 Issue 新建并绑定一个独立执行会话"
        >
          + 新建绑定会话
        </button>

        <button
          type="button"
          data-action="split-exec-sync-board"
          onClick={() => void taskboard.syncExecutionProgressToIssue(issue()?.id, "review")}
          class="rounded-md bg-v2-background-bg-accent px-2.5 py-1 text-[11px] [font-weight:560] text-white transition-opacity hover:opacity-90"
        >
          📤 回写看板
        </button>
      </div>
    </header>
  )
}

function IssueDetailDrawer(props: { issue: TaskboardIssue; onClose: () => void }) {
  const taskboard = useTaskboard()

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
              taskboard.updateIssueStatus(props.issue.id, e.currentTarget.value as TaskboardColumnId)
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
            onInput={(e) => taskboard.updateIssueDetails(props.issue.id, { title: e.currentTarget.value })}
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
                taskboard.updateIssueDetails(props.issue.id, { assigneeAgent: e.currentTarget.value })
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
          <label class="mb-1 block text-[11px] text-v2-text-text-muted">
            需求描述与验收标准 (自动进入 &lt;discussion_context&gt;)
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

        <div class="space-y-2 rounded-xl border border-purple-500/30 bg-purple-950/15 p-3">
          <div class="flex items-center justify-between text-[12px]">
            <span class="[font-weight:560] text-purple-300">💬 需求讨论室 (@多Agent)</span>
            <span class="font-mono text-[11px] text-emerald-300">
              {props.issue.discussionThreads.filter((t) => t.resolved).length} 条已收敛结论
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              props.onClose()
              taskboard.openDiscussion(props.issue.id)
            }}
            class="w-full rounded-lg bg-purple-600 py-1.5 text-[12px] [font-weight:560] text-white hover:bg-purple-500"
          >
            💬 进入需求讨论室 (@多Agent)
          </button>
        </div>

        <div class="space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-950/15 p-3">
          <div class="flex items-center justify-between text-[12px]">
            <span class="[font-weight:560] text-emerald-300">⚡ 绑定编码执行会话 (Worktree)</span>
            <span class="font-mono text-[11px] text-emerald-400">{props.issue.worktree}</span>
          </div>
          <div class="flex gap-2">
            <button
              type="button"
              onClick={() => {
                props.onClose()
                void taskboard.spawnOrOpenExecutionSession(props.issue.id)
              }}
              class="flex-1 rounded-lg bg-emerald-600 py-1.5 text-[12px] [font-weight:560] text-white hover:bg-emerald-500"
            >
              🪟 左讨论 + 右执行双屏打开
            </button>
            <button
              type="button"
              onClick={() => {
                props.onClose()
                void taskboard.spawnOrOpenExecutionSession(props.issue.id, {
                  forceNewSession: true,
                  createNewWorktree: true,
                  sendContextPrompt: true,
                })
              }}
              class="rounded-lg border border-v2-border-border-base bg-v2-background-bg-base px-2.5 py-1.5 text-[11px] text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover"
            >
              + 建 Worktree 会话
            </button>
          </div>
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
  const [agent, setAgent] = createSignal("plan")

  const submit = (openDiscussionImmediately: boolean) => {
    taskboard.createIssue(
      {
        title: title().trim() || "支持将需求讨论结论一键同步到执行会话",
        description: desc(),
        status: col(),
        priority: priority(),
        assigneeAgent: agent(),
      },
      { openDiscussionImmediately },
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
            ➕ 新建 OpenCode Issue (支持直接拉起 @多Agent 讨论室)
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
              placeholder="例如：为 SessionSidebar 增加按关联 Issue 过滤会话能力"
              value={title()}
              onInput={(e) => setTitle(e.currentTarget.value)}
              class="h-9 w-full rounded-lg border border-v2-border-border-base bg-v2-background-bg-deep/50 px-3 text-[12px] text-v2-text-text-base focus:outline-none"
            />
          </div>

          <div>
            <label class="mb-1 block text-[11px] text-v2-text-text-muted">
              需求背景与验收标准 (可留给 @plan 与 @reviewer 协同补充)
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
              <label class="mb-1 block text-[11px] text-v2-text-text-muted">主责 Agent</label>
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
            data-action="submit-issue-and-discuss"
            onClick={() => submit(true)}
            class="rounded-lg bg-purple-600 px-3 py-1.5 text-[12px] [font-weight:560] text-white hover:bg-purple-500"
          >
            创建并进入 @多Agent 讨论
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
