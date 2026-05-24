'use strict';

const { renderRequest: sharedRenderRequest } = require('./ssr-shared');

function buildSurface(config) {
    return {
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
    };
}

function renderRequest({ config, routePath }) {
    return sharedRenderRequest({ config, surface: buildSurface(config), routePath });
}

module.exports = { buildSurface, renderRequest };
