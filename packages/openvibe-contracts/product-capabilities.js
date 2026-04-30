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

// Capabilities that the network kernel has working dispatchers for today.
// Mirrors services/openvibe-network/server/capabilities/index.js
// `KNOWN_CAPABILITY_DEFINITIONS` plus a few read-only seams.
const IMPLEMENTED_CAPABILITY_IDS = new Set([
    CAPABILITIES.CHAT_ROOM_CREATE,
    CAPABILITIES.CHAT_ROOM_JOIN,
    CAPABILITIES.CHAT_SEND_MESSAGE,
    CAPABILITIES.CHAT_DM_OPEN,
    CAPABILITIES.COMMUNITY_SPACE_CREATE,
    CAPABILITIES.COMMUNITY_CATEGORY_CREATE,
    CAPABILITIES.COMMUNITY_THREAD_CREATE,
    CAPABILITIES.COMMUNITY_CREATE_POST,
    CAPABILITIES.BILLING_WALLET_GET,
    CAPABILITIES.BILLING_WALLET_ADJUST,
    CAPABILITIES.BILLING_CREDITS_CHARGE,
    CAPABILITIES.BILLING_CREDITS_REFUND,
    CAPABILITIES.TIPS_CREATE,
    CAPABILITIES.MEDIA_UPLOAD_INIT,
    CAPABILITIES.MEDIA_ATTACH_TO_ENTITY,
    CAPABILITIES.AI_RUN_CREATE,
    CAPABILITIES.AI_CHAT,
    CAPABILITIES.AI_GENERATE,
    CAPABILITIES.AI_SUMMARIZE,
]);

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
        implemented: IMPLEMENTED_CAPABILITY_IDS.has(capabilityId),
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
    return {
        capability_count: PRODUCT_CAPABILITY_RECORDS.length,
        implemented_count: PRODUCT_CAPABILITY_RECORDS.filter((rec) => rec.implemented).length,
        owners: owners.map((owner) => ({
            owner_service: owner,
            capability_count: grouped[owner].length,
            implemented_count: grouped[owner].filter((rec) => rec.implemented).length,
        })),
    };
}

module.exports = {
    PRODUCT_CAPABILITY_RECORDS,
    IMPLEMENTED_CAPABILITY_IDS,
    PREFIX_OWNERS,
    POLICY_OVERRIDES,
    describeCapabilityRecord,
    describeProductCapabilityCatalog,
    findProductCapability,
    listCapabilitiesByOwner,
    listProductCapabilities,
    ownerForCapability,
};
