import { defineHook } from "eve/hooks";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const LOG = ".eve/logs/turns.jsonl";

async function log(line: object) {
  try {
    await mkdir(dirname(LOG), { recursive: true });
    await appendFile(LOG, JSON.stringify({ at: new Date().toISOString(), ...line }) + "\n");
  } catch {
    // 永远不抛出——hook 抛出会升级成 turn.failed
  }
}

export default defineHook({
  events: {
    async "session.started"(event, ctx) {
      await log({
        kind: "session.started",
        sessionId: ctx.session.id,
        agent: ctx.agent.name,
        nodeId: ctx.agent.nodeId,
        channel: ctx.channel.kind,
      });
    },
    async "message.received"(event, ctx) {
      await log({
        kind: "message.received",
        sessionId: ctx.session.id,
        nodeId: ctx.agent.nodeId,
        text: (event.data as any).message?.slice(0, 200),
      });
    },
    async "actions.requested"(event, ctx) {
      const actions = (event.data as any).actions ?? [];
      for (const a of actions) {
        await log({
          kind: "tool.call",
          sessionId: ctx.session.id,
          nodeId: ctx.agent.nodeId,
          tool: a.toolName,
          callId: a.callId,
          inputKeys: a.input ? Object.keys(a.input) : [],
        });
      }
    },
    async "action.result"(event, ctx) {
      const r = (event.data as any).result;
      await log({
        kind: "tool.result",
        sessionId: ctx.session.id,
        nodeId: ctx.agent.nodeId,
        tool: r?.toolName,
        callId: r?.callId,
        status: r?.status,
        isError: !!r?.isError,
      });
    },
    async "message.completed"(event, ctx) {
      await log({
        kind: "message.completed",
        sessionId: ctx.session.id,
        nodeId: ctx.agent.nodeId,
        length: (event.data as any).message?.length ?? 0,
        finishReason: (event.data as any).finishReason,
      });
    },
    async "turn.completed"(event, ctx) {
      await log({
        kind: "turn.completed",
        sessionId: ctx.session.id,
        nodeId: ctx.agent.nodeId,
      });
    },
    async "session.failed"(event, ctx) {
      await log({
        kind: "session.failed",
        sessionId: ctx.session.id,
        nodeId: ctx.agent.nodeId,
        reason: (event.data as any).error?.message ?? "unknown",
      });
    },
  },
});
