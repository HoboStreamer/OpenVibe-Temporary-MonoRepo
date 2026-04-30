'use strict';

/**
 * Product capability catalog.
 *
 * Pairs every well-known capability id from `./capabilities.js` with the
 * minimum metadata the platform kernel needs to register it as a first-class
 * action contract: owner service, version, description, input/output schema
 * stubs, policy, and an `implemented` flag that callers can use to filter
 * routable capabilities from declared-but-unwired ones.
 *
 * This module never wires dispatch. It only describes ownership and contract
 * shape, so the network kernel's `seedCapabilityRegistry(...)` can register
 * every product action with a truthful version/owner/policy and so future
 * slices can flip `implemented: true` once the matching dispatcher exists.
 *
 * The catalog is derived programmatically from capability id prefixes and then
 * enriched with explicit overrides for capabilities that diverge from the
 * default owner mapping.
 */

const { CAPABILITIES, CAPABILITY_LIST } = require('./capabilities');

const PREFIX_OWNERS = Object.freeze({
    chat:        'openvibe-chat',
    community:   'openvibe-community',
    billing:     'openvibe-billing',
    tips:        'openvibe-billing',
    vip:         'openvibe-billing',
    media:       'openvibe-media',
    ai:          'openvibe-ai',
    seo:         'openvibe-ai',
    content:     'openvibe-content',
    wiki:        'openvibe-content',
    blog:        'openvibe-content',
    news:        'openvibe-content',
    reviews:     'openvibe-content',
    deals:       'openvibe-content',
    coupons:     'openvibe-content',
    trade:       'openvibe-content',
    host:        'openvibe-content',
    codes:       'openvibe-content',
    tools:       'openvibe-content',
    games:       'openvibe-games',
    live:        'openvibe-live',
    openre:      'openre-stream',
    search:      'openvibe-ai',
});

