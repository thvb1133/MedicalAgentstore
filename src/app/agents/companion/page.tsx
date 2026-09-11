import { notFound } from "next/navigation";

import { AgentShell } from "@/components/AgentShell";
import { CompanionAgent } from "@/components/agents/CompanionAgent";
import { getAgent } from "@/lib/agents/registry";

export const metadata = {
  title: "Live Wellness Companion — Sanjivani",
  description:
    "A spoken conversation with an assistant that measures your pulse from the camera and the acoustics of your voice from the microphone.",
};

export default function CompanionPage() {
  const agent = getAgent("companion");
  if (!agent) notFound();
  return (
    <AgentShell agent={agent}>
      <CompanionAgent agent={agent} />
    </AgentShell>
  );
}
