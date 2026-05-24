'use strict';

const { formatBytes, renderRequest: sharedRenderRequest } = require('./ssr-shared');

function buildSurface(config) {
    const limits = config.limits;
    return {
        id: 'codes',
        host: 'openvibe.codes',
        origin: config.surfaces.codes,
        label: 'openvibe.codes',
        title: 'OpenVibe Codes — Platform Docs, API Reference & Guides',
        description: 'Engineering docs, API reference, and operator guides for the OpenVibe streaming platform.',
        kind: 'WebSite',
        implemented: true,
        indexable: true,
        heroTitle: 'openvibe.codes — native docs and platform notes',
        heroText: `Technical docs and API reference for the OpenVibe network. Plain-English engineering notes with no marketing layer. Public media objects hard-stop at ${formatBytes(limits.publicMediaObjectMaxBytes)}.`,
        entries: [
            {
                path: '/docs/api-overview',
                title: 'OpenVibe API Overview',
                summary: 'How to use the OpenVibe REST API for streams, users, chat, clips, and billing.',
                publishedAt: '2026-05-01T09:00:00.000Z',
                kind: 'TechArticle',
                sections: [
                    'All OpenVibe services expose JSON REST APIs under /api/v1/. Authentication uses Bearer tokens from the openvibe-network service. Tokens can be obtained via OAuth2 (web apps) or API token (bots and automation).',
                    'Base URL: each service runs on its own port in development. In production, all services are accessible via their domain (openvibe.live for live, openvibe.chat for chat, etc.).',
                    'Auth header: `Authorization: Bearer <token>`. Token format: JWT (RS256) for user sessions, `ovt_` prefix for long-lived API tokens. API tokens are managed at my.openvibe.network/tokens.',
                    'Common response format: `{ ok: true, ... }` on success. Errors return `{ error: "message" }` with appropriate HTTP status codes. Rate limiting uses 429 with Retry-After header.',
                ],
            },
            {
                path: '/docs/websocket-chat',
                title: 'Chat WebSocket Protocol',
                summary: 'How to connect to and use the OpenVibe chat WebSocket for real-time messaging, moderation, and events.',
                publishedAt: '2026-05-02T09:00:00.000Z',
                kind: 'TechArticle',
                sections: [
                    'Connect to `wss://openvibe.chat/ws/chat`. On connect, the server sends a `{type:"welcome", connectionId:"..."}` message. Send a `{type:"join", channel:"channel-name", token:"..."}` to join a channel.',
                    'Message types: `chat` (send/receive messages), `join`/`leave` (channel membership), `ban`/`timeout` (moderation), `system` (server announcements), `tip` (tip alert events), `tts` (text-to-speech trigger).',
                    'Authentication: join with a valid Bearer token for authenticated sessions. Anonymous sessions can join with `token: null` in read-only mode depending on channel settings.',
                    'Bot integration: create an API token at my.openvibe.network/tokens with `chat:write` scope. Use the token in the join message. Bots are rate-limited to 20 messages/minute per channel.',
                ],
            },
            {
                path: '/docs/streaming-whip',
                title: 'Streaming via WHIP to OpenVibe',
                summary: 'How to broadcast to openre.stream using the WHIP protocol from OBS, the browser, or custom FFmpeg pipelines.',
                publishedAt: '2026-05-03T09:00:00.000Z',
                kind: 'TechArticle',
                sections: [
                    'WHIP endpoint: `https://openre.stream/whip/<stream-key>`. POST an SDP offer to this URL with Content-Type: application/sdp. The server responds with an SDP answer and ICE candidates.',
                    'OBS 30+ WHIP setup: Settings > Stream > Service: Custom > WHIP URL: `https://openre.stream/whip/<your-stream-key>`. Leave bearer token blank for stream-key auth.',
                    'Browser streaming: use the dashboard at openre.stream/dashboard. Click "Start Streaming" to use navigator.mediaDevices.getUserMedia() + RTCPeerConnection for WHIP negotiation automatically.',
                    'FFmpeg WHIP: `ffmpeg -re -i input.mp4 -c:v libx264 -c:a aac -f whip https://openre.stream/whip/<stream-key>`. Requires FFmpeg 7.0+ built with WHIP support.',
                ],
            },
            {
                path: '/docs/host-routing-truth',
                title: 'Host Routing Without Localhost Lies',
                summary: 'How OpenVibe resolves canonical hosts locally without sprinkling raw loopback URLs across product surfaces.',
                publishedAt: '2026-04-29T10:00:00.000Z',
                kind: 'TechArticle',
                sections: [
                    'Use the shared URL defaults to derive public origins per surface instead of hardcoding localhost or production-only URLs.',
                    'Host-aware services stay honest in staging by serving the same logical surfaces under *.localhost domains.',
                    'This keeps browser smoke meaningful and avoids fake prod links in prelaunch environments.',
                ],
            },
            {
                path: '/docs/self-hosting',
                title: 'Self-Hosting OpenVibe',
                summary: 'How to clone, configure, and run OpenVibe services on your own server.',
                publishedAt: '2026-05-04T09:00:00.000Z',
                kind: 'TechArticle',
                sections: [
                    'Prerequisites: Node.js 20+, SQLite3, FFmpeg, yt-dlp, nginx. Each service is a standalone Express app — clone the monorepo and run `npm install` from the root.',
                    'Configuration: each service reads a `.env` file from its directory. Copy `.env.example` to `.env` and fill in the required values. Minimum required: SESSION_SECRET, INTERNAL_KEY, and the public origin URLs.',
                    'Running services: `npm start` (production) or `npm run dev` (development with --watch). Each service is independent — start only the services you need.',
                    'nginx configuration: proxy each service to its domain. Example configs are in `deploy/nginx/`. Enable SSL via certbot: `certbot --nginx -d openvibe.live -d openre.stream ...`.',
                ],
            },
        ],
    };
}

function renderRequest({ config, routePath }) {
    return sharedRenderRequest({ config, surface: buildSurface(config), routePath });
}

module.exports = { buildSurface, renderRequest };
