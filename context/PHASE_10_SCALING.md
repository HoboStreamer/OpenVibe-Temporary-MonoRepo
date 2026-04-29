# Phase 10 — scalable runtime foundation

Phase 10 is the first implementation tranche that converts the repo from
native-but-bootstrap into a horizontally scalable runtime baseline.

## Goals

- add shared runtime packages for readiness, metrics, structured logs, and
  future Postgres/Redis adapters
- expose `/health`, `/ready`, and `/metrics` consistently across every native
  service
- surface runtime readiness directly in `admin.openvibe.network`
- add first-pass deployment and CI scaffolding for NGINX, Compose, and
  offline readiness verification

## Landed in this tranche

- `packages/openvibe-observability/`
- `packages/openvibe-runtime/`
- `packages/openvibe-persistence/`
- `packages/openvibe-redis/`
- `packages/openvibe-queue/`
- `services/openvibe-workers/`
- runtime dependency + `/ready` + `/metrics` integration across all native
  services
- admin runtime dashboard additions in
  `services/openvibe-network/public/admin.html`
- browser-verified runtime tab with clean console and fixed OIDC discovery
  routing on the admin surface
- `scripts/readiness/check-scalable-runtime.js`
- `deploy/nginx/**`, `deploy/env/**`, `deploy/compose/docker-compose.local.yml`
- `.github/workflows/ci.yml`

## Remaining next slices

- real Postgres repository adapters per service
- real Redis-backed queues, presence, locks, and distributed worker processors
- object-storage-native upload/playback lifecycle
- realtime gateway service and event bridge
- media-plane + DVR + clips
- AI transcript / scene / motion pipeline
