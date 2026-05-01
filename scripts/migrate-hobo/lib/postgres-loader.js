'use strict';

const path = require('path');
const fs = require('fs');

const { buildEntityId, forEachNdjson, ensureDir, writeJson } = require('./common');
const { withClient, buildBatchUpsert, buildUpsert, applySchemaDirectory } = require('./postgres');

const SCHEMA_DIR = path.resolve(__dirname, '..', 'postgres', 'schema');

const DATASET_PLAN = [
    {
        dataset: 'identity/users',
        table: 'identity_users',
        keys: ['id'],
        map(row) {
            return {
                id: row.id,
                username: row.username || null,
                display_name: row.display_name || row.displayName || null,
                email: row.email || null,
                role: row.role || null,
                flags_json: row.flags || row.flags_json || {},
                legacy_source: row.legacy_source || (row.legacy_ref && row.legacy_ref.source) || null,
                legacy_id: row.legacy_id || (row.legacy_ref && row.legacy_ref.legacy_id) || null,
            };
        },
    },
    {
        dataset: 'identity/linked-accounts',
        table: 'identity_linked_accounts',
        keys: ['service', 'external_id'],
        map(row) {
            return {
                user_id: row.user_id || row.userId || null,
                service: row.service,
                external_id: row.external_id || row.externalId || row.id,
                metadata_json: row.metadata || {},
                legacy_source: row.legacy_source || null,
                legacy_id: row.legacy_id || null,
            };
        },
    },
    {
        dataset: 'identity/anon-users',
        table: 'identity_anon_users',
        keys: ['id'],
        map(row) {
            return {
                id: row.id,
                anon_number: row.anon_number == null ? null : String(row.anon_number),
                session_token: row.session_token || null,
                display_name: row.display_name || null,
                preferences_json: row.preferences || {},
                total_messages: row.total_messages || 0,
                total_commands: row.total_commands || 0,
                first_seen: row.first_seen || null,
                last_seen: row.last_seen || null,
                fingerprint: row.session_token || (row.anon_number == null ? null : `anon:${row.anon_number}`),
                legacy_source: row.source || (row.legacy_ref && row.legacy_ref.source) || null,
                legacy_id: (row.legacy_ref && row.legacy_ref.legacy_id) || null,
                created_at: row.first_seen || row.created_at || null,
            };
        },
    },
    {
        dataset: 'identity/verification-keys',
        table: 'identity_verification_keys',
        keys: ['id'],
        map(row) {
            return {
                id: row.id,
                user_id: row.used_by_user_id || row.created_by_user_id || null,
                key_type: 'legacy-verification-key',
                metadata_json: {
                    source: row.source || null,
                    key: row.key || null,
                    target_username: row.target_username || null,
                    note: row.note || null,
                    status: row.status || null,
                    created_by_user_id: row.created_by_user_id || null,
                    used_by_user_id: row.used_by_user_id || null,
                    used_at: row.used_at || null,
                    legacy_ref: row.legacy_ref || null,
                },
                created_at: row.created_at || null,
            };
        },
    },
    {
        dataset: 'identity/user-effects',
        table: 'identity_user_effects',
        keys: ['user_id', 'effect_type', 'effect_id'],
        map(row) {
            return {
                user_id: row.user_id || null,
                effect_type: row.effect_type || null,
                effect_id: row.effect_id || null,
                data_json: {
                    is_active: row.is_active == null ? true : !!row.is_active,
                    acquired_at: row.acquired_at || null,
                    legacy_ref: row.legacy_ref || null,
                },
            };
        },
    },
    {
        dataset: 'identity/username-conflicts',
        table: 'identity_username_conflicts',
        keys: ['canonical_user_id', 'legacy_id'],
        map(row) {
            return {
                canonical_user_id: row.canonical_user_id || null,
                hobotools_username: row.hobotools_username || null,
                hobostreamer_username: row.hobostreamer_username || null,
                legacy_id: row.legacy_id || null,
                created_at: row.created_at || null,
            };
        },
    },
    {
        dataset: 'themes/catalog',
        table: 'themes_catalog',
        keys: ['id'],
        map(row) {
            return {
                id: row.id,
                name: row.name || null,
                description: row.description || null,
                css_vars_json: row.css_vars || row.cssVars || {},
                legacy_source: row.legacy_source || null,
                legacy_id: row.legacy_id || null,
            };
        },
    },
    {
        dataset: 'themes/preferences',
        table: 'themes_user_preferences',
        keys: ['user_id'],
        map(row) {
            return {
                user_id: row.user_id || row.userId,
                theme_id: row.theme_id || row.themeId || null,
                overrides_json: row.overrides || {},
            };
        },
    },
    {
        dataset: 'control-plane/url-registry',
        table: 'control_url_registry',
        keys: ['key'],
        map(row) {
            return {
                key: row.key,
                value: row.value == null ? null : String(row.value),
                description: row.description || null,
            };
        },
    },
    {
        dataset: 'control-plane/user-preferences',
        table: 'control_user_preferences',
        keys: ['user_id', 'scope'],
        map(row) {
            return {
                user_id: row.user_id || null,
                scope: row.scope || 'network',
                language: row.language || null,
                settings_json: {
                    notifications_enabled: row.notifications_enabled == null ? true : !!row.notifications_enabled,
                    custom_theme_variables: row.custom_theme_variables || {},
                    chat_settings: row.chat_settings || {},
                    legacy_ref: row.legacy_ref || null,
                    source: row.source || null,
                },
                legacy_source: row.source || (row.legacy_ref && row.legacy_ref.source) || null,
                legacy_id: (row.legacy_ref && row.legacy_ref.legacy_id) || null,
                updated_at: row.updated_at || null,
            };
        },
    },
    {
        dataset: 'control-plane/oauth-clients',
        table: 'control_oauth_clients',
        keys: ['client_id'],
        map(row) {
            return {
                client_id: row.client_id || row.id,
                display_name: row.name || row.display_name || null,
                redirect_uris: row.redirect_uris || [],
                scopes: row.scopes || [],
                legacy_source: row.source || (row.legacy_ref && row.legacy_ref.source) || null,
            };
        },
    },
    {
        dataset: 'control-plane/notifications',
        table: 'control_notifications',
        keys: ['id'],
        map(row) {
            return {
                id: row.id,
                user_id: row.user_id || null,
                category: row.category || null,
                type: row.type || null,
                payload_json: {
                    title: row.title || null,
                    message: row.message || null,
                    icon: row.icon || null,
                    sender_user_id: row.sender_user_id || null,
                    sender_name: row.sender_name || null,
                    sender_avatar: row.sender_avatar || null,
                    service: row.service || null,
                    url: row.url || null,
                    rich_content: row.rich_content || null,
                    is_dismissed: !!row.is_dismissed,
                    is_emailed: !!row.is_emailed,
                    expires_at: row.expires_at || null,
                    legacy_ref: row.legacy_ref || null,
                },
                read_at: row.is_read ? (row.read_at || row.created_at || null) : null,
                created_at: row.created_at || null,
            };
        },
    },
    {
        dataset: 'control-plane/notification-preferences',
        table: 'control_notification_preferences',
        keys: ['user_id', 'category'],
        map(row) {
            return {
                user_id: row.user_id || null,
                category: row.category || null,
                enabled: row.enabled == null ? true : !!row.enabled,
            };
        },
    },
    {
        dataset: 'social/follows',
        table: 'social_follows',
        keys: ['follower_id', 'followed_id'],
        map(row) {
            return {
                follower_id: row.follower_user_id || null,
                followed_id: row.followed_user_id || null,
                created_at: row.created_at || null,
            };
        },
    },
    {
        dataset: 'live/channels',
        table: 'live_channels',
        keys: ['id'],
        map(row) {
            return {
                id: row.id,
                owner_id: row.owner_id || row.user_id || null,
                title: row.title || null,
                description: row.description || null,
                metadata_json: row.metadata || {},
                legacy_source: row.legacy_source || null,
                legacy_id: row.legacy_id || null,
            };
        },
    },
    {
        dataset: 'live/streams',
        table: 'live_streams',
        keys: ['id'],
        map(row) {
            return {
                id: row.id,
                channel_id: row.channel_id || null,
                user_id: row.user_id || null,
                title: row.title || null,
                status: row.status || null,
                started_at: row.started_at || row.startedAt || null,
                ended_at: row.ended_at || row.endedAt || null,
                metadata_json: row.metadata || {},
                legacy_source: row.legacy_source || null,
                legacy_id: row.legacy_id || null,
            };
        },
    },
    // Canonical importer emits live/stream-sessions and live/stream-definitions.
    {
        dataset: 'live/stream-sessions',
        table: 'live_streams',
        keys: ['id'],
        map(row) {
            return {
                id: row.id,
                channel_id: row.channel_id || null,
                user_id: row.user_id || row.owner_user_id || null,
                title: row.title || null,
                status: row.status || (row.ended_at ? 'ended' : 'unknown'),
                started_at: row.started_at || row.startedAt || null,
                ended_at: row.ended_at || row.endedAt || null,
                metadata_json: row.metadata || row.payload || {},
                legacy_source: row.source || (row.legacy_ref && row.legacy_ref.source) || null,
                legacy_id: (row.legacy_ref && row.legacy_ref.legacy_id) || row.legacy_id || null,
            };
        },
    },
    {
        dataset: 'live/stream-definitions',
        table: 'live_stream_definitions',
        keys: ['id'],
        map(row) {
            return {
                id: row.id,
                channel_id: row.channel_id || null,
                owner_user_id: row.owner_user_id || row.user_id || null,
                title: row.title || null,
                ingest_kind: row.ingest_kind || row.ingestKind || null,
                metadata_json: row.metadata || row.payload || {},
                legacy_source: row.source || (row.legacy_ref && row.legacy_ref.source) || null,
                legacy_id: (row.legacy_ref && row.legacy_ref.legacy_id) || row.legacy_id || null,
            };
        },
    },
    {
        dataset: 'chat/messages',
        table: 'chat_messages',
        keys: ['id'],
        map(row) {
            return {
                id: row.id,
                room: row.room || null,
                sender_id: row.sender_id || null,
                body: row.body || row.message || null,
                sent_at: row.sent_at || row.sentAt || row.created_at || null,
                metadata_json: row.metadata || {},
                legacy_source: row.legacy_source || null,
                legacy_id: row.legacy_id || null,
            };
        },
    },
    {
        dataset: 'chat/moderation-bans',
        table: 'chat_moderation_actions',
        keys: ['id'],
        map(row) {
            return {
                id: row.id,
                room: row.scope_ref || row.scope_type || 'global',
                actor_id: row.banned_by_user_id || null,
                target_id: row.target_user_id || (row.target_anon_id ? `anon:${row.target_anon_id}` : null),
                action: 'ban',
                reason: row.reason || null,
                created_at: row.created_at || null,
            };
        },
    },
    {
        dataset: 'community/pastes',
        table: 'community_pastes',
        keys: ['id'],
        map(row) {
            return {
                id: row.id,
                owner_id: row.owner_id || row.user_id || null,
                title: row.title || null,
                body: row.body || null,
                visibility: row.visibility || null,
                metadata_json: row.metadata || {},
                legacy_source: row.legacy_source || null,
                legacy_id: row.legacy_id || null,
            };
        },
    },
    {
        dataset: 'community/paste_likes',
        table: 'community_paste_likes',
        keys: ['paste_id', 'user_id'],
        map(row, referenceMaps) {
            const payload = row.payload || {};
            const source = row.source || (row.legacy_ref && row.legacy_ref.source) || 'hobostreamer';
            return {
                paste_id: canonicalPasteId(source, payload.paste_id),
                user_id: canonicalUserId(referenceMaps, source, payload.user_id),
                created_at: payload.created_at || null,
            };
        },
    },
    {
        dataset: 'community/paste_comments',
        table: 'community_paste_comments',
        keys: ['id'],
        map(row, referenceMaps) {
            const payload = row.payload || {};
            const source = row.source || (row.legacy_ref && row.legacy_ref.source) || 'hobostreamer';
            return {
                id: row.id,
                paste_id: canonicalPasteId(source, payload.paste_id),
                user_id: canonicalUserId(referenceMaps, source, payload.user_id),
                body: payload.body || payload.message || null,
                created_at: payload.created_at || null,
            };
        },
    },
    {
        dataset: 'community/comments',
        table: 'community_comments',
        keys: ['id'],
        map(row) {
            return {
                id: row.id,
                target_kind: row.ref_type || row.target_kind || null,
                target_id: row.ref_id || row.target_id || null,
                user_id: row.author_user_id || row.user_id || null,
                body: row.body || null,
                metadata_json: {
                    source: row.source || null,
                    parent_comment_id: row.parent_comment_id || null,
                    is_deleted: !!row.is_deleted,
                    updated_at: row.updated_at || null,
                    legacy_ref: row.legacy_ref || null,
                },
                created_at: row.created_at || null,
            };
        },
    },
    {
        dataset: 'media/objects',
        table: 'media_objects',
        keys: ['id'],
        map(row) {
            return {
                id: row.id,
                namespace: row.namespace || 'uncategorized',
                media_type: row.media_type || row.mediaType || null,
                owner_id: row.owner_id || row.ownerId || null,
                storage_key: row.storage_key || row.storageKey || null,
                size_bytes: row.size_bytes || row.sizeBytes || null,
                sha256: row.sha256 || null,
                status: row.status || null,
                tier: row.tier || null,
                metadata_json: row.metadata || {},
                legacy_source: row.legacy_source || null,
                legacy_id: row.legacy_id || null,
            };
        },
    },
    {
        dataset: 'games/world-state',
        table: 'game_world_state',
        keys: ['key'],
        map(row) {
            return {
                key: row.key,
                value: row.value == null ? null : String(row.value),
                value_type: row.type || 'json',
                updated_at: row.updated_at || null,
            };
        },
    },
    {
        dataset: 'games/players',
        table: 'game_players',
        keys: ['user_id'],
        map(row) {
            return {
                user_id: row.user_id,
                display_name: row.display_name || null,
                avatar_url: row.avatar_url || null,
                class_name: row.class_name || 'wanderer',
                world_id: row.world_id || 'main',
                zone: row.zone || 'outpost',
                x: row.x == null ? 4096 : row.x,
                y: row.y == null ? 4096 : row.y,
                coins: row.coins || 0,
                loyalty_points: row.loyalty_points || 0,
                mining_xp: row.mining_xp || 0,
                fishing_xp: row.fishing_xp || 0,
                woodcut_xp: row.woodcut_xp || 0,
                farming_xp: row.farming_xp || 0,
                combat_xp: row.combat_xp || 0,
                crafting_xp: row.crafting_xp || 0,
                smithing_xp: row.smithing_xp || 0,
                agility_xp: row.agility_xp || 0,
                hp: row.hp || 100,
                max_hp: row.max_hp || 100,
                stamina: row.stamina || 100,
                max_stamina: row.max_stamina || 100,
                equip_pickaxe: row.equip_pickaxe || null,
                equip_rod: row.equip_rod || null,
                equip_axe: row.equip_axe || null,
                equip_hat: row.equip_hat || '',
                equip_weapon: row.equip_weapon || '',
                equip_armor: row.equip_armor || '',
                metadata_json: row.metadata || {},
                created_at: row.created_at || null,
                updated_at: row.updated_at || null,
            };
        },
    },
    {
        dataset: 'games/inventory',
        table: 'game_inventory',
        keys: ['user_id', 'item_id'],
        map(row) {
            return {
                user_id: row.user_id,
                item_id: row.item_id,
                quantity: row.quantity || 0,
                metadata_json: row.metadata || {},
                updated_at: row.updated_at || null,
            };
        },
    },
    {
        dataset: 'games/bank',
        table: 'game_bank',
        keys: ['user_id', 'item_id'],
        map(row) {
            return {
                user_id: row.user_id,
                item_id: row.item_id,
                quantity: row.quantity || 0,
                metadata_json: row.metadata || {},
                updated_at: row.updated_at || null,
            };
        },
    },
    {
        dataset: 'games/structures',
        table: 'game_structures',
        keys: ['id'],
        map(row) {
            return {
                id: row.id,
                structure_type: row.type,
                world_id: row.world_id || 'main',
                x: row.x,
                y: row.y,
                owner_user_id: row.owner_user_id || null,
                data_json: row.data || {},
                metadata_json: row.metadata || {},
                created_at: row.created_at || null,
                updated_at: row.updated_at || null,
                legacy_source: row.source || null,
                legacy_id: row.legacy_ref && row.legacy_ref.legacy_id || null,
            };
        },
    },
    {
        dataset: 'games/farm-plots',
        table: 'game_farm_plots',
        keys: ['id'],
        map(row) {
            return {
                id: row.id,
                user_id: row.user_id,
                plot_index: row.plot_index || 0,
                seed_id: row.seed_id || null,
                stage: row.stage || 'empty',
                planted_at: row.planted_at || null,
                watered_at: row.watered_at || null,
                ready_at: row.ready_at || null,
                metadata_json: row.metadata || {},
                updated_at: row.updated_at || null,
            };
        },
    },
    {
        dataset: 'games/recipes',
        table: 'game_recipes',
        keys: ['user_id', 'recipe_id'],
        map(row) {
            return {
                user_id: row.user_id,
                recipe_id: row.recipe_id,
                metadata_json: row.metadata || {},
                unlocked_at: row.unlocked_at || null,
            };
        },
    },
    {
        dataset: 'games/effects',
        table: 'game_effects',
        keys: ['id'],
        map(row) {
            return {
                id: row.id,
                user_id: row.user_id,
                effect_type: row.effect_type || 'legacy-effect',
                effect_id: row.effect_id || null,
                expires_at: row.expires_at || null,
                charges: row.charges == null ? null : row.charges,
                data_json: row.data || {},
                metadata_json: row.metadata || {},
                created_at: row.created_at || null,
                updated_at: row.updated_at || null,
            };
        },
    },
    {
        dataset: 'games/battle-stats',
        table: 'game_battle_stats',
        keys: ['user_id'],
        map(row) {
            return {
                user_id: row.user_id,
                battles_won: row.battles_won || 0,
                battles_lost: row.battles_lost || 0,
                total_stolen: row.total_stolen || 0,
                total_lost: row.total_lost || 0,
                kill_streak: row.kill_streak || 0,
                best_streak: row.best_streak || 0,
                fatalities: row.fatalities || 0,
                kills: row.kills || 0,
                deaths: row.deaths || 0,
                metadata_json: row.metadata || {},
                updated_at: row.updated_at || null,
            };
        },
    },
    {
        dataset: 'games/dungeon-runs',
        table: 'game_dungeon_runs',
        keys: ['id'],
        map(row) {
            return {
                id: row.id,
                user_id: row.user_id,
                dungeon_id: row.dungeon_id || 'legacy-dungeon',
                floor_reached: row.floor_reached || 1,
                status: row.status || 'active',
                party_json: row.party || [],
                metadata_json: row.metadata || {},
                started_at: row.started_at || null,
                ended_at: row.ended_at || null,
            };
        },
    },
    {
        dataset: 'games/leaderboards',
        table: 'game_leaderboard',
        keys: ['id'],
        map(row) {
            return {
                id: row.id,
                board: row.board || 'legacy',
                rank: row.rank || 0,
                user_id: row.user_id || null,
                username: row.username || null,
                value: row.value || 0,
                metadata_json: row.metadata || {},
                updated_at: row.updated_at || null,
            };
        },
    },
    {
        dataset: 'games/fish-collection',
        table: 'game_fish_collection',
        keys: ['user_id', 'fish_id'],
        map(row) {
            return {
                user_id: row.user_id,
                fish_id: row.fish_id,
                count: row.count || 0,
                best_weight: row.best_weight || 0,
                metadata_json: row.metadata || {},
                first_caught: row.first_caught || null,
            };
        },
    },
    {
        dataset: 'games/daily-quests',
        table: 'game_daily_quests',
        keys: ['user_id', 'quest_date', 'quest_id'],
        map(row) {
            return {
                user_id: row.user_id,
                quest_date: row.quest_date,
                quest_id: row.quest_id,
                title: row.title || null,
                description: row.description || null,
                progress: row.progress || 0,
                goal: row.goal || 1,
                reward_json: row.reward || {},
                claimed_at: row.claimed_at || null,
                updated_at: row.updated_at || null,
            };
        },
    },
    {
        dataset: 'games/achievements',
        table: 'game_achievements',
        keys: ['user_id', 'achievement_id'],
        map(row) {
            return {
                user_id: row.user_id,
                achievement_id: row.achievement_id,
                title: row.title || null,
                description: row.description || null,
                metadata_json: row.metadata || {},
                unlocked_at: row.unlocked_at || null,
            };
        },
    },
    {
        dataset: 'games/cosmetics',
        table: 'game_cosmetics',
        keys: ['user_id', 'slot', 'item_id'],
        map(row) {
            return {
                user_id: row.user_id,
                slot: row.slot,
                item_id: row.item_id,
                equipped: !!row.equipped,
                source_name: row.source || 'import',
                metadata_json: row.metadata || {},
                acquired_at: row.acquired_at || null,
                updated_at: row.updated_at || null,
            };
        },
    },
    {
        dataset: 'games/tags',
        table: 'game_tags',
        keys: ['user_id', 'tag_id'],
        map(row) {
            return {
                user_id: row.user_id,
                tag_id: row.tag_id,
                source_name: row.source || 'import',
                metadata_json: row.metadata || {},
                granted_at: row.granted_at || null,
            };
        },
    },
    {
        dataset: 'games/equipped-tags',
        table: 'game_equipped_tags',
        keys: ['user_id'],
        map(row) {
            return {
                user_id: row.user_id,
                tag_id: row.tag_id,
                updated_at: row.updated_at || null,
            };
        },
    },
    {
        dataset: 'games/tag-guardian-defeats',
        table: 'game_tag_guardian_defeats',
        keys: ['user_id'],
        map(row) {
            return {
                user_id: row.user_id,
                defeated_at: row.defeated_at || null,
            };
        },
    },
    {
        dataset: 'games/canvas-settings',
        table: 'canvas_settings',
        keys: ['key'],
        map(row) {
            return {
                key: row.key,
                value: row.value == null ? null : String(row.value),
                setting_type: row.type || 'json',
                updated_at: row.updated_at || null,
            };
        },
    },
    {
        dataset: 'games/canvas-tiles',
        table: 'canvas_tiles',
        keys: ['x', 'y'],
        map(row) {
            return {
                x: row.x,
                y: row.y,
                color_index: row.color_index || 0,
                user_id: row.user_id || null,
                username: row.username || null,
                ip_address: row.ip_address || null,
                metadata_json: row.metadata || {},
                updated_at: row.updated_at || null,
            };
        },
    },
    {
        dataset: 'games/canvas-actions',
        table: 'canvas_actions',
        keys: ['id'],
        map(row) {
            return {
                id: row.id,
                action_type: row.action_type || 'place',
                x: row.x == null ? null : row.x,
                y: row.y == null ? null : row.y,
                prev_color_index: row.prev_color_index == null ? null : row.prev_color_index,
                color_index: row.color_index == null ? null : row.color_index,
                user_id: row.user_id || null,
                username: row.username || null,
                ip_address: row.ip_address || null,
                metadata_json: row.metadata || {},
                created_at: row.created_at || null,
            };
        },
    },
    {
        dataset: 'games/canvas-snapshots',
        table: 'canvas_snapshots',
        keys: ['id'],
        map(row) {
            return {
                id: row.id,
                name: row.name || 'snapshot',
                board_data_json: row.board_data || null,
                created_by_user_id: row.created_by_user_id || null,
                metadata_json: row.metadata || {},
                created_at: row.created_at || null,
            };
        },
    },
    {
        dataset: 'games/canvas-region-locks',
        table: 'canvas_region_locks',
        keys: ['id'],
        map(row) {
            return {
                id: row.id,
                label: row.label || '',
                mode: row.mode || 'locked',
                x1: row.x1,
                y1: row.y1,
                x2: row.x2,
                y2: row.y2,
                reason: row.reason || '',
                created_by_user_id: row.created_by_user_id || null,
                metadata_json: row.metadata || {},
                created_at: row.created_at || null,
            };
        },
    },
    {
        dataset: 'games/canvas-bans',
        table: 'canvas_bans',
        keys: ['id'],
        map(row) {
            return {
                id: row.id,
                user_id: row.user_id || null,
                ip_address: row.ip_address || null,
                action_type: row.action_type || 'ban',
                reason: row.reason || '',
                expires_at: row.expires_at || null,
                created_by_user_id: row.created_by_user_id || null,
                metadata_json: row.metadata || {},
                created_at: row.created_at || null,
            };
        },
    },
    {
        dataset: 'games/canvas-user-overrides',
        table: 'canvas_user_overrides',
        keys: ['user_id'],
        map(row) {
            return {
                user_id: row.user_id,
                cooldown_seconds: row.cooldown_seconds == null ? null : row.cooldown_seconds,
                placements_per_minute: row.placements_per_minute == null ? null : row.placements_per_minute,
                bypass_read_only: !!row.bypass_read_only,
                note: row.note || '',
                updated_by_user_id: row.updated_by_user_id || null,
                metadata_json: row.metadata || {},
                updated_at: row.updated_at || null,
            };
        },
    },
    {
        dataset: 'billing/subscriptions',
        table: 'billing_subscriptions',
        keys: ['id'],
        map(row) {
            return {
                id: row.id,
                subscriber_id: row.subscriber_user_id || null,
                creator_id: row.creator_user_id || null,
                plan: row.tier == null ? null : String(row.tier),
                status: row.is_active ? 'active' : 'inactive',
                amount_cents: row.amount_cents == null ? null : row.amount_cents,
                currency: row.currency || null,
                started_at: row.started_at || null,
                ended_at: row.expires_at || row.ended_at || null,
                metadata_json: {
                    legacy_ref: row.legacy_ref || null,
                    source: row.source || null,
                },
                legacy_source: row.source || (row.legacy_ref && row.legacy_ref.source) || null,
                legacy_id: (row.legacy_ref && row.legacy_ref.legacy_id) || null,
            };
        },
    },
    {
        dataset: 'loyalty/accounts',
        table: 'loyalty_accounts',
        keys: ['user_id'],
        map(row) {
            return {
                user_id: row.user_id || row.userId,
                coins_balance: row.coins_balance || row.coinsBalance || 0,
                nickels_balance: row.nickels_balance || row.nickelsBalance || 0,
                metadata_json: row.metadata || {},
            };
        },
    },
    {
        dataset: 'loyalty/transactions',
        table: 'loyalty_transactions',
        keys: ['id'],
        map(row) {
            return {
                id: row.id,
                user_id: row.user_id || null,
                kind: row.kind || row.tx_kind || null,
                amount: row.amount || 0,
                reason: row.reason || null,
                created_at: row.created_at || null,
                legacy_source: row.legacy_source || null,
                legacy_id: row.legacy_id || null,
            };
        },
    },
    // Canonical importer emits granular loyalty datasets keyed off the legacy
    // Hobo Coins/Nickels tables. They are imported as non-cash progression.
    {
        dataset: 'loyalty/coin-transactions',
        table: 'loyalty_transactions',
        keys: ['id'],
        map(row) {
            const payload = row.payload || {};
            return {
                id: row.id,
                user_id: row.user_id || null,
                kind: payload.kind || payload.tx_kind || 'coin',
                amount: payload.amount || payload.delta || 0,
                reason: payload.reason || payload.note || null,
                created_at: payload.created_at || null,
                legacy_source: row.source || (row.legacy_ref && row.legacy_ref.source) || null,
                legacy_id: (row.legacy_ref && row.legacy_ref.legacy_id) || null,
            };
        },
    },
    {
        dataset: 'loyalty/coin-rewards',
        table: 'loyalty_rewards',
        keys: ['id'],
        map(row) {
            const payload = row.payload || {};
            return {
                id: row.id,
                user_id: row.user_id || null,
                reward_kind: payload.reward_kind || payload.kind || 'coin-reward',
                metadata_json: payload || {},
                created_at: payload.created_at || null,
            };
        },
    },
    {
        dataset: 'loyalty/coin-redemptions',
        table: 'loyalty_redemptions',
        keys: ['id'],
        map(row) {
            const payload = row.payload || {};
            return {
                id: row.id,
                user_id: row.user_id || null,
                reward_id: payload.reward_id || null,
                status: payload.status || 'redeemed',
                metadata_json: payload || {},
                created_at: payload.created_at || null,
            };
        },
    },
    {
        dataset: 'loyalty/watch-time',
        table: 'loyalty_watch_time',
        keys: ['user_id', 'stream_id'],
        map(row) {
            const payload = row.payload || {};
            return {
                user_id: row.user_id || payload.user_id || null,
                stream_id: payload.stream_id || payload.streamId || row.id,
                seconds: payload.seconds || payload.watch_seconds || 0,
                captured_at: payload.captured_at || payload.created_at || null,
            };
        },
    },
];

