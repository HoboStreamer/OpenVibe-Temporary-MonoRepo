# Legacy AI migration

There is **no legacy AI/LLM data** to migrate from prior
HoboStreamer / HoboApp builds. Phase 7 is therefore purely additive:

- HoboStreamer continues to operate without AI; the bridge in
  `/opt/hobostreamer/server/openvibe-bridge/ai.js` is inert when
  `OPENVIBE_AI_URL` is unset.
- Future phases that introduce AI-aware Hobo features (AI-tagged
  emotes, AI moderation, AI-suggested clip titles, etc.) opt-in by
  setting `OPENVIBE_AI_URL` + `OPENVIBE_INTERNAL_KEY` and calling the
  `*Safe` helpers in the bridge.
- No table backfills are required.
