import { notFound } from "next/navigation";

import { AgentShell } from "@/components/AgentShell";
import { VitalsAgent } from "@/components/agents/VitalsAgent";
import { getAgent } from "@/lib/agents/registry";

export const metadata = {
  title: "Contactless Vitals — Sanjivani Setu",
  description:
    "Heart rate, HRV, breathing and calibrated blood pressure from a laptop camera.",
};

export default function VitalsPage() {
  const agent = getAgent("vitals");
  if (!agent) notFound();
  return (
    <AgentShell agent={agent}>
      <VitalsAgent agent={agent} />
    </AgentShell>
  );
}
