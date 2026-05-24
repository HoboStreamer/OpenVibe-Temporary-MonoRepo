'use strict';

const { renderRequest: sharedRenderRequest } = require('./ssr-shared');

function buildSurface(config) {
    return {
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
    };
}

function renderRequest({ config, routePath }) {
    return sharedRenderRequest({ config, surface: buildSurface(config), routePath });
}

module.exports = { buildSurface, renderRequest };
