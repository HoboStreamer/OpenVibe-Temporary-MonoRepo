'use strict';

const { renderRequest: sharedRenderRequest } = require('./ssr-shared');

function buildSurface(config) {
    return {
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
    };
}

function renderRequest({ config, routePath }) {
    return sharedRenderRequest({ config, surface: buildSurface(config), routePath });
}

module.exports = { buildSurface, renderRequest };
