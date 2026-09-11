import "server-only";

import { readSetting } from "@/lib/env";

/**
 * Server configuration, read once from the environment.
 *
 * Nothing here is ever sent to the browser. The Anthropic key in particular
 * only exists inside route handlers — the client talks to our own endpoints,
 * never to Anthropic directly, so the key cannot leak through the network tab.
 */

export interface ServiceAvailability {
  claude: boolean;
  polly: boolean;
  s3: boolean;
  transcribe: boolean;
}

const read = (name: string, fallback = "") => readSetting(process.env, name, fallback);

export const config = {
  anthropicApiKey: read("ANTHROPIC_API_KEY"),
  /** Sonnet is the right trade-off here: fast enough to feel live, strong enough to reason about numbers. */
  claudeModel: read("CLAUDE_MODEL", "claude-sonnet-4-5-20250929"),
  /**
   * No default. A guessed region is worse than a missing one: the credentials
   * are valid, so the request is signed and sent, and it fails somewhere on
   * another continent for reasons that have nothing to do with the region.
   * Unset means AWS is simply reported as not configured.
   */
  awsRegion: read("AWS_REGION"),
  awsAccessKeyId: read("AWS_ACCESS_KEY_ID"),
  awsSecretAccessKey: read("AWS_SECRET_ACCESS_KEY"),
  /** Optional: leave unset to keep sessions in the browser only. */
  sessionBucket: read("SANJIVANI_SESSION_BUCKET"),
  pollyVoice: read("POLLY_VOICE_ID", "Amy"),
} as const;

export function hasAwsCredentials(): boolean {
  return Boolean(config.awsAccessKeyId && config.awsSecretAccessKey && config.awsRegion);
}

export function awsCredentials() {
  return {
    region: config.awsRegion,
    credentials: {
      accessKeyId: config.awsAccessKeyId,
      secretAccessKey: config.awsSecretAccessKey,
    },
  };
}

export function availability(): ServiceAvailability {
  const aws = hasAwsCredentials();
  return {
    claude: Boolean(config.anthropicApiKey),
    polly: aws,
    transcribe: aws,
    s3: aws && Boolean(config.sessionBucket),
  };
}
