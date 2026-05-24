'use strict';

const { renderRequest: sharedRenderRequest } = require('./ssr-shared');

function buildSurface(config) {
    return {
        id: 'wiki',
        host: 'openvibe.wiki',
        origin: config.surfaces.wiki,
        label: 'openvibe.wiki',
        title: 'openvibe.wiki — platform glossary and migration index',
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
    };
}

function renderRequest({ config, routePath }) {
    return sharedRenderRequest({ config, surface: buildSurface(config), routePath });
}

module.exports = { buildSurface, renderRequest };
