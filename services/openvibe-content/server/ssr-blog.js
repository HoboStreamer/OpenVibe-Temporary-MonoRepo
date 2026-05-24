'use strict';

const { renderRequest: sharedRenderRequest } = require('./ssr-shared');

function buildSurface(config) {
    return {
        id: 'blog',
        host: 'openvibe.blog',
        origin: config.surfaces.blog,
        label: 'openvibe.blog',
        title: 'openvibe.blog — build notes from the native platform cutover',
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
    };
}

function renderRequest({ config, routePath }) {
    return sharedRenderRequest({ config, surface: buildSurface(config), routePath });
}

module.exports = { buildSurface, renderRequest };
