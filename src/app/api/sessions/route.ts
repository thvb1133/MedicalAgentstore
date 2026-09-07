import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { NextRequest } from "next/server";

import { awsCredentials, config, hasAwsCredentials } from "@/lib/server/config";
import type { MeasurementReport } from "@/lib/report";

export const runtime = "nodejs";

/**
 * Measurement history in S3.
 *
 * Only the derived numbers are stored — never a frame of video, never audio.
 * Records are filed under a pseudonymous profile id that the browser
 * generates locally and never links to a name or an account, so what lands in
 * the bucket is a stream of anonymous measurements.
 *
 * Trend over time is the point. A single webcam heart rate is a curiosity; the
 * same measurement every day for a month, compared against the person's own
 * baseline, is the thing that could actually be useful.
 */

const MAX_HISTORY = 60;

/** Profile ids come from the client, so they must be constrained here. */
function isValidProfileId(id: string): boolean {
  return /^[a-z0-9-]{8,64}$/.test(id);
}

function keyFor(profileId: string, agentSlug: string, takenAt: string): string {
  const safeSlug = agentSlug.replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "unknown";
  const stamp = new Date(takenAt).toISOString().replace(/[:.]/g, "-");
  return `profiles/${profileId}/${safeSlug}/${stamp}.json`;
}

function unavailable() {
  return Response.json(
    {
      error:
        "Session history is not configured. Set the AWS credentials and SANJIVANI_SESSION_BUCKET to enable it.",
    },
    { status: 503 },
  );
}

export async function POST(req: NextRequest) {
  if (!hasAwsCredentials() || !config.sessionBucket) return unavailable();

  let profileId: string;
  let report: MeasurementReport;
  try {
    const body = (await req.json()) as { profileId?: string; report?: MeasurementReport };
    profileId = body.profileId ?? "";
    report = body.report as MeasurementReport;
  } catch {
    return Response.json({ error: "Malformed request body." }, { status: 400 });
  }

  if (!isValidProfileId(profileId)) {
    return Response.json({ error: "Invalid profile id." }, { status: 400 });
  }
  if (!report?.agentSlug || !Array.isArray(report.metrics)) {
    return Response.json({ error: "Invalid report." }, { status: 400 });
  }

  const s3 = new S3Client(awsCredentials());
  const takenAt = report.takenAt ?? new Date().toISOString();

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: config.sessionBucket,
        Key: keyFor(profileId, report.agentSlug, takenAt),
        Body: JSON.stringify({ ...report, takenAt }),
        ContentType: "application/json",
        ServerSideEncryption: "AES256",
      }),
    );
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: `Could not save session: ${message}` }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  if (!hasAwsCredentials() || !config.sessionBucket) return unavailable();

  const profileId = req.nextUrl.searchParams.get("profileId") ?? "";
  const agentSlug = req.nextUrl.searchParams.get("agent") ?? "";

  if (!isValidProfileId(profileId)) {
    return Response.json({ error: "Invalid profile id." }, { status: 400 });
  }

  const prefix = agentSlug
    ? `profiles/${profileId}/${agentSlug.replace(/[^a-z0-9-]/gi, "")}/`
    : `profiles/${profileId}/`;

  const s3 = new S3Client(awsCredentials());

  try {
    const listed = await s3.send(
      new ListObjectsV2Command({
        Bucket: config.sessionBucket,
        Prefix: prefix,
        MaxKeys: MAX_HISTORY,
      }),
    );

    const keys = (listed.Contents ?? [])
      .filter((o) => o.Key)
      .sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0))
      .slice(0, MAX_HISTORY)
      .map((o) => o.Key as string);

    const reports = await Promise.all(
      keys.map(async (Key) => {
        try {
          const obj = await s3.send(
            new GetObjectCommand({ Bucket: config.sessionBucket, Key }),
          );
          const text = await obj.Body?.transformToString();
          return text ? (JSON.parse(text) as MeasurementReport) : null;
        } catch {
          return null;
        }
      }),
    );

    return Response.json({ reports: reports.filter(Boolean) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: `Could not load history: ${message}` },
      { status: 502 },
    );
  }
}
