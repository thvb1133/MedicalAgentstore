import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { NextRequest } from "next/server";

import { awsCredentials, config, hasAwsCredentials } from "@/lib/server/config";

export const runtime = "nodejs";

/** Long enough for a full interpretation, short enough to bound the bill. */
const MAX_CHARS = 3000;

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
  try {
    const body = (await req.json()) as { text?: string; voice?: string };
    text = (body.text ?? "").trim();
    voice = body.voice || config.pollyVoice;
  } catch {
    return Response.json({ error: "Malformed request body." }, { status: 400 });
  }

  if (!text) {
    return Response.json({ error: "Nothing to speak." }, { status: 400 });
  }
  if (text.length > MAX_CHARS) text = `${text.slice(0, MAX_CHARS)}…`;

  const polly = new PollyClient(awsCredentials());

  try {
    const result = await polly.send(
      new SynthesizeSpeechCommand({
        Text: text,
        OutputFormat: "mp3",
        VoiceId: voice as never,
        Engine: "neural",
      }),
    );

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