function bundleFile(bundleDir, dataset) {
    return path.join(bundleDir, `${dataset}.ndjson`);
}

function isJsonLikeColumn(columnName) {
    return /_json$/i.test(columnName)
        || columnName === 'redirect_uris'
        || columnName === 'scopes'
        || columnName === 'board_data_json'
        || columnName === 'party_json'
        || columnName === 'reward_json';
}

function normalizeJsonLikeValue(value) {
    if (value == null) return null;
    if (typeof value === 'object') {
        return JSON.stringify(value);
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return JSON.stringify(value);
        try {
            JSON.parse(trimmed);
            return value;
        } catch {
            return JSON.stringify(value);
        }
    }
    return JSON.stringify(value);
}

function normalizeColumnValue(columnName, value) {
    if (!isJsonLikeColumn(columnName)) {
        return value;
    }
    return normalizeJsonLikeValue(value);
}

function summarizeRecordForError(record) {
    try {
        const json = JSON.stringify(record);
        return json.length > 1000 ? `${json.slice(0, 997)}...` : json;
    } catch {
        return '[unserializable record]';
    }
}

function legacyLookupKey(source, legacyId) {
    return `${String(source || '').trim().toLowerCase()}:${String(legacyId)}`;
}

async function buildReferenceMaps(bundleDir) {
    const usersByLegacy = new Map();

    await forEachNdjson(bundleFile(bundleDir, 'identity/users'), async (row) => {
        if (!row || !row.id) return;

        const legacyRefs = Array.isArray(row.legacy_refs) ? row.legacy_refs : [];
        for (const legacyRef of legacyRefs) {
            if (!legacyRef || !legacyRef.source || legacyRef.legacy_id == null) continue;
            usersByLegacy.set(legacyLookupKey(legacyRef.source, legacyRef.legacy_id), String(row.id));
        }

        const sourceProfiles = row.source_profiles && typeof row.source_profiles === 'object'
            ? row.source_profiles
            : {};
        for (const [sourceName, profile] of Object.entries(sourceProfiles)) {
            if (profile && profile.legacy_id != null) {
                usersByLegacy.set(legacyLookupKey(sourceName, profile.legacy_id), String(row.id));
            }
            if (profile && profile.legacy_source && profile.legacy_user_id != null) {
                usersByLegacy.set(legacyLookupKey(profile.legacy_source, profile.legacy_user_id), String(row.id));
            }
        }
    });

    return { usersByLegacy };
}

