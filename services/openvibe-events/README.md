# openvibe-events

The OpenVibe **event backbone**. SQLite-backed publish / persist / fan-out /
retry / DLQ implementation that fits the Phase 1 envelope contract from
[`@openvibe/contracts`](../../packages/openvibe-contracts/).

## Why SQLite

The Hobo stack already uses `better-sqlite3` everywhere
(`HoboApp/hobo-tools/server/db/database.js`, `HoboStreamer.com/server/db/database.js`).
Reusing it keeps Phase 1 deployable on the same boxes with no new infra.

The transport boundary is the `EventsClient` HTTP API — when we outgrow
SQLite the storage layer can be swapped for Redis Streams / NATS JetStream /
Kafka without touching publishers or consumers.

## Run

```bash
cd /opt/openvibe/services/openvibe-events
cp .env.example .env
npm install
npm start            # http://localhost:4400
```

## API (mounted under `/api/v1`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/events` | `X-Internal-Key` | Publish `{ topic, envelope }` |
| `GET`  | `/events?topic=&event_type=&limit=&since_id=` | none (read) | List recent events |
| `GET`  | `/events/:eventId` | none (read) | Fetch one |
| `POST` | `/events/:eventId/replay` | `X-Internal-Key` | Re-enqueue all subs |
| `GET`  | `/subscriptions` | none | List subscribers |
| `POST` | `/subscriptions` | `X-Internal-Key` | Create / upsert |
| `DELETE` | `/subscriptions/:id` | `X-Internal-Key` | Deactivate |
| `GET`  | `/dlq` | none | List dead letters |

## Manual smoke

```bash
KEY=$(grep '^INTERNAL_API_KEY=' .env | cut -d= -f2)

# subscribe (log-only delivery prints a line per event)
curl -s -X POST http://localhost:4400/api/v1/subscriptions \
  -H "X-Internal-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"subscription_id":"smoke-log","consumer":"smoke","topic":"system.events","delivery":"log"}'

# publish (envelope fields are filled in by the SDK; raw publish needs full envelope)
curl -s -X POST http://localhost:4400/api/v1/events \
  -H "X-Internal-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"topic":"system.events","envelope":{
        "event_id":"evt_smoke_1","trace_id":"trc_smoke_1",
        "event_type":"system.audit.recorded","version":1,
        "source":"smoke-test","actor_type":"system","actor_id":null,
        "timestamp":"2026-04-23T00:00:00.000Z","payload":{"hello":"world"}}}'

curl -s http://localhost:4400/api/v1/events?topic=system.events | jq .
```
