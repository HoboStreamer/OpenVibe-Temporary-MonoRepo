# OpenVibe Live — product readiness

Native UI: `services/openvibe-live/public/index.html`. Driven by:

* `GET /api/v1/channels` — channel directory.
* `GET /api/v1/streams?status=live` — live tile grid.
* `GET /@:slug` and `/@:slug/s/:streamId` — canonical server-rendered detail pages
  (`server/ssr.js`).

Phase 8 readiness criteria:

* Page loads without JS errors against an empty database (shows graceful
  empty states).
* Filter input narrows the channel grid.
* Live grid honours the `status=live` filter and surfaces viewer counts.
* Network nav + footer come from the shared assets (`/assets/openvibe.css`,
  `/assets/openvibe.js`).
