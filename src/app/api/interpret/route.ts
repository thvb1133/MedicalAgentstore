import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

import { config } from "@/lib/server/config";
import type { InterpretRequest, MeasurementReport } from "@/lib/report";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * The system prompt is the safety layer.
 *
 * Claude is being handed physiological numbers and asked to talk about them,
 * which is exactly the situation where a language model will drift towards
 * sounding like a doctor. The constraints below are therefore specific and
 * non-negotiable rather than a general "be careful" instruction: name the
 * measurement, respect the confidence score, never diagnose, and escalate to
 * emergency care for a defined set of findings.
 */
const SYSTEM_PROMPT = `You are the interpretation layer of Sanjivani Setu, a research tool that measures physiological signals using an ordinary laptop camera.

You receive a measurement report as JSON and explain it to the person who was measured.

HOW TO WRITE
- Plain language. No jargon without immediately explaining it.
- Two or three short paragraphs. No headings, no bullet lists, no markdown.
- Address the person directly as "you".
- Lead with what the numbers say, then what they do not say.

RESPECTING UNCERTAINTY
- The report carries a quality score from 0 to 1. Below 0.5, say plainly that the measurement is not reliable enough to draw anything from, and explain what would improve it. Do not interpret the numbers as if they were solid.
- Any metric whose value is null was deliberately withheld by the system because it could not be measured well. Never guess at it or fill it in.
- Never state a number more precisely than the report gives it.

HARD LIMITS
- You must never diagnose, name a likely disease, or suggest that a condition is present or absent.
- You must never advise on medication, dosage, or whether to seek or avoid treatment, beyond the escalation rule below.
- Webcam vitals are wellness estimates, not clinical measurements. Say so when the person appears to be treating a number as definitive.
- Blood pressure from a camera is only meaningful against that person's own cuff calibration. If the report shows it uncalibrated or stale, say the number cannot be trusted and why.

ESCALATION
- If the report contains signs of a possible stroke, or a heart rate outside 40-140 beats per minute at rest with good signal quality, open your response by telling the person to contact emergency medical services now. Be direct, do not soften it, and do not offer reassurance alongside it.

If the person asks a question, answer that question specifically rather than restating the whole report.`;

function validateReport(report: unknown): report is MeasurementReport {
  if (typeof report !== "object" || report === null) return false;
  const r = report as Partial<MeasurementReport>;
  return (
    typeof r.agentSlug === "string" &&
    typeof r.agentName === "string" &&
    typeof r.quality === "number" &&
    Array.isArray(r.metrics)
  );
}

export async function POST(req: NextRequest) {
  if (!config.anthropicApiKey) {
    return Response.json(
      {
        error:
          "Claude is not configured. Set ANTHROPIC_API_KEY to enable interpretation.",
      },
      { status: 503 },
    );
  }

  let body: InterpretRequest;
  try {
    body = (await req.json()) as InterpretRequest;
  } catch {
    return Response.json({ error: "Malformed request body." }, { status: 400 });
  }

  if (!validateReport(body.report)) {
    return Response.json({ error: "Missing or invalid report." }, { status: 400 });
  }

  // Cap the free-text question so a long paste cannot be used to steer the
  // model away from the system prompt with sheer volume.
  const question =
    typeof body.question === "string" ? body.question.slice(0, 500).trim() : "";

  const history = Array.isArray(body.history) ? body.history.slice(-5) : [];

  const userContent = [
    `Measurement report:\n${JSON.stringify(body.report, null, 2)}`,
    history.length > 0
      ? `Earlier reports from the same agent, oldest first:\n${JSON.stringify(history, null, 2)}`
      : null,
    question ? `The person asks: ${question}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

  try {
    const stream = anthropic.messages.stream({
      model: config.claudeModel,
      max_tokens: 700,
      temperature: 0.3,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
        } catch (err) {
          controller.enqueue(
            encoder.encode(
              `\n\n[Interpretation was cut short: ${
                err instanceof Error ? err.message : "stream error"
              }]`,
            ),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: `Claude request failed: ${message}` },
      { status: 502 },
    );
  }
}
