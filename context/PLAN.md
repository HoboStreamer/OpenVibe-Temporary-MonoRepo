# OpenVibe PLAN.md

## 0. Purpose

This document is the initial grounded migration and architecture plan for turning the current **HoboStreamer.com** repository plus the **HoboApp** monorepo into **OpenVibe**: a community-focused, open-source, non-profit, multi-domain, moddable platform.

This plan assumes we are not doing a cosmetic rename. We are extracting a reusable platform kernel from what currently exists, then realigning product features into cleaner domain and service boundaries.

---

## 1. Grounded Baseline: what exists now

### 1.1 HoboStreamer.com today

HoboStreamer is already much more than a simple stream page. It currently combines:
- streaming ingest and playback
- WebRTC/WHIP/JSMPEG/RTMP support
- chat
- moderation
- VODs and clips
- restreaming
- themes
- DMs
- TTS
- voice/call signaling
- comments
- pastes/media
- analytics
- admin/mod routes
- vibe-coding/event publishing features
- some news/integration surfaces

Architecturally, it is a Node/Express runtime with a large route and WebSocket surface. It also keeps significant product state locally in SQLite.

### 1.2 HoboApp / hobo-tools today

The HoboApp monorepo already acts like a platform hub. `hobo-tools` currently owns:
- central auth / SSO
- OAuth2 / JWT issuance
- account hub
- notifications
- internal server-to-server API
- admin panel
- themes
- URL registry / service registry behavior
- anon users and multi-account sessions
- subdomain routing for tool surfaces

The monorepo also contains sibling services and a shared package (`packages/hobo-shared`) already functioning as a primitive shared platform layer.

### 1.3 HoboQuest today

HoboQuest is already presented as a multi-mode platform, not just one game. It has:
- a browser MMORPG
- a collaborative realtime canvas
- anonymous or signed-in play
- messaging that it is built to grow into more community-built modes over time

### 1.4 What this means

The current Hobo ecosystem already has the right *shape* for OpenVibe:
- HoboStreamer = media/realtime-heavy runtime
- hobo-tools = identity/control plane seed
- hobo-quest = game/world seed
- hobo-shared = SDK/shared package seed
- many tool surfaces = evidence that multi-domain or multi-surface expansion is viable

The problem is not that the concept is wrong.

The problem is that too many responsibilities are currently co-located in the wrong runtime boundaries.

---

## 2. OpenVibe target definition

OpenVibe is a platform kernel plus a set of product surfaces.

### 2.1 The platform kernel owns
- identity and SSO
- permissions and policy
- contracts and capability registry
- event bus
- modular user data
- media storage/processing
- billing / subscriptions / credits / balances
- AI backend orchestration
- themes and account management
- service registry
- mod registry / trust levels
- admin/control plane

### 2.2 Product surfaces plug into the kernel
- `openvibe.live`
- `openre.stream`
- `openvibe.chat`
- `openvibe.community`
- `openvibe.media`
- `openvibe.tools`
- `openvibe.games`
- `openvibe.vip`
- `openvibe.tips`
- `openvibe.codes`
- `openvibe.wiki`
- `openvibe.blog`
- `openvibe.news`
- `openvibe.reviews`
- `openvibe.trade`
- `openvibe.host`
- `openvibe.deals`
- `openvibe.coupons`

### 2.3 Core platform promise

One account.
One network.
Many surfaces.
Shared identity, shared media, shared economy, shared modding model.

---

## 3. Domain map

### 3.1 Kernel / infrastructure domains
- `openvibe.network`
- `auth.openvibe.network`
- `api.openvibe.network`
- `admin.openvibe.network`
- `events.openvibe.network`
- `billing.openvibe.network`
- `ai.openvibe.network`
- `my.openvibe.network`
- `themes.openvibe.network`

### 3.2 Core product domains
- `openvibe.live`
- `openre.stream`
- `openvibe.chat`
- `openvibe.community`
- `openvibe.media`
- `openvibe.tools`
- `openvibe.games`

### 3.3 Economy / creator domains
- `openvibe.tips`
- `openvibe.vip`
- `openvibe.trade`
- `openvibe.host`

### 3.4 Knowledge / discovery / growth domains
- `openvibe.codes`
- `openvibe.wiki`
- `openvibe.blog`
- `openvibe.news`
- `openvibe.reviews`
- `openvibe.deals`
- `openvibe.coupons`

---

## 4. Permanent architecture rules

### Rule 1 — identity is centralized
Only `openvibe.network` subservices define who a user, service, mod, or admin is.

### Rule 2 — cross-service communication is standardized
Cross-service business logic happens through:
- events
- capabilities
- platform APIs

Not ad hoc direct DB writes or hidden internal coupling.

### Rule 3 — all shared state is namespaced
User data, media, capabilities, events, policies, and config all need explicit ownership.

