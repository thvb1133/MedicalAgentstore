import { useEffect, useMemo, useState } from "react";
import { createOrder, fetchAgents, fetchCategories } from "./api";
import type { Agent, Order } from "./types";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

type CartState = Record<string, number>;

export function App() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<CartState>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [confirmed, setConfirmed] = useState<Order | null>(null);

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchAgents({ q: query, category: activeCategory })
      .then((data) => {
        if (!active) return;
        setAgents(data);
        setError(null);
      })
      .catch((err: Error) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [query, activeCategory]);

  const agentsById = useMemo(() => {
    const map = new Map<string, Agent>();
    agents.forEach((a) => map.set(a.id, a));
    return map;
  }, [agents]);

  const cartLines = useMemo(
    () =>
      Object.entries(cart)
        .filter(([, qty]) => qty > 0)
        .map(([agentId, quantity]) => ({ agent: agentsById.get(agentId), quantity }))
        .filter((line): line is { agent: Agent; quantity: number } => Boolean(line.agent)),
    [cart, agentsById],
  );

  const cartCount = Object.values(cart).reduce((sum, n) => sum + n, 0);
  const cartTotal = cartLines.reduce((sum, l) => sum + l.agent.priceMonthly * l.quantity, 0);

  function addToCart(agent: Agent) {
    setCart((prev) => ({ ...prev, [agent.id]: (prev[agent.id] ?? 0) + 1 }));
    setCartOpen(true);
  }

  function setQuantity(agentId: string, quantity: number) {
    setCart((prev) => ({ ...prev, [agentId]: Math.max(0, quantity) }));
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            ⊕
          </span>
          <div>
            <h1>Medical Agent Store</h1>
            <p>Vetted, compliance-ready AI agents for care teams</p>
          </div>
        </div>
        <button className="cart-button" onClick={() => setCartOpen(true)}>
          Cart
          {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
        </button>
      </header>

      <section className="hero">
        <h2>Deploy clinical AI you can trust</h2>
        <p>
          Browse a curated catalog of medical AI agents—each with published certifications and
          transparent monthly pricing. Add agents to your subscription and check out in seconds.
        </p>
        <div className="search-row">
          <input
            className="search"
            placeholder="Search agents, vendors, or capabilities…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search agents"
          />
        </div>
        <div className="filters">
          <button
            className={activeCategory === "" ? "chip chip-active" : "chip"}
            onClick={() => setActiveCategory("")}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              className={activeCategory === cat ? "chip chip-active" : "chip"}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </section>

      <main className="catalog">
        {loading && <p className="muted">Loading catalog…</p>}
        {error && <p className="error">{error}</p>}
        {!loading && !error && agents.length === 0 && (
          <p className="muted">No agents match your search.</p>
        )}
        <div className="grid">
          {agents.map((agent) => (
            <article className="card" key={agent.id}>
              <div className="card-head">
                <span className="category-tag">{agent.category}</span>
                <span className="rating" title={`${agent.rating} out of 5`}>
                  ★ {agent.rating.toFixed(1)}
                </span>
              </div>
              <h3>{agent.name}</h3>
              <p className="vendor">by {agent.vendor}</p>
              <p className="summary">{agent.summary}</p>
              <ul className="cert-list">
                {agent.certifications.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <div className="card-foot">
                <span className="price">
                  {currency.format(agent.priceMonthly)}
                  <span className="per">/mo</span>
                </span>
                <button className="add-button" onClick={() => addToCart(agent)}>
                  Add
                </button>
              </div>
            </article>
          ))}
        </div>
      </main>

      {cartOpen && (
        <CartDrawer
          lines={cartLines}
          total={cartTotal}
          onClose={() => setCartOpen(false)}
          onQuantity={setQuantity}
          onCheckout={async (customer, organization) => {
            const order = await createOrder({
              customer,
              organization,
              items: cartLines.map((l) => ({ agentId: l.agent.id, quantity: l.quantity })),
            });
            setConfirmed(order);
            setCart({});
            setCartOpen(false);
          }}
        />
      )}

      {confirmed && <Confirmation order={confirmed} onClose={() => setConfirmed(null)} />}

      <footer className="footer">
        <span>{agents.length} agents in catalog</span>
        <span>Demo environment · not for clinical use</span>
      </footer>
    </div>
  );
}

interface CartLine {
  agent: Agent;
  quantity: number;
}

function CartDrawer({
  lines,
  total,
  onClose,
  onQuantity,
  onCheckout,
}: {
  lines: CartLine[];
  total: number;
  onClose: () => void;
  onQuantity: (agentId: string, quantity: number) => void;
  onCheckout: (customer: string, organization: string) => Promise<void>;
}) {
  const [customer, setCustomer] = useState("");
  const [organization, setOrganization] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCheckout = lines.length > 0 && customer.trim() && organization.trim();

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await onCheckout(customer.trim(), organization.trim());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h2>Your subscription</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close cart">
            ✕
          </button>
        </div>

        {lines.length === 0 ? (
          <p className="muted">Your cart is empty. Add agents from the catalog.</p>
        ) : (
          <ul className="cart-lines">
            {lines.map(({ agent, quantity }) => (
              <li key={agent.id} className="cart-line">
                <div>
                  <p className="cart-line-name">{agent.name}</p>
                  <p className="muted small">{currency.format(agent.priceMonthly)}/mo each</p>
                </div>
                <div className="qty">
                  <button onClick={() => onQuantity(agent.id, quantity - 1)} aria-label="Decrease">
                    −
                  </button>
                  <span>{quantity}</span>
                  <button onClick={() => onQuantity(agent.id, quantity + 1)} aria-label="Increase">
                    +
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="total-row">
          <span>Monthly total</span>
          <strong>{currency.format(total)}</strong>
        </div>

        <div className="checkout-form">
          <label>
            Your name
            <input
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="Dr. Jane Doe"
            />
          </label>
          <label>
            Organization
            <input
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              placeholder="Cedar Valley Clinic"
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="primary" disabled={!canCheckout || submitting} onClick={submit}>
            {submitting ? "Placing order…" : `Subscribe · ${currency.format(total)}/mo`}
          </button>
        </div>
      </aside>
    </div>
  );
}

function Confirmation({ order, onClose }: { order: Order; onClose: () => void }) {
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="check-circle" aria-hidden>
          ✓
        </div>
        <h2>Subscription confirmed</h2>
        <p className="muted">
          Thanks, {order.customer}. {order.organization} is now subscribed to{" "}
          {order.lines.length} agent{order.lines.length > 1 ? "s" : ""}.
        </p>
        <p className="order-id">
          Order <code>{order.id}</code>
        </p>
        <ul className="confirm-lines">
          {order.lines.map((line) => (
            <li key={line.agentId}>
              <span>
                {line.name} × {line.quantity}
              </span>
              <span>{currency.format(line.priceMonthly * line.quantity)}/mo</span>
            </li>
          ))}
        </ul>
        <div className="total-row">
          <span>Monthly total</span>
          <strong>{currency.format(order.monthlyTotal)}</strong>
        </div>
        <button className="primary" onClick={onClose}>
          Continue browsing
        </button>
      </div>
    </div>
  );
}
