import { notFound } from "next/navigation";

import { AgentShell } from "@/components/AgentShell";
import { AlertnessAgent } from "@/components/agents/AlertnessAgent";
import { getAgent } from "@/lib/agents/registry";

export const metadata = {
  title: "Alertness & Gaze — Sanjivani Setu",
  description:
    "PERCLOS, blink behaviour, head nodding and gaze combined into a fatigue score.",
};

export default function AlertnessPage() {
  const agent = getAgent("alertness");
  if (!agent) notFound();
  return (
    <AgentShell agent={agent}>
      <AlertnessAgent agent={agent} />
    </AgentShell>
  );
}
