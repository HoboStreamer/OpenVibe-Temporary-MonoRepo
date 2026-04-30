'use strict';

const assert = require('assert');

const {
    PRODUCT_CAPABILITY_RECORDS,
    IMPLEMENTED_CAPABILITY_IDS,
    describeCapabilityRecord,
    describeProductCapabilityCatalog,
    findProductCapability,
    listCapabilitiesByOwner,
    listProductCapabilities,
    ownerForCapability,
} = require('../product-capabilities');
const { CAPABILITIES, CAPABILITY_LIST } = require('../capabilities');

(function recordsCoverEveryKnownCapability() {
    assert.strictEqual(PRODUCT_CAPABILITY_RECORDS.length, CAPABILITY_LIST.length);
    for (const id of CAPABILITY_LIST) {
        const record = findProductCapability(id);
        assert.ok(record, `missing record for ${id}`);
        assert.strictEqual(record.capability_id, id);
        assert.ok(record.owner_service, `missing owner_service for ${id}`);
        assert.strictEqual(typeof record.version, 'number');
        assert.ok(record.policy && record.policy.access, `missing policy.access for ${id}`);
        assert.ok(record.input_schema && typeof record.input_schema === 'object');
        assert.ok(record.output_schema && typeof record.output_schema === 'object');
        assert.strictEqual(typeof record.implemented, 'boolean');
    }
})();

(function ownerInferenceMatchesPrefix() {
    assert.strictEqual(ownerForCapability(CAPABILITIES.CHAT_SEND_MESSAGE), 'openvibe-chat');
    assert.strictEqual(ownerForCapability(CAPABILITIES.COMMUNITY_CREATE_POST), 'openvibe-community');
    assert.strictEqual(ownerForCapability(CAPABILITIES.TIPS_CREATE), 'openvibe-billing');
    assert.strictEqual(ownerForCapability(CAPABILITIES.VIP_PLAN_CREATE), 'openvibe-billing');
    assert.strictEqual(ownerForCapability(CAPABILITIES.AI_GENERATE), 'openvibe-ai');
    assert.strictEqual(ownerForCapability(CAPABILITIES.SEARCH_QUERY), 'openvibe-ai');
    assert.strictEqual(ownerForCapability(CAPABILITIES.WIKI_GENERATE_SPACE), 'openvibe-content');
    assert.strictEqual(ownerForCapability(CAPABILITIES.MEDIA_UPLOAD_INIT), 'openvibe-media');
    assert.strictEqual(ownerForCapability(CAPABILITIES.GAMES_CREATE_WORLD), 'openvibe-games');
})();

(function implementedSetSubsetOfCatalog() {
    for (const id of IMPLEMENTED_CAPABILITY_IDS) {
        assert.ok(CAPABILITY_LIST.includes(id), `implemented id not in catalog: ${id}`);
        const record = findProductCapability(id);
        assert.strictEqual(record.implemented, true);
    }
})();

(function listingFiltersByOwnerAndImplemented() {
    const billing = listProductCapabilities({ ownerService: 'openvibe-billing' });
    assert.ok(billing.length > 0);
    for (const record of billing) {
        assert.strictEqual(record.owner_service, 'openvibe-billing');
    }
    const implemented = listProductCapabilities({ implementedOnly: true });
    assert.ok(implemented.length > 0);
    for (const record of implemented) {
        assert.strictEqual(record.implemented, true);
    }
})();

(function groupsByOwner() {
    const grouped = listCapabilitiesByOwner();
    assert.ok(grouped['openvibe-chat'] && grouped['openvibe-chat'].length > 0);
    assert.ok(grouped['openvibe-billing'] && grouped['openvibe-billing'].length > 0);
    assert.ok(grouped['openvibe-content'] && grouped['openvibe-content'].length > 0);
})();

(function summaryShape() {
    const summary = describeProductCapabilityCatalog();
    assert.strictEqual(summary.capability_count, PRODUCT_CAPABILITY_RECORDS.length);
    assert.ok(summary.implemented_count >= 1);
    assert.ok(summary.implemented_count <= summary.capability_count);
    assert.ok(Array.isArray(summary.owners));
    assert.ok(summary.owners.length > 0);
})();

(function describeRecordIsStable() {
    const r1 = describeCapabilityRecord(CAPABILITIES.TIPS_CREATE);
    const r2 = describeCapabilityRecord(CAPABILITIES.TIPS_CREATE);
    assert.deepStrictEqual(r1, r2);
})();

console.log('product-capabilities: OK');