### Rule 4 — everything is versioned
Version:
- events
- APIs
- capabilities
- schemas
- SDKs
- mod contracts

### Rule 5 — anything expensive is asynchronous
Uploads, transcodes, scraping, summarization, notifications, billing reconciliation, indexing, analytics, and game jobs should all use queues/workers.

### Rule 6 — the platform is composable
Features should be built from reusable primitives. For example:
- a tip alert should be billing + events + media + chat/TTS capability
- a wiki generation request should be AI + media + content storage + indexing + permissions

### Rule 7 — the platform is introspectable
There should be a machine-readable and human-readable registry of:
- services
- capabilities
- schemas
- events
- policies
- deprecations

### Rule 8 — mods are first-class citizens, not hacks
Mods can read allowed data and invoke allowed capabilities, but cannot bypass core authority systems.

---

## 5. Platform kernel design

## 5.1 Identity and SSO (`auth.openvibe.network`)

### Responsibilities
- user auth
- OAuth2/OIDC
- session issuance
- service identities
- mod identities
- machine tokens
- linked identities
- username history
- multi-account switching
- anonymous/guest mode where applicable
- token revocation / token-valid-after

### Migration source
Primarily extracted from `hobo-tools` auth/OAuth/account logic.

### Requirements
- support the current Hobo-style one-account-many-services behavior
- support current local dev redirect patterns during transition
- support account linking from legacy HoboStreamer identities
- support migration of `linked_accounts`
- support user/session invalidation events across domains

### Notes
This should replace the old `hobo.tools` issuer role and become the single issuer for the whole OpenVibe network.

---

## 5.2 Control plane (`api.openvibe.network`, `admin.openvibe.network`, `my.openvibe.network`, `themes.openvibe.network`)

### Responsibilities
- user modules API
- policy engine
- capability registry
- contract registry
- service registry
- mod registry
- feature flags
- quotas
- account management
- theme management
- notifications
- admin dashboards
- setup/bootstrap APIs
- platform config / URL registry

### Migration source
Mostly extracted and generalized from `hobo-tools`.

### Split
- `my.openvibe.network` = user-facing account/preferences/security/billing overview/themes/session management
- `themes.openvibe.network` = theme catalog, shared design tokens, installs/preferences
- `admin.openvibe.network` = operator/admin control plane
- `api.openvibe.network` = shared platform API surface

---

## 5.3 Event backbone (`events.openvibe.network`)

### Responsibilities
- event publication
- topic routing
- subscriptions
- queue delivery
- retries
- DLQ
- replay
- filtering
- event tracing

### Model
Producer -> topic -> filtered subscription -> queue -> consumer

### Core topics
- `auth.events`
- `user.events`
- `service.events`
- `stream.events`
- `chat.events`
- `community.events`
- `media.events`
- `billing.events`
- `ai.events`
- `game.events`
- `mod.events`
- `system.events`

### Event envelope
Every event should include:
- `event_id`
- `trace_id`
- `event_type`
- `version`
- `source`
- `actor_type`
- `actor_id`
- `timestamp`
- `payload`

### Delivery semantics
- at-least-once
- consumers must be idempotent
- retries + exponential backoff
- DLQ required
- replay supported

### Why this matters
The current Hobo stack already has enough cross-service interactions that direct coupling is a long-term trap. This event layer becomes the spine of OpenVibe.

---

## 5.4 Capability layer (`api.openvibe.network/capabilities`)

### Purpose
Standardize actions that services and mods can request.

### Examples
- `chat.send_message`
- `chat.start_call`
- `chat.enqueue_tts`
- `tips.create_alert`
- `media.upload_init`
- `media.attach_to_entity`
- `billing.charge_credits`
- `billing.create_subscription`
- `community.create_post`
- `community.create_paste`
- `wiki.generate_space`
- `blog.publish_post`
- `games.create_world`

### Why it matters
Mods should not be calling random internal endpoints of different services. They should invoke registered, versioned, permissioned capabilities.

### Capability requirements
- owner service
- input schema
- output schema
- version
- rate limits
- permission policy
- event(s) emitted on success/failure

---

## 5.5 Contract registry

### Purpose
Keep schemas and platform interfaces coherent.

### Stores
- event schemas
- capability schemas
- user module schemas
- media metadata schemas
- service manifests
- deprecations
- SDK compatibility metadata

### Benefit
This prevents invisible drift between services, SDKs, and mods.

---

## 5.6 Policy engine

### Responsibilities
- namespace ownership rules
- capability invocation permissions
- mod trust tier enforcement
- quota rules
- age-gating / adult-content policies
- role-based admin / moderator authority
- platform moderation rules
- service-level trust boundaries

### Notes
These rules should not be hardcoded independently in every service.

---

## 5.7 User modules system

