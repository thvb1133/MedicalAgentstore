import { notFound } from "next/navigation";

import { AgentShell } from "@/components/AgentShell";
import { FastAgent } from "@/components/agents/FastAgent";
import { getAgent } from "@/lib/agents/registry";

export const metadata = {
  title: "FAST Stroke Check — Sanjivani Setu",
  description:
    "Face symmetry, arm drift and speech clarity, as a prompt to seek emergency care.",
};

export default function FastPage() {
  const agent = getAgent("fast");
  if (!agent) notFound();
  return (
    <AgentShell agent={agent}>
      <FastAgent agent={agent} />
    </AgentShell>
  );
}
