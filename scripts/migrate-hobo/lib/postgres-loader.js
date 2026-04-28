'use strict';

const path = require('path');
const fs = require('fs');

const { forEachNdjson, ensureDir, writeJson } = require('./common');
const { withClient, buildUpsert, applySchemaDirectory } = require('./postgres');

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

async function loadBundle({ client, bundleDir, runId, dryRun = false, only = null, batchSize = 500 }) {
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
                for (const mapped of batch) {
                    const cols = Object.keys(mapped);
                    const vals = cols.map((c) => mapped[c]);
                    const sql = buildUpsert(plan.table, cols, plan.keys);
                    await client.query(sql, vals);
                }
            }
            count += batch.length;
            batch = [];
        };
        await forEachNdjson(file, async (row) => {
            batch.push(plan.map(row));
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