### Purpose
Hold extensible user-centric state without turning the canonical user record into a monolith.

### Model
Each user has many namespaced modules.

Examples:
- `live.profile`
- `live.stats`
- `live.followers`
- `chat.preferences`
- `community.profile`
- `community.reputation`
- `billing.wallet_snapshot`
- `games.progress`
- `games.inventory`
- `tools.usage`
- `wiki.projects`
- `mod.xyz.*`

### Rules
- each namespace has an owner
- write permissions are namespace-based and possibly field-based
- read permissions can be public/private/role-based/mod-tier-based
- updates emit `user.module.updated` events

### Important design choice
This is how OpenVibe supports extensibility without letting mods or services overwrite core data they do not own.

---

## 5.8 Themes system (`themes.openvibe.network`)

### Migration source
Migrate the current hobo.tools themes system here.

### Responsibilities
- built-in themes
- community themes
- user theme preferences
- CSS variable token system
- service overrides on top of shared global tokens
- install/import/export theme bundles
- theme previews
- theme moderation/approval if needed

### Long-term goal
Support:
- per-service theme variants
- community theme marketplace or featured library
- creator-specific public themes
- accessibility presets

---

## 5.9 Notifications system

### Migration source
Current `hobo-tools` notification service.

### Responsibilities
- central notification store
- per-category preferences
- email/push/in-app delivery
- eventual DM/call/tip/live/community/game notification fanout
- cross-service read/dismiss state

### Future
Later add:
- websocket/push realtime delivery
- digest generation
- channel-based notification packs

---

## 5.10 AI backend (`ai.openvibe.network`)

### Purpose
Provide one modular AI/LLM orchestration layer for all OpenVibe services.

### Responsibilities
- configure providers/models/API keys in admin
- route requests per capability or service
- prompt/template registry
- embeddings/vector search later
- summarization, extraction, generation, classification helpers
- quota and budget control
- caching
- observability / cost tracking

### Consumers
- `openvibe.wiki`
- `openvibe.blog`
- `openvibe.news`
- `openvibe.reviews`
- `openvibe.deals`
- `openvibe.coupons`
- `openvibe.trade`
- moderation, internal copilots, and support tools later

---

## 6. Media platform (`openvibe.media`)

## 6.1 Purpose
Generalize HoboStreamer's VOD/media system into a shared platform media service.

### Handles
- VODs
- clips
- thumbnails
- avatar/profile images
- audio files
- paste attachments/screenshots
- community attachments
- blog/wiki assets
- mod assets
- game assets where appropriate

## 6.2 Why it must be centralized
Right now HoboStreamer owns VODs, clips, thumbnails, avatars, emotes, and other media. That works for one runtime, but OpenVibe needs many services and mods to upload/process media under consistent permissions and storage rules.

## 6.3 Storage model
Media object fields should include:
- `id`
- `owner_type` (`user`, `service`, `mod`, `system`)
- `owner_id`
- `namespace`
- `type` (`image`, `video`, `audio`, `file`)
- `visibility`
- `status`
- `storage_tier`
- `metadata`
- `source`
- `created_at`
- `updated_at`

## 6.4 Namespace examples
- `live.vods`
- `live.clips`
- `chat.tts-assets`
- `community.pastes`
- `community.attachments`
- `blog.images`
- `wiki.assets`
- `games.assets`
- `mod.xyz.assets`

## 6.5 Upload flow
1. request upload init
2. permission and quota check
3. signed upload target returned
4. direct upload to object storage
5. completion callback/verification
6. processing queue
7. derivative generation / metadata extraction
8. media events emitted
9. service attaches object references

## 6.6 Processing queue
Should support:
- thumbnails
- HLS transcodes or other VOD outputs
- image variants/resizing
- waveform generation for audio
- OCR or analysis only where explicitly needed later
- moderation or virus scanning hooks later

## 6.7 Hot/cold storage
- hot = frequent access, current VODs, recent images
- cold = archives, older media, deep storage

Need lifecycle policies and restore flow.

## 6.8 Quotas
Quota checks must happen centrally, not in each service.

Track usage by:
- user
- service
- mod
- tier/plan

---

## 7. Billing and economy (`billing.openvibe.network`)

## 7.1 Purpose
Create a unified economy for:
- tips
- subscriptions
- creator memberships
- cross-site balances
- premium mods or services later
- marketplace purchases later

## 7.2 Ledger-first model
Never treat a mutable balance field as the only truth.

Use:
- append-only ledger transactions
- materialized balance snapshots/caches for fast reads
- reconciliation jobs

## 7.3 Economy concepts
- fiat purchases
- OpenVibe tip balance / credits balance
- creator pending balances
- recurring subscriptions
- one-off purchases
- refunds and reversals

