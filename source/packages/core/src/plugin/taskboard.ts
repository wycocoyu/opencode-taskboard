export * as TaskboardPlugin from "./taskboard.js"

import { Message } from "@opencode/ai"
import { define } from "@opencode/plugin/effect/plugin"
import { Effect } from "effect"

const DISCUSSION_CONTEXT_REGEX = /<discussion_context\s+issue="([^"]+)"[\s\S]*?<\/discussion_context>/

export function extractDiscussionContext(messages: ReadonlyArray<Message>): {
  issueID: string
  xml: string
} | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!msg || msg.role !== "user") continue
    for (const part of msg.content) {
      if (part.type !== "text") continue
      const match = part.text.match(DISCUSSION_CONTEXT_REGEX)
      if (match && match[1]) {
        return {
          issueID: match[1],
          xml: match[0],
        }
      }
    }
  }
  return undefined
}

export const Plugin = define({
  id: "opencode.taskboard",
  effect: Effect.fn("TaskboardPlugin")(function* (ctx) {
    yield* ctx.session.hook("context", (event) =>
      Effect.gen(function* () {
        const inline = extractDiscussionContext(event.messages)
        if (inline) {
          yield* ctx.storage.set(`session:${event.sessionID}:issue`, inline.issueID)
          yield* ctx.storage.set(`issue:${inline.issueID}:context`, inline.xml)
          return
        }

        const boundIssueID = yield* ctx.storage.get(`session:${event.sessionID}:issue`)
        if (typeof boundIssueID !== "string" || !boundIssueID) return

        const storedContext = yield* ctx.storage.get(`issue:${boundIssueID}:context`)
        if (typeof storedContext !== "string" || !storedContext.trim()) return

        const at = event.messages.at(-1)?.role === "user" ? event.messages.length - 1 : event.messages.length
        event.messages.splice(at, 0, Message.user(storedContext))
      }).pipe(Effect.catch(() => Effect.void)),
    )
  }),
})
