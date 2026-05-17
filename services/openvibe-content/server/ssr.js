'use strict';

const { renderIcon } = require('@openvibe/icons');

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = Number(bytes || 0);
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value % 1 === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}

function toIsoDate(value) {
    return new Date(value).toISOString();
}

function navItems(config) {
    return [
        { id: 'codes', label: 'Codes', href: `${config.surfaces.codes}/` },
        { id: 'blog', label: 'Blog', href: `${config.surfaces.blog}/` },
        { id: 'wiki', label: 'Wiki', href: `${config.surfaces.wiki}/` },
        { id: 'news', label: 'News', href: `${config.surfaces.news}/` },
        { id: 'reviews', label: 'Reviews', href: `${config.surfaces.reviews}/` },
        { id: 'deals', label: 'Deals', href: `${config.surfaces.deals}/` },
        { id: 'coupons', label: 'Coupons', href: `${config.surfaces.coupons}/` },
        { id: 'trade', label: 'Trade', href: `${config.surfaces.trade}/` },
        { id: 'host', label: 'Host', href: `${config.surfaces.host}/` },
    ];
}

function buildSurfaceCatalog(config) {
    const limits = config.limits;
    return {
        codes: {
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
        },
        blog: {
            id: 'blog',
            host: 'openvibe.blog',
            origin: config.surfaces.blog,
            label: 'openvibe.blog',
            title: 'OpenVibe Blog — Platform Updates & Engineering Notes',
            description: 'Product updates, engineering notes, and community announcements from the OpenVibe team.',
            kind: 'Blog',
            implemented: true,
            indexable: true,
            heroTitle: 'The OpenVibe Blog',
            heroText: 'Platform updates, engineering notes, and community announcements. No VC talk, no startup cosplay. Just what\'s shipping and why.',
            entries: [
                {
                    path: '/posts/whip-goes-live',
                    title: 'WHIP Broadcasting Is Now Live on openre.stream',
                    summary: 'The openre.stream dashboard now supports browser-based WHIP broadcasting. Stream without OBS, right from your browser.',
                    publishedAt: '2026-05-05T10:00:00.000Z',
                    kind: 'BlogPosting',
                    sections: [
                        'Browser-native streaming is now live. Go to openre.stream/dashboard, pick your camera and mic, hit Start — your stream is live via WHIP with sub-second latency.',
                        'How it works: the dashboard uses navigator.mediaDevices.getUserMedia() for device access and RTCPeerConnection for WHIP negotiation. No plugins, no downloads.',
                        'OBS users can also point OBS 30\'s WHIP output at openre.stream for a lower-latency alternative to RTMP. Same stream key works for both methods.',
                        'What\'s next: multi-track audio mixing in the browser dashboard, co-streaming (invite a guest to your stream), and chat overlay integration.',
                    ],
                },
                {
                    path: '/posts/content-surfaces-launch',
                    title: 'Content Surfaces Now Live: Host, Wiki, News, Reviews, Deals',
                    summary: 'Five new content surfaces launched today: openvibe.host (hosting guides), openvibe.wiki (streaming reference), openvibe.news, openvibe.reviews, and openvibe.deals.',
                    publishedAt: '2026-05-06T09:00:00.000Z',
                    kind: 'BlogPosting',
                    sections: [
                        'Five content surfaces launched today as fully indexable, real-content pages. No placeholder copy, no noindex stubs.',
                        'openvibe.host covers VPS setup guides, self-hosting how-tos, and honest hosting provider reviews. openvibe.wiki is a streaming technology reference (RTMP, WHIP, HLS, OVC currency).',
                        'openvibe.news covers the streaming and creator economy news. openvibe.reviews has real gear reviews with honest ratings. openvibe.deals lists current offers on streaming tools and hosting.',
                        'All surfaces share the same rendering engine (openvibe-content) and brand design. Articles live in the service\'s SSR catalog for now; dynamic ingestion via openvibe-ai workers is planned.',
                    ],
                },
                {
                    path: '/posts/native-runtime-before-polish',
                    title: 'Ship the native runtime before polishing the wallpaper',
                    summary: 'On why honest readiness and host routing matter more than fake feature parity while the platform is still prelaunch.',
                    publishedAt: '2026-04-29T12:00:00.000Z',
                    kind: 'BlogPosting',
                    sections: [
                        'Migration, media, AI, staff/admin, and realtime foundations already existed in the repo before this content runtime landed.',
                        'The highest-value missing layer was public host delivery plus a readiness/reporting stack that reflects the actual repo state.',
                        'That is why some hosts shipped while others remain explicit noindex placeholders instead of pretend launch pages.',
                    ],
                },
                {
                    path: '/posts/vip-and-tips-launch',
                    title: 'VIP Subscriptions and Creator Tips Are Live',
                    summary: 'openvibe.vip and openvibe.tips are now live with the full subscription tier and direct tip infrastructure.',
                    publishedAt: '2026-05-07T09:00:00.000Z',
                    kind: 'BlogPosting',
                    sections: [
                        'Two more surfaces launched: openvibe.vip for creator subscriptions and openvibe.tips for direct tipping. Both are backed by the billing service on openvibe.vip.',
                        'VIP tiers: Viewer (free), Supporter (500 OVC/month), VIP (1500 OVC/month), Creator (5000 OVC/month). Tiers unlock chat badges, emotes, TTS priority, soundboard access, and extended clip limits.',
                        'Direct tips: any viewer can tip any creator directly using OVC credits. Tips trigger real-time overlay alerts, chat announcements, and TTS if the creator has it enabled.',
                        'Connector integrations for tip alerts are wired to Streamlabs, StreamElements, PowerChat, and a generic webhook for custom overlays.',
                    ],
                },
            ],
        },
        wiki: {
            id: 'wiki',
            host: 'openvibe.wiki',
            origin: config.surfaces.wiki,
            label: 'openvibe.wiki',
            title: 'OpenVibe Wiki — Streaming, Tools & Platform Reference',
            description: 'Reference wiki for streaming technology, OpenVibe platform concepts, self-hosting guides, and community vocabulary.',
            kind: 'WebSite',
            implemented: true,
            indexable: true,
            heroTitle: 'The OpenVibe Reference Wiki',
            heroText: 'Plain-language reference for streaming technology, platform concepts, and the OpenVibe ecosystem. No jargon walls. No paywalls.',
            entries: [
                {
                    path: '/concepts/rtmp',
                    title: 'RTMP — Real-Time Messaging Protocol',
                    summary: 'RTMP is the protocol used by most streaming software (OBS, Streamlabs, SLOBS) to send live video to an ingest server.',
                    publishedAt: '2026-05-01T09:00:00.000Z',
                    kind: 'DefinedTerm',
                    sections: [
                        'RTMP (Real-Time Messaging Protocol) was developed by Macromedia (later Adobe) for low-latency audio/video streaming. Despite being 20+ years old, it remains the dominant ingest protocol for live streaming.',
                        'RTMP runs over TCP on port 1935. Streams are sent from broadcaster software (OBS, XSplit, mobile apps) to an ingest server (nginx-rtmp, SRS, Wowza). The ingest server then converts to HLS or WebRTC for viewer playback.',
                        'RTMP stream keys: most platforms assign a unique stream key per channel. The streaming software sends to `rtmp://ingest.example.com/live/<stream-key>`. The ingest server uses the key to authenticate the publisher.',
                        'RTMPS is RTMP over TLS (port 443). Required by most platforms as of 2023. OBS supports RTMPS natively; check your streaming software version if you get connection errors.',
                    ],
                },
                {
                    path: '/concepts/whip',
                    title: 'WHIP — WebRTC-HTTP Ingest Protocol',
                    summary: 'WHIP is the modern successor to RTMP, enabling ultra-low latency browser-based streaming without plugins.',
                    publishedAt: '2026-05-01T10:00:00.000Z',
                    kind: 'DefinedTerm',
                    sections: [
                        'WHIP (WebRTC-HTTP Ingest Protocol) is a 2023 IETF standard for sending live media from browsers or native apps directly to a media server via WebRTC. It enables sub-second latency without plugins.',
                        'Unlike RTMP, WHIP works natively in modern browsers using getUserMedia() and RTCPeerConnection. OpenVibe uses WHIP for the openre.stream dashboard, enabling browser-only streaming.',
                        'WHIP negotiation: the client POSTs an SDP offer to a WHIP endpoint URL. The server replies with an SDP answer and ICE candidates. Media flows over DTLS-SRTP after negotiation.',
                        'Compatibility: OBS 30+ supports WHIP output. Gstreamer, FFmpeg 7+, and most recent streaming apps support WHIP. Check your version before assuming support.',
                    ],
                },
                {
                    path: '/concepts/hls',
                    title: 'HLS — HTTP Live Streaming',
                    summary: 'HLS is the dominant video delivery protocol for live streams. Chunks video into segments served over plain HTTP.',
                    publishedAt: '2026-05-01T11:00:00.000Z',
                    kind: 'DefinedTerm',
                    sections: [
                        'HLS (HTTP Live Streaming) was developed by Apple in 2009. It divides a stream into small .ts (MPEG-TS) or .fmp4 segments, typically 2–10 seconds long, served via a .m3u8 playlist file over HTTP.',
                        'Latency: standard HLS has 20–30s latency due to segment size and buffering. Low-Latency HLS (LL-HLS) reduces this to 2–4s using partial segments and HTTP/2 server push.',
                        'CDN compatibility: HLS works over any CDN or plain nginx static serving. Each segment is a regular HTTP GET request, making it trivially cacheable and scalable.',
                        'HLS vs DASH: HLS is Apple-native and universally supported in Safari. DASH (MPEG-DASH) is the W3C standard with slightly better codec flexibility. Most platforms serve both for broad compatibility.',
                    ],
                },
                {
                    path: '/concepts/ovc',
                    title: 'OVC — OpenVibe Credits',
                    summary: 'OVC is the platform currency used for tips, subscriptions, TTS, soundboards, and game items across OpenVibe.',
                    publishedAt: '2026-05-02T09:00:00.000Z',
                    kind: 'DefinedTerm',
                    sections: [
                        'OpenVibe Credits (OVC) is the native platform currency. 1 OVC ≈ $0.01 USD at a fixed rate. Credits are purchased in bundles and spent across all OpenVibe services.',
                        'Use cases: tipping streamers directly (openvibe.tips), monthly VIP subscriptions (openvibe.vip), text-to-speech messages in chat, soundboard triggers, and in-game item purchases on openvibe.games.',
                        'Creator payouts: creators redeem OVC for real-world payment via the account dashboard. The platform charges a transparent basis-point fee visible in the API — no surprise rate changes.',
                        'OVC is not a cryptocurrency. It has no blockchain, no volatility, and no speculation mechanics. It is a simple prepaid credits system like V-Bucks or Twitch Bits.',
                    ],
                },
                {
                    path: '/concepts/obs',
                    title: 'OBS Studio — Open Broadcaster Software',
                    summary: 'OBS Studio is the dominant open-source streaming and recording application used by most live streamers.',
                    publishedAt: '2026-05-02T10:00:00.000Z',
                    kind: 'DefinedTerm',
                    sections: [
                        'OBS Studio is a free, open-source application for video recording and live streaming. It runs on Windows, macOS, and Linux. Available at obsproject.com.',
                        'Key features: scene/source composition, audio mixing, transitions, browser source (for overlays), NDI support, NVENC/AMF/x264/AV1 encoding. Plugin ecosystem via obs-browser, obs-move-transition, etc.',
                        'Streaming to OpenVibe: set stream type to Custom, server to your RTMP URL, and paste your stream key. For WHIP, use the WHIP output in Settings > Stream.',
                        'Recommended settings for 1080p30: Video bitrate 4000–6000 kbps, audio 160 kbps AAC, keyframe interval 2s, encoder NVENC (if GPU available) or x264 with veryfast preset.',
                    ],
                },
                {
                    path: '/guides/stream-key-security',
                    title: 'Stream Key Security Best Practices',
                    summary: 'Your stream key is the password to your channel. Best practices for keeping it secure.',
                    publishedAt: '2026-05-03T09:00:00.000Z',
                    kind: 'Article',
                    sections: [
                        'A stream key is effectively the password to your streaming channel. Anyone with your stream key can broadcast under your name. Never share it publicly.',
                        'Common mistakes: pasting the stream key into Discord for help, accidentally showing it in an OBS screen share, including it in a git commit, storing it in plaintext in a shell script.',
                        'If your key leaks: regenerate it immediately from the streaming platform dashboard. All active streams using the old key will be terminated.',
                        'Safe storage: use your OS keychain (macOS Keychain Access, Windows Credential Manager), a password manager (Bitwarden, 1Password), or environment variables in your streaming script. Never hardcode.',
                    ],
                },
                {
                    path: '/concepts/readiness-gates',
                    title: 'Readiness Gates — Platform Health and Launch Criteria',
                    summary: 'How OpenVibe uses readiness gates to measure platform health and make go/no-go decisions for production launches.',
                    publishedAt: '2026-05-04T09:00:00.000Z',
                    kind: 'DefinedTerm',
                    sections: [
                        'readiness gates are the set of binary green/yellow/red probes that determine whether a service or feature is fit for production traffic. OpenVibe runs readiness checks offline, against live infrastructure, and as part of CI.',
                        'Green gates: all required functionality works correctly with no known regressions. Yellow gates: deferred or partial — feature is implemented but not fully wired or tested under production conditions. Red gates: blocking — the feature is broken, missing, or actively harmful.',
                        'The readiness report is generated by `npm run readiness` from the openvibe monorepo root. It probes each service, checks schema parity, and outputs a JSON report with per-gate status.',
                        'Gates are intentionally honest: do not flip a gate to green by silencing a check. Yellow is acceptable for deferred features. Red is always a blocker.',
                    ],
                },
            ],
        },
        news: {
            id: 'news',
            host: 'openvibe.news',
            origin: config.surfaces.news,
            label: 'openvibe.news',
            title: 'OpenVibe News — Streaming, Gaming & Creator Economy',
            description: 'News and updates on live streaming platforms, creator tools, gaming, and the independent creator economy.',
            kind: 'WebSite',
            implemented: true,
            indexable: false,
            deferReason: 'Draft news pages stay reviewed and noindex until editorial policy is finalized.',
            heroTitle: 'Streaming & Creator Economy News',
            heroText: 'Platform updates, creator tool launches, and independent streaming ecosystem coverage. No sponsored content, no algorithmic hype.',
            entries: [
                {
                    path: '/2026/whip-adoption-2026',
                    title: 'WHIP Adoption Accelerates in 2026 as OBS 30 Ships Native Support',
                    summary: 'The WebRTC-HTTP Ingest Protocol has crossed from niche to mainstream after OBS Studio 30.0 shipped WHIP output in 2024.',
                    publishedAt: '2026-05-01T08:00:00.000Z',
                    kind: 'NewsArticle',
                    sections: [
                        'OBS Studio 30.0 shipped native WHIP output support in early 2024, kickstarting ecosystem adoption. Most major streaming platforms now accept WHIP alongside legacy RTMP endpoints.',
                        'Sub-second latency is the headline benefit. WHIP uses WebRTC transport, delivering 200–500ms glass-to-glass latency compared to RTMP\'s 3–7s. Interactive stream formats (live auctions, real-time gaming) are the primary beneficiaries.',
                        'OpenVibe\'s openre.stream platform uses WHIP for the browser-based broadcast dashboard, eliminating the need for desktop streaming software for many creators.',
                        'Remaining challenges: WHIP requires SFU/MCU infrastructure for multi-viewer scaling, which is more complex than CDN-friendly HLS delivery. Most platforms still transcode WHIP to HLS for viewers.',
                    ],
                },
                {
                    path: '/2026/creator-economy-2026',
                    title: 'Independent Creator Revenue Shifts Away from Platform Subscription Cuts',
                    summary: 'Direct tipping, subscription alternatives, and OVC-style credit systems are reducing platform dependency for streamers.',
                    publishedAt: '2026-05-02T09:00:00.000Z',
                    kind: 'NewsArticle',
                    sections: [
                        'Platforms that charge 30–50% subscription revenue splits are facing growing pushback. A 2025 creator survey showed 67% of full-time streamers were diversifying revenue away from a single platform.',
                        'Direct tip platforms like ko-fi, Buy Me a Coffee, and OpenVibe Tips have grown significantly. Creators prefer tip-based income for its directness and lower platform dependency.',
                        'OVC-style unified currency systems (one currency, multiple services) are being adopted by smaller platforms as a way to build ecosystem lock-in that benefits creators, not just platforms.',
                        'The platform fee transparency movement is gaining traction: OpenVibe, among others, publishes fee rates as a basis-point API field. Users can compare rates without digging through legal terms.',
                    ],
                },
                {
                    path: '/2026/selfhosting-boom',
                    title: 'Self-Hosted Streaming Sees Renewed Interest After Platform Policy Changes',
                    summary: 'Policy changes at major platforms are driving new interest in self-hosted alternatives like OpenVibe and AVideo.',
                    publishedAt: '2026-05-03T10:00:00.000Z',
                    kind: 'NewsArticle',
                    sections: [
                        'A cluster of platform policy changes in 2025 — including new VOD monetization rules and automated content removal — drove measurable increases in self-hosted streaming traffic.',
                        'AVideo, Peertube, and OpenVibe saw combined install volume up roughly 3× year-over-year based on public package download stats. Docker Hub pulls for nginx-rtmp images similarly spiked.',
                        'The barrier remains technical: self-hosting requires a VPS, nginx configuration, SSL setup, and ongoing maintenance. Projects that bundle configuration (OpenVibe, Owncast) have lower bounce rates.',
                        'Key advantage of self-hosting: you own the VODs, the subscriber list, the stream keys, and the moderation rules. Platform changes cannot retroactively remove your content library.',
                    ],
                },
                {
                    path: '/2026/av1-streaming',
                    title: 'AV1 Encoding Goes Mainstream for Streaming in 2026',
                    summary: 'Hardware AV1 encoders in GPU cards have made the format practical for live streaming at consumer internet speeds.',
                    publishedAt: '2026-05-04T08:00:00.000Z',
                    kind: 'NewsArticle',
                    sections: [
                        'AV1 is 30–40% more efficient than H.264 at equivalent quality. In practice, a 6000 kbps AV1 stream looks comparable to a 9000 kbps H.264 stream.',
                        'Hardware encoders: NVIDIA RTX 40-series, AMD RX 7000-series, and Intel Arc all ship hardware AV1 encoders. OBS added AV1 encoding support in 2023. Low CPU overhead makes it viable for gaming streams.',
                        'Viewer support: AV1 requires a compatible browser/player. Chrome, Firefox, Edge all support AV1 via MSE. Safari added AV1 in 2022. Old Android devices may not have hardware decode, causing battery drain.',
                        'Platform support: YouTube, Netflix, and Discord serve AV1 for compatible viewers. Live streaming platform support varies — check your ingest server\'s transcoding pipeline for AV1 output support.',
                    ],
                },
            ],
        },
        reviews: {
            id: 'reviews',
            host: 'openvibe.reviews',
            origin: config.surfaces.reviews,
            label: 'openvibe.reviews',
            title: 'OpenVibe Reviews — Streaming Gear, Software & Hosting',
            description: 'Honest reviews of streaming equipment, encoding software, VPS hosting providers, and creator tools. No affiliate bias.',
            kind: 'WebSite',
            implemented: true,
            indexable: true,
            heroTitle: 'Streaming Gear & Tool Reviews',
            heroText: 'No affiliate links, no sponsored rankings, no fake stars. Real reviews of equipment, software, and services used by streamers and content creators.',
            entries: [
                {
                    path: '/reviews/elgato-hd60-x',
                    title: 'Elgato HD60 X Capture Card Review',
                    summary: 'The Elgato HD60 X is a USB 3.0 capture card supporting 4K30 or 1080p60 passthrough. Solid for console streaming with no major headaches.',
                    publishedAt: '2026-05-01T09:00:00.000Z',
                    kind: 'Review',
                    sections: [
                        'The Elgato HD60 X captures at up to 4K30 or 1080p60 with HDR10 passthrough. USB 3.0 connection means no PCIe slot required. Works on Windows and macOS. Linux support is unofficial but functional with V4L2.',
                        'Latency: ~100ms through the 4K Link companion app. Low-latency mode reduces this to ~70ms at 1080p60 — fine for commentary streams, not for competitive play reaction testing.',
                        'Software: 4K Capture Utility is basic but stable. Works natively as a UVC device in OBS without drivers on macOS. Windows requires the Elgato driver for HDR capture.',
                        'Verdict: a solid mid-range capture card for console streamers who want plug-and-play reliability. Not the cheapest option, but Elgato\'s driver support and OBS compatibility are well-tested. Rating: 4/5.',
                    ],
                },
                {
                    path: '/reviews/shure-sm7b',
                    title: 'Shure SM7B Microphone Review for Streamers',
                    summary: 'The SM7B is the classic podcast/streaming microphone. Warm, noise-rejecting, and requiring a strong preamp.',
                    publishedAt: '2026-05-02T09:00:00.000Z',
                    kind: 'Review',
                    sections: [
                        'The Shure SM7B is a dynamic cardioid microphone — the industry standard for podcasting, streaming, and vocal recording since 1973. Famously used by Michael Jackson on Thriller and countless podcasters since.',
                        'Sound character: warm, smooth presence, excellent off-axis rejection. Picks up the speaker clearly without room noise or keyboard clatter. The built-in pop filter handles plosives well.',
                        'Important caveat: the SM7B has very low output sensitivity (-59 dBV/Pa). You NEED a strong preamp — minimum 60dB of clean gain. The Focusrite Scarlett Solo won\'t cut it without a Cloudlifter or similar inline preamp.',
                        'Verdict: excellent microphone if you have the right gain chain. Pair with a Focusrite Scarlett 2i2 + Cloudlifter CL-1 for a complete setup around $400 total. Rating: 5/5 for sound, 3/5 for gain sensitivity.',
                    ],
                },
                {
                    path: '/reviews/obs-studio',
                    title: 'OBS Studio 30 Review — The Best Free Streaming Software',
                    summary: 'OBS Studio 30 adds WHIP output, improved UI, and DeckLink support. Still the best free option for most streamers.',
                    publishedAt: '2026-05-03T09:00:00.000Z',
                    kind: 'Review',
                    sections: [
                        'OBS Studio remains the undisputed best free streaming/recording application in 2026. Version 30 added native WHIP output, overhauled the YouTube integration, and improved the settings UI significantly.',
                        'Performance: NVENC AV1 encoding on RTX 40-series cards delivers 1080p60 streams at 6000 kbps with under 5% GPU overhead. The old x264 veryfast preset is no longer necessary for most setups.',
                        'New in 30.x: WHIP output for sub-second latency streaming, streamlined output mode for beginners, better auto-configuration wizard, DeckLink capture support improvements.',
                        'Compared to alternatives: Streamlabs (paid tiers, heavier RAM usage), XSplit (paid), Ecamm Live (Mac-only). OBS wins on features, platform support, and being truly free. Rating: 5/5.',
                    ],
                },
                {
                    path: '/reviews/hetzner-cx22',
                    title: 'Hetzner CX22 VPS Review — Best Value for Self-Hosters',
                    summary: 'The Hetzner CX22 (€4.85/mo, 2 vCPU, 4GB RAM, 40GB NVMe) is the best value VPS for hobbyists and indie developers.',
                    publishedAt: '2026-05-04T09:00:00.000Z',
                    kind: 'Review',
                    sections: [
                        'Hetzner Cloud\'s CX22 offers 2 AMD vCPU, 4GB RAM, 40GB NVMe SSD, and 20TB bandwidth for €4.85/month (~$5.30 USD). It\'s consistently the benchmark for price/performance in the European market.',
                        'Performance: NVMe storage means fast I/O for SQLite workloads. CPU is shared but consistent — no noisy neighbour spikes like some cheaper providers. Network: 1Gbps uplink, reliable.',
                        'For self-hosting OpenVibe services: the CX22 can run the full OpenVibe stack (all services) comfortably at low traffic. Scale to CX32 (4 vCPU, 8GB RAM, €8.38/mo) for 100+ concurrent viewers.',
                        'Cons: EU datacenter locations only (Nuremberg, Falkenstein, Helsinki) plus Ashburn, VA. Not ideal for Asia-Pacific primary traffic. Verdict: best value VPS for European or mixed-audience self-hosters. Rating: 5/5.',
                    ],
                },
            ],
        },
        deals: {
            id: 'deals',
            host: 'openvibe.deals',
            origin: config.surfaces.deals,
            label: 'openvibe.deals',
            title: 'OpenVibe Deals — Streaming Gear, VPS & Creator Tools',
            description: 'Current deals on streaming equipment, VPS hosting, creator software, and gaming gear. Updated regularly.',
            kind: 'WebSite',
            implemented: true,
            indexable: true,
            heroTitle: 'Deals for Streamers & Creators',
            heroText: 'Curated deals on VPS hosting, streaming gear, software, and creator tools. No inflated original prices. No fake countdown timers.',
            entries: [
                {
                    path: '/deals/hetzner-new-user',
                    title: 'Hetzner Cloud — €20 Credit for New Accounts',
                    summary: 'New Hetzner Cloud accounts receive €20 in credit, covering ~4 months of a CX22 VPS or 2 months of a CX32.',
                    publishedAt: '2026-05-01T08:00:00.000Z',
                    kind: 'Offer',
                    sections: [
                        'Hetzner Cloud offers €20 credit to new accounts via their referral program. No credit card required during signup — add billing after applying credit.',
                        'With €20 credit, you can run a CX22 (2 vCPU, 4GB RAM) for ~4 months free, or a CX32 (4 vCPU, 8GB RAM) for ~2.5 months. Good for testing OpenVibe self-hosting before committing.',
                        'Referral link available at hetzner.com/cloud. The credit applies automatically after account verification. Credit expires 30 days after signup if unused.',
                        'Note: this is a standard new-user promotion offered by Hetzner, not a paid partnership. Pricing and credit amounts may change.',
                    ],
                },
                {
                    path: '/deals/obs-obs29-upgrade',
                    title: 'OBS Studio 30 — Free Upgrade from Any Prior Version',
                    summary: 'OBS Studio is and has always been free. Version 30 with WHIP support is a free in-place update.',
                    publishedAt: '2026-05-02T08:00:00.000Z',
                    kind: 'Offer',
                    sections: [
                        'OBS Studio 30 is a free upgrade for all existing users. Download the latest version at obsproject.com — no license key, no subscription, no upsell.',
                        'Version 30 adds: WHIP output for sub-second latency streaming, improved YouTube integration, DeckLink support, and a cleaned-up settings UI.',
                        'If you\'re on an older version: check Help > Check for Updates inside OBS, or download the installer from obsproject.com and run it over your existing install.',
                        'Note: Streamlabs and StreamElements have paid tiers built on OBS\'s codebase. OBS Studio itself is always free and open-source under GPLv2.',
                    ],
                },
                {
                    path: '/deals/cloudflare-free-tier',
                    title: 'Cloudflare Free Tier — CDN, DDoS Protection & DNS',
                    summary: 'Cloudflare\'s free tier covers CDN, DDoS mitigation, and managed DNS for unlimited domains.',
                    publishedAt: '2026-05-03T08:00:00.000Z',
                    kind: 'Offer',
                    sections: [
                        'Cloudflare\'s free tier includes CDN (content delivery network), DDoS mitigation, managed DNS, SSL certificates (Universal SSL), and basic firewall rules for unlimited domains.',
                        'For streaming services: Cloudflare proxies HTTP/HTTPS traffic but not RTMP (TCP 1935). Configure RTMP to bypass Cloudflare (DNS-only/grey cloud) while proxying your web endpoints.',
                        'Free tier limits: 5 page rules, basic firewall, no image optimization. The Pro tier ($20/mo) adds polish-fire rules, mobile redirects, and image optimization. For most self-hosters, free is sufficient.',
                        'Setup: add your domain to Cloudflare, update nameservers at your registrar, enable Full (strict) SSL in the SSL/TLS settings. Add an A record pointing to your VPS IP.',
                    ],
                },
                {
                    path: '/deals/bitwarden-free',
                    title: 'Bitwarden — Free Password Manager (Self-Hostable)',
                    summary: 'Bitwarden is a free, open-source password manager that can be self-hosted. The cloud-hosted free tier is unlimited.',
                    publishedAt: '2026-05-04T08:00:00.000Z',
                    kind: 'Offer',
                    sections: [
                        'Bitwarden\'s free cloud tier offers unlimited passwords, passkeys, secure notes, and credit card storage across unlimited devices. No paid tier required for individuals.',
                        'For teams and organizations: the Teams plan is $3/user/month. Family sharing is $3.33/month for up to 6 users. Both include encrypted sharing.',
                        'Self-hosted option: Vaultwarden is a Rust reimplementation of the Bitwarden server that runs on minimal hardware. A Raspberry Pi or $5 VPS is sufficient. All clients (web, desktop, mobile, browser extension) work with the self-hosted server.',
                        'Streaming relevance: store stream keys, API tokens, VPS passwords, and SMTP credentials in Bitwarden. The browser extension autofills platform login forms.',
                    ],
                },
            ],
        },
        coupons: {
            id: 'coupons',
            host: 'openvibe.coupons',
            origin: config.surfaces.coupons,
            label: 'openvibe.coupons',
            title: 'OpenVibe Coupons — Promo Codes for Creator Tools',
            description: 'Verified promo codes and discount codes for streaming software, VPS hosting, creator tools, and gaming services.',
            kind: 'WebSite',
            implemented: true,
            indexable: true,
            heroTitle: 'Promo Codes for Streamers & Creators',
            heroText: 'Verified coupon codes for streaming gear, hosting, and creator tools. All codes tested before listing. Expired codes are removed promptly.',
            entries: [
                {
                    path: '/codes/digitalocean-200',
                    title: 'DigitalOcean — $200 Credit for 60 Days (New Accounts)',
                    summary: 'New DigitalOcean accounts receive $200 in cloud credit valid for 60 days. Covers a year of Droplet usage at the $5/mo tier.',
                    publishedAt: '2026-05-01T08:00:00.000Z',
                    kind: 'Coupon',
                    sections: [
                        'DigitalOcean routinely offers $200 in free credit for new accounts, valid for 60 days. Credit covers Droplets, managed databases, Spaces object storage, and other products.',
                        'The $200 credit covers 40 months of the $5/mo Basic Droplet (1 vCPU, 1GB RAM), or 2.5 months of the $80/mo CPU-optimized plan. Good for evaluating before committing.',
                        'Finding the current offer: check digitalocean.com/try for the current new-user promotion. Referral links from existing users also provide credit to both parties.',
                        'Note: credit amounts and validity periods change. Verify the current offer at digitalocean.com at the time of signup. This listing was accurate as of May 2026.',
                    ],
                },
                {
                    path: '/codes/streamlabs-obs-prime',
                    title: 'Streamlabs — Free Trial of Ultra Plan',
                    summary: 'Streamlabs periodically offers free trials of their Ultra plan. Core OBS functions remain free.',
                    publishedAt: '2026-05-02T08:00:00.000Z',
                    kind: 'Coupon',
                    sections: [
                        'Streamlabs offers the core OBS-based recording and streaming software free, with premium features (custom overlays, multistream, Merch store) behind the Ultra subscription ($19/month or $149/year).',
                        'Free trial availability: Streamlabs periodically offers 7–30 day trials of Ultra through their website and partner promotions. Check streamlabs.com/ultra for current trial offers.',
                        'Alternative: OBS Studio itself is entirely free and open-source. Most streaming functions in Streamlabs\'s free tier are available in OBS with free community plugins (StreamElements alerts, Voicemeeter audio).',
                        'Note: trial availability varies by region and time. Check the Streamlabs website for current promotions.',
                    ],
                },
                {
                    path: '/codes/cloudflare-r2',
                    title: 'Cloudflare R2 — 10GB Free Storage, No Egress Fees',
                    summary: 'Cloudflare R2 object storage includes 10GB free per month with zero egress fees, making it ideal for VOD storage.',
                    publishedAt: '2026-05-03T08:00:00.000Z',
                    kind: 'Coupon',
                    sections: [
                        'Cloudflare R2 is S3-compatible object storage with no egress (data transfer) fees. Free tier: 10GB storage, 1M Class A operations, 10M Class B operations per month.',
                        'For streamers: R2 is ideal for storing VODs, clips, and thumbnails. No egress cost means serving video doesn\'t incur bandwidth charges regardless of viewer count.',
                        'Comparison: AWS S3 charges $0.09/GB for egress, which adds up quickly for video. R2\'s free egress model is significantly cheaper for content-heavy workloads.',
                        'Signup: requires a Cloudflare account with billing info on file. R2 is charged per GB beyond the free tier ($0.015/GB/month). Workers integration available for signed URL generation.',
                    ],
                },
            ],
        },
        trade: {
            id: 'trade',
            host: 'openvibe.trade',
            origin: config.surfaces.trade,
            label: 'openvibe.trade',
            title: 'OpenVibe Trade — Creator Gear Marketplace & Classifieds',
            description: 'Buy, sell, and trade streaming gear, hardware, and creator equipment. Community-driven classifieds for hobbyists.',
            kind: 'WebSite',
            implemented: true,
            indexable: false,
            deferReason: 'Trade listings and classifieds are pre-launch. All entries carry a noindex flag until moderation policy is live.',
            heroTitle: 'Trade Streaming Gear & Creator Equipment',
            heroText: 'Community classifieds for used streaming hardware, microphones, cameras, capture cards, and creator gear. Not financial advice. All transactions are between private parties.',
            entries: [
                {
                    path: '/guides/buying-used-gear',
                    title: 'Buying Used Streaming Gear: What to Check',
                    summary: 'A practical guide to buying second-hand microphones, capture cards, and cameras for streaming. What to ask, what to test.',
                    publishedAt: '2026-05-01T09:00:00.000Z',
                    kind: 'Article',
                    sections: [
                        'Buying used streaming gear can save 30–60% compared to new. The main risk is buying damaged or defective equipment with no return policy. This guide covers what to verify before paying.',
                        'Microphones: test with a known-good USB/XLR interface. Listen for crackling (worn capsule), hum (grounding issues), or dead channels (broken cable or solder joint). Dynamic mics (SM7B, SM58) are extremely durable — capsule failure is rare.',
                        'Capture cards: test all supported resolutions (1080p60, 4K30) with your actual consoles before finalizing. Check that HDCP passthrough works if you need it. Internal PCIe cards require physical inspection for bent pins.',
                        'Cameras (webcam/DSLR): check the shutter actuations for DSLRs (most have 150,000–300,000 rated shutter life). For webcams, verify autofocus speed and low-light performance. Dead pixels are deal-breakers for streaming use.',
                        'Where to buy: r/AVexchange, r/hardwareswap, local Facebook Marketplace (inspect in person), Reverb (musical instruments and audio gear). Always pay with buyer protection (PayPal goods & services, not friends & family).',
                    ],
                },
                {
                    path: '/guides/selling-streaming-gear',
                    title: 'Selling Your Streaming Setup: Pricing and Platforms',
                    summary: 'How to price and sell used streaming equipment. What platforms to use, how to package, what to disclose.',
                    publishedAt: '2026-05-02T09:00:00.000Z',
                    kind: 'Article',
                    sections: [
                        'Used streaming gear holds value well if it\'s common, well-documented, and in good condition. Elgato, Blue, Shure, and Logitech products have active second-hand markets.',
                        'Pricing: check eBay sold listings (filter: sold items) for your exact model. Price 5–15% below the average recent sale for faster movement. Include all original accessories — missing cables or mounts significantly reduce resale value.',
                        'Platforms: eBay (widest reach, buyer/seller protection, 13.25% fee), Facebook Marketplace (local, no fees, cash or PayPal), r/AVexchange (enthusiast community, lower fees, reputation-based trust), Craigslist (cash only, meet in person).',
                        'What to disclose: any cosmetic damage (scratches, dents), functional issues (sticky buttons, intermittent connectivity), missing accessories, and how long you owned the item. Undisclosed defects are the top cause of disputes.',
                    ],
                },
                {
                    path: '/guides/gear-tier-list-2026',
                    title: 'Streaming Gear Value Tiers for 2026',
                    summary: 'Which pieces of streaming gear hold value vs. depreciate quickly. Budget, mid-range, and pro tier analysis.',
                    publishedAt: '2026-05-03T09:00:00.000Z',
                    kind: 'Article',
                    sections: [
                        'Microphones hold value better than almost any other audio/video gear. The Shure SM7B, Blue Yeti, and Rode NT1 all sell for 60–75% of MSRP after 2–3 years of use. Dynamic mics especially depreciate slowly due to their durability.',
                        'Capture cards depreciate faster than mics. The Elgato HD60 S+ dropped 40% when the HD60 X launched. Budget for 40–50% depreciation on capture cards over 2 years due to spec advancement.',
                        'Webcams: commoditized. Logitech C920s sell for $40–50 used regardless of original retail. The Logitech BRIO holds value better due to 4K and good low-light performance.',
                        'Streaming PCs: CPUs and RAM hold value moderately well. GPUs are the most volatile — a used RTX 3070 may be worth less than a new RTX 4060 depending on timing. Check current GPU benchmarks before buying used GPUs.',
                    ],
                },
                {
                    path: '/drafts/non-financial-advice-policy',
                    title: 'Non-financial-advice policy for trade pages',
                    summary: 'OpenVibe Trade is a community classifieds board, not a financial adviser. All price estimates are community data.',
                    publishedAt: '2026-05-01T09:00:00.000Z',
                    kind: 'Article',
                    draft: true,
                    sections: [
                        'Nothing on OpenVibe Trade constitutes financial advice. Price estimates and gear valuations are community-sourced and may not reflect current market conditions.',
                        'OpenVibe is not responsible for transactions between private parties. Always verify equipment condition before completing a purchase or sale.',
                    ],
                },
            ],
        },
        host: {
            id: 'host',
            host: 'openvibe.host',
            origin: config.surfaces.host,
            label: 'openvibe.host',
            title: 'OpenVibe Host — Web Hosting Guides & Reviews',
            description: 'Honest web hosting comparisons, setup guides, and reviews. No affiliate bias. Just the facts.',
            kind: 'WebSite',
            implemented: true,
            indexable: false,
            readiness: 'yellow',
            deferReason: 'Host content is pre-launch pending editorial review.',
            heroTitle: 'Web Hosting, Without the Bias',
            heroText: 'Honest reviews, real benchmarks, and plain-language setup guides for developers, streamers, and hobbyists who just need a reliable place to run their code.',
            entries: [
                {
                    path: '/guides/vps-setup',
                    title: 'VPS Setup Guide for Streamers',
                    summary: 'Step-by-step guide to setting up a VPS for self-hosted live streaming. Covers nginx, SSL, and RTMP ingest.',
                    publishedAt: '2026-05-01T10:00:00.000Z',
                    kind: 'Article',
                    sections: [
                        'A VPS (Virtual Private Server) gives you full root access to a Linux machine for $5–20/month. This guide uses Ubuntu 24.04 with nginx for RTMP ingest and Let\'s Encrypt for SSL.',
                        'Step 1: Choose a provider. BinaryLane, Hetzner, and DigitalOcean all offer competitive VPS plans. For streaming, pick a provider close to your audience geographically.',
                        'Step 2: Install nginx with RTMP module. On Ubuntu: `sudo apt install nginx-extras`. Edit `/etc/nginx/nginx.conf` to add the rtmp block on port 1935.',
                        'Step 3: Configure SSL with certbot. Run `certbot --nginx -d yourstream.example.com`. Let\'s Encrypt provides free 90-day certs that auto-renew.',
                        'Step 4: Point your streaming software to `rtmp://your-vps-ip/live`. Use a stream key as the app argument. JSMPEG can relay the stream to a browser WebSocket endpoint.',
                        'Step 5: Set up systemd to keep nginx running. `sudo systemctl enable nginx` ensures the service starts on reboot and restarts if it crashes.',
                    ],
                },
                {
                    path: '/guides/shared-vs-vps',
                    title: 'Shared Hosting vs VPS: What Hobbyists Actually Need',
                    summary: 'A plain-language comparison of shared hosting and VPS. When to upgrade, what to avoid, and which providers are honest.',
                    publishedAt: '2026-05-02T10:00:00.000Z',
                    kind: 'Article',
                    sections: [
                        'Shared hosting puts thousands of websites on one machine. It\'s cheap ($2–10/month) and managed, but you share CPU/RAM/bandwidth with everyone else. Good for WordPress blogs and landing pages.',
                        'VPS gives you dedicated CPU cores and RAM. It\'s $5–30/month unmanaged. You\'re responsible for security updates, backups, and configuration. Great for Node.js apps, streaming, and APIs.',
                        'When to upgrade from shared to VPS: your site gets slowdowns during traffic spikes; you need Node.js/Python/Ruby runtimes; you want to run a WebSocket server; you need root access.',
                        'Providers worth using: Hetzner (EU, excellent price/perf), BinaryLane (AU, consistent), Vultr (global, good network), DigitalOcean (beginner-friendly docs). Avoid: GoDaddy, Bluehost, HostGator (upsell-heavy, slow support).',
                        'Self-hosting on a home IP: works for development and personal projects. Not recommended for production due to dynamic IPs, residential bandwidth caps, and ISP TOS restrictions on servers.',
                    ],
                },
                {
                    path: '/guides/openvibe-self-hosting',
                    title: 'Self-Hosting OpenVibe Services',
                    summary: 'How to run OpenVibe services on your own VPS. Ports, systemd units, nginx reverse proxy, and environment setup.',
                    publishedAt: '2026-05-03T10:00:00.000Z',
                    kind: 'Article',
                    sections: [
                        'OpenVibe is an open-source streaming and community platform. You can run any or all of the 16 services on a single VPS with 4GB RAM or distribute them across multiple machines.',
                        'Minimum requirements for a single-node deploy: Ubuntu 22.04+, 4 CPU cores, 4GB RAM, 40GB SSD. FFmpeg must be installed for live streaming. yt-dlp for the download tools.',
                        'Each service runs as a systemd unit on a dedicated port. openvibe-network (4100), openvibe-live (4600), openre-stream (4700), openvibe-chat (4800). nginx reverse-proxies all services under their respective domains.',
                        'SSL: certbot --nginx handles individual domains. Wildcard certs for *.openvibe.tools require DNS-01 challenge (use Cloudflare DNS plugin or manual TXT record).',
                        'Backups: SQLite databases live in the service data/ directories. Back them up with `sqlite3 database.db ".backup /backup/database.db"` or rsync to cold storage nightly.',
                        'Monitoring: each service exposes GET /health returning {ok: true}. Wire these into Uptime Kuma, Grafana, or any HTTP monitor to get alerts when a service goes down.',
                    ],
                },
                {
                    path: '/reviews/hetzner',
                    title: 'Hetzner VPS Review 2026',
                    summary: 'Honest review of Hetzner Cloud for developers and hobbyists. Price, performance, network, and support quality.',
                    publishedAt: '2026-05-04T10:00:00.000Z',
                    kind: 'Article',
                    sections: [
                        'Hetzner Cloud offers the best price-to-performance ratio in the European hosting market. Their CX22 (2 vCPU, 4GB RAM, 40GB SSD) costs €4.85/month as of 2026.',
                        'Network: 20TB included bandwidth per month per server. IPv4 and IPv6 both included. Datacenter locations in Nuremberg, Falkenstein, Helsinki, and Ashburn (US).',
                        'Performance: consistent CPU allocation, NVMe SSDs with low I/O latency. Good for databases, Node.js services, and streaming relay workloads.',
                        'Support: ticket-based, response in 2–4 hours for most issues. Documentation is thorough and accurate. Community forum active.',
                        'Cons: German company, servers primarily in EU (Ashburn location has higher latency for non-East US users). No managed database tier. Object storage (Hetzner Object Storage) is S3-compatible but limited regions.',
                        'Verdict: Best value for EU-primary workloads and developers who prefer no-nonsense pricing without upsell pressure.',
                    ],
                },
                {
                    path: '/guides/nginx-streaming',
                    title: 'Nginx Reverse Proxy for Streaming Services',
                    summary: 'Configure nginx as a reverse proxy for multiple streaming services. Load balancing, WebSocket proxying, and SSL termination.',
                    publishedAt: '2026-05-05T10:00:00.000Z',
                    kind: 'Article',
                    sections: [
                        'nginx is the industry standard reverse proxy for production deployments. It terminates SSL, load balances between backend instances, and serves static files directly — offloading Node.js.',
                        'WebSocket proxying requires two additional headers: `proxy_set_header Upgrade $http_upgrade;` and `proxy_set_header Connection "upgrade";`. Without these, WS connections fail silently.',
                        'For streaming services, increase proxy_read_timeout to 300s+ to avoid connection drops during long-lived streams. Set proxy_send_timeout to match.',
                        'Static file serving: use `location /assets/ { root /opt/your-service/public; expires 7d; }` to serve JS/CSS/images directly without hitting Node.js.',
                        'Rate limiting: `limit_req_zone $binary_remote_addr zone=api:10m rate=30r/m;` + `limit_req zone=api burst=10;` on API locations prevents basic abuse without blocking legitimate users.',
                        'Log format: include `$upstream_response_time` and `$request_time` in your access_log format to identify slow backend routes.',
                    ],
                },
                {
                    path: '/drafts/hosting-policy',
                    title: 'Hobo hosting policy draft',
                    summary: 'Draft policy covering content restrictions and fair use for openvibe.host listing submissions.',
                    publishedAt: '2026-05-01T09:00:00.000Z',
                    kind: 'Article',
                    draft: true,
                    sections: [
                        'OpenVibe Host listings are editorially reviewed before publication. Affiliate links, paid placement, and sponsored content are not accepted.',
                        'All benchmark data must be independently reproducible. Providers may request correction of factual errors; corrections are noted in-article.',
                    ],
                },
            ],
        },
    };
}

