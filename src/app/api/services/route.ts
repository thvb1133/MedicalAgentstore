import { availability } from "@/lib/server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Which cloud services are actually wired up.
 *
 * The client uses this to hide features rather than let the user press a
 * button that will fail. Only booleans are returned — never a key, never a
 * region, never a bucket name.
 */
export async function GET() {
  return Response.json(availability(), {
    headers: { "Cache-Control": "no-store" },
  });
}
