'use strict';

function normalizedHostname(host) {
    return String(host || '').split(':')[0].trim().toLowerCase();
}

const CONTENT_HOSTS = Object.freeze({
    codes: ['openvibe.codes'],
    blog: ['openvibe.blog'],
    wiki: ['openvibe.wiki'],
    news: ['openvibe.news'],
    reviews: ['openvibe.reviews'],
    deals: ['openvibe.deals'],
    coupons: ['openvibe.coupons'],
    trade: ['openvibe.trade'],
    host: ['openvibe.host'],
});

function detectSurface(host, surfaces) {
    const hostname = normalizedHostname(host);
    for (const [surface, hosts] of Object.entries(CONTENT_HOSTS)) {
        for (const entry of hosts) {
            if (hostname === entry || hostname.endsWith(`.${entry}`)) return surface;
        }
    }
    for (const [surface, origin] of Object.entries(surfaces || {})) {
        try {
            if (hostname === new URL(origin).hostname.toLowerCase()) return surface;
        } catch {
            // ignore malformed override
        }
    }
    return 'codes';
}

function attachHostRouter({ app, config }) {
    app.use((req, _res, next) => {
        req.openvibeSurface = detectSurface(req.headers.host, config && config.surfaces);
        next();
    });
}

module.exports = {
    CONTENT_HOSTS,
    attachHostRouter,
    detectSurface,
    normalizedHostname,
};
