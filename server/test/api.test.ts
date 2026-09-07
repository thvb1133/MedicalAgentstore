import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp, buildOrderLines, monthlyTotal, CheckoutError } from "../src/app.js";

const app = createApp();

describe("buildOrderLines", () => {
  it("computes lines for valid items", () => {
    const lines = buildOrderLines([{ agentId: "scribe-copilot", quantity: 2 }]);
    expect(lines).toHaveLength(1);
    expect(lines[0].name).toBe("Ambient Scribe Copilot");
    expect(monthlyTotal(lines)).toBe(349 * 2);
  });

  it("rejects an empty cart", () => {
    expect(() => buildOrderLines([])).toThrow(CheckoutError);
  });

  it("rejects unknown agents", () => {
    expect(() => buildOrderLines([{ agentId: "nope", quantity: 1 }])).toThrow(/Unknown agent/);
  });

  it("rejects invalid quantities", () => {
    expect(() => buildOrderLines([{ agentId: "scribe-copilot", quantity: 0 }])).toThrow(
      /Invalid quantity/,
    );
  });
});

describe("API", () => {
  it("reports health", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.agents).toBeGreaterThan(0);
  });

  it("lists agents and filters by search", async () => {
    const all = await request(app).get("/api/agents");
    expect(all.status).toBe(200);
    expect(all.body.length).toBeGreaterThan(1);

    const filtered = await request(app).get("/api/agents").query({ q: "radiology" });
    expect(filtered.body.length).toBe(1);
    expect(filtered.body[0].id).toBe("radiology-second-read");
  });

  it("creates and retrieves an order", async () => {
    const create = await request(app)
      .post("/api/orders")
      .send({
        customer: "Dr. Ada Lovelace",
        organization: "Analytical Health",
        items: [
          { agentId: "triage-navigator", quantity: 1 },
          { agentId: "scribe-copilot", quantity: 3 },
        ],
      });
    expect(create.status).toBe(201);
    expect(create.body.monthlyTotal).toBe(499 + 349 * 3);
    const id = create.body.id as string;

    const fetched = await request(app).get(`/api/orders/${id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.customer).toBe("Dr. Ada Lovelace");
  });

  it("rejects checkout without customer", async () => {
    const res = await request(app)
      .post("/api/orders")
      .send({ organization: "X", items: [{ agentId: "scribe-copilot", quantity: 1 }] });
    expect(res.status).toBe(400);
  });
});