## 7.4 Product surfaces built on billing
- `openvibe.tips`
- `openvibe.vip`
- `openvibe.chat` monetized interactions
- `openvibe.trade` purchases and premium offerings later
- channel subscriptions in `openvibe.live`

## 7.5 Must-have rules
- only billing service can mint or burn credits
- services request charges via capability/API
- all external payment actions use idempotency keys
- all webhook-based flows are replay-safe and reconcilable
- emergency freeze mode exists

## 7.6 Adult/gated content note
If `openvibe.vip` eventually supports adult creators/content, design must include:
- age gating
- content visibility controls
- moderation/compliance layers
- provider compatibility boundaries
- per-creator policy enforcement

The architecture should allow it without making it the default focus of the platform.

---

## 8. Product services

## 8.1 `openvibe.live`

### Role
The streaming destination, creator channel surface, viewer experience, and stream metadata/public page layer.

### What migrates here from HoboStreamer
- channel pages
- stream pages
- stream metadata UI
- creator dashboard/UI
- viewer-facing watch pages
- overlays/integrations specific to live viewing
- live moderation surfaces
- analytics views relevant to streamers

### What should move out of HoboStreamer into other services
- DMs -> `openvibe.chat`
- calls/voice/cam -> `openvibe.chat`
- TTS manager -> `openvibe.chat`
- soundboards/audio playback queue -> `openvibe.chat`
- VOD storage and media processing -> `openvibe.media`
- pastes -> `openvibe.community`
- shared theme system -> `themes.openvibe.network`
- subscriptions/tips balances -> billing + `openvibe.vip` / `openvibe.tips`

### Important design choice
`openvibe.live` should consume other platform services instead of owning every creator feature itself.

---

## 8.2 `openre.stream`

### Role
Dedicated ingest/restream runtime.

### Why it must exist separately
Restreaming and ingest scale differently than page rendering, chat UI, billing UI, or community content.

### Responsibilities
- ingest streams
- manage outputs to third parties
- optional OpenVibe mirror path
- ingest-side monitoring and health
- route stream lifecycle events into the platform

### Integration with `openvibe.live`
- a stream can be mirrored into OpenVibe automatically or via opt-in
- OpenVibe gets public pages, discovery, and media opportunities from that stream
- stream lifecycle remains event-driven

### Migration source
Extract current restream/integration parts from HoboStreamer into this service.

---

## 8.3 `openvibe.chat`

### Role
Communication and social realtime platform for the network.

### This is where HoboStreamer chat evolves to
`openvibe.chat` should own:
- live stream chat infrastructure
- DMs
- group chats / rooms
- voice/cam calling
- streamer-to-viewer calls
- community calls
- TTS management
- soundboard / audio queue / 101soundboards integration surface
- audio playback queues for stream alerts or media request interaction support

### Why split it out
HoboStreamer currently contains:
- chat routes
- TTS routes
- DM routes
- call signaling/server

That is already enough evidence that communication has become its own product concern.

### Integration examples
- a streamer on `openvibe.live` can call a viewer using `openvibe.chat`
- a community thread space can attach a voice room from `openvibe.chat`
- TTS queue and alert audio for streamers are managed centrally but embedded into live overlays and dashboards
- DMs are identity-wide, not tied to a single surface

### Major subsystems
- message service
- room/presence service
- call signaling service
- TTS/audio queue service
- DM service
- moderation service
- integration adapters for soundboards/audio sources

---

## 8.4 `openvibe.community`

### Role
Forum/discussion/social hub.

### Must also own
- Discord relay into OpenVibe-native spaces
- migration target for `hobostreamer.com/pastes`
- reusable thread/comment/discussion primitives for other services

### Responsibilities
- communities/spaces
- posts/threads/replies
- reactions
- creator communities
- community moderation
- pastes and shareable snippets
- Discord bridge and source-tagging
- cross-surface discussion embeds

### Migration source
- HoboStreamer pastes feature
- comment/discussion patterns that are currently scattered or VOD-specific
- future Discord bridge from existing hobo-tools Discord-related foundation

### Important design requirement
Discord relay must avoid loops and keep source transparency.
A relayed message must be clearly marked as coming from Discord, and posting rules must prevent endless sync loops.

---

## 8.5 `openvibe.tools`

### Role
Mega-surface for utility tools.

### Migration source
The existing Hobo monorepo already contains multiple tool/service folders and `hobo.tools` markets 200+ tools with subdomain routing.

### Strategy
- keep tool surfaces modular inside a product repo/app suite
- reuse shared auth/themes/media/billing if useful
- keep public tools mostly accessible without sign-in where appropriate
- preserve the “every tool can be its own entry point” growth model

### Long-term idea
A tool can later declare:
- required capabilities
- required media support
- optional monetization
- optional mod/plugin interfaces

---

## 8.6 `openvibe.games`

### Role
Community game platform and HoboQuest successor.

