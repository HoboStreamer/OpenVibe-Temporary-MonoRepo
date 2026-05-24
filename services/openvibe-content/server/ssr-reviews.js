'use strict';

const { renderRequest: sharedRenderRequest } = require('./ssr-shared');

function buildSurface(config) {
    return {
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
    };
}

function renderRequest({ config, routePath }) {
    return sharedRenderRequest({ config, surface: buildSurface(config), routePath });
}

module.exports = { buildSurface, renderRequest };
