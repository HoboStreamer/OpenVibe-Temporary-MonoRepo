'use strict';

const { normalizeServiceName } = require('./common');

function withRedactedFields(row, fields, extra) {
    const next = { ...row };
    const redacted = [];

    for (const field of fields) {
        if (Object.prototype.hasOwnProperty.call(next, field)) {
            if (next[field] != null && next[field] !== '') {
                redacted.push(field);
            }
            delete next[field];
        }
    }

    if (redacted.length) {
        next.redacted_fields = redacted;
    }
    if (extra) {
        Object.assign(next, extra);
    }
    return next;
}

const HOBOSTREAMER_EXPORTS = [
    { table: 'users', orderBy: 'id' },
    {
        table: 'linked_accounts',
        orderBy: 'id',
        transformRow(row) {
            return { ...row, service: normalizeServiceName(row.service) };
        },
    },
    { table: 'channels', orderBy: 'id' },
    {
        table: 'robotstreamer_integrations',
        orderBy: 'id',
        transformRow(row) {
            return withRedactedFields(row, ['token'], { token_redacted: !!row.token });
        },
    },
    {
        table: 'restream_destinations',
        orderBy: 'id',
        transformRow(row) {
            return withRedactedFields(row, ['stream_key'], { stream_key_redacted: !!row.stream_key });
        },
    },
    { table: 'managed_streams', orderBy: 'id' },
    { table: 'streams', orderBy: 'id' },
    { table: 'cameras', orderBy: 'id' },
    { table: 'chat_messages', orderBy: 'id' },
    { table: 'follows', orderBy: 'follower_id, streamer_id' },
    { table: 'subscriptions', orderBy: 'id' },
    { table: 'coin_transactions', orderBy: 'id' },
    { table: 'coin_rewards', orderBy: 'id' },
    { table: 'coin_redemptions', orderBy: 'id' },
    { table: 'watch_time', orderBy: 'id' },
    { table: 'vods', orderBy: 'id' },
    { table: 'clips', orderBy: 'id' },
    { table: 'comments', orderBy: 'id' },
    { table: 'bans', orderBy: 'id' },
    { table: 'themes', orderBy: 'id' },
    { table: 'user_themes', orderBy: 'id' },
    { table: 'verification_keys', orderBy: 'id' },
    { table: 'pastes', orderBy: 'id' },
    { table: 'paste_likes', orderBy: 'paste_id, user_id' },
    { table: 'paste_comments', orderBy: 'id' },
    { table: 'media_request_settings', orderBy: 'user_id' },
    { table: 'media_requests', orderBy: 'id' },
    { table: 'vibe_coding_sessions', orderBy: 'id' },
    { table: 'vibe_coding_events', orderBy: 'id' },
    { table: 'viewer_snapshots', orderBy: 'id' },
    { table: 'stream_analytics', orderBy: 'stream_id' },
    { table: 'user_preferences', orderBy: 'user_id' },
    { table: 'emotes', orderBy: 'id' },
    {
        table: 'camera_profiles',
        orderBy: 'id',
        transformRow(row) {
            return withRedactedFields(row, ['password_hash'], { password_hash_redacted: !!row.password_hash });
        },
    },
    { table: 'camera_presets', orderBy: 'id' },
    { table: 'stream_controls', orderBy: 'id' },
    { table: 'moderation_actions', orderBy: 'id' },
    { table: 'channel_moderators', orderBy: 'id' },
    { table: 'channel_moderation_settings', orderBy: 'channel_id' },
    { table: 'control_configs', orderBy: 'id' },
    { table: 'control_config_buttons', orderBy: 'id' },
    { table: 'game_world_state', orderBy: 'key' },
    { table: 'game_players', orderBy: 'user_id' },
    { table: 'game_inventory', orderBy: 'user_id, item_id' },
    { table: 'game_bank', orderBy: 'user_id, item_id' },
    { table: 'game_structures', orderBy: 'id' },
    { table: 'game_farm_plots', orderBy: 'user_id, plot_index' },
    { table: 'game_recipes', orderBy: 'user_id, recipe_id' },
    { table: 'game_effects', orderBy: 'id' },
    { table: 'game_battle_stats', orderBy: 'user_id' },
    { table: 'game_dungeon_runs', orderBy: 'id' },
    { table: 'game_leaderboard', orderBy: 'board_type, rank, user_id' },
    { table: 'game_fish_collection', orderBy: 'user_id, fish_id' },
    { table: 'game_daily_quest_progress', orderBy: 'user_id, quest_date, stat_key' },
    { table: 'game_daily_quest_claims', orderBy: 'user_id, quest_date, quest_id' },
    { table: 'game_achievements', orderBy: 'user_id, achievement_id' },
    { table: 'user_cosmetics', orderBy: 'user_id, category, item_id' },
    { table: 'user_equipped', orderBy: 'user_id, slot' },
    { table: 'user_tags', orderBy: 'user_id, tag_id' },
    { table: 'user_equipped_tag', orderBy: 'user_id' },
    { table: 'tag_guardian_defeats', orderBy: 'user_id' },
];

