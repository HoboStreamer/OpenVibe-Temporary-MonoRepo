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
  └─ openvibe.community.localhost:4900 ← Cookie SSO via .localhost domain
```

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

## Pattern B — Cross-domain cookie SSO + sessionStorage (community, tools)

The network service sets the `openvibe_token` cookie on TWO domains on every login:
1. Primary domain: `.openvibe.network.localhost` (dev) or `.openvibe.network` (prod)
2. Localhost SSO domain: `.localhost` (dev only)

This means **all `*.localhost` services automatically receive the cookie** without their own auth routes. Community and tools use this.

**Sign-in flow from community SSR pages:**
```
User clicks "Sign in" (href = {network}/api/v1/session/bridge?return_to={community})
  → If already logged in: bridge redirects to {community}#openvibe_token={jwt}
  → If not logged in: bridge → {auth}/oauth/authorize → login → back to bridge → {community}#openvibe_token={jwt}
  → Community SPA loads: consumeBridgeToken() reads hash → saves to sessionStorage
  → exchangeNetworkSession() POSTs to {network}/api/v1/session/exchange with Bearer token
  → Session resolved; openvibe-auth-changed event fired → nav updates
```

**Client-side session load (openvibe.js):**
```js
loadSession()
  → consumeBridgeToken()   // reads #openvibe_token from URL hash, saves to sessionStorage
  → exchangeNetworkSession()
      → POST {network}/api/v1/session/exchange
          with Authorization: Bearer {sessionStorage token}  (or .localhost cookie)
      → returns { authenticated, anonymous, user, access_token }
  → fires 'openvibe-auth-changed' CustomEvent on document
```

**Key functions in openvibe.js:**
- `signInUrl(returnTo)` → bridge URL pointing back to current page
- `signOutUrl(returnTo)` → `{auth}/oauth/logout?return_to={bridge_return_url}`
- `consumeBridgeToken()` → reads hash, saves to sessionStorage
- `exchangeNetworkSession()` → POSTs to network, gets session
- `networkRequestJson(path, opts)` → fetches from network with Bearer + credentials:include

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

## Known broken patterns (fixed 2026-05-23)

**Fixed:** Community SSR sign-in links pointed to `{network}/auth/login` which doesn't exist as a route. Corrected to `{network}/api/v1/session/bridge?return_to={community}`.

**Fixed:** `tools.html` on the network surface had `href="/auth/login"` and `href="/auth/register"` — neither route exists. Corrected to `/oauth/authorize`.

**Fixed:** Community SSR shell did not load `openvibe.js`, so client-side auth state was never established on SSR pages (/pulse, /threads, /pastes, /p/:slug, etc.). Script tag added to `_shell()`.

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
