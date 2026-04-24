# @openvibe/sdk

Server-side SDK for OpenVibe services. Depends on `@openvibe/contracts`.

## What's in here

* `OpenVibeAuthClient` — multi-issuer JWT verifier (RS256). Trust both
  `auth.openvibe.network` and `hobo.tools` simultaneously during the migration.
* `RegistryClient` — typed wrapper around the network service registry,
  capability registry, contract registry, and URL registry endpoints.
* `EventsClient` — typed wrapper around the openvibe-events HTTP API.
  Always builds envelopes through `@openvibe/contracts/envelope`.
* Express middleware: `requireOpenVibeAuth`, `optionalOpenVibeAuth`,
  `requireInternalKey`, `requireRole`.

## Multi-issuer example

```js
const { OpenVibeAuthClient, requireOpenVibeAuth } = require('@openvibe/sdk');

const auth = new OpenVibeAuthClient();
auth.addIssuer({
    issuer: process.env.OPENVIBE_AUTH_URL,
    publicKeyPath: process.env.OPENVIBE_AUTH_PUBLIC_KEY,
    label: 'openvibe',
});
if (process.env.HOBO_TOOLS_URL && process.env.HOBO_TOOLS_PUBLIC_KEY) {
    auth.addIssuer({
        issuer: process.env.HOBO_TOOLS_URL,
        publicKeyPath: process.env.HOBO_TOOLS_PUBLIC_KEY,
        label: 'hobo-tools (legacy)',
    });
}

app.get('/api/me', requireOpenVibeAuth(auth), (req, res) => res.json(req.user));
```