// Capabilities that have a real HTTP route and model wiring in this repo today.
// Audited 2026-04-30 against:
//   services/openvibe-chat/server/routes.js
//   services/openvibe-community/server/routes.js
//   services/openvibe-billing/server/routes.js
//   services/openvibe-media/server/routes.js
//   services/openvibe-ai/server/routes.js
//   services/openvibe-network/server/capabilities/index.js
// Anything not in this set is declared-only; see DEFERRED_CAPABILITY_REASONS.
const IMPLEMENTED_CAPABILITY_IDS = new Set([
    // chat — routes in services/openvibe-chat/server/routes.js
    CAPABILITIES.CHAT_ROOM_CREATE,
    CAPABILITIES.CHAT_ROOM_JOIN,
    CAPABILITIES.CHAT_ROOM_LEAVE,
    CAPABILITIES.CHAT_SEND_MESSAGE,
    CAPABILITIES.CHAT_EDIT_MESSAGE,
    CAPABILITIES.CHAT_DELETE_MESSAGE,
    CAPABILITIES.CHAT_DM_OPEN,
    CAPABILITIES.CHAT_START_CALL,
    CAPABILITIES.CHAT_END_CALL,
    CAPABILITIES.CHAT_CALL_SIGNAL,
    CAPABILITIES.CHAT_TTS_SETTINGS_UPDATE,
    CAPABILITIES.CHAT_ENQUEUE_TTS,
    CAPABILITIES.CHAT_TTS_SKIP,
    CAPABILITIES.CHAT_TTS_CLEAR,
    CAPABILITIES.CHAT_AUDIO_ENQUEUE,
    CAPABILITIES.CHAT_AUDIO_SKIP,
    CAPABILITIES.CHAT_AUDIO_CLEAR,
    CAPABILITIES.CHAT_OVERLAY_RENDER,

    // community — routes in services/openvibe-community/server/routes.js
    CAPABILITIES.COMMUNITY_SPACE_CREATE,
    CAPABILITIES.COMMUNITY_CATEGORY_CREATE,
    CAPABILITIES.COMMUNITY_THREAD_CREATE,
    CAPABILITIES.COMMUNITY_THREAD_LOCK,
    CAPABILITIES.COMMUNITY_CREATE_POST,
    CAPABILITIES.COMMUNITY_DELETE_POST,
    CAPABILITIES.COMMUNITY_COMMENT_ATTACH,
    CAPABILITIES.COMMUNITY_CREATE_PASTE,
    CAPABILITIES.COMMUNITY_UPDATE_PASTE,
    CAPABILITIES.COMMUNITY_DISCORD_RELAY_CONFIGURE,
    CAPABILITIES.COMMUNITY_DISCORD_MESSAGE_IMPORT,

    // billing — routes in services/openvibe-billing/server/routes.js
    CAPABILITIES.BILLING_WALLET_GET,
    CAPABILITIES.BILLING_WALLET_ADJUST,
    CAPABILITIES.BILLING_CREDITS_CHECKOUT,
    CAPABILITIES.BILLING_CREDITS_COMPLETE_CHECKOUT,
    CAPABILITIES.BILLING_CREDITS_CHARGE,
    CAPABILITIES.BILLING_CREDITS_REFUND,
    CAPABILITIES.BILLING_TRANSACTION_LOOKUP,
    CAPABILITIES.BILLING_ENTITLEMENT_CHECK,
    CAPABILITIES.BILLING_ECONOMY_FREEZE,
    CAPABILITIES.BILLING_ECONOMY_UNFREEZE,

    // tips — routes in services/openvibe-billing/server/routes.js (buildTipsRouter)
    CAPABILITIES.TIPS_CREATE,
    CAPABILITIES.TIPS_REFUND,
    CAPABILITIES.TIPS_OVERLAY_FEED,
    CAPABILITIES.TIPS_SUPERCHAT_CREATE,
    CAPABILITIES.TIPS_TTS_CREATE,
    CAPABILITIES.TIPS_MEDIA_REQUEST_CREATE,

    // vip — routes in services/openvibe-billing/server/routes.js (buildVipRouter)
    CAPABILITIES.VIP_PLAN_CREATE,
    CAPABILITIES.VIP_PLAN_UPDATE,
    CAPABILITIES.VIP_SUBSCRIPTION_CREATE,
    CAPABILITIES.VIP_SUBSCRIPTION_CANCEL,
    CAPABILITIES.VIP_SUBSCRIPTION_RENEW,
    CAPABILITIES.VIP_ENTITLEMENT_CHECK,

    // media — routes in services/openvibe-media/server/routes.js
    CAPABILITIES.MEDIA_UPLOAD_INIT,
    CAPABILITIES.MEDIA_ATTACH_TO_ENTITY,

    // ai — routes in services/openvibe-ai/server/routes.js
    CAPABILITIES.AI_RUN_CREATE,
    CAPABILITIES.AI_CHAT,
    CAPABILITIES.AI_GENERATE,
    CAPABILITIES.AI_SUMMARIZE,
    CAPABILITIES.AI_CLASSIFY,
    CAPABILITIES.AI_EXTRACT,

    // search — routes in services/openvibe-content/server/routes.js (search seam)
    CAPABILITIES.SEARCH_QUERY,
    CAPABILITIES.SEARCH_DOCUMENT_INDEX,

    // content — routes in services/openvibe-content/server/routes.js
    CAPABILITIES.CONTENT_SOURCE_REGISTER,
    CAPABILITIES.CONTENT_INGESTION_JOB_CREATE,
]);

