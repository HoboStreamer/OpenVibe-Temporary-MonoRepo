'use strict';

const {
    ChatClient,
    CommunityClient,
    BillingClient,
    MediaClient,
    AiClient,
    jsonRequest,
} = require('@openvibe/sdk');
const { CAPABILITIES } = require('@openvibe/contracts/capabilities');
const { PRODUCT_CAPABILITY_RECORDS } = require('@openvibe/contracts/product-capabilities');

const SERVICE_NAME = 'openvibe-network';

const KNOWN_CAPABILITY_DEFINITIONS = Object.freeze([
    {
        capability_id: CAPABILITIES.CHAT_ROOM_CREATE,
        owner_service: 'openvibe-chat',
        description: 'Create a chat room.',
        policy: { access: 'authenticated' },
        rate_limit: { requests_per_minute: 60 },
    },
    {
        capability_id: CAPABILITIES.CHAT_ROOM_JOIN,
        owner_service: 'openvibe-chat',
        description: 'Resolve a chat room before join.',
        policy: { access: 'authenticated' },
        input_schema: { type: 'object', properties: { room_id: { type: 'string' }, roomId: { type: 'string' } } },
        rate_limit: { requests_per_minute: 120 },
    },
    {
        capability_id: CAPABILITIES.CHAT_SEND_MESSAGE,
        owner_service: 'openvibe-chat',
        description: 'Send a chat message into a room.',
        policy: { access: 'authenticated' },
        input_schema: {
            type: 'object',
            properties: {
                room_id: { type: 'string' },
                roomId: { type: 'string' },
                body: { type: 'object' },
                content: { type: 'string' },
                message: { type: 'string' },
            },
        },
        rate_limit: { requests_per_minute: 180 },
    },
    {
        capability_id: CAPABILITIES.CHAT_DM_OPEN,
        owner_service: 'openvibe-chat',
        description: 'Open a DM room.',
        policy: { access: 'authenticated' },
        rate_limit: { requests_per_minute: 60 },
    },
    {
        capability_id: CAPABILITIES.COMMUNITY_SPACE_CREATE,
        owner_service: 'openvibe-community',
        description: 'Create a community space.',
        policy: { access: 'authenticated' },
    },
    {
        capability_id: CAPABILITIES.COMMUNITY_CATEGORY_CREATE,
        owner_service: 'openvibe-community',
        description: 'Create a category inside a space.',
        policy: { access: 'authenticated' },
        input_schema: { type: 'object', properties: { space_id: { type: 'string' }, spaceId: { type: 'string' }, body: { type: 'object' } } },
    },
    {
        capability_id: CAPABILITIES.COMMUNITY_THREAD_CREATE,
        owner_service: 'openvibe-community',
        description: 'Create a community thread.',
        policy: { access: 'authenticated' },
    },
    {
        capability_id: CAPABILITIES.COMMUNITY_CREATE_POST,
        owner_service: 'openvibe-community',
        description: 'Create a community post.',
        policy: { access: 'authenticated' },
        input_schema: { type: 'object', properties: { thread_id: { type: 'string' }, threadId: { type: 'string' }, body: { type: 'object' } } },
    },
    {
        capability_id: CAPABILITIES.BILLING_WALLET_GET,
        owner_service: 'openvibe-billing',
        description: 'Read a wallet snapshot.',
        policy: { access: 'self', target_field: 'owner_id', target_field_aliases: ['ownerId'] },
        input_schema: {
            type: 'object',
            properties: {
                owner_type: { type: 'string' },
                owner_id: { type: 'string' },
                ownerId: { type: 'string' },
                wallet_type: { type: 'string' },
                walletType: { type: 'string' },
            },
        },
        rate_limit: { requests_per_minute: 120 },
    },
    {
        capability_id: CAPABILITIES.BILLING_WALLET_ADJUST,
        owner_service: 'openvibe-billing',
        description: 'Adjust a wallet balance.',
        policy: { access: 'service' },
    },
    {
        capability_id: CAPABILITIES.BILLING_CREDITS_CHARGE,
        owner_service: 'openvibe-billing',
        description: 'Charge credits.',
        policy: { access: 'service' },
    },
    {
        capability_id: CAPABILITIES.BILLING_CREDITS_REFUND,
        owner_service: 'openvibe-billing',
        description: 'Refund credits.',
        policy: { access: 'service' },
    },
    {
        capability_id: CAPABILITIES.TIPS_CREATE,
        owner_service: 'openvibe-billing',
        description: 'Create a tip.',
        policy: { access: 'authenticated' },
        rate_limit: { requests_per_minute: 30 },
    },
    {
        capability_id: CAPABILITIES.MEDIA_UPLOAD_INIT,
        owner_service: 'openvibe-media',
        description: 'Initialize a media upload.',
        policy: { access: 'authenticated' },
        rate_limit: { requests_per_minute: 60 },
    },
    {
        capability_id: CAPABILITIES.MEDIA_ATTACH_TO_ENTITY,
        owner_service: 'openvibe-media',
        description: 'Attach media to an entity.',
        policy: { access: 'authenticated' },
        rate_limit: { requests_per_minute: 60 },
    },
    {
        capability_id: CAPABILITIES.AI_RUN_CREATE,
        owner_service: 'openvibe-ai',
        description: 'Create an AI run.',
        policy: { access: 'authenticated' },
        rate_limit: { requests_per_minute: 15 },
    },
    {
        capability_id: CAPABILITIES.AI_CHAT,
        owner_service: 'openvibe-ai',
        description: 'Run an AI chat completion.',
        policy: { access: 'authenticated' },
        rate_limit: { requests_per_minute: 30 },
    },
    {
        capability_id: CAPABILITIES.AI_GENERATE,
        owner_service: 'openvibe-ai',
        description: 'Run an AI generation task.',
        policy: { access: 'authenticated' },
        rate_limit: { requests_per_minute: 30 },
    },
    {
        capability_id: CAPABILITIES.AI_SUMMARIZE,
        owner_service: 'openvibe-ai',
        description: 'Run an AI summarization task.',
        policy: { access: 'authenticated' },
        rate_limit: { requests_per_minute: 30 },
    },
]);

