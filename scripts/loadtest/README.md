# OpenVibe load testing

This folder is the home for scalable-runtime load and soak scripts.

Planned coverage:

- HTTP readiness + health sweep under burst traffic
- Prometheus scrape stability under concurrent requests
- Socket.IO fanout / presence churn once `services/openvibe-realtime` lands
- media upload + playback resolution concurrency
- clip and DVR timeline polling behavior

For the current runtime-foundation tranche, use the repo-wide validation flow
plus `node scripts/readiness/check-scalable-runtime.js --offline`.
