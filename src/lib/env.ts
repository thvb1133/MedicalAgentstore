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

/**
 * The first of several names that has a value, for settings with an alias.
 *
 * The aliases exist because `AWS_ACCESS_KEY_ID` and its siblings are not
 * ordinary variable names on a host that is itself AWS. Amplify, Lambda and
 * anything else running under an execution role populate them with that
 * role's own short-lived credentials, so a deployment can silently end up
 * signing Polly requests as the platform rather than as the account holder —
 * and the failure appears as a permissions error against a principal nobody
 * configured.
 *
 * A prefixed name cannot collide, so it wins where it is set, and the plain
 * name keeps working everywhere else.
 */
export function readFirst(
  env: Record<string, string | undefined>,
  names: string[],
  fallback = "",
): string {
  for (const name of names) {
    const value = readSetting(env, name);
    if (value) return value;
  }
  return fallback;
}
