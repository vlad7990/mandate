import { NextResponse } from "next/server";
import { getAnthropic } from "@/lib/anthropic";
import {
  COPILOT_MODEL,
  COPILOT_SYSTEM_PROMPT,
  type CopilotMessage,
} from "@/lib/ai/copilot-agent";
import { loadCopilotProjectContext } from "@/lib/ai/copilot-context";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CopilotRequestBody = {
  projectId: string;
  candidateId: string | null;
  messages: CopilotMessage[];
};

/**
 * Streaming Copilot endpoint. Returns text/event-stream chunks shaped
 * for the panel's incremental renderer:
 *   data: {"delta":"<text fragment>"}\n\n
 *   data: {"done":true}\n\n
 *
 * On error: data: {"error":"..."}\n\n followed by [DONE].
 */
export async function POST(req: Request): Promise<Response> {
  let body: CopilotRequestBody;
  try {
    body = (await req.json()) as CopilotRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { projectId, candidateId, messages } = body;
  if (!projectId || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "projectId and at least one message are required" },
      { status: 400 }
    );
  }

  const context = await loadCopilotProjectContext(
    projectId,
    candidateId ?? null
  );
  if (!context) {
    return NextResponse.json(
      { error: "Project not accessible" },
      { status: 403 }
    );
  }

  const system = await applySkillsToPrompt(COPILOT_SYSTEM_PROMPT, {
    projectId,
    organizationId:
      ((context.project as { organization_id?: string })?.organization_id ??
        null) || null,
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
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Copilot failed.";
        send({ error: msg });
      } finally {
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
