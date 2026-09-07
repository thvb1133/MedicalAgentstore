import { randomUUID } from "node:crypto";
import cors from "cors";
import express, { type Request, type Response } from "express";
import { agents, findAgent, listCategories } from "./data/agents.js";
import { getOrder, saveOrder, type Order, type OrderLine } from "./store.js";

export interface CartItemInput {
  agentId: string;
  quantity: number;
}

export interface CheckoutInput {
  customer: string;
  organization: string;
  items: CartItemInput[];
}

export class CheckoutError extends Error {}

/**
 * Builds validated order lines from raw cart items. Throws CheckoutError with a
 * user-facing message when input references unknown agents or invalid quantities.
 */
export function buildOrderLines(items: CartItemInput[]): OrderLine[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new CheckoutError("Cart is empty.");
  }
  return items.map((item) => {
    const agent = findAgent(item.agentId);
    if (!agent) {
      throw new CheckoutError(`Unknown agent: ${item.agentId}`);
    }
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new CheckoutError(`Invalid quantity for ${agent.name}.`);
    }
    return {
      agentId: agent.id,
      name: agent.name,
      quantity,
      priceMonthly: agent.priceMonthly,
    };
  });
}

export function monthlyTotal(lines: OrderLine[]): number {
  return lines.reduce((sum, line) => sum + line.priceMonthly * line.quantity, 0);
}

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", agents: agents.length });
  });

  app.get("/api/categories", (_req: Request, res: Response) => {
    res.json(listCategories());
  });

  app.get("/api/agents", (req: Request, res: Response) => {
    const q = String(req.query.q ?? "").trim().toLowerCase();
    const category = String(req.query.category ?? "").trim();
    let results = agents;
    if (category) {
      results = results.filter((agent) => agent.category === category);
    }
    if (q) {
      results = results.filter((agent) =>
        [agent.name, agent.vendor, agent.summary, ...agent.tags]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    res.json(results);
  });

  app.get("/api/agents/:id", (req: Request, res: Response) => {
    const agent = findAgent(req.params.id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    res.json(agent);
  });

  app.post("/api/orders", async (req: Request, res: Response) => {
    const body = req.body as CheckoutInput;
    const customer = String(body?.customer ?? "").trim();
    const organization = String(body?.organization ?? "").trim();
    if (!customer || !organization) {
      res.status(400).json({ error: "customer and organization are required." });
      return;
    }
    let lines: OrderLine[];
    try {
      lines = buildOrderLines(body?.items ?? []);
    } catch (err) {
      if (err instanceof CheckoutError) {
        res.status(400).json({ error: err.message });
        return;
      }
      throw err;
    }
    const order: Order = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      customer,
      organization,
      lines,
      monthlyTotal: monthlyTotal(lines),
    };
    await saveOrder(order);
    res.status(201).json(order);
  });

  app.get("/api/orders/:id", async (req: Request, res: Response) => {
    const order = await getOrder(req.params.id);
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json(order);
  });

  return app;
}
