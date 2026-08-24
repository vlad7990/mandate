import { NextResponse } from "next/server";
import { getAnthropic } from "@/lib/anthropic";
import {
  COPILOT_MODEL,
  COPILOT_SYSTEM_PROMPT,
  suggestionContextForPath,
  type CopilotMessage,
} from "@/lib/ai/copilot-agent";
import {
  authorizeCopilotAccess,
  loadCopilotProjectContext,
} from "@/lib/ai/copilot-context";
import { signInCopilotAgent } from "@/lib/agents/session";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";
import { captureSeamError } from "@/lib/observability/sentry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CopilotRequestBody = {
  projectId: string;
  candidateId: string | null;
  messages: CopilotMessage[];
  /** Panel pathname — resolves the event's context string. */
  pathname?: string;
};

/** One SSE-shaped stream carrying a single error frame — the panel's
 * existing "⚠" bubble renders it verbatim (D5). */
function sseErrorResponse(message: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`)
      );
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

/**
 * Streaming Copilot endpoint. Returns text/event-stream chunks shaped
 * for the panel's incremental renderer:
 *   data: {"delta":"<text fragment>"}\n\n
 *   data: {"done":true}\n\n
 *
 * On error: data: {"error":"..."}\n\n followed by [DONE].
 *
 * The split (094: D2): the caller's cookie session answers "may this
 * user ask about this project" at the threshold; the judgment —
 * snapshot assembly, skills, the model stream, the trail event —
 * runs under the COPILOT AGENT's own session, which signs out when
 * the stream closes and persists nothing. History is client-side by
 * design. A failed or aborted stream records no event: no answer
 * landed, so there is nothing to attribute.
 */
export async function POST(req: Request): Promise<Response> {
  let body: CopilotRequestBody;
  try {
    body = (await req.json()) as CopilotRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { projectId, candidateId, messages, pathname } = body;
  if (!projectId || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "projectId and at least one message are required" },
      { status: 400 }
    );
  }

  // The HUMAN door — before any agent exists.
  const auth = await authorizeCopilotAccess(projectId);
  if (!auth) {
    return NextResponse.json(
      { error: "Project not accessible" },
      { status: 403 }
    );
  }

  // The agent, refused honestly BEFORE any model spend (D5).
  const session = await signInCopilotAgent();
  if (!session.ok) {
    console.error(
      `[copilot] The Copilot Agent could not run — an operator has ` +
        `suspended it or its credentials are absent. (${session.reason})`
    );
    return sseErrorResponse(
      "The Copilot Agent could not run — an operator has suspended it or " +
        "its credentials are absent. Your conversation is safe on this " +
        "device; ask again when it is restored."
    );
  }

  const context = await loadCopilotProjectContext(
    projectId,
    candidateId ?? null,
    session.client
  );
  if (!context) {
    await session.signOut();
    return sseErrorResponse(
      "The project context could not be loaded — it may be outside this " +
        "workspace."
    );
  }

  // Skills ride the AGENT's session (094: D6 — the §50 doctrine).
  const system = await applySkillsToPrompt(COPILOT_SYSTEM_PROMPT, {
    projectId,
    organizationId: auth.organizationId,
    client: session.client,
  });

  // Front-load the snapshot as a system-style block embedded in the
  // first user message. We could put it in `system` but then prompt
  // caching would fragment per-snapshot — keeping it in the user
  // turn is simpler.
  const snapshotMessage: CopilotMessage = {
    role: "user",
    content: `<project_snapshot>\n${JSON.stringify(context, null, 2)}\n</project_snapshot>\n\n${messages[0]?.content ?? ""}`,
  };
  const upstreamMessages: CopilotMessage[] = [
    snapshotMessage,
    ...messages.slice(1),
  ];

  const anthropic = getAnthropic();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
        );
      };
      try {
        const upstream = await anthropic.messages.create({
          model: COPILOT_MODEL,
          max_tokens: 1500,
          system,
          messages: upstreamMessages,
          stream: true,
        });

        for await (const event of upstream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            send({ delta: event.delta.text });
          }
        }
        send({ done: true });

        // The trail (094: D4): one event per ANSWERED turn — the
        // context string and COUNTS, never the question or the answer.
        const candidateCount = Array.isArray(
          (context as { candidates?: unknown[] }).candidates
        )
          ? (context as { candidates: unknown[] }).candidates.length
          : 0;
        const { error: eventErr } = await session.client.rpc(
          "record_agent_event",
          {
            p_event_type: "copilot_answered",
            p_project_id: projectId,
            p_detail: {
              agent_kind: "copilot",
              context: suggestionContextForPath(pathname ?? ""),
              messages: messages.length,
              candidates: candidateCount,
              focused: Boolean(candidateId),
            },
          }
        );
        if (eventErr) {
          captureSeamError(
            "[copilot] failed to record the answer event",
            eventErr
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Copilot failed.";
        send({ error: msg });
      } finally {
        // Persist nothing (D3): revoke the run's session from GoTrue's
        // ledger before the stream closes.
        await session.signOut();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
