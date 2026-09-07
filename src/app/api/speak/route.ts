import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { NextRequest } from "next/server";

import { awsCredentials, config, hasAwsCredentials } from "@/lib/server/config";

export const runtime = "nodejs";

/** Long enough for a full interpretation, short enough to bound the bill. */
const MAX_CHARS = 3000;

/**
 * Escape text before it goes inside an SSML document.
 *
 * Claude's replies are plain prose, but they routinely contain an ampersand or
 * an angle bracket, and either one turns a valid SSML document into a parse
 * error and a 400 from Polly. Escaping is also what stops a reply that happens
 * to contain markup from being interpreted as SSML tags.
 */
function escapeSsml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Amazon Polly text-to-speech.
 *
 * Neural voices are used because the standard ones read numbers with an
 * unnatural cadence, and this endpoint mostly reads numbers. Audio is
 * returned as a plain MP3 body rather than base64 JSON so the browser can
 * stream it straight into an <audio> element.
 */
export async function POST(req: NextRequest) {
  if (!hasAwsCredentials()) {
    return Response.json(
      { error: "Speech is not configured. Set the AWS credentials to enable Polly." },
      { status: 503 },
    );
  }

  let text: string;
  let voice: string;
  let rate: number;
  try {
    const body = (await req.json()) as { text?: string; voice?: string; rate?: number };
    text = (body.text ?? "").trim();
    voice = body.voice || config.pollyVoice;
    rate = typeof body.rate === "number" ? body.rate : 100;
  } catch {
    return Response.json({ error: "Malformed request body." }, { status: 400 });
  }

  if (!text) {
    return Response.json({ error: "Nothing to speak." }, { status: 400 });
  }
  if (text.length > MAX_CHARS) text = `${text.slice(0, MAX_CHARS)}…`;

  // Bounded here as well as in the client, because this endpoint is reachable
  // on its own and a prosody rate of 5% would produce minutes of audio from a
  // single sentence.
  rate = Math.min(125, Math.max(60, Math.round(rate)));

  const polly = new PollyClient(awsCredentials());

  const useSsml = rate !== 100;
  const speak = (engine: "neural" | "standard") =>
    polly.send(
      new SynthesizeSpeechCommand({
        Text: useSsml ? `<speak><prosody rate="${rate}%">${escapeSsml(text)}</prosody></speak>` : text,
        TextType: useSsml ? "ssml" : "text",
        OutputFormat: "mp3",
        VoiceId: voice as never,
        Engine: engine,
      }),
    );

  try {
    /**
     * Neural first, standard as a fallback.
     *
     * Polly's neural coverage varies by language and changes over time, and a
     * voice that has no neural model returns a hard error rather than quietly
     * degrading. Falling back keeps a language working — a flatter voice is a
     * far smaller problem than a companion that cannot speak at all to the
     * person who chose that language.
     */
    let result;
    try {
      result = await speak("neural");
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (!/engine|not supported|ValidationException/i.test(message)) throw err;
      result = await speak("standard");
    }

    if (!result.AudioStream) {
      return Response.json({ error: "Polly returned no audio." }, { status: 502 });
    }

    const bytes = await result.AudioStream.transformToByteArray();
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: `Polly request failed: ${message}` }, { status: 502 });
  }
}
