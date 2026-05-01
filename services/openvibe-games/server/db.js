'use strict';

const path = require('path');
const {
    createLegacyPersistenceRuntime,
    describeBootstrapSource,
    createLegacyPostgresStore,
    createLegacySqliteStore,
} = require('@openvibe/persistence');

const SERVICE_NAME = 'openvibe-games';
const POSTGRES_MIGRATIONS_DIR = path.resolve(__dirname, 'migrations', 'postgres');
const SCHEMA_SQL = `
        CREATE TABLE IF NOT EXISTS game_players (
            user_id TEXT PRIMARY KEY,
            display_name TEXT,
            avatar_url TEXT,
            class_name TEXT NOT NULL DEFAULT 'wanderer',
            world_id TEXT NOT NULL DEFAULT 'main',
            zone TEXT NOT NULL DEFAULT 'outpost',
            x REAL NOT NULL DEFAULT 4096,
            y REAL NOT NULL DEFAULT 4096,
            coins INTEGER NOT NULL DEFAULT 0,
            loyalty_points INTEGER NOT NULL DEFAULT 0,
            mining_xp INTEGER NOT NULL DEFAULT 0,
            fishing_xp INTEGER NOT NULL DEFAULT 0,
            woodcut_xp INTEGER NOT NULL DEFAULT 0,
            farming_xp INTEGER NOT NULL DEFAULT 0,
            combat_xp INTEGER NOT NULL DEFAULT 0,
            crafting_xp INTEGER NOT NULL DEFAULT 0,
            smithing_xp INTEGER NOT NULL DEFAULT 0,
            agility_xp INTEGER NOT NULL DEFAULT 0,
            hp INTEGER NOT NULL DEFAULT 100,
            max_hp INTEGER NOT NULL DEFAULT 100,
            stamina INTEGER NOT NULL DEFAULT 100,
            max_stamina INTEGER NOT NULL DEFAULT 100,
            equip_pickaxe TEXT,
            equip_rod TEXT,
            equip_axe TEXT,
            equip_hat TEXT NOT NULL DEFAULT '',
            equip_weapon TEXT NOT NULL DEFAULT '',
            equip_armor TEXT NOT NULL DEFAULT '',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_game_players_world ON game_players(world_id, zone);

        CREATE TABLE IF NOT EXISTS game_world_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            value_type TEXT NOT NULL DEFAULT 'json',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS game_inventory (
            user_id TEXT NOT NULL,
            item_id TEXT NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 0,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, item_id)
        );
        CREATE INDEX IF NOT EXISTS idx_game_inventory_user ON game_inventory(user_id, updated_at DESC);

        CREATE TABLE IF NOT EXISTS game_bank (
            user_id TEXT NOT NULL,
            item_id TEXT NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 0,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, item_id)
        );

        CREATE TABLE IF NOT EXISTS game_structures (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            world_id TEXT NOT NULL DEFAULT 'main',
            x REAL NOT NULL,
            y REAL NOT NULL,
            owner_id TEXT,
            data_json TEXT NOT NULL DEFAULT '{}',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_game_structures_world ON game_structures(world_id, x, y);

        CREATE TABLE IF NOT EXISTS game_farm_plots (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            plot_index INTEGER NOT NULL,
            seed_id TEXT,
            stage TEXT NOT NULL DEFAULT 'empty',
            planted_at DATETIME,
            watered_at DATETIME,
            ready_at DATETIME,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (user_id, plot_index)
        );

        CREATE TABLE IF NOT EXISTS game_recipes (
            user_id TEXT NOT NULL,
            recipe_id TEXT NOT NULL,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, recipe_id)
        );

        CREATE TABLE IF NOT EXISTS game_effects (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            effect_type TEXT NOT NULL,
            effect_id TEXT,
            expires_at DATETIME,
            charges INTEGER,
            data_json TEXT NOT NULL DEFAULT '{}',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS game_battle_stats (
            user_id TEXT PRIMARY KEY,
            battles_won INTEGER NOT NULL DEFAULT 0,
            battles_lost INTEGER NOT NULL DEFAULT 0,
            total_stolen INTEGER NOT NULL DEFAULT 0,
            total_lost INTEGER NOT NULL DEFAULT 0,
            kill_streak INTEGER NOT NULL DEFAULT 0,
            best_streak INTEGER NOT NULL DEFAULT 0,
            fatalities INTEGER NOT NULL DEFAULT 0,
            kills INTEGER NOT NULL DEFAULT 0,
            deaths INTEGER NOT NULL DEFAULT 0,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS game_dungeon_runs (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            dungeon_id TEXT NOT NULL,
            floor_reached INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'active',
            party_json TEXT NOT NULL DEFAULT '[]',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            ended_at DATETIME
        );

        CREATE TABLE IF NOT EXISTS game_leaderboard (
            id TEXT PRIMARY KEY,
            board TEXT NOT NULL,
            rank INTEGER NOT NULL DEFAULT 0,
            user_id TEXT,
            username TEXT,
            value INTEGER NOT NULL DEFAULT 0,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_game_leaderboard_board ON game_leaderboard(board, rank ASC, value DESC);

        CREATE TABLE IF NOT EXISTS game_fish_collection (
            user_id TEXT NOT NULL,
            fish_id TEXT NOT NULL,
            count INTEGER NOT NULL DEFAULT 0,
            best_weight REAL NOT NULL DEFAULT 0,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            first_caught DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, fish_id)
        );

        CREATE TABLE IF NOT EXISTS game_daily_quests (
            user_id TEXT NOT NULL,
            quest_date TEXT NOT NULL,
            quest_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            progress INTEGER NOT NULL DEFAULT 0,
            goal INTEGER NOT NULL DEFAULT 1,
            reward_json TEXT NOT NULL DEFAULT '{}',
            claimed_at DATETIME,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, quest_date, quest_id)
        );

        CREATE TABLE IF NOT EXISTS game_achievements (
            user_id TEXT NOT NULL,
            achievement_id TEXT NOT NULL,
            title TEXT,
            description TEXT,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, achievement_id)
        );

        CREATE TABLE IF NOT EXISTS game_cosmetics (
            user_id TEXT NOT NULL,
            slot TEXT NOT NULL,
            item_id TEXT NOT NULL,
            equipped INTEGER NOT NULL DEFAULT 0,
            source TEXT NOT NULL DEFAULT 'import',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            acquired_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, slot, item_id)
        );

        CREATE TABLE IF NOT EXISTS game_tags (
            user_id TEXT NOT NULL,
            tag_id TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'import',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, tag_id)
        );

        CREATE TABLE IF NOT EXISTS game_equipped_tags (
            user_id TEXT PRIMARY KEY,
            tag_id TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS game_tag_guardian_defeats (
            user_id TEXT PRIMARY KEY,
            defeated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS game_legacy_map (
            source TEXT NOT NULL,
            kind TEXT NOT NULL,
            legacy_id TEXT NOT NULL,
            new_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (source, kind, legacy_id)
        );

        CREATE TABLE IF NOT EXISTS canvas_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'json',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS canvas_tiles (
            x INTEGER NOT NULL,
            y INTEGER NOT NULL,
            color_index INTEGER NOT NULL,
            user_id TEXT,
            username TEXT,
            ip_address TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (x, y)
        );

        CREATE TABLE IF NOT EXISTS canvas_actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action_type TEXT NOT NULL,
            x INTEGER,
            y INTEGER,
            prev_color_index INTEGER,
            color_index INTEGER,
            user_id TEXT,
            username TEXT,
            ip_address TEXT,
            meta_json TEXT NOT NULL DEFAULT '{}',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_canvas_actions_created ON canvas_actions(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_canvas_actions_user ON canvas_actions(user_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS canvas_region_locks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            label TEXT DEFAULT '',
            mode TEXT NOT NULL DEFAULT 'locked',
            x1 INTEGER NOT NULL,
            y1 INTEGER NOT NULL,
            x2 INTEGER NOT NULL,
            y2 INTEGER NOT NULL,
            reason TEXT DEFAULT '',
            created_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS canvas_snapshots (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            board_data_json TEXT NOT NULL,
            created_by TEXT,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS canvas_bans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            ip_address TEXT,
            action_type TEXT NOT NULL DEFAULT 'ban',
            reason TEXT DEFAULT '',
            expires_at DATETIME,
            created_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS canvas_user_overrides (
            user_id TEXT PRIMARY KEY,
            cooldown_seconds INTEGER,
            placements_per_minute INTEGER,
            bypass_read_only INTEGER NOT NULL DEFAULT 0,
            note TEXT DEFAULT '',
            updated_by TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Phase 17: 2D World rebirth — authoritative MMO runtime, mod registry,
        -- and asset ledger. Mirrored in
        -- services/openvibe-games/server/migrations/postgres/002_2d_world_runtime.sql.
        CREATE TABLE IF NOT EXISTS game_worlds (
            id TEXT PRIMARY KEY,
            slug TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            owner_id TEXT,
            mode TEXT NOT NULL DEFAULT 'sandbox',
            seed INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'draft',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_game_worlds_owner ON game_worlds(owner_id);

        CREATE TABLE IF NOT EXISTS game_world_zones (
            world_id TEXT NOT NULL,
            zone_id TEXT NOT NULL,
            kind TEXT NOT NULL DEFAULT 'overworld',
            pvp INTEGER NOT NULL DEFAULT 0,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            PRIMARY KEY (world_id, zone_id)
        );

        CREATE TABLE IF NOT EXISTS game_world_snapshots (
            id TEXT PRIMARY KEY,
            world_id TEXT NOT NULL,
            sequence INTEGER NOT NULL DEFAULT 0,
            payload_json TEXT NOT NULL DEFAULT '{}',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_game_world_snapshots_world ON game_world_snapshots(world_id, sequence DESC);

        CREATE TABLE IF NOT EXISTS game_runtime_sessions (
            id TEXT PRIMARY KEY,
            world_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            left_at DATETIME,
            metadata_json TEXT NOT NULL DEFAULT '{}'
        );
        CREATE INDEX IF NOT EXISTS idx_game_runtime_sessions_world ON game_runtime_sessions(world_id);

        CREATE TABLE IF NOT EXISTS game_runtime_entities (
            id TEXT PRIMARY KEY,
            world_id TEXT NOT NULL,
            zone_id TEXT NOT NULL DEFAULT 'outpost',
            kind TEXT NOT NULL,
            template_id TEXT,
            x REAL NOT NULL DEFAULT 0,
            y REAL NOT NULL DEFAULT 0,
            hp INTEGER NOT NULL DEFAULT 0,
            max_hp INTEGER NOT NULL DEFAULT 0,
            owner_id TEXT,
            state_version INTEGER NOT NULL DEFAULT 0,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_game_runtime_entities_world ON game_runtime_entities(world_id, zone_id);

        CREATE TABLE IF NOT EXISTS game_resource_nodes (
            id TEXT PRIMARY KEY,
            world_id TEXT NOT NULL,
            zone_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            x REAL NOT NULL,
            y REAL NOT NULL,
            hp INTEGER NOT NULL DEFAULT 1,
            max_hp INTEGER NOT NULL DEFAULT 1,
            respawn_at DATETIME,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_game_resource_nodes_world ON game_resource_nodes(world_id, zone_id);

        CREATE TABLE IF NOT EXISTS game_item_catalog (
            item_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'misc',
            stackable INTEGER NOT NULL DEFAULT 1,
            max_stack INTEGER NOT NULL DEFAULT 999,
            rarity TEXT NOT NULL DEFAULT 'common',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS game_loot_tables (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            entries_json TEXT NOT NULL DEFAULT '[]',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS game_npc_templates (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            kind TEXT NOT NULL DEFAULT 'mob',
            hp INTEGER NOT NULL DEFAULT 10,
            damage INTEGER NOT NULL DEFAULT 1,
            speed REAL NOT NULL DEFAULT 60,
            aggro_radius REAL NOT NULL DEFAULT 0,
            loot_table_id TEXT,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS game_mods (
            id TEXT PRIMARY KEY,
            slug TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            owner_id TEXT,
            version TEXT NOT NULL DEFAULT '0.0.0',
            status TEXT NOT NULL DEFAULT 'registered',
            trust_level TEXT NOT NULL DEFAULT 'untrusted',
            manifest_json TEXT NOT NULL DEFAULT '{}',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS game_mod_versions (
            id TEXT PRIMARY KEY,
            mod_id TEXT NOT NULL,
            version TEXT NOT NULL,
            manifest_json TEXT NOT NULL DEFAULT '{}',
            validated_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (mod_id, version)
        );

        CREATE TABLE IF NOT EXISTS game_mod_assets (
            id TEXT PRIMARY KEY,
            mod_id TEXT NOT NULL,
            namespace TEXT NOT NULL,
            media_id TEXT,
            asset_path TEXT,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_game_mod_assets_mod ON game_mod_assets(mod_id);

        CREATE TABLE IF NOT EXISTS game_mod_worlds (
            id TEXT PRIMARY KEY,
            mod_id TEXT NOT NULL,
            world_id TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 0,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (mod_id, world_id)
        );

        CREATE TABLE IF NOT EXISTS game_asset_ledger (
            id TEXT PRIMARY KEY,
            slug TEXT UNIQUE NOT NULL,
            source_url TEXT,
            download_url TEXT,
            author TEXT,
            license TEXT NOT NULL,
            license_url TEXT,
            retrieved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            files_json TEXT NOT NULL DEFAULT '[]',
            modifications TEXT,
            notes TEXT
        );
    `;