// Capabilities declared in the catalog but not yet routed to a service
// dispatcher. Keys are capability ids; values explain the gap so admins do
// not see a green check next to a half-built feature.
const DEFERRED_CAPABILITY_REASONS = Object.freeze({
    [CAPABILITIES.BILLING_CHARGE_CREDITS]:           'Legacy alias; superseded by billing.credits.charge.',
    [CAPABILITIES.BILLING_CREATE_SUBSCRIPTION]:      'Replaced by vip.subscription.create dispatcher.',
    [CAPABILITIES.TIPS_CREATE_ALERT]:                'Overlay alert push not yet wired — overlay feed is GET-only.',
    [CAPABILITIES.AI_PROVIDER_CREATE]:               'Provider CRUD exists but is not exposed via capability dispatch.',
    [CAPABILITIES.AI_PROVIDER_UPDATE]:               'See AI_PROVIDER_CREATE.',
    [CAPABILITIES.AI_PROVIDER_DISABLE]:              'See AI_PROVIDER_CREATE.',
    [CAPABILITIES.AI_MODEL_CREATE]:                  'Model CRUD exists but is not exposed via capability dispatch.',
    [CAPABILITIES.AI_ROUTE_CONFIGURE]:               'Route CRUD exists but is not exposed via capability dispatch.',
    [CAPABILITIES.AI_TEMPLATE_CREATE]:               'Template CRUD exists but is not exposed via capability dispatch.',
    [CAPABILITIES.AI_WORKFLOW_CREATE]:               'Workflow CRUD exists but is not exposed via capability dispatch.',
    [CAPABILITIES.AI_RUN_CANCEL]:                    'Cancel route exists but is not exposed via capability dispatch.',
    [CAPABILITIES.AI_RUN_RETRY]:                     'Retry route exists but is not exposed via capability dispatch.',
    [CAPABILITIES.AI_ENRICH]:                        'Provider invocation exists but no first-class capability dispatcher yet.',
    [CAPABILITIES.AI_EMBED]:                         'Provider invocation exists but no first-class capability dispatcher yet.',
    [CAPABILITIES.AI_WIKI_GENERATE_SPACE]:           'Product workflow seam — AI client + content store wiring deferred.',
    [CAPABILITIES.AI_WIKI_GENERATE_PAGE]:            'Product workflow seam — AI client + content store wiring deferred.',
    [CAPABILITIES.AI_BLOG_DRAFT_POST]:               'Product workflow seam — AI client + content store wiring deferred.',
    [CAPABILITIES.AI_NEWS_SUMMARIZE_STORY]:          'Product workflow seam — AI client + content store wiring deferred.',
    [CAPABILITIES.AI_NEWS_COMPARE_PERSPECTIVES]:     'Product workflow seam — AI client + content store wiring deferred.',
    [CAPABILITIES.AI_REVIEWS_SUMMARIZE_ENTITY]:      'Product workflow seam — AI client + content store wiring deferred.',
    [CAPABILITIES.AI_DEALS_ENRICH_DEAL]:             'Product workflow seam — AI client + content store wiring deferred.',
    [CAPABILITIES.AI_COUPONS_EXTRACT_COUPON]:        'Product workflow seam — AI client + content store wiring deferred.',
    [CAPABILITIES.AI_TRADE_SUMMARIZE_MARKET]:        'Product workflow seam — AI client + content store wiring deferred.',
    [CAPABILITIES.AI_CODES_GENERATE_DOCS]:           'Product workflow seam — AI client + content store wiring deferred.',
    [CAPABILITIES.AI_TOOLS_DESCRIBE_TOOL]:           'Product workflow seam — AI client + content store wiring deferred.',
    [CAPABILITIES.AI_GAMES_GENERATE_LORE]:           'Product workflow seam — AI client + content store wiring deferred.',
    [CAPABILITIES.AI_MODERATION_CLASSIFY]:           'Moderation classifier dispatcher pending.',
    [CAPABILITIES.WIKI_GENERATE_SPACE]:              'Phase 7 alias — superseded by ai.wiki.generate_space.',
    [CAPABILITIES.BLOG_PUBLISH_POST]:                'Phase 7 alias — superseded by content.* publication routes.',
    [CAPABILITIES.GAMES_CREATE_WORLD]:               'Games world creation API not yet exposed.',
    [CAPABILITIES.MEDIA_UPLOAD_INIT]:                undefined, // implemented; placeholder so lookup is safe
    [CAPABILITIES.SEO_METADATA_GENERATE]:            'SEO helpers exist as library functions; not exposed via capability dispatch.',
    [CAPABILITIES.SEO_INDEXABILITY_EVALUATE]:        'See SEO_METADATA_GENERATE.',
    [CAPABILITIES.SEO_STRUCTURED_DATA_GENERATE]:     'See SEO_METADATA_GENERATE.',
    [CAPABILITIES.SEO_SITEMAP_ENTRY_GENERATE]:       'See SEO_METADATA_GENERATE.',
    [CAPABILITIES.SEO_SITEMAP_GENERATE]:             'See SEO_METADATA_GENERATE.',
    [CAPABILITIES.SEO_SITEMAP_INDEX_GENERATE]:       'See SEO_METADATA_GENERATE.',
    [CAPABILITIES.SEO_FEED_RSS_GENERATE]:            'See SEO_METADATA_GENERATE.',
    [CAPABILITIES.SEO_FEED_ATOM_GENERATE]:           'See SEO_METADATA_GENERATE.',
    [CAPABILITIES.SEO_ROBOTS_GENERATE]:              'See SEO_METADATA_GENERATE.',
    [CAPABILITIES.SEO_SLUG_NORMALIZE]:               'Helper function; capability dispatcher pending.',
    [CAPABILITIES.SEO_CANONICAL_GENERATE]:           'Helper function; capability dispatcher pending.',
    [CAPABILITIES.SEO_DUPLICATE_HASH_GENERATE]:      'Helper function; capability dispatcher pending.',
    [CAPABILITIES.CONTENT_SOURCE_UPDATE]:            'Source PATCH route pending.',
    [CAPABILITIES.CONTENT_SOURCE_TEST]:              'Source dry-run not exposed via capability dispatch.',
    [CAPABILITIES.CONTENT_SOURCE_FETCH]:             'Fetch worker exists; capability dispatcher pending.',
    [CAPABILITIES.CONTENT_SOURCE_ROBOTS_CHECK]:      'Robots check exists in scripts/readiness; capability dispatcher pending.',
    [CAPABILITIES.CONTENT_INGESTION_JOB_RUN]:        'Worker invocation pending.',
    [CAPABILITIES.CONTENT_INGESTION_JOB_CANCEL]:     'Cancel route pending.',
    [CAPABILITIES.CONTENT_QUALITY_EVALUATE]:         'Quality scoring helper pending capability dispatch.',
    [CAPABILITIES.SEARCH_DOCUMENT_DELETE]:           'Index delete route pending.',
});