### Phase 1
Migrate HoboQuest concepts and shared account integration.

### Phase 2
Expose a game-platform model:
- 2D browser engine/runtime
- 3D browser engine/runtime
- multiplayer networking primitives
- world/session hosting model
- asset pipelines
- user inventories/progression modules

### Phase 3
Move toward a Roblox/Garry’s Mod-style creator platform for browser games/experiences.

### Requirements
- authoritative game servers/workers where needed
- client SDKs
- moderation hooks
- economy hooks
- community discovery surfaces
- creator publishing flow

---

## 8.7 `openvibe.tips`

### Role
Donation, alert, interaction, and monetized request system.

### Responsibilities
- superchat-like messages
- alerting overlays
- donation goals
- media request donations
- paid interactions triggering TTS/audio/call/chat overlays
- reusable tip balance across all services

### Migration source
Centralize HoboStreamer's donation goals, transaction-style features, media request payment patterns, and alert concepts.

### Integrations
- `openvibe.live` overlays/widgets
- `openvibe.chat` TTS/audio queue
- billing credits and creator balances

---

## 8.8 `openvibe.vip`

### Role
Membership/subscription platform.

### Responsibilities
- creator memberships
- channel subscriptions on `openvibe.live`
- tiered perks
- gated content/community access
- optional adult-safe age-gated memberships if policy allows

### Payment model
- recurring subscriptions
- optional use of existing tip balance/credits where product design allows
- regular auto-renewing subscriptions

### Integrations
- `openvibe.live` channel subs
- `openvibe.community` gated spaces
- `openvibe.blog` or `openvibe.wiki` gated posts/wikis

---

## 8.9 `openvibe.codes`

### Role
The modding and developer portal.

### This should become much bigger than docs
It should include:
- SDK docs
- API docs
- contracts registry explorer
- capability explorer
- event explorer/docs
- tutorials
- vibe-coding examples
- starter templates
- local dev instructions
- service boilerplate guides
- mod publishing guide
- governance docs / RFC system
- playgrounds for auth/events/capabilities/media/billing integration

### Important vision
`openvibe.codes` is where contributors learn how to plug into the platform. It should feel like both docs and a builder ecosystem hub.

---

## 8.10 `openvibe.wiki`

### Role
AI-generated plus user-customizable wiki platform.

### Core concept
A user should be able to generate a full Wikipedia-style knowledge space for a topic using scraped sources plus AI synthesis, then refine it manually.

### Needs
- source ingestion pipeline
- AI summarization/generation workflows
- page tree generation
- custom page editing
- media support
- citations/source transparency
- regeneration/versioning
- moderation tools

### Dependencies
- `ai.openvibe.network`
- `openvibe.media`
- community comments/discussion optionally
- search/indexing

---

## 8.11 `openvibe.blog`

### Role
Multi-tenant blogging platform.

### Responsibilities
- official OpenVibe blog
- user blogs
- AI-assisted content creation
- AI-generated niche blogs backed by large source datasets
- scheduled publishing
- theming and customization
- comments/discussion integration

### Dependencies
- AI backend
- media
- community discussion/comments
- VIP gating later if needed

---

## 8.12 `openvibe.news`

### Role
Aggregated news with transparent AI processing.

### Responsibilities
- ingest news from many sources
- summarize
- show multi-angle or multi-slant representations
- expose source transparency
- let users tune summarization/perspective preferences

### Important note
The system should separate:
- sourced facts
- AI summary layer
- user preference / “how do you want it framed” layer

That avoids turning the whole thing into an opaque opinion machine.

---

## 8.13 `openvibe.reviews`

### Role
Review aggregation platform for many entity types.

### Examples
- employers
- restaurants
- hosting providers
- products
- communities
- platforms
- service providers

### Sources
Can eventually include public/community data from places like Glassdoor, Yelp, BBB, WebHostingTalk, Reddit, X/Twitter, etc., subject to legal and technical feasibility.

### Needs
- entity resolution
- source provenance
- dedupe
- weighting/trust signals
- AI summarization across many reviews
- community discussion overlays

---

## 8.14 `openvibe.deals`

### Role
Slickdeals-like community deals platform with AI + scraping + utility tooling.

### Responsibilities
- ingest deals
- rank/hotness scoring
- community voting/commenting
- keyword alerts/watchlists
- AI summaries/comparisons
- special tools like saved eBay keyword watches or “search unshittifier” utilities

### Important design note
Deals should be both:
- a content surface
- a utility/workflow surface

---

## 8.15 `openvibe.coupons`

### Role
Coupon platform + browser extension.

### Responsibilities
- scrape and list coupons
- browser extension/apply flow
- community reporting on validity
- store/domain matching
- no parasitic/referral-first design

### Architecture note
This may need a dedicated extension backend, but the account/economy/media/admin layers should still plug into the kernel.

