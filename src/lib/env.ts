/**
 * Reading a setting out of the environment, defensively.
 *
 * Credentials are pasted, and a pasted credential very often arrives with a
 * leading space or a trailing newline — from a shell here-doc, from a secrets
 * form, from a copy that caught one character too many. None of the values
 * this application reads can legitimately begin or end with whitespace, so
 * trimming costs nothing.
 *
 * It is worth doing because of how the failure presents. A key with a space
 * in front of it is still a key as far as a truthiness check is concerned:
 * the service is reported as configured, the interface offers it, the request
 * is signed and sent, and AWS rejects it with a 400 that the SDK surfaces as
 * `UnknownError` — a message that points at nothing and sends somebody
 * hunting for a permissions problem that does not exist.
 *
 * A value that is nothing but whitespace is treated as absent rather than as
 * an empty configured value, for the same reason: it was meant to be unset.
 */
export function readSetting(
  env: Record<string, string | undefined>,
  name: string,
  fallback = "",
): string {
  const value = env[name]?.trim();
  return value ? value : fallback;
}