// Per-capability policy overrides. Anything not listed defaults to
// { access: 'authenticated' }, with service-only writes for refund/charge etc.
const POLICY_OVERRIDES = Object.freeze({
    [CAPABILITIES.BILLING_WALLET_ADJUST]:           { access: 'service' },
    [CAPABILITIES.BILLING_CREDITS_CHARGE]:          { access: 'service' },
    [CAPABILITIES.BILLING_CREDITS_REFUND]:          { access: 'service' },
    [CAPABILITIES.BILLING_ECONOMY_FREEZE]:          { access: 'service' },
    [CAPABILITIES.BILLING_ECONOMY_UNFREEZE]:        { access: 'service' },
    [CAPABILITIES.TIPS_REFUND]:                     { access: 'service' },
    [CAPABILITIES.AI_PROVIDER_CREATE]:              { access: 'service' },
    [CAPABILITIES.AI_PROVIDER_UPDATE]:              { access: 'service' },
    [CAPABILITIES.AI_PROVIDER_DISABLE]:             { access: 'service' },
    [CAPABILITIES.AI_MODEL_CREATE]:                 { access: 'service' },
    [CAPABILITIES.AI_ROUTE_CONFIGURE]:              { access: 'service' },
    [CAPABILITIES.COMMUNITY_DISCORD_RELAY_CONFIGURE]: { access: 'service' },
    [CAPABILITIES.COMMUNITY_DISCORD_MESSAGE_IMPORT]: { access: 'service' },
    [CAPABILITIES.SEARCH_DOCUMENT_INDEX]:           { access: 'service' },
    [CAPABILITIES.SEARCH_DOCUMENT_DELETE]:          { access: 'service' },
    [CAPABILITIES.CONTENT_INGESTION_JOB_RUN]:       { access: 'service' },
    [CAPABILITIES.CONTENT_INGESTION_JOB_CANCEL]:    { access: 'service' },
});

// Owner overrides for capability ids whose prefix does not map cleanly.
const OWNER_OVERRIDES = Object.freeze({});