---

## 8.16 `openvibe.trade`

### Role
Marketplace/economy/market-intelligence surface.

### It should start broad but safe
Initial emphasis should be:
- watchlists
- alerts
- scraped market/news/content
- AI-assisted explainers/summaries
- community tools and insights
- premium tools later

### Future directions
- mod/plugin marketplace
- digital assets/themes/templates
- stock/crypto signal content and alerts
- monetized premium dashboards

### Important caution
Avoid early architecture that assumes regulatory or custody-heavy features. Keep first versions informational/tools/community-first.

---

## 8.17 `openvibe.host`

### Role
Hosting/deployment/control surface.

### Initial scope
- platform/service hosting admin surface
- creator or service deployment helpers
- maybe evolution of current deploy/TLS/Nginx helper logic from `hobo-tools`

### Later scope
- static site/app hosting for creators/mods
- managed service hosting for mods or bots
- deployment logs and environment management

---

## 9. Cross-service shared systems

## 9.1 Search
Need a shared indexing/search system for:
- streams
- users
- community posts
- wiki pages
- blogs
- news
- reviews
- deals
- coupons
- games/worlds
- mods

## 9.2 Analytics
Need a shared analytics pipeline consuming events.

Used for:
- live analytics
- tip/subscription dashboards
- content performance
- moderation insights
- search ranking signals
- game retention metrics

## 9.3 Social graph
Should become platform-level or at least platform-shared:
- follows
- blocks
- creator relationships
- membership/guild/community relations
- team/org associations later

## 9.4 Notifications
Single notification center for cross-service updates.

## 9.5 Config distribution
Services should fetch config/flags/registry info dynamically rather than hardcoding network topology.

---

## 10. Mod platform design

## 10.1 Mod identity
Each mod gets its own identity and trust tier.

### Trust tiers
- untrusted
- verified
- trusted
- platform-maintained

## 10.2 What a mod can declare
- events it subscribes to
- capabilities it needs
- namespaces it owns
- read permissions requested
- media namespaces
- billing hooks if monetized
- version compatibility

## 10.3 What a mod can do
- read allowed public or granted data
- write only to owned namespaces
- invoke capabilities it is allowed to invoke
- upload assets/media under quota
- create derived features without mutating core data

## 10.4 What a mod cannot do
- direct DB access
- mutate core billing balances
- mutate namespaces it does not own
- bypass policy engine
- spam unlimited events or storage

## 10.5 Developer experience
`openvibe.codes` should offer:
- CLI scaffolding
- service/mod starter templates
- test harnesses
- local event simulators
- capability playgrounds
- schema validation tooling
- staged/sandbox environment support

---

## 11. Data ownership and boundaries

## 11.1 Shared truth systems
- Identity truth: `openvibe.network` auth layer
- User extensible state truth: user modules
- Money truth: billing ledger
- Media truth: media object store + metadata DB
- Event truth: event log / replay store

## 11.2 Service-owned data
Services can still keep local domain-specific data, but:
- it should be local to that service’s concern
- shared cross-service state should not be stored only locally

### Example
`openvibe.live` can keep stream-session local tables, but shared creator balance, theme prefs, or cross-service notification state should not be local-only.

## 11.3 Production persistence target

The current OpenVibe repo still contains service-local SQLite scaffolding so
contributors can boot services without provisioning extra infrastructure.
That is a developer convenience, not the intended production end state.

### Canonical production target
- PostgreSQL for durable relational truth
- Redis for queues, fanout coordination, cache, leases, and other short-lived
	coordination state
- object storage for media bytes and derivatives
- async workers for replay-safe migration, media processing, reconciliation,
	and notification/billing jobs

### Migration implication
All new migration planning should target the canonical Postgres/Redis/object
storage model. The checked-in SQLite files should be treated as a transitional
bootstrap seam, not the architecture to optimize for long-term cutover.

---

## 12. Current-to-target migration mapping

## 12.1 HoboStreamer -> OpenVibe mapping

### Stay in live/realtime orbit
- channel pages -> `openvibe.live`
- streams/managed streams -> `openvibe.live` + `openre.stream`
- ingest/runtime -> `openre.stream`
- live moderation UI -> `openvibe.live`
- control widgets/overlays -> mostly `openvibe.live` but backed by shared capabilities

### Move out
- VODs/clips/thumbnails/media -> `openvibe.media`
- tips/donations/subscriptions/transactions -> billing + `openvibe.tips` / `openvibe.vip`
- DMs -> `openvibe.chat`
- TTS queue -> `openvibe.chat`
- call signaling -> `openvibe.chat`
- pastes -> `openvibe.community`
- themes -> `themes.openvibe.network`
- shared comments/discussions -> `openvibe.community` or generic comment service layered there
- news experiments -> `openvibe.news`

