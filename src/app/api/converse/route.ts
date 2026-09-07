import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

import { config } from "@/lib/server/config";
import {
  buildSystemPrompt,
  describeContext,
  type ConversationTurn,
  type ConverseRequest,
  type LiveContext,
} from "@/lib/conversation";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Keeps a long session inside the context window and the latency budget. */
const MAX_TURNS = 20;

/** Long enough for a real answer, short enough to stay a conversation. */
const MAX_TOKENS = 400;

/** A single spoken turn should never be longer than this. */
const MAX_USER_CHARS = 2000;


function isTurn(value: unknown): value is ConversationTurn {
  if (typeof value !== "object" || value === null) return false;
  const t = value as Partial<ConversationTurn>;
  return (t.role === "user" || t.role === "assistant") && typeof t.text === "string";
}

export async function POST(req: NextRequest) {
  if (!config.anthropicApiKey) {
    return Response.json(
      { error: "Claude is not configured. Set ANTHROPIC_API_KEY to enable the conversation." },
      { status: 503 },
    );
  }

  let body: ConverseRequest;
  try {
    body = (await req.json()) as ConverseRequest;
  } catch {
    return Response.json({ error: "Malformed request body." }, { status: 400 });
  }

  const turns = Array.isArray(body.messages) ? body.messages.filter(isTurn) : [];
  if (turns.length === 0) {
    return Response.json({ error: "No conversation turns supplied." }, { status: 400 });
  }
  if (turns[turns.length - 1].role !== "user") {
    return Response.json({ error: "The last turn must be from the user." }, { status: 400 });
  }

  const context: LiveContext = body.context ?? { vitals: null, voice: null, sessionSeconds: 0 };

  // Trim to the recent window, and cap each turn, so neither a long session
  // nor a single pasted wall of text can crowd out the system prompt.
  const recent = turns.slice(-MAX_TURNS).map((t) => ({
    role: t.role,
    text: t.text.slice(0, MAX_USER_CHARS),
  }));

  /**
   * The sensor block rides on the final user turn rather than in the system
   * prompt, because it changes every turn while the system prompt is meant to
   * be stable. It is fenced and labelled so the model treats it as instrument
   * output rather than as something the person said — without that boundary,
   * text arriving from speech recognition could be read as instructions.
   */
  const messages = recent.map((t, i) => {
    if (i !== recent.length - 1) return { role: t.role, content: t.text };
    return {
      role: t.role,
      content: `<sensors>\n${describeContext(context)}\n</sensors>\n\nThe person said: ${t.text}`,
    };
  });

  const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

  try {
    const stream = anthropic.messages.stream({
      model: config.claudeModel,
      max_tokens: MAX_TOKENS,
      // Warmer than the interpretation route, which reads a static report.
      // This one has to sound like a person without inventing anything.
      temperature: 0.6,
      system: buildSystemPrompt(typeof body.persona === "string" ? body.persona : undefined),
      messages,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
        } catch (err) {
          controller.enqueue(
            encoder.encode(
              `\n\n[The reply was cut short: ${err instanceof Error ? err.message : "stream error"}]`,
            ),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: `Claude request failed: ${message}` }, { status: 502 });
  }
}