const HOBOSTREAMER_EXCLUSIONS = [
    {
        entity: 'users.hobo_bucks_balance',
        reason: 'Hobo Bucks balances are explicitly excluded from canonical OpenVibe import.',
    },
    {
        entity: 'transactions',
        reason: 'Legacy Hobo Bucks transaction rows remain read-only audit sources and are not imported as canonical balance truth.',
    },
    {
        entity: 'donation_goals',
        reason: 'Donation-goal current amounts depend on the legacy Hobo Bucks balance model and must be recalculated or rebuilt later.',
    },
    {
        entity: 'api_keys',
        reason: 'Hardware control API keys are secret-bearing and must be manually reissued in OpenVibe.',
    },
    {
        entity: 'api_tokens',
        reason: 'Bot and integration tokens are secret-bearing and must be manually reissued in OpenVibe.',
    },
    {
        entity: 'site_settings',
        reason: 'Legacy site settings include operational secrets and host-specific config that should not be bulk-imported.',
    },
    {
        entity: 'approved_ips',
        reason: 'Approved IP lists are operational runtime state, not canonical product data.',
    },
    {
        entity: 'pending_ip_messages',
        reason: 'Pending IP moderation queues are operational runtime state.',
    },
    {
        entity: 'hidden_relay_users',
        reason: 'Relay suppression lists are operational bridge state and remain transitional.',
    },
    {
        entity: 'anon_ip_mappings',
        reason: 'Anonymous IP mappings are operational/abuse-mitigation state, not canonical user data.',
    },
    {
        entity: 'ip_log',
        reason: 'IP logs are operational audit data and should not be bulk imported into canonical persistence.',
    },
    {
        entity: 'vpn_approvals',
        reason: 'VPN approval workflows are operational moderation state and not part of the initial cutover foundation.',
    },
];

const HOBOQUEST_EXPORTS = [
    { table: 'game_world_state', orderBy: 'key' },
    { table: 'game_players', orderBy: 'user_id' },
    { table: 'game_inventory', orderBy: 'user_id, item_id' },
    { table: 'game_bank', orderBy: 'user_id, item_id' },
    { table: 'game_structures', orderBy: 'id' },
    { table: 'game_farm_plots', orderBy: 'user_id, plot_index' },
    { table: 'game_recipes', orderBy: 'user_id, recipe_id' },
    { table: 'game_effects', orderBy: 'id' },
    { table: 'game_battle_stats', orderBy: 'user_id' },
    { table: 'game_dungeon_runs', orderBy: 'id' },
    { table: 'game_leaderboard', orderBy: 'board, rank, user_id' },
    { table: 'game_fish_collection', orderBy: 'user_id, fish_id' },
    { table: 'game_daily_quest_progress', orderBy: 'user_id, quest_date, stat_key' },
    { table: 'game_daily_quest_claims', orderBy: 'user_id, quest_date, quest_id' },
    { table: 'game_achievements', orderBy: 'user_id, achievement_id' },
    { table: 'user_cosmetics', orderBy: 'user_id, type, item_id' },
    { table: 'user_equipped', orderBy: 'user_id, slot' },
    { table: 'user_tags', orderBy: 'user_id, tag_id' },
    { table: 'user_equipped_tag', orderBy: 'user_id' },
    { table: 'tag_guardian_defeats', orderBy: 'user_id' },
    { table: 'canvas_settings', orderBy: 'key' },
    { table: 'canvas_tiles', orderBy: 'x, y' },
    { table: 'canvas_actions', orderBy: 'id' },
    { table: 'canvas_snapshots', orderBy: 'id' },
    { table: 'canvas_region_locks', orderBy: 'id' },
    { table: 'canvas_bans', orderBy: 'id' },
    { table: 'canvas_user_overrides', orderBy: 'user_id' },
];