function canonicalUserId(referenceMaps, source, legacyUserId) {
    if (legacyUserId == null || legacyUserId === '') return null;
    const sourceName = String(source || 'hobostreamer').trim().toLowerCase();
    const exact = referenceMaps.usersByLegacy.get(legacyLookupKey(sourceName, legacyUserId));
    if (exact) return exact;
    const hobotools = referenceMaps.usersByLegacy.get(legacyLookupKey('hobotools', legacyUserId));
    if (hobotools) return hobotools;
    if (String(legacyUserId).includes(':')) return String(legacyUserId);
    return buildEntityId('user', sourceName, legacyUserId);
}

function canonicalPasteId(source, legacyPasteId) {
    if (legacyPasteId == null || legacyPasteId === '') return null;
    if (String(legacyPasteId).includes(':')) return String(legacyPasteId);
    return buildEntityId('paste', source || 'hobostreamer', legacyPasteId);
}

async function loadBundle({ client, bundleDir, runId, dryRun = false, only = null, batchSize = 500 }) {
    const referenceMaps = await buildReferenceMaps(bundleDir);
    const report = {
        generated_at: new Date().toISOString(),
        bundle_dir: bundleDir,
        run_id: runId,
        dry_run: !!dryRun,
        datasets: {},
        hobo_bucks_excluded: true,
        loyalty_imported_as_progression: true,
        manual_actions: [],
    };

    if (!dryRun) {
        await client.query(
            `INSERT INTO migration_runs (run_id, bundle_dir, mode, status)
             VALUES ($1, $2, $3, 'running')
             ON CONFLICT (run_id) DO UPDATE SET status = 'running', started_at = now()`,
            [runId, bundleDir, 'postgres'],
        );
    }

    for (const plan of DATASET_PLAN) {
        if (only && only !== plan.dataset) continue;
        const file = bundleFile(bundleDir, plan.dataset);
        if (!fs.existsSync(file)) {
            report.datasets[plan.dataset] = { file, status: 'missing', count: 0 };
            continue;
        }
        let count = 0;
        let batch = [];
        const flush = async () => {
            if (!batch.length) return;
            if (!dryRun) {
                const cols = Object.keys(batch[0]);
                const flatVals = [];
                for (const mapped of batch) {
                    for (const columnName of cols) {
                        flatVals.push(normalizeColumnValue(columnName, mapped[columnName]));
                    }
                }
                const batchSql = buildBatchUpsert(plan.table, cols, plan.keys, batch.length);
                try {
                    await client.query(batchSql, flatVals);
                } catch {
                    for (const mapped of batch) {
                        const vals = cols.map((c) => normalizeColumnValue(c, mapped[c]));
                        const sql = buildUpsert(plan.table, cols, plan.keys);
                        try {
                            await client.query(sql, vals);
                        } catch (error) {
                            const recordId = mapped.id || plan.keys.map((key) => mapped[key]).filter(Boolean).join(',') || 'unknown-record';
                            const wrapped = new Error(
                                `Failed loading dataset '${plan.dataset}' into '${plan.table}' for record '${recordId}': ${error.message}. Record=${summarizeRecordForError(mapped)}`,
                            );
                            wrapped.cause = error;
                            throw wrapped;
                        }
                    }
                }
            }
            count += batch.length;
            batch = [];
        };
        await forEachNdjson(file, async (row) => {
            batch.push(plan.map(row, referenceMaps));
            if (batch.length >= batchSize) await flush();
        });
        await flush();
        report.datasets[plan.dataset] = { file, status: dryRun ? 'planned' : 'loaded', count };
    }

    if (!dryRun) {
        await client.query(
            `UPDATE migration_runs SET finished_at = now(), status = 'completed',
                summary_json = $2 WHERE run_id = $1`,
            [runId, JSON.stringify(report)],
        );
    }

    return report;
}

async function applySchema({ client }) {
    return applySchemaDirectory(client, SCHEMA_DIR);
}

async function loadBundleWithUrl({ databaseUrl, client, bundleDir, runId, dryRun, only, batchSize, applyMigrations }) {
    return withClient({ databaseUrl, client }, async (c) => {
        if (applyMigrations) await applySchema({ client: c });
        return loadBundle({ client: c, bundleDir, runId, dryRun, only, batchSize });
    });
}

module.exports = {
    DATASET_PLAN,
    SCHEMA_DIR,
    applySchema,
    loadBundle,
    loadBundleWithUrl,
};