### Reinterpret, don’t blindly migrate
- Hobo Coins / rewards -> either platform-wide free loyalty modules or product-local progression models depending on desired future
- Hobo Bucks balances -> **NOT imported** into OpenVibe credits. Historical
	Hobo Bucks rows may be archived for reconciliation, but they do not become
	canonical ledger truth in OpenVibe
- vibe-coding sessions/events -> become seeds for `openvibe.codes` + live devstream tooling
- robotstreamer integrations -> inform `openre.stream` and capability design

## 12.2 HoboApp / hobo-tools -> OpenVibe mapping

### Move into kernel directly
- auth -> `auth.openvibe.network`
- OAuth/OIDC -> `auth.openvibe.network`
- notifications -> `api.openvibe.network` notifications service
- admin -> `admin.openvibe.network`
- setup/bootstrap -> `admin`/`api` control plane
- themes -> `themes.openvibe.network`
- my account -> `my.openvibe.network`
- URL registry/config -> `api.openvibe.network` control plane config
- deploy helpers -> seed for `openvibe.host`
- Discord service -> seed for `openvibe.community` relay + admin integration

### Move into shared packages / SDKs
- `packages/hobo-shared` -> `openvibe-sdk`, `openvibe-ui`, `openvibe-auth-client`, etc.

### Move into product repos
- sibling tool services -> `openvibe.tools`
- `hobo-quest` -> `openvibe.games`

---

## 13. Repository strategy

## 13.1 Core repos
- `openvibe-network`
- `openvibe-events`
- `openvibe-media`
- `openvibe-billing`
- `openvibe-sdk`
- `openvibe-contracts`

## 13.2 Product repos
- `openvibe-live`
- `openre-stream`
- `openvibe-chat`
- `openvibe-community`
- `openvibe-tools`
- `openvibe-games`
- `openvibe-content` (or multiple repos later for wiki/blog/news/reviews/deals/coupons/trade/host depending maturity)

## 13.3 Why not one repo per domain on day one
Because some domains are distinct product surfaces but still share enough runtime and contributor concerns that initially they may live in a combined repo or umbrella repo.

Example:
- `openvibe.wiki`, `openvibe.blog`, `openvibe.news`, `openvibe.reviews`, `openvibe.deals`, `openvibe.coupons`, `openvibe.trade`, and `openvibe.host` may initially share ingestion, AI, content, and moderation foundations.

The important part is distinct product modules and deploy surfaces, not necessarily maximal repo fragmentation on day one.

---

## 14. Migration phases

## Phase 0 — audit and freeze

### Goals
- inventory current HoboStreamer routes/tables/subsystems
- inventory hobo-tools auth/admin/theme/notification/subdomain behaviors
- document coupling points
- document legacy environment variables and URL assumptions
- define data migration checklist

### Deliverables
- route ownership map
- schema ownership map
- env/config map
- migration risk log

---

## Phase 1 — extract the kernel

### Build first
- `openvibe-events`
- user modules system
- capability registry
- contract registry
- service registry
- policy engine skeleton
- SDK foundations

### Why first
Because every product/service/mod depends on these primitives.

---

## Phase 2 — extract auth/control plane

### Build
- `auth.openvibe.network`
- `api.openvibe.network`
- `admin.openvibe.network`
- `my.openvibe.network`
- `themes.openvibe.network`

### Migrate from hobo-tools
- auth
- OAuth
- notifications
- admin
- themes
- account management
- URL/config registry

### Transitional requirement
Support old and new identity flows during cutover.

---

## Phase 3 — media platform

### Build
- `openvibe.media`
- upload init/complete flow
- processing workers
- media object metadata model
- hot/cold storage lifecycle

### Migrate from HoboStreamer
- VODs
- clips
- thumbnails
- avatar/emote/media handling patterns where appropriate

---

## Phase 4 — live + restream split

### Build
- `openvibe-live`
- `openre-stream`

### Migrate from HoboStreamer
- stream/channel pages
- stream dashboard UX
- ingest/restream logic separation
- stream analytics UI
- SSR public pages

### Result
Streaming runtime and public live surface stop being one giant multi-responsibility service.

---

## Phase 5 — communication split

### Build
- `openvibe-chat`
- `openvibe-community`

### Migrate
- chat
- DMs
- call signaling
- TTS manager
- audio queue / soundboard layer
- pastes
- comments/discussion primitives
- Discord relay

### Result
The communication and community systems become reusable across all domains.

---

## Phase 6 — billing and creator economy

### Build
- billing ledger
- credits / tip balance
- subscription engine
- `openvibe.tips`
- `openvibe.vip`

### Migrate
- donation goals
- transaction-like logic
- subscriptions
- media request monetization patterns

### Result
Monetization stops being scattered inside HoboStreamer.

---

## Phase 7 — tools, games, and content products

