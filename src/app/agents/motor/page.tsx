import { notFound } from "next/navigation";

import { AgentShell } from "@/components/AgentShell";
import { MotorAgent } from "@/components/agents/MotorAgent";
import { getAgent } from "@/lib/agents/registry";

export const metadata = {
  title: "Tremor & Finger Tapping — Sanjivani",
  description:
    "Tremor frequency by FFT and finger-tapping kinematics, measured from hand video.",
};

export default function MotorPage() {
  const agent = getAgent("motor");
  if (!agent) notFound();
  return (
    <AgentShell agent={agent}>
      <MotorAgent agent={agent} />
    </AgentShell>
  );
}
