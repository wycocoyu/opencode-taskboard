import { describe, expect, test } from "bun:test"
import { Message } from "@opencode/ai"
import { extractDiscussionContext } from "./taskboard.js"

describe("TaskboardPlugin", () => {
  test("extractDiscussionContext finds the latest <discussion_context> block in user messages", () => {
    const messages = [
      Message.user("Hello"),
      Message.user(
        `<discussion_context issue="OC-101" title="实现项目看板与 @多Agent 需求讨论区">\n<conclusion id="d2" author="plan">采用双层架构</conclusion>\n</discussion_context>\n\n请开始执行`,
      ),
    ]

    const extracted = extractDiscussionContext(messages)
    expect(extracted).toBeDefined()
    expect(extracted?.issueID).toBe("OC-101")
    expect(extracted?.xml).toContain(`<conclusion id="d2" author="plan">采用双层架构</conclusion>`)
  })

  test("extractDiscussionContext returns undefined when no <discussion_context> block is present", () => {
    const messages = [Message.user("Normal prompt without discussion context")]
    expect(extractDiscussionContext(messages)).toBeUndefined()
  })
})
