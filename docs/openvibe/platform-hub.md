# Platform hub & tools portal

* `openvibe.network` (`services/openvibe-network/public/index.html`) — the
  branded hub: hero, OpenVibe value props, registry-driven service grid,
  metrics strip (services / capabilities / contracts / themes), Ctrl/⌘ K
  launcher.
* `openvibe.tools` (`services/openvibe-network/public/tools.html`, mapped
  through `host-router.js` `tools` surface) — searchable, category-filterable
  directory of every OpenVibe service. Falls back to the static catalog in
  `public/assets/openvibe.js` so the page is meaningful even without the
  registry online.

Both surfaces use the same shared assets (`/assets/openvibe.css`,
`/assets/openvibe.js`) so the visual identity is consistent across the
network.
