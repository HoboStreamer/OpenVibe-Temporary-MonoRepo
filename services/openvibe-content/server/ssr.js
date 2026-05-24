'use strict';

const { formatBytes, buildFeedXml, buildAtomXml, buildSitemapXml, buildRobotsTxt } = require('./ssr-shared');
const ssrCodes   = require('./ssr-codes');
const ssrBlog    = require('./ssr-blog');
const ssrWiki    = require('./ssr-wiki');
const ssrNews    = require('./ssr-news');
const ssrReviews = require('./ssr-reviews');
const ssrDeals   = require('./ssr-deals');
const ssrCoupons = require('./ssr-coupons');
const ssrTrade   = require('./ssr-trade');
const ssrHost    = require('./ssr-host');

const SURFACE_MODULES = {
    codes:   ssrCodes,
    blog:    ssrBlog,
    wiki:    ssrWiki,
    news:    ssrNews,
    reviews: ssrReviews,
    deals:   ssrDeals,
    coupons: ssrCoupons,
    trade:   ssrTrade,
    host:    ssrHost,
};

function buildSurfaceCatalog(config) {
    return Object.fromEntries(
        Object.entries(SURFACE_MODULES).map(([id, mod]) => [id, mod.buildSurface(config)])
    );
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
    const mod = SURFACE_MODULES[surfaceId] || SURFACE_MODULES.codes;
    return mod.renderRequest({ config, routePath });
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
