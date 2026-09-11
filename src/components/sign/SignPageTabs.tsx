"use client";

import { useState } from "react";

import { SignStudio } from "./SignStudio";
import { SigningStudio } from "./SigningStudio";

type Tab = "signing" | "spelling";

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "signing", label: "Signing", hint: "Signs with movement and expression" },
  { id: "spelling", label: "Fingerspelling", hint: "The manual alphabet, letter by letter" },
];

export function SignPageTabs() {
  const [tab, setTab] = useState<Tab>("signing");

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Sign language modes" className="flex gap-2">
        {TABS.map((option) => (
          <button
            key={option.id}
            role="tab"
            id={`sign-tab-${option.id}`}
            aria-selected={tab === option.id}
            aria-controls={`sign-panel-${option.id}`}
            onClick={() => setTab(option.id)}
            className="rounded-lg border px-3.5 py-2 text-left transition-colors"
            style={{
              borderColor: tab === option.id ? "var(--border-strong)" : "var(--border)",
              background: tab === option.id ? "var(--surface-raised)" : "transparent",
            }}
          >
            <span
              className="block text-[13px] font-medium"
              style={{ color: tab === option.id ? "var(--foreground)" : "var(--muted)" }}
            >
              {option.label}
            </span>
            <span className="block text-[11px] text-[var(--faint)]">{option.hint}</span>
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`sign-panel-${tab}`}
        aria-labelledby={`sign-tab-${tab}`}
      >
        {tab === "signing" ? <SigningStudio /> : <SignStudio />}
      </div>
    </div>
  );
}
