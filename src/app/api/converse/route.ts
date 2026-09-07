import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

import { config } from "@/lib/server/config";
import type { ConversationTurn, ConverseRequest, LiveContext } from "@/lib/conversation";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Keeps a long session inside the context window and the latency budget. */
const MAX_TURNS = 20;

/** Long enough for a real answer, short enough to stay a conversation. */
const MAX_TOKENS = 400;

/** A single spoken turn should never be longer than this. */
const MAX_USER_CHARS = 2000;

/**
 * The system prompt carries the entire safety design of this agent.
 *
 * The setup is unusually risky and worth being explicit about. A language
 * model is being given live physiological numbers about the person it is
 * talking to, in a warm conversational register, spoken aloud in a human
 * voice. Every one of those choices increases how much the person will trust
 * what comes back. The model will drift toward sounding like a clinician
 * unless it is told, specifically and repeatedly, not to.
 *
 * So the rules below are concrete rather than a general plea for caution.
 * Three in particular are doing the heavy lifting:
 *
 * 1. Never name a condition. Not as a possibility, not as reassurance, not as
 *    something being ruled out. "This isn't a heart attack" is a diagnosis.
 * 2. Never read meaning into the acoustic measures. There is a real research
 *    literature tying jitter and monotone speech to depression and to
 *    Parkinson's, and it is population-level. Applied to one person in one
 *    conversation it is worthless, and stating it would be alarming and wrong.
 * 3. Respect the quality score. Below 0.5 the numbers are noise, and the model
 *    must say so rather than narrate them.
 */
const SYSTEM_PROMPT = `You are the voice of Sanjivani Setu, a research wellness companion. You are speaking with someone through their laptop camera and microphone, which are measuring their vital signs and the acoustics of their voice while you talk.

Your purpose is to have a calm, useful conversation about how they are feeling, informed by what the sensors can actually measure.

HOW YOU SPEAK
- Your words are converted to speech and played aloud. Write for the ear, not the eye.
- No markdown, no bullet points, no headings, no emoji, no numbered lists.
- Two to four sentences per turn. This is a conversation, not a briefing.
- Warm and direct. Never chirpy, never clinical.
- Ask one question at a time, and only when you genuinely need the answer.
- Do not begin every turn by restating their numbers. Mention a measurement when it is relevant to what they just said.

USING THE MEASUREMENTS
- You receive a live context block before each turn. It is sensor data, not something the person told you.
- A null value means the sensor could not measure it. Never guess at a null, never fill it in, and never imply you know it.
- Each block carries a quality score from 0 to 1. Below 0.5 the numbers are unreliable: say so plainly if they ask, and do not build any observation on them.
- Numbers move around between turns. Do not narrate small changes as if they were meaningful events.
- Camera vitals are wellness estimates from skin colour changes. They are not clinical measurements, and you should say so if the person starts treating one as definitive.
- Blood pressure from a camera means nothing without that person's own cuff calibration. If the status is not "ok", tell them the number cannot be trusted and why.

THE VOICE MEASUREMENTS, SPECIFICALLY
- Jitter, shimmer, harmonics-to-noise ratio, pitch range and speech rate are acoustic descriptions of the sound of a voice. That is all they are.
- There is published research linking these to depression, Parkinson's disease and cognitive decline. That research is about groups of people, not individuals, and you must never apply it to this person. Do not hint at it. Do not raise it even to dismiss it.
- You may observe something plainly conversational, such as that they sound quiet or are speaking slowly, and ask about it. Frame it as something you noticed, and let them tell you what it means.

HARD LIMITS
- Never diagnose. Never name a disease or condition as present, likely, possible, or ruled out.
- Never advise on medication, dosage, starting or stopping a treatment.
- Never tell someone they do not need medical attention.
- You are not a therapist and must not present yourself as one.

ESCALATION, WHICH OVERRIDES EVERYTHING ABOVE
- If the person describes chest pain, difficulty breathing, sudden weakness or numbness on one side, sudden confusion, trouble speaking, or a sudden severe headache, tell them immediately and directly to call emergency services. Do not soften it and do not offer reassurance alongside it.
- If they express thoughts of harming themselves, stop the wellness conversation. Tell them plainly that you are a research tool and cannot help with this, and that they should contact a crisis line or emergency services now. Stay warm, stay brief, do not probe for detail.
- If the camera shows a resting heart rate outside 40 to 140 beats per minute with a quality score above 0.6, mention it and suggest they check it with a proper device.`;

