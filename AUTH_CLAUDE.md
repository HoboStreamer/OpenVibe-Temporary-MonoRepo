# AUTH_CLAUDE.md — OpenVibe Authentication Reference

This document describes how auth works across every surface. Read this before touching sign-in, sign-out, session, or token code anywhere in the monorepo.

---

## Architecture overview

OpenVibe uses **RS256 JWTs** issued by the network service. There is one identity provider and two auth patterns depending on whether a service can receive the network's cookie directly.

```
Browser
  │
  ├─ openvibe.network.localhost:4100  ← Issues tokens, sets cookies, runs OAuth
  │    (host-router routes "network" + "auth" + "my" + "admin" surfaces)
  │
  ├─ openvibe.live.localhost:4600     ← Cookie-based auth (own /auth/login route)
  ├─ openre.stream.localhost:4700     ← Cookie-based auth (own /auth/login route)
  ├─ openvibe.tips.localhost:?        ← Cookie-based auth (own /auth/login route)
  └─ openvibe.community.localhost:4900 ← Cookie SSO via .localhost domain (dev)
                                        ← Session sync via bridge token (prod)
```

**Critical prod distinction:** In development all services share `.localhost` so the network cookie reaches every surface. In production `openvibe.community` is a different TLD from `openvibe.network` — the network cookie (`Domain=.openvibe.network`) is **never sent** to `openvibe.community`. Community uses the bridge-token + session-sync pattern described in Pattern B to bridge that gap.

---

## Pattern A — Cookie-based auth (live, restream, tips)

These services have their own `auth-routes.js` built with `buildAuthRouter()`.

**Sign-in flow:**
```
User clicks /auth/login
  → service redirects to {auth}/oauth/authorize?return_to={bridge_url}
  → OAuth form shown (login or anonymous)
  → After success: bridge at {network}/api/v1/session/bridge?return_to={service}/auth/callback
  → Bridge appends #openvibe_token={jwt} to callback URL
  → /auth/callback page (client HTML) reads hash, POSTs token to /auth/callback
  → Service sets HttpOnly cookie `openvibe_token` for its own domain
  → Subsequent SSR requests: optionalOpenVibeAuth reads cookie → req.user populated
```

**Files:**
- `services/openvibe-live/server/auth-routes.js`
- `services/openre-stream/server/auth-routes.js`
- `services/openvibe-tips/server/auth-routes.js`
- `packages/openvibe-sdk/session.js` — `buildCallbackPage`, `setSessionCookie`, `clearSessionCookies`

**Cookie name:** `openvibe_token`
**Cookie domain:** derived from the service's own base URL (e.g. `.openvibe.live.localhost`)

---

## Pattern B — Cross-domain bridge token + session sync (community, tools)

The network service sets the `openvibe_token` cookie on TWO domains on every login:
1. Primary domain: `.openvibe.network.localhost` (dev) or `.openvibe.network` (prod)
2. Localhost SSO domain: `.localhost` (dev only)

In **dev** all `*.localhost` services automatically receive the cookie. In **prod** community has a different TLD so it relies on the bridge token and the session-sync endpoint instead.

**Sign-in flow from community SSR pages (prod):**
```
User clicks "Sign in" (href = {network}/api/v1/session/bridge?return_to={community_page})
  → If already logged in: bridge redirects to {community_page}#openvibe_token={jwt}
  → If not logged in: bridge → {auth}/oauth/authorize → login → back to bridge → {community_page}#openvibe_token={jwt}
  → openvibe.js loads: consumeBridgeToken() reads hash → saves JWT to sessionStorage
  → exchangeNetworkSession() calls {network}/api/v1/session/exchange with Bearer token
  → Returns { authenticated, anonymous, user, access_token }
  → hydrateNavSession() syncs session to community domain (see Session Sync below)
  → Nav updates: avatar/initials dropdown rendered in #ov-nav-session
```

**Client-side session load (openvibe.js on community):**
```js
loadSession()
  → consumeBridgeToken()     // reads #openvibe_token from URL hash, saves to sessionStorage
  → exchangeNetworkSession()
      → POST {network}/api/v1/session/exchange
          with Authorization: Bearer {sessionStorage token}  (or .localhost cookie in dev)
      → returns { authenticated, anonymous, user, access_token }
  → fires 'openvibe-auth-changed' CustomEvent on document
```

