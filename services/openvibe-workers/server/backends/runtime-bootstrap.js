'use strict';

let mediaRuntimePromise = null;
let billingRuntimePromise = null;
let contentRuntimePromise = null;
let networkRuntimePromise = null;
let aiRuntimePromise = null;

function memoizeRuntime(getterName, currentPromise, factory) {
    if (currentPromise) return currentPromise;
    const nextPromise = Promise.resolve().then(factory).catch((error) => {
        if (getterName === 'media') mediaRuntimePromise = null;
        if (getterName === 'billing') billingRuntimePromise = null;
        if (getterName === 'content') contentRuntimePromise = null;
        if (getterName === 'network') networkRuntimePromise = null;
        if (getterName === 'ai') aiRuntimePromise = null;
        throw error;
    });
    if (getterName === 'media') mediaRuntimePromise = nextPromise;
    if (getterName === 'billing') billingRuntimePromise = nextPromise;
    if (getterName === 'content') contentRuntimePromise = nextPromise;
    if (getterName === 'network') networkRuntimePromise = nextPromise;
    if (getterName === 'ai') aiRuntimePromise = nextPromise;
    return nextPromise;
}

function ensureMediaRuntime() {
    return memoizeRuntime('media', mediaRuntimePromise, () => {
        const config = require('../../../openvibe-media/server/config');
        const db = require('../../../openvibe-media/server/db');
        const clipModel = require('../../../openvibe-media/server/clip-model');
        const model = require('../../../openvibe-media/server/model');
        const quotas = require('../../../openvibe-media/server/quotas');
        const processing = require('../../../openvibe-media/server/processing');
        const storageModel = require('../../../openvibe-media/server/storage-model');
        const { buildStorage } = require('../../../openvibe-media/server/storage');
        const { buildEventBus } = require('../../../openvibe-media/server/events');
        const { resolvePlayback } = require('../../../openvibe-media/server/playback-resolver');
        const { createPlaybackPayloadBuilder } = require('../../../openvibe-media/server/playback');
        const { MEDIA_EVENT_TYPES } = require('@openvibe/contracts/media-events');

        db.init(config.db.path);
        processing.configureExternalQueue(config.processing);

        const storage = buildStorage(config.storage);
        const eventBus = buildEventBus(config);
        const buildPlaybackPayload = createPlaybackPayloadBuilder({
            storage,
            storageModel,
            resolvePlayback,
        });

        return {
            config,
            db,
            clipModel,
            model,
            quotas,
            processing,
            storageModel,
            storage,
            eventBus,
            buildPlaybackPayload,
            mediaEventTypes: MEDIA_EVENT_TYPES,
        };
    });
}

function ensureBillingRuntime() {
    return memoizeRuntime('billing', billingRuntimePromise, () => {
        const config = require('../../../openvibe-billing/server/config');
        const db = require('../../../openvibe-billing/server/db');
        const model = require('../../../openvibe-billing/server/model');

        db.init(config.db.path);

        return {
            config,
            db,
            model,
        };
    });
}

function ensureContentRuntime() {
    return memoizeRuntime('content', contentRuntimePromise, () => {
        const config = require('../../../openvibe-content/server/config');
        const { createContentStore } = require('../../../openvibe-content/server/db');

        return {
            config,
            contentStore: createContentStore(config),
        };
    });
}

function ensureNetworkRuntime() {
    return memoizeRuntime('network', networkRuntimePromise, () => {
        const config = require('../../../openvibe-network/server/config');
        const db = require('../../../openvibe-network/server/db');
        const staff = require('../../../openvibe-network/server/api/staff');

        db.init(config.db.path);
        staff.ensureTables();

        return {
            config,
            db,
            staff,
        };
    });
}

function ensureAiRuntime() {
    return memoizeRuntime('ai', aiRuntimePromise, () => {
        const config = require('../../../openvibe-ai/server/config');
        const db = require('../../../openvibe-ai/server/db');
        const seeds = require('../../../openvibe-ai/server/seeds');
        const { buildEventBus } = require('../../../openvibe-ai/server/events');
        const runner = require('../../../openvibe-ai/server/runner');

        db.init(config.db.path);
        seeds.seedAll();
        const eventBus = buildEventBus(config);

        return {
            config,
            db,
            eventBus,
            executeRun: runner.executeRun,
        };
    });
}

module.exports = {
    ensureBillingRuntime,
    ensureContentRuntime,
    ensureMediaRuntime,
    ensureNetworkRuntime,
    ensureAiRuntime,
};
