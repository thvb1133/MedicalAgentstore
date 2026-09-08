/**
 * Where things live when the site is not at the root of a domain.
 *
 * GitHub Pages serves a project site under `/<repo>/`, and Next only rewrites
 * the paths it controls: `<Link>`, the router, the files it emits itself.
 * Anything we hand to `fetch`, to `audioWorklet.addModule`, to an `<img src>`
 * or to MediaPipe's fileset resolver is a string we wrote, and Next never
 * sees it. Those are exactly the paths that carry the models, the capture
 * worklet and the presenter photographs — so under a base path the site
 * renders perfectly and every sensor silently fails to load.
 *
 * Hence one helper, used at every such point, and a test that walks the
 * source looking for absolute public paths that skipped it.
 */

/** Set at build time. "" for a root deployment, "/repo" for a project page. */
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");

/**
 * True when the build has no server behind it.
 *
 * A static export keeps every measurement — all of that is arithmetic in the
 * browser — and loses exactly the parts that need a secret: Claude's replies,
 * Polly's voice, the S3 mirror. The interface already hides unconfigured
 * services, and this flag lets it say *why* they are missing rather than
 * leaving somebody to wonder what broke.
 */
export const STATIC_BUILD = process.env.NEXT_PUBLIC_STATIC_BUILD === "1";

/**
 * What to say when somebody asks for a reply and there is nothing to answer.
 *
 * Specific about the cause, because "something went wrong" would send people
 * looking for a fault in a build that is working exactly as it was published.
 */
export const NO_SERVER =
  "This is the hosted demonstration build, which has no API keys behind it, so the assistant cannot reply here. Every measurement on this site still runs — all of it happens in your browser. Run it locally with your own Claude key for the conversation.";

/** A file under `public/`, resolved against the base path. */
export function asset(path: string): string {
  return `${BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * A route handler, or null when this build has none.
 *
 * Null rather than a URL that 404s, so callers have to decide what to do
 * without a server instead of discovering it from a failed request.
 */
export function api(path: string): string | null {
  if (STATIC_BUILD) return null;
  return asset(path);
}
