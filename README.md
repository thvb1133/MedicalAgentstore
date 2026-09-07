# Medical Agent Store

A demo marketplace for discovering and subscribing to vetted **medical AI agents**. It is a
full-stack TypeScript application:

- **`server/`** — an Express REST API that serves the agent catalog and persists subscription
  orders to a JSON file (no external database required).
- **`web/`** — a React + Vite storefront where you can search agents, filter by category, build a
  cart, and check out.

> This is a demonstration project and is **not** intended for real clinical use.

## Requirements

- Node.js >= 20 (developed against Node 22)
- npm 10+

## Getting started

```bash
npm install        # installs both workspaces
npm run dev        # runs the API (port 3001) and the web app (port 5173) together
```

Then open http://localhost:5173. The Vite dev server proxies `/api/*` requests to the API on
port 3001.

### Run the pieces individually

```bash
npm run dev:server   # API only, http://localhost:3001
npm run dev:web      # web only, http://localhost:5173
```

## Quality checks

```bash
npm run lint         # ESLint across both workspaces
npm test             # server unit + API integration tests (Vitest + supertest)
npm run build        # type-check and build server (tsc) and web (vite build)
```

## API overview

| Method | Path                | Description                                   |
| ------ | ------------------- | --------------------------------------------- |
| GET    | `/api/health`       | Health check with catalog size                |
| GET    | `/api/categories`   | Distinct agent categories                     |
| GET    | `/api/agents`       | List agents; supports `?q=` and `?category=`  |
| GET    | `/api/agents/:id`   | Single agent detail                           |
| POST   | `/api/orders`       | Create a subscription order (checkout)        |
| GET    | `/api/orders/:id`   | Retrieve a previously created order           |

### Example checkout

```bash
curl -s -X POST http://localhost:3001/api/orders \
  -H 'Content-Type: application/json' \
  -d '{"customer":"Dr. Ada Lovelace","organization":"Analytical Health",
       "items":[{"agentId":"triage-navigator","quantity":1}]}'
```

## Project layout

```
.
├── server/            # Express + TypeScript API
│   ├── src/
│   │   ├── app.ts     # routes + validation
│   │   ├── store.ts   # JSON-file order persistence
│   │   └── data/      # seed agent catalog
│   └── test/          # Vitest + supertest tests
├── web/               # React + Vite storefront
│   └── src/
└── .cursor/           # Cloud Agent environment configuration
```

## Cloud Agent environment

`.cursor/environment.json` installs dependencies with `npm install` and starts two terminals:
`api` (`npm run dev:server`) and `web` (`npm run dev:web`), exposing ports 3001 and 5173.
