# OpenVibe Community — product readiness

Native UI: `services/openvibe-community/public/index.html`. Tabs for threads,
pastes, and spaces backed by:

* `GET /api/v1/threads`
* `GET /api/v1/pastes` + `POST /api/v1/pastes`
* `GET /api/v1/spaces`

Phase 8 readiness criteria:

* All three tabs render meaningful empty states when the DB is empty.
* Paste-create form posts JSON and reloads the list on success.
* Tabs are keyboard accessible.