### Build/migrate
- `openvibe.tools`
- `openvibe.games`
- `openvibe.codes`
- AI platform
- `openvibe.wiki`
- `openvibe.blog`
- `openvibe.news`
- `openvibe.reviews`
- `openvibe.deals`
- `openvibe.coupons`
- `openvibe.trade`
- `openvibe.host`

---

## Phase 8 — mod ecosystem

### Build
- mod registry
- trust levels
- install/enable/disable flow
- sandbox/dev environment
- policy-bound capability and data access
- optional marketplace hooks

---

## Phase 9 — final cutover

Current execution note: the checked-in repository is actively tracking the
post-Phase-8 hardening/parity tranche in [PHASE_9.md](PHASE_9.md). Use that
file plus [../PHASES.md](../PHASES.md) as the authoritative status documents
for the current hard-cut work.

### Actions
- final export/import/reconciliation completed against the canonical OpenVibe
	persistence target
- compatibility bridges retired or left inert
- old routes redirected
- legacy identity paths retired
- Hobo repos become read-only migration sources / archives, not runtime
	dependencies
- Hobo domains become redirects or archives where appropriate
- no long-term dual-write / dual-read dependency remains
- migration audit complete

---

## 15. SEO/rendering strategy

## 15.1 Rule
Important public pages must render useful HTML on first response.

## 15.2 SSR candidates
- creator/channel pages
- live stream pages
- public community profile pages where relevant
- maybe public wiki/blog/news/review/deal pages when dynamic freshness is needed

## 15.3 Static/ISR candidates
- blog posts
- wiki pages
- news pages
- reviews
- deals
- coupon pages
- docs/tutorials on `openvibe.codes`

## 15.4 Additional requirements
- canonical URLs
- structured data
- sitemap generation
- indexing events
- cache invalidation rules
- no empty-shell JS for major discovery pages

---

## 16. Scalability model

## 16.1 General principle
Split by bottleneck, not by ideology.

## 16.2 High-scale surfaces
- event system
- chat/calls/presence
- stream ingest/restream
- media processing
- AI content pipelines
- search/indexing

## 16.3 Stateful vs stateless
- public APIs and renderers should be mostly stateless
- event queues and DB-backed truth systems hold state
- realtime presence/call/chat fanout will need specialized handling

## 16.4 Queue-heavy jobs
- media processing
- AI generation/summarization
- scraping and ingestion
- email/push notifications
- analytics computation
- billing reconciliation
- cold-storage lifecycle

---

## 17. Biggest risks and how to avoid them

### Risk 1 — renaming without extracting platform primitives
Avoid by building kernel first.

### Risk 2 — too many domains turning into too many disconnected backends
Avoid by centralizing identity, events, media, billing, capabilities, and user modules.

### Risk 3 — direct service coupling comes back
Avoid by enforcing events/capabilities/platform API rules.

### Risk 4 — mods become unsafe or impossible
Avoid by designing mod trust tiers, policies, namespaces, and SDKs from the start.

### Risk 5 — economy gets corrupted
Avoid by ledger-first billing and idempotent external transaction handling.

### Risk 6 — AI products each become their own isolated pile
Avoid by centralizing provider/backend orchestration in `ai.openvibe.network`.

### Risk 7 — current Hobo features get lost in migration
Avoid by mapping every major existing feature to a target owner before writing code.

---

## 18. Immediate next actions

### 18.1 Architecture work products to create immediately
1. current-state route ownership spreadsheet/map
2. current-state table ownership spreadsheet/map
3. event schema draft v1
4. capability schema draft v1
5. user module namespace draft v1
6. service registry manifest draft v1
7. mod permission model draft v1

### 18.2 Build order for first actual code
1. `openvibe-events`
2. `openvibe-network` core auth + user modules + capability registry
3. `openvibe-sdk`
4. `openvibe-media`
5. minimal `openvibe-live` public SSR page
6. `openre-stream` ingest/restream shell
7. `openvibe-chat` core message/call/TTS queue shell

### 18.3 First cutover milestone
A user can:
- sign in through OpenVibe identity
- visit a live page on `openvibe.live`
- have user module state loaded from the new kernel
- chat through the new communication layer or a compatibility bridge
- have media managed through the new media system

That is the first real proof the platform kernel works.

---

## 19. Final stance

OpenVibe should be treated as a platform-kernel extraction and service realignment project.

Not a logo swap.
Not a simple repo rename.
Not a “split it into a bunch of microservices” project.

The right move is:
- extract the existing strong ideas already present in Hobo
- centralize the shared platform concerns
- move product-specific concerns into cleaner domains
- keep the whole system moddable and contributor-friendly from the beginning

If this is done correctly, HoboStreamer and HoboApp stop being the permanent final architecture and instead become the seed crystal for a much larger platform.
