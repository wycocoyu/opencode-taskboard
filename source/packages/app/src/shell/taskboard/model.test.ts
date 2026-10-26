import { describe, expect, test } from "bun:test"
import {
  addCustomAgentProfile,
  appendDiscussionThread,
  bindSessionToIssue,
  buildDiscussionContextXml,
  buildExecutionPromptFromIssue,
  buildIssueComposerDraft,
  createDefaultTaskboardState,
  createIssue,
  deleteIssue,
  findIssueBySessionId,
  parseLeadingAgentMention,
  toggleThreadResolved,
  unbindSessionFromIssue,
  updateIssueDetails,
  updateIssueStatus,
} from "./model"

describe("taskboard model", () => {
  test("creates default state with 5 kanban columns and initial OC-101..OC-105 issues", () => {
    const state = createDefaultTaskboardState()
    expect(state.viewMode).toBe("sessions")
    expect(state.activeIssueId).toBe("OC-101")
    expect(state.issues.length).toBeGreaterThanOrEqual(5)
    const oc101 = state.issues.find((i) => i.id === "OC-101")
    expect(oc101).toBeDefined()
    expect(oc101?.discussionThreads.filter((t) => t.resolved).length).toBe(2)
  })

  test("createIssue auto-increments OC-xxx key, seeds initial @Agent discussion thread, and updates activeIssueId", () => {
    const initial = createDefaultTaskboardState()
    const next = createIssue(initial, {
      title: "支持讨论串结论同步至验收清单",
      description: "将标为结论的内容同步到 Issue 验收标准",
      status: "todo",
      priority: "P0",
      assigneeAgent: "plan",
      seedDiscussion: true,
    })

    expect(next.issues[0]?.id).toBe("OC-106")
    expect(next.activeIssueId).toBe("OC-106")
    expect(next.issues[0]?.status).toBe("todo")
    expect(next.issues[0]?.priority).toBe("P0")
    expect(next.issues[0]?.assigneeAgent).toBe("plan")
    expect(next.issues[0]?.worktree).toBe(".worktrees/oc-106")
    expect(next.issues[0]?.discussionThreads.length).toBe(1)
    expect(next.issues[0]?.discussionThreads[0]?.targetAgent).toBe("plan")
  })

  test("updateIssueStatus, updateIssueDetails, and deleteIssue maintain clean state", () => {
    let state = createDefaultTaskboardState()
    state = updateIssueStatus(state, "OC-101", "review")
    expect(state.issues.find((i) => i.id === "OC-101")?.status).toBe("review")

    state = updateIssueDetails(state, "OC-101", {
      title: "更新后的标题",
      priority: "P2",
      assigneeAgent: "reviewer",
    })
    const updated = state.issues.find((i) => i.id === "OC-101")
    expect(updated?.title).toBe("更新后的标题")
    expect(updated?.priority).toBe("P2")
    expect(updated?.assigneeAgent).toBe("reviewer")

    state = deleteIssue(state, "OC-101")
    expect(state.issues.some((i) => i.id === "OC-101")).toBe(false)
    expect(state.activeIssueId).toBe("OC-102")
  })

  test("appendDiscussionThread and toggleThreadResolved support Resolve & Fold conclusion extraction", () => {
    let state = createDefaultTaskboardState()
    state = appendDiscussionThread(state, "OC-102", {
      author: "老板 (Cocoyu)",
      targetAgent: "reviewer",
      question: "@reviewer 检查一下并发写 opencode.db 的安全性",
      replyText: "SQLite KV 在同一进程事务内串行化写入，不存在跨进程锁冲突。",
    })

    const issueBefore = state.issues.find((i) => i.id === "OC-102")!
    const lastThread = issueBefore.discussionThreads[issueBefore.discussionThreads.length - 1]!
    expect(lastThread.resolved).toBe(false)
    expect(lastThread.targetAgent).toBe("reviewer")

    state = toggleThreadResolved(state, "OC-102", lastThread.id)
    const issueAfter = state.issues.find((i) => i.id === "OC-102")!
    const resolvedThread = issueAfter.discussionThreads.find((t) => t.id === lastThread.id)!
    expect(resolvedThread.resolved).toBe(true)
    expect(resolvedThread.conclusion).toContain("SQLite KV")
  })

  test("buildDiscussionContextXml and buildExecutionPromptFromIssue include only folded conclusions", () => {
    const state = createDefaultTaskboardState()
    const oc101 = state.issues.find((i) => i.id === "OC-101")!
    const xml = buildDiscussionContextXml(oc101, "delta")

    expect(xml).toContain('<discussion_context mode="delta" issue="OC-101" worktree=".worktrees/oc-101">')
    expect(xml).toContain('agent="@plan"')
    expect(xml).toContain('agent="@reviewer"')
    // Unresolved thread t-3 (@build) should NOT appear as a folded_conclusion
    expect(xml).not.toContain('agent="@build"')

    const execPrompt = buildExecutionPromptFromIssue(oc101)
    expect(execPrompt).toContain("OC-101")
    expect(execPrompt).toContain("<discussion_context")
    expect(execPrompt).toContain("[已收敛结论]")
  })

  test("bindSessionToIssue and findIssueBySessionId track discussion and execution sessions bidirectionally", () => {
    let state = createDefaultTaskboardState()
    state = bindSessionToIssue(state, "OC-101", {
      kind: "discussion",
      sessionId: "ses_disc_101",
      serverKey: "local",
      directory: "/repo",
    })
    state = bindSessionToIssue(state, "OC-101", {
      kind: "execution",
      sessionId: "ses_exec_101",
      serverKey: "local",
      directory: "/repo/.worktrees/oc-101",
      worktree: ".worktrees/oc-101",
    })

    const discMatch = findIssueBySessionId(state, "ses_disc_101")
    expect(discMatch?.issue.id).toBe("OC-101")
    expect(discMatch?.role).toBe("discussion")

    const execMatch = findIssueBySessionId(state, "ses_exec_101")
    expect(execMatch?.issue.id).toBe("OC-101")
    expect(execMatch?.role).toBe("execution")
    expect(findIssueBySessionId(state, "ses_unknown")).toBeUndefined()

    state = unbindSessionFromIssue(state, "OC-101", "ses_exec_101")
    expect(findIssueBySessionId(state, "ses_exec_101")).toBeUndefined()
    expect(findIssueBySessionId(state, "ses_disc_101")?.issue.id).toBe("OC-101")

    const draft = buildIssueComposerDraft(state.issues.find((i) => i.id === "OC-101")!)
    expect(draft).toContain("[OC-101]")
  })

  test("parseLeadingAgentMention and addCustomAgentProfile support built-in and custom @Agents", () => {
    let state = createDefaultTaskboardState()
    state = addCustomAgentProfile(state, {
      id: "security",
      name: "@security · 安全审计员",
      roleLabel: "安全审计",
      description: "审计 RPC 与权限边界",
      mode: "subagent",
    })

    const parsed = parseLeadingAgentMention("@security 帮我检查一下权限边界", [
      "plan",
      "reviewer",
      "build",
      "coder",
      "security",
    ])
    expect(parsed.agent).toBe("security")
    expect(parsed.cleanText).toBe("帮我检查一下权限边界")
  })
})