function ownerForCapability(capabilityId) {
    if (OWNER_OVERRIDES[capabilityId]) return OWNER_OVERRIDES[capabilityId];
    const prefix = String(capabilityId).split('.')[0];
    return PREFIX_OWNERS[prefix] || 'openvibe-network';
}

function describeCapabilityRecord(capabilityId) {
    const implemented = IMPLEMENTED_CAPABILITY_IDS.has(capabilityId);
    const deferred_reason = !implemented && DEFERRED_CAPABILITY_REASONS[capabilityId]
        ? DEFERRED_CAPABILITY_REASONS[capabilityId]
        : (implemented ? null : 'Declared capability id; dispatcher not yet implemented in this repo.');
    return Object.freeze({
        capability_id: capabilityId,
        owner_service: ownerForCapability(capabilityId),
        version: 1,
        description: humanizeDescription(capabilityId),
        input_schema: { type: 'object' },
        output_schema: { type: 'object' },
        policy: POLICY_OVERRIDES[capabilityId] || { access: 'authenticated' },
        rate_limit: defaultRateLimit(capabilityId),
        emits_topics: [],
        deprecated: false,
        implemented,
        deferred_reason,
    });
}

function humanizeDescription(capabilityId) {
    return `Product capability ${capabilityId}.`;
}

function defaultRateLimit(capabilityId) {
    if (capabilityId.startsWith('ai.')) return { requests_per_minute: 30 };
    if (capabilityId.startsWith('tips.')) return { requests_per_minute: 30 };
    if (capabilityId.startsWith('billing.')) return { requests_per_minute: 60 };
    if (capabilityId.startsWith('chat.')) return { requests_per_minute: 120 };
    if (capabilityId.startsWith('community.')) return { requests_per_minute: 60 };
    if (capabilityId.startsWith('search.')) return { requests_per_minute: 120 };
    return { requests_per_minute: 60 };
}

const PRODUCT_CAPABILITY_RECORDS = Object.freeze(
    CAPABILITY_LIST.map((capabilityId) => describeCapabilityRecord(capabilityId))
);

function listProductCapabilities({ ownerService = null, implementedOnly = false } = {}) {
    let records = PRODUCT_CAPABILITY_RECORDS;
    if (ownerService) records = records.filter((rec) => rec.owner_service === ownerService);
    if (implementedOnly) records = records.filter((rec) => rec.implemented);
    return records;
}

function listCapabilitiesByOwner() {
    const grouped = {};
    for (const record of PRODUCT_CAPABILITY_RECORDS) {
        if (!grouped[record.owner_service]) grouped[record.owner_service] = [];
        grouped[record.owner_service].push(record);
    }
    return grouped;
}

function findProductCapability(capabilityId) {
    return PRODUCT_CAPABILITY_RECORDS.find((rec) => rec.capability_id === capabilityId) || null;
}

function describeProductCapabilityCatalog() {
    const grouped = listCapabilitiesByOwner();
    const owners = Object.keys(grouped).sort();
    const deferred_count = PRODUCT_CAPABILITY_RECORDS.filter((rec) => !rec.implemented).length;
    return {
        capability_count: PRODUCT_CAPABILITY_RECORDS.length,
        implemented_count: PRODUCT_CAPABILITY_RECORDS.filter((rec) => rec.implemented).length,
        deferred_count,
        owners: owners.map((owner) => ({
            owner_service: owner,
            capability_count: grouped[owner].length,
            implemented_count: grouped[owner].filter((rec) => rec.implemented).length,
            deferred_count: grouped[owner].filter((rec) => !rec.implemented).length,
        })),
    };
}

module.exports = {
    PRODUCT_CAPABILITY_RECORDS,
    IMPLEMENTED_CAPABILITY_IDS,
    DEFERRED_CAPABILITY_REASONS,
    PREFIX_OWNERS,
    POLICY_OVERRIDES,
    describeCapabilityRecord,
    describeProductCapabilityCatalog,
    findProductCapability,
    listCapabilitiesByOwner,
    listProductCapabilities,
    ownerForCapability,
};
