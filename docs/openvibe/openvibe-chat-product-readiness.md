# OpenVibe Chat — product readiness

Native UI: `services/openvibe-chat/public/index.html`. Two-pane layout
(rooms list + feed + composer) backed by:

* `GET /api/v1/rooms`
* `GET /api/v1/rooms/:roomId/messages`
* `POST /api/v1/rooms/:roomId/messages`
* `GET /api/v1/global/history`
* `POST /api/v1/global/send`

Phase 8 readiness criteria:

* `#global` is always selectable, even with zero rooms.
* Send/receive works against the local API; failures degrade to a sign-in
  prompt instead of a JS error.
* Layout collapses to a single column on narrow viewports.