const HOBOQUEST_EXCLUSIONS = [
    {
        entity: 'canvas_pixels',
        reason: 'Legacy canvas_pixels is a compatibility alias; canonical migration reads canvas_tiles instead.',
    },
    {
        entity: 'canvas_cooldowns',
        reason: 'Per-user placement cooldown rows are transient runtime throttling state and are recalculated after cutover.',
    },
];

const HOBOTOOLS_EXPORTS = [
    { table: 'users', orderBy: 'id' },
    {
        table: 'linked_accounts',
        orderBy: 'id',
        transformRow(row) {
            return { ...row, service: normalizeServiceName(row.service) };
        },
    },
    { table: 'user_preferences', orderBy: 'user_id' },
    { table: 'themes', orderBy: 'id' },
    { table: 'url_registry', orderBy: 'key' },
    { table: 'notifications', orderBy: 'created_at, id' },
    { table: 'notification_preferences', orderBy: 'user_id, category' },
    { table: 'anon_users', orderBy: 'id' },
    { table: 'user_effects', orderBy: 'user_id, effect_type, effect_id' },
    { table: 'follows', orderBy: 'follower_id, followed_id' },
    { table: 'verification_keys', orderBy: 'id' },
    {
        table: 'oauth_clients',
        orderBy: 'client_id',
        transformRow(row) {
            return withRedactedFields(row, ['client_secret'], { client_secret_redacted: !!row.client_secret });
        },
    },
];

const HOBOTOOLS_EXCLUSIONS = [
    {
        entity: 'oauth_codes',
        reason: 'Authorization codes are ephemeral auth state and must not survive cutover.',
    },
    {
        entity: 'oauth_tokens',
        reason: 'Refresh/access token state is ephemeral and should be rotated on cutover.',
    },
    {
        entity: 'user_sessions',
        reason: 'Existing multi-account session tokens are ephemeral and should be re-established after cutover.',
    },
    {
        entity: 'password_reset_tokens',
        reason: 'Password reset tokens are ephemeral security artifacts.',
    },
    {
        entity: 'push_subscriptions',
        reason: 'Push subscriptions are device-specific runtime registrations and should be re-registered after cutover.',
    },
    {
        entity: 'site_settings',
        reason: 'Legacy site settings include operational secrets and provider credentials that should be reconfigured explicitly.',
    },
    {
        entity: 'audit_log',
        reason: 'Audit logs remain an operational archive and are not part of the canonical data cutover slice.',
    },
    {
        entity: 'ip_log',
        reason: 'IP logs are operational audit data, not canonical product state.',
    },
    {
        entity: 'anon_ip_log',
        reason: 'Anonymous IP logs are abuse-mitigation state, not canonical user data.',
    },
    {
        entity: 'email_delivery_log',
        reason: 'Email delivery logs are operational telemetry and remain archive-only.',
    },
];

function getSourcePlan(sourceName) {
    if (sourceName === 'hobostreamer') return HOBOSTREAMER_EXPORTS;
    if (sourceName === 'hobotools') return HOBOTOOLS_EXPORTS;
    if (sourceName === 'hoboquest') return HOBOQUEST_EXPORTS;
    throw new Error(`Unsupported source plan: ${sourceName}`);
}

function getSourceExclusions(sourceName) {
    if (sourceName === 'hobostreamer') return HOBOSTREAMER_EXCLUSIONS;
    if (sourceName === 'hobotools') return HOBOTOOLS_EXCLUSIONS;
    if (sourceName === 'hoboquest') return HOBOQUEST_EXCLUSIONS;
    throw new Error(`Unsupported source exclusions: ${sourceName}`);
}

module.exports = {
    HOBOQUEST_EXCLUSIONS,
    HOBOQUEST_EXPORTS,
    HOBOSTREAMER_EXCLUSIONS,
    HOBOSTREAMER_EXPORTS,
    HOBOTOOLS_EXCLUSIONS,
    HOBOTOOLS_EXPORTS,
    getSourceExclusions,
    getSourcePlan,
};
