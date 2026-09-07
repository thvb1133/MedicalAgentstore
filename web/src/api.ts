import type { Agent, Order } from "./types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function fetchAgents(params: { q?: string; category?: string } = {}): Promise<Agent[]> {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.category) search.set("category", params.category);
  const query = search.toString();
  return json<Agent[]>(await fetch(`/api/agents${query ? `?${query}` : ""}`));
}

export async function fetchCategories(): Promise<string[]> {
  return json<string[]>(await fetch("/api/categories"));
}

export interface CheckoutPayload {
  customer: string;
  organization: string;
  items: { agentId: string; quantity: number }[];
}

export async function createOrder(payload: CheckoutPayload): Promise<Order> {
  return json<Order>(
    await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
}
