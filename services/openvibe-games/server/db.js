'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { warnIfUnsupported } = require('@openvibe/sdk');

let dbInstance = null;
let persistenceDescriptor = null;

function init(dbPath) {
    persistenceDescriptor = warnIfUnsupported('openvibe-games', dbPath);
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
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
    `);

    dbInstance = db;
    return db;
}

function get() {
    if (!dbInstance) throw new Error('games db not initialized — call db.init(path) first');
    return dbInstance;
}

function describePersistence() {
    return persistenceDescriptor || {
        service: 'openvibe-games',
        mode: 'sqlite',
        database_url_configured: false,
    };
}

module.exports = { init, get, describePersistence };
