export interface Agent {
  id: string;
  name: string;
  vendor: string;
  category: string;
  summary: string;
  description: string;
  priceMonthly: number;
  rating: number;
  certifications: string[];
  tags: string[];
}

export const agents: Agent[] = [
  {
    id: "triage-navigator",
    name: "Triage Navigator",
    vendor: "Helix Health AI",
    category: "Triage",
    summary: "Symptom triage assistant that routes patients to the right level of care.",
    description:
      "Triage Navigator interviews patients about their symptoms and produces an evidence-based acuity recommendation, from self-care through emergency escalation. It is tuned on validated triage protocols and hands off structured notes to clinicians.",
    priceMonthly: 499,
    rating: 4.7,
    certifications: ["HIPAA", "SOC 2 Type II"],
    tags: ["symptom-checker", "care-routing", "patient-facing"],
  },
  {
    id: "radiology-second-read",
    name: "Radiology Second Read",
    vendor: "PixelCare Labs",
    category: "Radiology",
    summary: "Flags suspected findings on chest X-rays as a second reader.",
    description:
      "Radiology Second Read analyzes chest radiographs and highlights regions suspicious for pneumonia, nodules, and effusions. It is designed to augment—not replace—the reading radiologist and produces a confidence-scored overlay.",
    priceMonthly: 1299,
    rating: 4.5,
    certifications: ["FDA 510(k)", "HIPAA", "CE"],
    tags: ["imaging", "chest-xray", "decision-support"],
  },
  {
    id: "scribe-copilot",
    name: "Ambient Scribe Copilot",
    vendor: "NoteWeave",
    category: "Documentation",
    summary: "Generates draft clinical notes from ambient visit audio.",
    description:
      "Ambient Scribe Copilot listens to the patient encounter and drafts a structured SOAP note, saving clinicians documentation time. Notes are editable and never finalized without clinician sign-off.",
    priceMonthly: 349,
    rating: 4.8,
    certifications: ["HIPAA", "SOC 2 Type II"],
    tags: ["ambient", "soap-notes", "clinician-facing"],
  },
  {
    id: "med-reconciler",
    name: "Medication Reconciler",
    vendor: "Helix Health AI",
    category: "Pharmacy",
    summary: "Detects drug interactions and reconciles medication lists.",
    description:
      "Medication Reconciler compares active prescriptions across sources, surfaces potential interactions and duplications, and proposes a reconciled list for pharmacist review.",
    priceMonthly: 599,
    rating: 4.4,
    certifications: ["HIPAA", "SOC 2 Type II"],
    tags: ["pharmacy", "interactions", "safety"],
  },
  {
    id: "coding-assist",
    name: "Revenue Coding Assist",
    vendor: "LedgerMD",
    category: "Revenue Cycle",
    summary: "Suggests ICD-10 and CPT codes from clinical documentation.",
    description:
      "Revenue Coding Assist reads finalized notes and recommends compliant ICD-10 and CPT codes with supporting rationale, reducing denials and coder workload.",
    priceMonthly: 799,
    rating: 4.2,
    certifications: ["HIPAA"],
    tags: ["billing", "icd-10", "cpt"],
  },
  {
    id: "care-gap-finder",
    name: "Care Gap Finder",
    vendor: "PopHealth Systems",
    category: "Population Health",
    summary: "Identifies overdue screenings and preventive-care gaps.",
    description:
      "Care Gap Finder scans a panel of patients against quality measures and generates prioritized outreach lists for overdue screenings, immunizations, and chronic-care follow-ups.",
    priceMonthly: 899,
    rating: 4.3,
    certifications: ["HIPAA", "SOC 2 Type II"],
    tags: ["quality-measures", "outreach", "prevention"],
  },
];

export function findAgent(id: string): Agent | undefined {
  return agents.find((agent) => agent.id === id);
}

export function listCategories(): string[] {
  return [...new Set(agents.map((agent) => agent.category))].sort();
}