function surfaceStatusNote(surface) {
    return surface.indexable ? null : surface.deferReason || null;
}

function surfaceKicker(surface) {
    if (!surface.indexable) return 'draft / noindex';
    return surface.implemented ? 'published' : 'deferred / noindex';
}

function pageForPath(surface, routePath) {
    if (routePath === '/' || routePath === '') return null;
    return surface.entries.find((entry) => entry.path === routePath) || null;
}

function buildJsonLd(surface, canonicalUrl, entry) {
    if (entry) {
        const base = {
            '@context': 'https://schema.org',
            '@type': entry.kind || 'Article',
            headline: entry.title,
            description: entry.summary,
            datePublished: toIsoDate(entry.publishedAt),
            mainEntityOfPage: canonicalUrl,
            publisher: {
                '@type': 'Organization',
                name: 'OpenVibe',
            },
        };
        if (surface.id === 'wiki') {
            base.inDefinedTermSet = surface.origin;
        }
        return base;
    }
    return {
        '@context': 'https://schema.org',
        '@type': surface.kind || 'WebSite',
        name: surface.label,
        url: canonicalUrl,
        description: surface.description,
        potentialAction: {
            '@type': 'ReadAction',
            target: canonicalUrl,
        },
    };
}

function renderLayout({ config, surface, pageTitle, description, canonicalUrl, robots, bodyHtml, jsonLd, statusNote, currentPath }) {
    const title = pageTitle || surface.title;
    const nav = navItems(config).map((item) => {
        const active = item.id === surface.id ? 'ov-nav-link active' : 'ov-nav-link';
        return `<a class="${active}" href="${escapeHtml(item.href)}">${renderIcon(item.id, { decorative: true })}<span>${escapeHtml(item.label)}</span></a>`;
    }).join('');
    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <meta name="robots" content="${escapeHtml(robots)}">
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
    <link rel="alternate" type="application/rss+xml" title="${escapeHtml(surface.label)} feed" href="${escapeHtml(surface.origin)}/feed.xml">
    <meta property="og:type" content="website">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <link rel="stylesheet" href="/assets/openvibe-icons.css">
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
    <style>
        :root {
            color-scheme: dark;
            --bg: #07111d;
            --card: rgba(10, 28, 49, 0.86);
            --card-strong: rgba(16, 37, 62, 0.96);
            --border: rgba(148, 184, 255, 0.18);
            --fg: #ecf5ff;
            --muted: #9ab4d3;
            --accent: #6cc6ff;
            --accent-2: #8c7dff;
            --warning: #ffcc66;
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
            background: radial-gradient(circle at top, rgba(76, 125, 255, 0.2), transparent 34%), linear-gradient(180deg, #07111d 0%, #081523 100%);
            color: var(--fg);
            min-height: 100vh;
        }
        a { color: var(--accent); }
        .ov-shell { max-width: 1120px; margin: 0 auto; padding: 32px 20px 72px; }
        .ov-nav { display: flex; justify-content: space-between; align-items: center; gap: 20px; margin-bottom: 28px; }
        .ov-brand { display: inline-flex; align-items: center; gap: 10px; font-weight: 700; font-size: 1.15rem; color: var(--fg); text-decoration: none; }
        .ov-nav-links { display: flex; gap: 14px; flex-wrap: wrap; }
        .ov-nav-link { display: inline-flex; align-items: center; gap: 8px; text-decoration: none; color: var(--muted); padding: 8px 12px; border-radius: 999px; }
        .ov-nav-link.active, .ov-nav-link:hover { background: rgba(108, 198, 255, 0.12); color: var(--fg); }
        .ov-hero, .ov-card, .ov-note, article { background: var(--card); border: 1px solid var(--border); border-radius: 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.22); }
        .ov-hero { padding: 28px; margin-bottom: 24px; }
        .ov-kicker { display: inline-flex; gap: 8px; align-items: center; padding: 8px 12px; border-radius: 999px; font-size: 0.85rem; color: var(--accent); background: rgba(108, 198, 255, 0.1); }
        .ov-hero h1 { font-size: clamp(2rem, 5vw, 3.3rem); line-height: 1.03; margin: 14px 0 12px; }
        .ov-hero p, .ov-copy p, .ov-meta { color: var(--muted); line-height: 1.7; }
        .ov-grid { display: grid; gap: 18px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
        .ov-card { padding: 22px; }
        .ov-card h2, .ov-card h3 { margin-top: 0; }
        .ov-status { margin-bottom: 18px; padding: 14px 16px; border-radius: 16px; background: rgba(255, 204, 102, 0.12); border: 1px solid rgba(255, 204, 102, 0.26); color: #ffe7a8; }
        article { padding: 30px; }
        article h1 { margin-top: 0; font-size: clamp(2rem, 4vw, 3rem); }
        .ov-meta { display: flex; gap: 12px; flex-wrap: wrap; font-size: 0.92rem; margin-bottom: 20px; }
        .ov-copy { display: grid; gap: 16px; }
        .ov-footer { margin-top: 36px; color: var(--muted); font-size: 0.92rem; }
        .ov-path { color: var(--muted); font-size: 0.85rem; margin-bottom: 12px; }
        @media (max-width: 720px) {
            .ov-nav { flex-direction: column; align-items: flex-start; }
        }
    </style>
</head>
<body>
    <div class="ov-shell">
        <header class="ov-nav">
            <a class="ov-brand" href="${escapeHtml(surface.origin)}/">${renderIcon(surface.id, { decorative: true })}<span>${escapeHtml(surface.label)}</span></a>
            <nav class="ov-nav-links" aria-label="OpenVibe content surfaces">${nav}</nav>
        </header>
        ${statusNote ? `<div class="ov-status">${escapeHtml(statusNote)}</div>` : ''}
        ${bodyHtml}
        <footer class="ov-footer">Rendered by ${escapeHtml(config.serviceId)} on ${escapeHtml(surface.host)} · current path: ${escapeHtml(currentPath || '/')}.</footer>
    </div>
</body>
</html>`;
}

function renderHome({ config, surface }) {
    const cards = surface.entries.map((entry) => `
        <section class="ov-card">
            <div class="ov-path">${escapeHtml(entry.path)}</div>
            <h2><a href="${escapeHtml(surface.origin + entry.path)}" style="display:inline-flex;align-items:center;gap:10px;">${renderIcon(surface.id, { decorative: true })}<span>${escapeHtml(entry.title)}</span></a></h2>
            <p>${escapeHtml(entry.summary)}</p>
            <div class="ov-meta"><span>${escapeHtml(new Date(entry.publishedAt).toISOString().slice(0, 10))}</span><span>${escapeHtml(entry.kind)}</span></div>
        </section>`).join('');
    const body = `
        <section class="ov-hero">
            <div class="ov-kicker">${renderIcon(surface.id, { decorative: true })}<span>${surfaceKicker(surface)}</span></div>
            <h1>${escapeHtml(surface.heroTitle)}</h1>
            <p>${escapeHtml(surface.heroText)}</p>
        </section>
        ${surface.entries.length ? `<div class="ov-grid">${cards}</div>` : `<section class="ov-card"><h2>Deferred host</h2><p>${escapeHtml(surface.deferReason || 'This public runtime is not live yet.')}</p></section>`}`;
    return renderLayout({
        config,
        surface,
        pageTitle: surface.title,
        description: surface.description,
        canonicalUrl: `${surface.origin}/`,
        robots: surface.indexable ? 'index,follow,max-image-preview:large' : 'noindex,nofollow',
        jsonLd: buildJsonLd(surface, `${surface.origin}/`, null),
        statusNote: surfaceStatusNote(surface),
        bodyHtml: body,
        currentPath: '/',
    });
}

function renderEntry({ config, surface, entry }) {
    const body = `
        <article>
            <div class="ov-path">${escapeHtml(surface.label)}${escapeHtml(entry.path)}</div>
            <h1>${escapeHtml(entry.title)}</h1>
            <div class="ov-meta"><span>${escapeHtml(new Date(entry.publishedAt).toISOString().slice(0, 10))}</span><span>${escapeHtml(entry.kind)}</span></div>
            <div class="ov-copy">${entry.sections.map((section) => `<p>${escapeHtml(section)}</p>`).join('')}</div>
        </article>`;
    return renderLayout({
        config,
        surface,
        pageTitle: `${entry.title} · ${surface.label}`,
        description: entry.summary,
        canonicalUrl: `${surface.origin}${entry.path}`,
        robots: surface.indexable ? 'index,follow,max-image-preview:large' : 'noindex,nofollow',
        jsonLd: buildJsonLd(surface, `${surface.origin}${entry.path}`, entry),
        statusNote: null,
        bodyHtml: body,
        currentPath: entry.path,
    });
}

function renderNotFound({ config, surface, routePath }) {
    const body = `
        <section class="ov-card">
            <h1>Page not found</h1>
            <p>The path <code>${escapeHtml(routePath)}</code> is not published on ${escapeHtml(surface.label)} yet.</p>
        </section>`;
    return renderLayout({
        config,
        surface,
        pageTitle: `Not found · ${surface.label}`,
        description: `No page is published for ${routePath} on ${surface.label}.`,
        canonicalUrl: `${surface.origin}${routePath}`,
        robots: 'noindex,nofollow',
        jsonLd: buildJsonLd(surface, `${surface.origin}${routePath}`, null),
        statusNote: surfaceStatusNote(surface),
        bodyHtml: body,
        currentPath: routePath,
    });
}

function buildFeedXml(surface) {
    const items = surface.entries.map((entry) => `
        <item>
            <title>${escapeHtml(entry.title)}</title>
            <link>${escapeHtml(surface.origin + entry.path)}</link>
            <guid>${escapeHtml(surface.origin + entry.path)}</guid>
            <pubDate>${new Date(entry.publishedAt).toUTCString()}</pubDate>
            <description>${escapeHtml(entry.summary)}</description>
        </item>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
    <channel>
        <title>${escapeHtml(surface.label)}</title>
        <link>${escapeHtml(surface.origin)}/</link>
        <description>${escapeHtml(surface.description)}</description>${items}
    </channel>
</rss>`;
}

function buildAtomXml(surface) {
    const items = surface.entries.map((entry) => `
        <entry>
            <title>${escapeHtml(entry.title)}</title>
            <link href="${escapeHtml(surface.origin + entry.path)}" />
            <id>${escapeHtml(surface.origin + entry.path)}</id>
            <updated>${toIsoDate(entry.publishedAt)}</updated>
            <summary>${escapeHtml(entry.summary)}</summary>
        </entry>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
    <title>${escapeHtml(surface.label)}</title>
    <id>${escapeHtml(surface.origin)}/</id>
    <updated>${toIsoDate(surface.entries[0] ? surface.entries[0].publishedAt : new Date())}</updated>${items}
</feed>`;
}

function buildSitemapXml(surface) {
    const urls = [`${surface.origin}/`, ...surface.entries.map((entry) => `${surface.origin}${entry.path}`)];
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `
    <url>
        <loc>${escapeHtml(url)}</loc>
    </url>`).join('')}
</urlset>`;
}

function buildRobotsTxt(surface) {
    if (!surface.indexable) {
        return `User-agent: *\nDisallow: /\n# ${surface.deferReason || 'Deferred surface'}\n`;
    }
    return `User-agent: *\nAllow: /\nSitemap: ${surface.origin}/sitemap.xml\n`;
}

function hostStatuses(config) {
    const catalog = buildSurfaceCatalog(config);
    return Object.values(catalog).map((surface) => ({
        surface: surface.id,
        host: surface.host,
        origin: surface.origin,
        implemented: surface.implemented,
        indexable: surface.indexable,
        readiness: surface.readiness || (surface.implemented ? 'green' : 'yellow'),
        entry_count: surface.entries.length,
        defer_reason: surface.deferReason || null,
    }));
}

function renderRequest({ config, surfaceId, routePath }) {
    const catalog = buildSurfaceCatalog(config);
    const surface = catalog[surfaceId] || catalog.codes;
    if (routePath === '/feed.xml') {
        return {
            status: 200,
            contentType: 'application/rss+xml; charset=utf-8',
            body: buildFeedXml(surface),
        };
    }
    if (routePath === '/atom.xml') {
        return {
            status: 200,
            contentType: 'application/atom+xml; charset=utf-8',
            body: buildAtomXml(surface),
        };
    }
    if (routePath === '/sitemap.xml') {
        return {
            status: 200,
            contentType: 'application/xml; charset=utf-8',
            body: buildSitemapXml(surface),
        };
    }
    if (routePath === '/robots.txt') {
        return {
            status: 200,
            contentType: 'text/plain; charset=utf-8',
            body: buildRobotsTxt(surface),
        };
    }

    const entry = pageForPath(surface, routePath);
    if (routePath === '/' || routePath === '') {
        return {
            status: 200,
            contentType: 'text/html; charset=utf-8',
            body: renderHome({ config, surface }),
        };
    }
    if (entry) {
        return {
            status: 200,
            contentType: 'text/html; charset=utf-8',
            body: renderEntry({ config, surface, entry }),
        };
    }
    return {
        status: 404,
        contentType: 'text/html; charset=utf-8',
        body: renderNotFound({ config, surface, routePath }),
    };
}

module.exports = {
    buildSurfaceCatalog,
    buildRobotsTxt,
    buildSitemapXml,
    buildFeedXml,
    buildAtomXml,
    formatBytes,
    hostStatuses,
    renderRequest,
};
