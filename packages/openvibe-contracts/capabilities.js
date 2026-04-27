'use strict';

// OpenVibe — well-known capability ids. A capability is a versioned, owned,
// permissioned action that any service or mod may invoke through the platform
// rather than calling a sibling service's private endpoint directly.
//
// These constants are the seed list — services register the canonical record
// (with input/output schema and policy) at boot via the SDK.

const CAPABILITIES = Object.freeze({
    // chat
    CHAT_ROOM_CREATE:     'chat.room.create',
    CHAT_ROOM_JOIN:       'chat.room.join',
    CHAT_ROOM_LEAVE:      'chat.room.leave',
    CHAT_SEND_MESSAGE:    'chat.message.send',
    CHAT_EDIT_MESSAGE:    'chat.message.edit',
    CHAT_DELETE_MESSAGE:  'chat.message.delete',
    CHAT_DM_OPEN:         'chat.dm.open',
    CHAT_START_CALL:      'chat.call.start',
    CHAT_CALL_SIGNAL:     'chat.call.signal',
    CHAT_END_CALL:        'chat.call.end',
    CHAT_TTS_SETTINGS_UPDATE: 'chat.tts.settings.update',
    CHAT_ENQUEUE_TTS:     'chat.tts.enqueue',
    CHAT_TTS_SKIP:        'chat.tts.skip',
    CHAT_TTS_CLEAR:       'chat.tts.clear',
    CHAT_AUDIO_ENQUEUE:   'chat.audio.enqueue',
    CHAT_AUDIO_SKIP:      'chat.audio.skip',
    CHAT_AUDIO_CLEAR:     'chat.audio.clear',
    CHAT_OVERLAY_RENDER:  'chat.overlay.render',

    // tips / billing (Phase 6)
    TIPS_CREATE_ALERT:           'tips.create_alert',
    TIPS_CREATE:                 'tips.create',
    TIPS_REFUND:                 'tips.refund',
    TIPS_OVERLAY_FEED:           'tips.overlay.feed',
    TIPS_SUPERCHAT_CREATE:       'tips.superchat.create',
    TIPS_TTS_CREATE:             'tips.tts.create',
    TIPS_MEDIA_REQUEST_CREATE:   'tips.media_request.create',

    BILLING_WALLET_GET:          'billing.wallet.get',
    BILLING_WALLET_ADJUST:       'billing.wallet.adjust',
    BILLING_CREDITS_CHECKOUT:    'billing.credits.checkout',
    BILLING_CREDITS_COMPLETE_CHECKOUT: 'billing.credits.complete_checkout',
    BILLING_CHARGE_CREDITS:      'billing.charge_credits',
    BILLING_CREDITS_CHARGE:      'billing.credits.charge',
    BILLING_CREDITS_REFUND:      'billing.credits.refund',
    BILLING_TRANSACTION_LOOKUP:  'billing.transaction.lookup',
    BILLING_ENTITLEMENT_CHECK:   'billing.entitlement.check',
    BILLING_ECONOMY_FREEZE:      'billing.economy.freeze',
    BILLING_ECONOMY_UNFREEZE:    'billing.economy.unfreeze',
    BILLING_CREATE_SUBSCRIPTION: 'billing.create_subscription',

    VIP_PLAN_CREATE:             'vip.plan.create',
    VIP_PLAN_UPDATE:             'vip.plan.update',
    VIP_SUBSCRIPTION_CREATE:     'vip.subscription.create',
    VIP_SUBSCRIPTION_CANCEL:     'vip.subscription.cancel',
    VIP_SUBSCRIPTION_RENEW:      'vip.subscription.renew',
    VIP_ENTITLEMENT_CHECK:       'vip.entitlement.check',

    // media
    MEDIA_UPLOAD_INIT:    'media.upload_init',
    MEDIA_ATTACH_TO_ENTITY: 'media.attach_to_entity',

    // community
    COMMUNITY_SPACE_CREATE:    'community.space.create',
    COMMUNITY_CATEGORY_CREATE: 'community.category.create',
    COMMUNITY_THREAD_CREATE:   'community.thread.create',
    COMMUNITY_THREAD_LOCK:     'community.thread.lock',
    COMMUNITY_CREATE_POST:     'community.post.create',
    COMMUNITY_DELETE_POST:     'community.post.delete',
    COMMUNITY_COMMENT_ATTACH:  'community.comment.attach',
    COMMUNITY_CREATE_PASTE:    'community.paste.create',
    COMMUNITY_UPDATE_PASTE:    'community.paste.update',
    COMMUNITY_DISCORD_RELAY_CONFIGURE: 'community.discord.relay.configure',
    COMMUNITY_DISCORD_MESSAGE_IMPORT:  'community.discord.message.import',

    // ai-driven content
    WIKI_GENERATE_SPACE:  'wiki.generate_space',
    BLOG_PUBLISH_POST:    'blog.publish_post',

    // games
    GAMES_CREATE_WORLD:   'games.create_world',

    // ── Phase 7: AI core ──
    AI_PROVIDER_CREATE:    'ai.provider.create',
    AI_PROVIDER_UPDATE:    'ai.provider.update',
    AI_PROVIDER_DISABLE:   'ai.provider.disable',
    AI_MODEL_CREATE:       'ai.model.create',
    AI_ROUTE_CONFIGURE:    'ai.route.configure',
    AI_TEMPLATE_CREATE:    'ai.template.create',
    AI_WORKFLOW_CREATE:    'ai.workflow.create',
    AI_RUN_CREATE:         'ai.run.create',
    AI_RUN_CANCEL:         'ai.run.cancel',
    AI_RUN_RETRY:          'ai.run.retry',

    // AI tasks
    AI_CHAT:               'ai.chat',
    AI_GENERATE:           'ai.generate',
    AI_SUMMARIZE:          'ai.summarize',
    AI_CLASSIFY:           'ai.classify',
    AI_EXTRACT:            'ai.extract',
    AI_ENRICH:             'ai.enrich',
    AI_EMBED:              'ai.embed',

    // Product AI workflows
    AI_WIKI_GENERATE_SPACE:        'ai.wiki.generate_space',
    AI_WIKI_GENERATE_PAGE:         'ai.wiki.generate_page',
    AI_BLOG_DRAFT_POST:            'ai.blog.draft_post',
    AI_NEWS_SUMMARIZE_STORY:       'ai.news.summarize_story',
    AI_NEWS_COMPARE_PERSPECTIVES:  'ai.news.compare_perspectives',
    AI_REVIEWS_SUMMARIZE_ENTITY:   'ai.reviews.summarize_entity',
    AI_DEALS_ENRICH_DEAL:          'ai.deals.enrich_deal',
    AI_COUPONS_EXTRACT_COUPON:     'ai.coupons.extract_coupon',
    AI_TRADE_SUMMARIZE_MARKET:     'ai.trade.summarize_market_context',
    AI_CODES_GENERATE_DOCS:        'ai.codes.generate_docs',
    AI_TOOLS_DESCRIBE_TOOL:        'ai.tools.describe_tool',
    AI_GAMES_GENERATE_LORE:        'ai.games.generate_lore',
    AI_MODERATION_CLASSIFY:        'ai.moderation.classify',

    // SEO
    SEO_METADATA_GENERATE:         'seo.metadata.generate',
    SEO_INDEXABILITY_EVALUATE:     'seo.indexability.evaluate',
    SEO_STRUCTURED_DATA_GENERATE:  'seo.structured_data.generate',
    SEO_SITEMAP_ENTRY_GENERATE:    'seo.sitemap.entry.generate',
    SEO_SITEMAP_GENERATE:          'seo.sitemap.generate',
    SEO_SITEMAP_INDEX_GENERATE:    'seo.sitemap_index.generate',
    SEO_FEED_RSS_GENERATE:         'seo.feed.rss.generate',
    SEO_FEED_ATOM_GENERATE:        'seo.feed.atom.generate',
    SEO_ROBOTS_GENERATE:           'seo.robots.generate',
    SEO_SLUG_NORMALIZE:            'seo.slug.normalize',
    SEO_CANONICAL_GENERATE:        'seo.canonical.generate',
    SEO_DUPLICATE_HASH_GENERATE:   'seo.duplicate_hash.generate',

    // Sources / ingestion
    CONTENT_SOURCE_REGISTER:       'content.source.register',
    CONTENT_SOURCE_UPDATE:         'content.source.update',
    CONTENT_SOURCE_TEST:           'content.source.test',
    CONTENT_SOURCE_FETCH:          'content.source.fetch',
    CONTENT_SOURCE_ROBOTS_CHECK:   'content.source.robots_check',
    CONTENT_INGESTION_JOB_CREATE:  'content.ingestion.job.create',
    CONTENT_INGESTION_JOB_RUN:     'content.ingestion.job.run',
    CONTENT_INGESTION_JOB_CANCEL:  'content.ingestion.job.cancel',
    CONTENT_QUALITY_EVALUATE:      'content.quality.evaluate',

    // Search
    SEARCH_DOCUMENT_INDEX:         'search.document.index',
    SEARCH_QUERY:                  'search.query',
    SEARCH_DOCUMENT_DELETE:        'search.document.delete',
});

const CAPABILITY_LIST = Object.freeze(Object.values(CAPABILITIES));

function isKnownCapability(id) {
    return typeof id === 'string' && CAPABILITY_LIST.includes(id);
}

module.exports = { CAPABILITIES, CAPABILITY_LIST, isKnownCapability };
