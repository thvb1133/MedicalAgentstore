import { STATIC_BUILD } from "@/lib/paths";

/**
 * What this copy of the site cannot do, said once, at the top.
 *
 * The published demonstration has no server and therefore no API keys, which
 * removes Claude's replies, Polly's voice and the S3 mirror — and nothing
 * else. Every measurement is unaffected, because none of it ever ran on a
 * server. Somebody who does not know that will read the missing conversation
 * as the whole thing being a mock-up, so the distinction is worth one line
 * across the top rather than a discovery made by clicking.
 */
export function HostedNotice() {
  if (!STATIC_BUILD) return null;

  return (
    <div className="border-b border-[var(--border)] bg-[var(--surface-raised)]">
      <p className="mx-auto max-w-6xl px-5 py-2 text-[12px] leading-relaxed text-[var(--muted)]">
        <span className="font-medium text-[var(--foreground)]">Live demonstration.</span> Every
        measurement here is real and runs entirely in your browser — camera and microphone never
        leave the device. The AI conversation, the neural voice and the cloud history need API
        keys, and a key has to live on a server; this copy is a static site with none, so those
        three are off. Run it on a server of your own with your keys to get them.
      </p>
    </div>
  );
}