function seedCapabilityRegistry(sql) {
    const stmt = sql.prepare(`
        INSERT INTO capability_registry (capability_id, version, owner_service, description,
            input_schema_json, output_schema_json, policy_json, rate_limit_json,
            emits_topics_json, deprecated, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(capability_id, version) DO UPDATE SET
            owner_service = excluded.owner_service,
            description = excluded.description,
            input_schema_json = excluded.input_schema_json,
            output_schema_json = excluded.output_schema_json,
            policy_json = excluded.policy_json,
            rate_limit_json = excluded.rate_limit_json,
            emits_topics_json = excluded.emits_topics_json,
            deprecated = excluded.deprecated,
            updated_at = CURRENT_TIMESTAMP
    `);
    // Build a merged catalog: every product capability gets a baseline record
    // from the contracts catalog, then implemented capabilities are upserted
    // with their richer schema/policy/rate-limit metadata so the network
    // dispatcher can rely on the enriched record.
    const richById = new Map();
    for (const def of KNOWN_CAPABILITY_DEFINITIONS) richById.set(def.capability_id, def);
    const merged = PRODUCT_CAPABILITY_RECORDS.map((record) => {
        const enriched = richById.get(record.capability_id);
        if (!enriched) return record;
        return Object.assign({}, record, enriched, {
            owner_service: enriched.owner_service || record.owner_service,
            policy: enriched.policy || record.policy,
            rate_limit: enriched.rate_limit || record.rate_limit,
        });
    });
    for (const def of merged) {
        stmt.run(
            def.capability_id,
            def.version || 1,
            def.owner_service,
            def.description || null,
            JSON.stringify(def.input_schema || {}),
            JSON.stringify(def.output_schema || {}),
            JSON.stringify(def.policy || {}),
            JSON.stringify(def.rate_limit || {}),
            JSON.stringify(def.emits_topics || []),
            def.deprecated ? 1 : 0
        );
    }
}

