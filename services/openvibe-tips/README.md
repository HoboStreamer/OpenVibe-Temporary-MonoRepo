# openvibe-tips

**openvibe.tips** — the aggregated tips and donations hub for the OpenVibe network.

Combine tips from multiple platforms (Streamlabs, StreamElements, PowerChat, and
more) plus OpenVibe's own free, open-source native tip engine into a single unified
overlay, feed, and creator page.

## What it does

- **Native tip engine** — free, open-source. Backed by `openvibe-billing` credits. No third-party required.
- **Third-party connectors** — receive webhook callbacks from Streamlabs, StreamElements, PowerChat, and any generic webhook source, normalised into one event stream.
- **Unified overlay** — a single OBS browser source URL (`/overlay/:creatorSlug`) that shows tips from *all* sources in real time.
- **Public creator tip page** — `openvibe.tips/:slug` — customisable page where viewers can tip natively or follow links to the creator's other tip services.
- **Aggregated feed** — REST + WebSocket feed of all tip events across all sources.

## Port

Default: **5600** (`PORT` env var)

## Setup

```bash
cp .env.example .env
# edit .env — set INTERNAL_API_KEY, OPENVIBE_EVENTS_URL, connector secrets, etc.
node server/index.js
```

## Environment variables

See [.env.example](.env.example) for the full list.

Key vars:
- `INTERNAL_API_KEY` — secret for service-to-service calls
- `OPENVIBE_BILLING_URL` — URL of the billing service (for native tip processing)
- `STREAMLABS_WEBHOOK_SECRET` — Streamlabs socket token for webhook verification
- `STREAMELEMENTS_JWT_SECRET` — StreamElements JWT secret for webhook verification
- `POWERCHAT_API_KEY` — PowerChat API key for event polling

## API

```
GET  /                            Homepage
GET  /:slug                       Public creator tip page
GET  /overlay/:slug               OBS browser source overlay

POST /api/v1/creators             Create/update creator profile
GET  /api/v1/creators/:slug       Get creator profile
GET  /api/v1/feed                 Aggregated tip feed (query: creator_id, limit)

POST /webhooks/streamlabs/:token  Streamlabs webhook receiver
POST /webhooks/streamelements/:token StreamElements webhook receiver
POST /webhooks/powerchat/:token   PowerChat webhook receiver
POST /webhooks/generic/:token     Generic webhook (any service, normalised)

POST /api/v1/tip                  Send a native OpenVibe tip (requires auth)
GET  /api/v1/connectors           List connector types + capabilities

GET  /health
GET  /readiness
```

## Connectors

Each connector normalises incoming webhook events into a common `TipEvent` shape:

```json
{
  "source":     "streamlabs",
  "creator_id": "user:123",
  "amount":     { "value": "10.00", "currency": "USD" },
  "sender":     "ViewerName",
  "message":    "Keep it up!",
  "type":       "tip",
  "received_at": "2026-05-03T00:00:00Z"
}
```

## Architecture

```
openvibe-tips
├── server/
│   ├── index.js            Express app, middleware, route mounting
│   ├── config.js           Env + dotenv config
│   ├── db.js               SQLite schema + createLegacyPersistenceRuntime
│   ├── routes.js           API + creator page + overlay routes
│   ├── model.js            DB access layer
│   ├── policy.js           Access policy decisions
│   ├── events.js           Event bus (EventsClient)
│   ├── middleware.js       Auth client + service actor
│   ├── auth-routes.js      /auth/login, /auth/callback, /auth/logout
│   ├── session.js          Cookie helpers
│   ├── overlay.js          OBS overlay SSR
│   ├── connectors.js       Connector registry
│   └── connectors/
│       ├── streamlabs.js   Streamlabs webhook normaliser
│       ├── streamelements.js StreamElements webhook normaliser
│       ├── powerchat.js    PowerChat webhook normaliser
│       └── generic.js      Generic webhook normaliser
├── public/
│   └── index.html          Homepage
└── test/
    └── tips-lifecycle.test.js
```
