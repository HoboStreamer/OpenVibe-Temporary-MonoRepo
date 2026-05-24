'use strict';

const { renderRequest: sharedRenderRequest } = require('./ssr-shared');

function buildSurface(config) {
    return {
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
    };
}

function renderRequest({ config, routePath }) {
    return sharedRenderRequest({ config, surface: buildSurface(config), routePath });
}

module.exports = { buildSurface, renderRequest };