function createCapabilityDispatcher({ config, internalKey }) {
    const headers = { 'X-OpenVibe-Service': SERVICE_NAME };
    const chat = new ChatClient({ chatUrl: config.chat.internalUrl, internalKey, service: SERVICE_NAME });
    const community = new CommunityClient({ communityUrl: config.community.internalUrl, internalKey, service: SERVICE_NAME });
    const billing = new BillingClient({ billingUrl: config.billing.internalUrl, internalKey, service: SERVICE_NAME });
    const media = new MediaClient({ mediaUrl: config.media.internalUrl, internalKey, service: SERVICE_NAME });
    const ai = new AiClient({ aiUrl: config.ai.internalUrl, internalKey, service: SERVICE_NAME });

    const targetServices = new Map(KNOWN_CAPABILITY_DEFINITIONS.map((def) => [def.capability_id, def.owner_service]));

    const handlers = {
        [CAPABILITIES.CHAT_ROOM_CREATE]: async ({ input }) => chat.createRoom(input),
        [CAPABILITIES.CHAT_ROOM_JOIN]: async ({ input }) => chat.getRoom(resolveField(input, ['room_id', 'roomId'], 'room id is required')),
        [CAPABILITIES.CHAT_SEND_MESSAGE]: async ({ input }) => {
            const roomId = resolveField(input, ['room_id', 'roomId'], 'room id is required');
            const body = normalizeNestedBody(input, ['room_id', 'roomId']);
            return chat.sendMessage(roomId, body);
        },
        [CAPABILITIES.CHAT_DM_OPEN]: async ({ input }) => chat.openDm(input),
        [CAPABILITIES.COMMUNITY_SPACE_CREATE]: async ({ input }) => community.createSpace(input),
        [CAPABILITIES.COMMUNITY_CATEGORY_CREATE]: async ({ input }) => {
            const spaceId = resolveField(input, ['space_id', 'spaceId'], 'space id is required');
            return community.createCategory(spaceId, normalizeNestedBody(input, ['space_id', 'spaceId']));
        },
        [CAPABILITIES.COMMUNITY_THREAD_CREATE]: async ({ input }) => community.createThread(input),
        [CAPABILITIES.COMMUNITY_CREATE_POST]: async ({ input }) => {
            const threadId = resolveField(input, ['thread_id', 'threadId'], 'thread id is required');
            return community.createPost(threadId, normalizeNestedBody(input, ['thread_id', 'threadId']));
        },
        [CAPABILITIES.BILLING_WALLET_GET]: async ({ input, actor }) => {
            const ownerType = String(input.owner_type || input.ownerType || (actor.type === 'user' ? 'user' : 'service'));
            const ownerId = String(input.owner_id || input.ownerId || actor.id || '');
            return billing.getWallet(ownerType, ownerId, input.wallet_type || input.walletType || undefined);
        },
        [CAPABILITIES.BILLING_WALLET_ADJUST]: async ({ input }) => {
            const ownerType = String(input.owner_type || input.ownerType || 'user');
            const ownerId = String(resolveField(input, ['owner_id', 'ownerId'], 'owner id is required'));
            return billing.adjustWallet(ownerType, ownerId, normalizeNestedBody(input, ['owner_type', 'ownerType', 'owner_id', 'ownerId']));
        },
        [CAPABILITIES.BILLING_CREDITS_CHARGE]: async ({ input, actor }) => billing.chargeCredits(withActorDefaults(input, actor)),
        [CAPABILITIES.BILLING_CREDITS_REFUND]: async ({ input, actor }) => billing.refundCredits(withActorDefaults(input, actor)),
        [CAPABILITIES.TIPS_CREATE]: async ({ input, actor }) => billing.createTip(withActorDefaults(input, actor)),
        [CAPABILITIES.MEDIA_UPLOAD_INIT]: async ({ input }) => media.initUpload(input),
        [CAPABILITIES.MEDIA_ATTACH_TO_ENTITY]: async ({ input }) => jsonRequest(`${stripSlash(config.media.internalUrl)}/api/v1/attachments`, {
            method: 'POST',
            internalKey,
            headers,
            body: input,
        }),
        [CAPABILITIES.AI_RUN_CREATE]: async ({ input }) => ai.createRun(input),
        [CAPABILITIES.AI_CHAT]: async ({ input }) => ai.chat(input),
        [CAPABILITIES.AI_GENERATE]: async ({ input }) => ai.generate(input),
        [CAPABILITIES.AI_SUMMARIZE]: async ({ input }) => ai.summarize(input),
    };

    return {
        targetServiceFor(capabilityId) {
            return targetServices.get(capabilityId) || null;
        },
        supports(capabilityId) {
            return typeof handlers[capabilityId] === 'function';
        },
        async dispatch({ capabilityId, input, actor }) {
            const handler = handlers[capabilityId];
            if (!handler) {
                const err = new Error(`capability not implemented: ${capabilityId}`);
                err.status = 501;
                throw err;
            }
            const result = await handler({ input, actor });
            return {
                target_service: this.targetServiceFor(capabilityId),
                result,
            };
        },
    };
}

function stripSlash(value) {
    return String(value || '').replace(/\/$/, '');
}

function withActorDefaults(input, actor) {
    const out = Object.assign({}, input || {});
    if (!out.actor_type && actor && actor.type && actor.type !== 'anonymous') out.actor_type = actor.type;
    if (!out.actor_id && actor && actor.id != null) out.actor_id = actor.id;
    return out;
}

function resolveField(input, names, message) {
    for (const name of names) {
        if (input && input[name] != null && input[name] !== '') return input[name];
    }
    const err = new Error(message);
    err.status = 400;
    throw err;
}

function normalizeNestedBody(input, keysToStrip) {
    if (input && input.body && typeof input.body === 'object' && !Array.isArray(input.body)) {
        return input.body;
    }
    const out = Object.assign({}, input || {});
    for (const key of keysToStrip) delete out[key];
    return out;
}

module.exports = {
    KNOWN_CAPABILITY_DEFINITIONS,
    seedCapabilityRegistry,
    createCapabilityDispatcher,
};