function isTurn(value: unknown): value is ConversationTurn {
  if (typeof value !== "object" || value === null) return false;
  const t = value as Partial<ConversationTurn>;
  return (t.role === "user" || t.role === "assistant") && typeof t.text === "string";
}

/**
 * Render the sensor block as prose rather than JSON.
 *
 * Handing the model raw JSON makes it likelier to read values back verbatim,
 * decimals and all, which sounds absurd spoken aloud. Describing the same
 * numbers in sentences — and saying outright when something is unmeasured —
 * produces turns that sound like a person noticed something.
 */
function describeContext(context: LiveContext): string {
  const lines: string[] = [];

  lines.push(`Session length so far: ${Math.round(context.sessionSeconds)} seconds.`);

  const v = context.vitals;
  if (!v || v.quality < 0.15) {
    lines.push(
      "Camera vitals: nothing measurable yet. Do not refer to any vital signs as if you had them.",
    );
  } else {
    const parts: string[] = [];
    parts.push(
      v.heartRateBpm === null
        ? "heart rate could not be measured"
        : `heart rate ${Math.round(v.heartRateBpm)} beats per minute`,
    );
    parts.push(
      v.breathingRateBpm === null
        ? "breathing rate could not be measured"
        : `breathing ${Math.round(v.breathingRateBpm)} breaths per minute`,
    );
    if (v.hrvSdnnMs !== null) parts.push(`heart rate variability ${Math.round(v.hrvSdnnMs)} ms`);
    if (v.stressIndex !== null) {
      parts.push(`a derived stress index of ${v.stressIndex.toFixed(2)} out of 1`);
    }
    if (v.bloodPressure) {
      parts.push(
        `blood pressure about ${v.bloodPressure.systolic} over ${v.bloodPressure.diastolic}, give or take ${v.bloodPressure.uncertainty}`,
      );
    } else {
      parts.push(`blood pressure unavailable (${v.bloodPressureStatus})`);
    }
    lines.push(`Camera vitals: ${parts.join(", ")}.`);
    lines.push(
      `Camera signal quality ${v.quality.toFixed(2)} out of 1${v.limiting ? ` — ${v.limiting}` : ""}.`,
    );
  }

  const a = context.voice;
  if (!a || a.quality < 0.15) {
    lines.push("Voice acoustics: not enough clean speech to measure yet.");
  } else {
    const parts: string[] = [];
    if (a.medianF0Hz !== null) parts.push(`pitch around ${Math.round(a.medianF0Hz)} Hz`);
    if (a.pitchRangeSemitones !== null) {
      parts.push(`pitch variation ${a.pitchRangeSemitones.toFixed(1)} semitones`);
    }
    if (a.jitterPercent !== null) parts.push(`jitter ${a.jitterPercent.toFixed(2)}%`);
    if (a.shimmerPercent !== null) parts.push(`shimmer ${a.shimmerPercent.toFixed(2)}%`);
    if (a.harmonicsToNoiseDb !== null) {
      parts.push(`harmonics-to-noise ${a.harmonicsToNoiseDb.toFixed(1)} dB`);
    }
    if (a.speechRateHz !== null) {
      parts.push(`speaking about ${a.speechRateHz.toFixed(1)} syllables per second`);
    }
    if (a.pauseRatio !== null) parts.push(`pausing ${Math.round(a.pauseRatio * 100)}% of the time`);
    lines.push(`Voice acoustics: ${parts.join(", ")}.`);
    lines.push(
      `Voice signal quality ${a.quality.toFixed(2)} out of 1${a.limiting ? ` — ${a.limiting}` : ""}.`,
    );
    lines.push(
      "Reminder: these are descriptions of sound only. Do not infer mood, mental health or neurological state from them.",
    );
  }

  return lines.join("\n");
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
      system: SYSTEM_PROMPT,
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