function defaultSqlitePath() {
    return path.resolve(__dirname, '..', 'data', 'openvibe-games.db');
}

function createSqliteStore(options) {
    const opts = Object.assign({}, options || {});
    return createLegacySqliteStore({
        serviceName: SERVICE_NAME,
        sqlitePath: opts.sqlitePath || defaultSqlitePath(),
        schemaSql: SCHEMA_SQL,
    });
}

function createPostgresStore(options) {
    const opts = Object.assign({}, options || {});
    return createLegacyPostgresStore({
        serviceName: SERVICE_NAME,
        databaseUrl: opts.databaseUrl,
        migrationsDir: opts.migrationsDir || POSTGRES_MIGRATIONS_DIR,
        schemaSql: SCHEMA_SQL,
    });
}

const sqliteStore = createSqliteStore({ sqlitePath: defaultSqlitePath() });
const runtime = createLegacyPersistenceRuntime({
    serviceName: SERVICE_NAME,
    bootstrap: describeBootstrapSource(SERVICE_NAME, { usesLegacyBootstrapSql: true }),
    defaultSqlitePath,
    sqlite: sqliteStore,
    createPostgres({ databaseUrl }) {
        return createPostgresStore({ databaseUrl });
    },
});

module.exports = Object.assign({}, runtime, {
    SERVICE_NAME,
    POSTGRES_MIGRATIONS_DIR,
    SCHEMA_SQL,
    defaultSqlitePath,
    createSqliteStore,
    createPostgresStore,
});