**After `loadSession()` resolves, `hydrateNavSession()` does two things:**
1. Calls `GET /api/v1/session/sync` on community with `Authorization: Bearer {access_token}` → community sets its own `openvibe_token` cookie (same-domain, httpOnly) → all subsequent form POSTs (thread replies, paste promote, etc.) carry auth automatically
2. Renders the account dropdown in `#ov-nav-session` with avatar/initials, username, account links, and sign-out

**Key functions in openvibe.js:**
- `signInUrl(returnTo)` → bridge URL pointing back to current page
- `signOutUrl(returnTo)` → `{auth}/oauth/logout?return_to={bridge_return_url}`
- `consumeBridgeToken()` → reads hash, saves to sessionStorage
- `exchangeNetworkSession()` → POSTs to network, gets session + `access_token`
- `hydrateNavSession()` → renders avatar dropdown + fires session sync
- `networkRequestJson(path, opts)` → fetches from network with Bearer + credentials:include

**Token lifetime:** Access tokens have a 2-hour TTL (`ACCESS_TOKEN_TTL_SECONDS = 7200`). Each page load re-runs `exchangeNetworkSession()` which refreshes the token transparently if the network cookie is still valid.

---

## Session sync endpoint (community-specific)

`GET {community}/api/v1/session/sync`

Called by client-side `hydrateNavSession()` after a successful `exchangeNetworkSession()`. Bridges the TLD gap in production so form POSTs on community carry authenticated identity.

