import "server-only";

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

export const config = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  /** Sonnet is the right trade-off here: fast enough to feel live, strong enough to reason about numbers. */
  claudeModel: process.env.CLAUDE_MODEL ?? "claude-sonnet-4-5-20250929",
  awsRegion: process.env.AWS_REGION ?? "eu-west-2",
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
  /** Optional: leave unset to keep sessions in the browser only. */
  sessionBucket: process.env.SANJIVANI_SESSION_BUCKET ?? "",
  pollyVoice: process.env.POLLY_VOICE_ID ?? "Amy",
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