**Request:** `Authorization: Bearer {access_token}` header (the token returned by network's `/session/exchange`)

**What it does:**
1. `optionalOpenVibeAuth` middleware verifies the bearer token → populates `req.user`
2. Sets `openvibe_token` as an `httpOnly` same-domain cookie on `openvibe.community`
3. Returns `{ ok: true }`

**Effect:** After this call, all form POSTs (thread replies at `/threads/:id/reply`, paste promote at `/pastes/:slug/promote`) carry the `openvibe_token` cookie → `req.user` is populated in SSR handlers → authenticated actions work without requiring an API client.

**Source:** `services/openvibe-community/server/index.js` — `app.get('/api/v1/session/sync', ...)`

**Cookie set:**
```
openvibe_token=<jwt>; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800
Secure=true in production, false in development
```

---

## The bridge endpoint

`GET {network}/api/v1/session/bridge?return_to={url}`

- **If logged in:** appends `#openvibe_token={jwt}` to return_to and redirects 302
- **If not logged in:** redirects to `{auth}/oauth/authorize?return_to={bridge_url}` (loops back after OAuth)
- **Allowed return_to hosts:** any `*.localhost`, any `*.openvibe.network`, any configured surface URL, `localhost`/`127.0.0.1`
- **Source:** `services/openvibe-network/server/native-auth.js` — `router.get('/session/bridge', ...)`

The `isAllowedRedirectUri()` check is permissive enough that all community/live/tools URLs pass in both dev and prod.

---

## The session exchange endpoint

`POST {network}/api/v1/session/exchange`

Accepts: cookie `openvibe_token` OR `Authorization: Bearer {jwt}`
Returns: `{ authenticated, anonymous, user, access_token }`

Used by client-side openvibe.js after bridge redirect. Also called on every page load to refresh session state.

**Source:** `native-auth.js` — `router.post('/session/exchange', ...)`

---

## Cookie setup

Set during login in `native-auth.js` → `setSessionCookie()`:

```
openvibe_token=<jwt>; Path=/; HttpOnly; SameSite=Lax; Max-Age=<TTL>; Domain=<domain>
```

Three cookies set on login:
1. `Domain=.openvibe.network.localhost` — primary network domain (dev)
2. `Domain=.localhost` — cross-service SSO for all *.localhost (dev only)
3. Clear no-domain cookie (migration cleanup)

In prod, only `.openvibe.network` is set (no `.localhost` SSO).

---

## Token verification

Every service uses `OpenVibeAuthClient` from `@openvibe/sdk`:

```js
const authClient = new OpenVibeAuthClient();
authClient.addIssuer({
    issuer: config.auth.issuer,          // e.g. https://auth.openvibe.network
    publicKeyPath: config.auth.publicKeyPath,
    label: 'openvibe',
});
```

`optionalOpenVibeAuth(authClient)` middleware checks for token in this order:
1. `Authorization: Bearer {token}` header
2. `req.cookies.openvibe_token`
3. `req.cookies.token` (legacy)
4. `req.query.token`

**Source:** `packages/openvibe-sdk/middleware.js`

---

## OAuth authorize page

Served at `{auth}/oauth/authorize` (also proxied at `{network}/oauth/authorize` via host-router).

- Shows login form (username + password) AND anonymous session option
- After login: checks `return_to` param, redirects there (validated by `isAllowedRedirectUri`)
- The default `return_to` is `config.surfaces.my` (My Account page)

**Source:** `native-auth.js` — `router.get('/oauth/authorize', ...)`

---

## Sign-out flow

```
User clicks Sign out
  → signOutUrl() builds: {auth}/oauth/logout?return_to={bridge_return_url}
  → /oauth/logout clears cookies (all three domains)
  → Redirects to return_to (usually the page they were on, stripped of hash)
```

Note: sessionStorage token is NOT cleared by the server. Client-side openvibe.js's `loadSession()` call after logout will fail with 401 → clears sessionStorage token and dispatches auth-changed with guest session.

---

## Known broken patterns

**Fixed 2026-05-23:** Community SSR sign-in links pointed to `{network}/auth/login` which doesn't exist as a route. Corrected to `{network}/api/v1/session/bridge?return_to={community}`.

**Fixed 2026-05-23:** `tools.html` on the network surface had `href="/auth/login"` and `href="/auth/register"` — neither route exists. Corrected to `/oauth/authorize`.

**Fixed 2026-05-23:** Community SSR shell (`_shell()`) did not load `openvibe.js`, so client-side auth state was never established on SSR pages (/pulse, /threads, /pastes, /p/:slug, etc.). Script tag added to `_shell()`.

**Fixed 2026-05-24:** `_forumShell()` in `ssr-shared.js` was missing `openvibe.js` entirely and had a hardcoded static `<a href="...">Sign in</a>` link. Fixed: added `<script src="/assets/openvibe.js" defer></script>`, replaced the static link with `<div id="ov-nav-session"></div>`, and added a `DOMContentLoaded` init block calling `OpenVibe.primeEnvironment()` + `OpenVibe.renderChrome('community')`. All forum pages (`/forum`, `/forum/s/:slug`, `/forum/t/:id`) now have full auth.

**Fixed 2026-05-24:** Community auth was client-side only — form POSTs (thread replies, paste promote) had `req.user = null` in production because the network cookie (`Domain=.openvibe.network`) is never sent to `openvibe.community`. Fixed via the `/api/v1/session/sync` endpoint that sets a same-domain cookie after the client-side bridge exchange completes.

---

## Nav session UI — buddy icon + dropdown

Every surface that loads `openvibe.js` and has `<div id="ov-nav-session"></div>` in its shell gets the account dropdown automatically via `hydrateNavSession()`.

**Authenticated state:**
```html
<button class="ov-anon-trigger" aria-label="Account menu">
  <img class="ov-nav-avatar" src="{avatar_url}">  <!-- falls back to initials if broken -->
  <span class="ov-nav-initials" style="display:none">AB</span>
</button>
<div class="ov-anon-dropdown" hidden>
  <div class="ov-anon-dropdown-name">@username</div>
  <a href="{my_account}">My account</a>
  <a href="{my_account}/sessions">Sessions</a>
  <a href="{sign_out_url}" class="--danger">Sign out</a>
</div>
```

**Anonymous state:** Shows "Anonymous" trigger with switch-identity, create-account, and leave-anonymous options.

**Signed-out state:** Shows an "Anonymous" button (which triggers sign-in bridge flow) and a "Sign in" link.

**Avatar fallback:** `onerror` on the `<img>` hides it and shows the `.ov-nav-initials` span. Initials are derived from display_name (first + last word initials) or username (first 2 chars).

**CSS classes added to community `ssr-shared.js` `_styles()`:**
- `.ov-nav-avatar` — 26px circle, `object-fit: cover`
- `.ov-nav-initials` — 26px circle, gradient background, white text

**`avatar_url` source:** Returned by network's `/api/v1/session/exchange` inside the `user` object via `buildExchangeResponse()`.

---

## Adding auth to a new service

Use `buildAuthRouter` from `openvibe-live` or `openre-stream` as the template:

```js
const { buildAuthRouter } = require('./auth-routes');
const authRouter = buildAuthRouter({ authClient, config, deriveBaseUrl, serviceName });
app.use(authRouter);
```

Required config keys: `config.auth.url`, `config.network.url`
Required: `buildCallbackPage` and `setSessionCookie` from `@openvibe/sdk/session`

The service then has working `/auth/login`, `/auth/callback`, `/auth/logout` routes that complete the bridge flow and set a local session cookie.
