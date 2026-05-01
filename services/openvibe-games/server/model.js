'use strict';

const crypto = require('crypto');
const db = require('./db');

const BOARD_WIDTH = parseInt(process.env.OPENVIBE_GAMES_CANVAS_WIDTH, 10) || 128;
const BOARD_HEIGHT = parseInt(process.env.OPENVIBE_GAMES_CANVAS_HEIGHT, 10) || 128;
const DEFAULT_TILE_COOLDOWN_SECONDS = parseInt(process.env.OPENVIBE_GAMES_CANVAS_TILE_COOLDOWN_SECONDS, 10) || 15;
const DEFAULT_PLACEMENTS_PER_MINUTE = parseInt(process.env.OPENVIBE_GAMES_CANVAS_PLACEMENTS_PER_MINUTE, 10) || 8;

const DEFAULT_PALETTE = Object.freeze([
    '#101418', '#232a31', '#3a4651', '#57697a', '#7f95a6', '#d6dde3', '#ffffff', '#ffd9b3',
    '#ffbf7f', '#ff9a57', '#ff6d3a', '#e13f2b', '#8b1e24', '#5a1120', '#3b1f15', '#6d3a1d',
    '#9b5d27', '#d18c3e', '#f0c85a', '#fff38f', '#a7d948', '#58b64c', '#2f7f4c', '#16594d',
    '#15324b', '#215b88', '#2f90d8', '#72c8ff', '#7d6ee7', '#b27cff', '#ff74c8', '#ff9fda',
]);

const DEFAULT_DAILY_QUESTS = Object.freeze([
    {
        quest_id: 'canvas-placements',
        title: 'Canvas Explorer',
        description: 'Place 5 pixels on the shared community canvas.',
        goal: 5,
        reward: { coins: 25, loyalty_points: 10 },
    },
    {
        quest_id: 'stockpile-items',
        title: 'Pack Rat',
        description: 'Add 10 items to your adventure inventory.',
        goal: 10,
        reward: { coins: 40, loyalty_points: 20 },
    },
    {
        quest_id: 'bank-trip',
        title: 'Safe Storage',
        description: 'Make 1 deposit into the bank vault.',
        goal: 1,
        reward: { coins: 20, loyalty_points: 5 },
    },
]);

const LEADERBOARD_FIELDS = Object.freeze({
    coins: 'coins',
    mining: 'mining_xp',
    fishing: 'fishing_xp',
    woodcut: 'woodcut_xp',
    farming: 'farming_xp',
    combat: 'combat_xp',
    crafting: 'crafting_xp',
    smithing: 'smithing_xp',
    agility: 'agility_xp',
    total_level: 'total_level',
});

function getDb() {
    return db.get();
}

function uid(prefix) {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function safeParse(value, fallback) {
    if (value == null || value === '') return fallback;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function json(value, fallback) {
    return JSON.stringify(value == null ? fallback : value);
}

function toInt(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toFloat(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function normalizeTimestamp(value) {
    if (!value) return null;
    if (value instanceof Date) {
        return Number.isFinite(value.getTime()) ? value.toISOString() : null;
    }
    const raw = String(value);
    const normalized = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
    const stamp = Date.parse(normalized);
    return Number.isFinite(stamp) ? new Date(stamp).toISOString() : null;
}

function nowIso() {
    return new Date().toISOString();
}

function isoMinutesAgo(minutes) {
    const amount = Number(minutes) || 0;
    return new Date(Date.now() - (amount * 60 * 1000)).toISOString();
}

function todayKey() {
    return nowIso().slice(0, 10);
}

function levelFromXp(xp) {
    const value = Math.max(0, Number(xp) || 0);
    return Math.max(1, Math.floor(Math.sqrt(value / 125)) + 1);
}

function hydratePlayer(row) {
    if (!row) return null;
    const levels = {
        mining: levelFromXp(row.mining_xp),
        fishing: levelFromXp(row.fishing_xp),
        woodcut: levelFromXp(row.woodcut_xp),
        farming: levelFromXp(row.farming_xp),
        combat: levelFromXp(row.combat_xp),
        crafting: levelFromXp(row.crafting_xp),
        smithing: levelFromXp(row.smithing_xp),
        agility: levelFromXp(row.agility_xp),
    };
    const totalLevel = Object.values(levels).reduce((sum, value) => sum + value, 0);
    return {
        user_id: String(row.user_id),
        display_name: row.display_name || `Player ${row.user_id}`,
        avatar_url: row.avatar_url || null,
        class_name: row.class_name,
        world_id: row.world_id,
        zone: row.zone,
        x: Number(row.x),
        y: Number(row.y),
        coins: Number(row.coins || 0),
        loyalty_points: Number(row.loyalty_points || 0),
        mining_xp: Number(row.mining_xp || 0),
        fishing_xp: Number(row.fishing_xp || 0),
        woodcut_xp: Number(row.woodcut_xp || 0),
        farming_xp: Number(row.farming_xp || 0),
        combat_xp: Number(row.combat_xp || 0),
        crafting_xp: Number(row.crafting_xp || 0),
        smithing_xp: Number(row.smithing_xp || 0),
        agility_xp: Number(row.agility_xp || 0),
        hp: Number(row.hp || 100),
        max_hp: Number(row.max_hp || 100),
        stamina: Number(row.stamina || 100),
        max_stamina: Number(row.max_stamina || 100),
        equip_pickaxe: row.equip_pickaxe || null,
        equip_rod: row.equip_rod || null,
        equip_axe: row.equip_axe || null,
        equip_hat: row.equip_hat || '',
        equip_weapon: row.equip_weapon || '',
        equip_armor: row.equip_armor || '',
        levels,
        total_level: totalLevel,
        metadata: safeParse(row.metadata_json, {}),
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

function hydrateItem(row) {
    return {
        user_id: String(row.user_id),
        item_id: String(row.item_id),
        quantity: Number(row.quantity || 0),
        metadata: safeParse(row.metadata_json, {}),
        updated_at: row.updated_at,
    };
}

function hydrateStructure(row) {
    return {
        id: String(row.id),
        type: row.type,
        world_id: row.world_id,
        x: Number(row.x),
        y: Number(row.y),
        owner_id: row.owner_id || null,
        data: safeParse(row.data_json, {}),
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

function hydrateFarmPlot(row) {
    return {
        id: String(row.id),
        user_id: String(row.user_id),
        plot_index: Number(row.plot_index),
        seed_id: row.seed_id || null,
        stage: row.stage,
        planted_at: row.planted_at || null,
        watered_at: row.watered_at || null,
        ready_at: row.ready_at || null,
        metadata: safeParse(row.metadata_json, {}),
        updated_at: row.updated_at,
    };
}

function hydrateAchievement(row) {
    return {
        user_id: String(row.user_id),
        achievement_id: String(row.achievement_id),
        title: row.title || row.achievement_id,
        description: row.description || null,
        metadata: safeParse(row.metadata_json, {}),
        unlocked_at: row.unlocked_at,
    };
}

function hydrateCosmetic(row) {
    return {
        user_id: String(row.user_id),
        slot: row.slot,
        item_id: row.item_id,
        equipped: !!row.equipped,
        source: row.source,
        metadata: safeParse(row.metadata_json, {}),
        acquired_at: row.acquired_at,
        updated_at: row.updated_at,
    };
}

function hydrateDailyQuest(row) {
    return {
        user_id: String(row.user_id),
        quest_date: row.quest_date,
        quest_id: row.quest_id,
        title: row.title,
        description: row.description || null,
        progress: Number(row.progress || 0),
        goal: Number(row.goal || 1),
        reward: safeParse(row.reward_json, {}),
        claimed_at: row.claimed_at || null,
        updated_at: row.updated_at,
    };
}

function hydrateCanvasTile(row) {
    return {
        x: Number(row.x),
        y: Number(row.y),
        color_index: Number(row.color_index || 0),
        user_id: row.user_id || null,
        username: row.username || null,
        updated_at: row.updated_at,
    };
}

function hydrateCanvasAction(row) {
    return {
        id: Number(row.id),
        action_type: row.action_type,
        x: row.x == null ? null : Number(row.x),
        y: row.y == null ? null : Number(row.y),
        prev_color_index: row.prev_color_index == null ? null : Number(row.prev_color_index),
        color_index: row.color_index == null ? null : Number(row.color_index),
        user_id: row.user_id || null,
        username: row.username || null,
        ip_address: row.ip_address || null,
        meta: safeParse(row.meta_json, {}),
        created_at: row.created_at,
    };
}

function hydrateCanvasRegion(row) {
    return {
        id: Number(row.id),
        label: row.label || '',
        mode: row.mode || 'locked',
        x1: Number(row.x1),
        y1: Number(row.y1),
        x2: Number(row.x2),
        y2: Number(row.y2),
        reason: row.reason || '',
        created_by: row.created_by || null,
        created_at: row.created_at,
    };
}

function hydrateCanvasBan(row) {
    return {
        id: Number(row.id),
        user_id: row.user_id || null,
        ip_address: row.ip_address || null,
        action_type: row.action_type || 'ban',
        reason: row.reason || '',
        expires_at: row.expires_at || null,
        created_by: row.created_by || null,
        created_at: row.created_at,
    };
}

function ensureCanvasSettings() {
    const defaults = [
        ['board_width', BOARD_WIDTH, 'number'],
        ['board_height', BOARD_HEIGHT, 'number'],
        ['palette', DEFAULT_PALETTE, 'json'],
        ['frozen', false, 'boolean'],
        ['read_only', false, 'boolean'],
        ['tile_cooldown_seconds', DEFAULT_TILE_COOLDOWN_SECONDS, 'number'],
        ['placements_per_minute', DEFAULT_PLACEMENTS_PER_MINUTE, 'number'],
    ];
    const stmt = getDb().prepare('INSERT INTO canvas_settings (key, value, type, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING');
    for (const [key, value, type] of defaults) {
        stmt.run(key, type === 'json' ? JSON.stringify(value) : String(value), type);
    }
}

function parseSetting(row) {
    if (!row) return null;
    if (row.type === 'number') return Number(row.value);
    if (row.type === 'boolean') return row.value === 'true';
    if (row.type === 'json') return safeParse(row.value, null);
    return row.value;
}

function getCanvasSettings() {
    ensureCanvasSettings();
    const rows = getDb().prepare('SELECT * FROM canvas_settings ORDER BY key').all();
    const settings = {};
    for (const row of rows) settings[row.key] = parseSetting(row);
    return {
        board_width: Number(settings.board_width || BOARD_WIDTH),
        board_height: Number(settings.board_height || BOARD_HEIGHT),
        palette: Array.isArray(settings.palette) ? settings.palette : DEFAULT_PALETTE,
        frozen: !!settings.frozen,
        read_only: !!settings.read_only,
        tile_cooldown_seconds: Number(settings.tile_cooldown_seconds || DEFAULT_TILE_COOLDOWN_SECONDS),
        placements_per_minute: Number(settings.placements_per_minute || DEFAULT_PLACEMENTS_PER_MINUTE),
    };
}

function getPlayer(userId) {
    if (!userId) return null;
    const row = getDb().prepare('SELECT * FROM game_players WHERE user_id = ?').get(String(userId));
    return hydratePlayer(row);
}

function upsertPlayer(input) {
    if (!input || !input.user_id) throw new Error('user_id required');
    const userId = String(input.user_id);
    const previous = getPlayer(userId);
    const next = {
        user_id: userId,
        display_name: input.display_name || (previous && previous.display_name) || `Player ${userId}`,
        avatar_url: Object.prototype.hasOwnProperty.call(input, 'avatar_url') ? (input.avatar_url || null) : (previous ? previous.avatar_url : null),
        class_name: input.class_name || (previous && previous.class_name) || 'wanderer',
        world_id: input.world_id || (previous && previous.world_id) || 'main',
        zone: input.zone || (previous && previous.zone) || 'outpost',
        x: toFloat(input.x, previous ? previous.x : 4096),
        y: toFloat(input.y, previous ? previous.y : 4096),
        coins: toInt(input.coins, previous ? previous.coins : 0),
        loyalty_points: toInt(input.loyalty_points, previous ? previous.loyalty_points : 0),
        mining_xp: toInt(input.mining_xp, previous ? previous.mining_xp : 0),
        fishing_xp: toInt(input.fishing_xp, previous ? previous.fishing_xp : 0),
        woodcut_xp: toInt(input.woodcut_xp, previous ? previous.woodcut_xp : 0),
        farming_xp: toInt(input.farming_xp, previous ? previous.farming_xp : 0),
        combat_xp: toInt(input.combat_xp, previous ? previous.combat_xp : 0),
        crafting_xp: toInt(input.crafting_xp, previous ? previous.crafting_xp : 0),
        smithing_xp: toInt(input.smithing_xp, previous ? previous.smithing_xp : 0),
        agility_xp: toInt(input.agility_xp, previous ? previous.agility_xp : 0),
        hp: toInt(input.hp, previous ? previous.hp : 100),
        max_hp: toInt(input.max_hp, previous ? previous.max_hp : 100),
        stamina: toInt(input.stamina, previous ? previous.stamina : 100),
        max_stamina: toInt(input.max_stamina, previous ? previous.max_stamina : 100),
        equip_pickaxe: Object.prototype.hasOwnProperty.call(input, 'equip_pickaxe') ? (input.equip_pickaxe || null) : (previous ? previous.equip_pickaxe : null),
        equip_rod: Object.prototype.hasOwnProperty.call(input, 'equip_rod') ? (input.equip_rod || null) : (previous ? previous.equip_rod : null),
        equip_axe: Object.prototype.hasOwnProperty.call(input, 'equip_axe') ? (input.equip_axe || null) : (previous ? previous.equip_axe : null),
        equip_hat: Object.prototype.hasOwnProperty.call(input, 'equip_hat') ? (input.equip_hat || '') : (previous ? previous.equip_hat : ''),
        equip_weapon: Object.prototype.hasOwnProperty.call(input, 'equip_weapon') ? (input.equip_weapon || '') : (previous ? previous.equip_weapon : ''),
        equip_armor: Object.prototype.hasOwnProperty.call(input, 'equip_armor') ? (input.equip_armor || '') : (previous ? previous.equip_armor : ''),
        metadata: Object.assign({}, previous ? previous.metadata : {}, input.metadata || {}),
    };

    getDb().prepare(`
        INSERT INTO game_players (
            user_id, display_name, avatar_url, class_name, world_id, zone, x, y, coins, loyalty_points,
            mining_xp, fishing_xp, woodcut_xp, farming_xp, combat_xp, crafting_xp, smithing_xp, agility_xp,
            hp, max_hp, stamina, max_stamina, equip_pickaxe, equip_rod, equip_axe, equip_hat, equip_weapon, equip_armor,
            metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
            display_name = excluded.display_name,
            avatar_url = excluded.avatar_url,
            class_name = excluded.class_name,
            world_id = excluded.world_id,
            zone = excluded.zone,
            x = excluded.x,
            y = excluded.y,
            coins = excluded.coins,
            loyalty_points = excluded.loyalty_points,
            mining_xp = excluded.mining_xp,
            fishing_xp = excluded.fishing_xp,
            woodcut_xp = excluded.woodcut_xp,
            farming_xp = excluded.farming_xp,
            combat_xp = excluded.combat_xp,
            crafting_xp = excluded.crafting_xp,
            smithing_xp = excluded.smithing_xp,
            agility_xp = excluded.agility_xp,
            hp = excluded.hp,
            max_hp = excluded.max_hp,
            stamina = excluded.stamina,
            max_stamina = excluded.max_stamina,
            equip_pickaxe = excluded.equip_pickaxe,
            equip_rod = excluded.equip_rod,
            equip_axe = excluded.equip_axe,
            equip_hat = excluded.equip_hat,
            equip_weapon = excluded.equip_weapon,
            equip_armor = excluded.equip_armor,
            metadata_json = excluded.metadata_json,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        next.user_id,
        next.display_name,
        next.avatar_url,
        next.class_name,
        next.world_id,
        next.zone,
        next.x,
        next.y,
        next.coins,
        next.loyalty_points,
        next.mining_xp,
        next.fishing_xp,
        next.woodcut_xp,
        next.farming_xp,
        next.combat_xp,
        next.crafting_xp,
        next.smithing_xp,
        next.agility_xp,
        next.hp,
        next.max_hp,
        next.stamina,
        next.max_stamina,
        next.equip_pickaxe,
        next.equip_rod,
        next.equip_axe,
        next.equip_hat,
        next.equip_weapon,
        next.equip_armor,
        json(next.metadata, {})
    );

    return getPlayer(userId);
}

function ensurePlayer(userId, displayName) {
    return getPlayer(userId) || upsertPlayer({ user_id: userId, display_name: displayName || `Player ${userId}` });
}

function listPlayers(limit) {
    const rows = getDb().prepare('SELECT * FROM game_players ORDER BY updated_at DESC LIMIT ?').all(toInt(limit, 500));
    return rows.map(hydratePlayer);
}

function leaderboardValue(type, player) {
    const key = LEADERBOARD_FIELDS[type] || LEADERBOARD_FIELDS.total_level;
    if (key === 'total_level') return Number(player.total_level || 0);
    return Number(player[key] || 0);
}

function listLeaderboard(type, limit) {
    const board = LEADERBOARD_FIELDS[type] ? type : 'total_level';
    return listPlayers(2000)
        .map((player) => ({
            user_id: player.user_id,
            display_name: player.display_name,
            value: leaderboardValue(board, player),
            total_level: player.total_level,
            levels: player.levels,
        }))
        .sort((a, b) => b.value - a.value || a.display_name.localeCompare(b.display_name))
        .slice(0, toInt(limit, 20))
        .map((item, index) => Object.assign({ rank: index + 1, board }, item));
}

function ensureInventoryTable(table) {
    if (table !== 'game_inventory' && table !== 'game_bank') throw new Error(`Unsupported item table: ${table}`);
}

function listItems(table, userId) {
    ensureInventoryTable(table);
    return getDb().prepare(`SELECT * FROM ${table} WHERE user_id = ? AND quantity > 0 ORDER BY updated_at DESC, item_id ASC`).all(String(userId)).map(hydrateItem);
}

function adjustItem(table, userId, itemId, delta, metadata) {
    ensureInventoryTable(table);
    ensurePlayer(userId);
    const current = getDb().prepare(`SELECT * FROM ${table} WHERE user_id = ? AND item_id = ?`).get(String(userId), String(itemId));
    const nextQuantity = Number(current ? current.quantity : 0) + toInt(delta, 0);
    if (nextQuantity < 0) throw new Error('insufficient quantity');
    if (nextQuantity === 0) {
        getDb().prepare(`DELETE FROM ${table} WHERE user_id = ? AND item_id = ?`).run(String(userId), String(itemId));
        return null;
    }
    const mergedMetadata = Object.assign({}, current ? safeParse(current.metadata_json, {}) : {}, metadata || {});
    getDb().prepare(`
        INSERT INTO ${table} (user_id, item_id, quantity, metadata_json, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, item_id) DO UPDATE SET
            quantity = excluded.quantity,
            metadata_json = excluded.metadata_json,
            updated_at = CURRENT_TIMESTAMP
    `).run(String(userId), String(itemId), nextQuantity, json(mergedMetadata, {}));
    return getDb().prepare(`SELECT * FROM ${table} WHERE user_id = ? AND item_id = ?`).get(String(userId), String(itemId));
}

function addInventoryItem({ user_id, item_id, quantity, metadata }) {
    if (!item_id) throw new Error('item_id required');
    const qty = toInt(quantity, 1);
    adjustItem('game_inventory', String(user_id), String(item_id), qty, metadata || {});
    if (qty > 0) incrementDailyQuestProgress(String(user_id), 'stockpile-items', qty);
    return listInventory(String(user_id));
}

function listInventory(userId) {
    return listItems('game_inventory', userId);
}

function listBank(userId) {
    return listItems('game_bank', userId);
}

function bankDeposit(userId, itemId, quantity) {
    const qty = Math.max(1, toInt(quantity, 1));
    const tx = getDb().transaction(() => {
        adjustItem('game_inventory', userId, itemId, -qty, {});
        adjustItem('game_bank', userId, itemId, qty, {});
    });
    tx();
    incrementDailyQuestProgress(String(userId), 'bank-trip', 1);
    return { inventory: listInventory(userId), bank: listBank(userId) };
}

function bankWithdraw(userId, itemId, quantity) {
    const qty = Math.max(1, toInt(quantity, 1));
    const tx = getDb().transaction(() => {
        adjustItem('game_bank', userId, itemId, -qty, {});
        adjustItem('game_inventory', userId, itemId, qty, {});
    });
    tx();
    return { inventory: listInventory(userId), bank: listBank(userId) };
}

function listStructures(filters) {
    const f = filters || {};
    const rows = getDb().prepare(`
        SELECT * FROM game_structures
        WHERE (? IS NULL OR world_id = ?)
          AND (? IS NULL OR owner_id = ?)
        ORDER BY created_at DESC
        LIMIT ?
    `).all(f.world_id || null, f.world_id || null, f.owner_id || null, f.owner_id || null, toInt(f.limit, 100));
    return rows.map(hydrateStructure);
}

function createStructure(input) {
    if (!input || !input.type) throw new Error('type required');
    const id = uid('structure');
    getDb().prepare(`
        INSERT INTO game_structures (id, type, world_id, x, y, owner_id, data_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
        id,
        String(input.type),
        input.world_id || 'main',
        toFloat(input.x, 0),
        toFloat(input.y, 0),
        input.owner_id != null ? String(input.owner_id) : null,
        json(input.data || {}, {})
    );
    return getDb().prepare('SELECT * FROM game_structures WHERE id = ?').get(id);
}

function ensureFarmPlots(userId) {
    ensurePlayer(userId);
    const count = getDb().prepare('SELECT COUNT(*) AS c FROM game_farm_plots WHERE user_id = ?').get(String(userId)).c;
    if (count >= 6) return;
    const stmt = getDb().prepare(`
        INSERT INTO game_farm_plots (id, user_id, plot_index, stage, metadata_json, updated_at)
        VALUES (?, ?, ?, 'empty', '{}', CURRENT_TIMESTAMP)
    `);
    for (let index = count; index < 6; index += 1) {
        try {
            stmt.run(uid('plot'), String(userId), index);
        } catch {
            // UNIQUE(user_id, plot_index) makes repeated ensure safe.
        }
    }
}

function listFarmPlots(userId) {
    ensureFarmPlots(userId);
    return getDb().prepare('SELECT * FROM game_farm_plots WHERE user_id = ? ORDER BY plot_index ASC').all(String(userId)).map(hydrateFarmPlot);
}

function upsertFarmPlot(input) {
    if (!input || input.user_id == null) throw new Error('user_id required');
    const userId = String(input.user_id);
    ensureFarmPlots(userId);
    const existing = getDb().prepare('SELECT * FROM game_farm_plots WHERE user_id = ? AND plot_index = ?').get(userId, toInt(input.plot_index, 0));
    const id = existing ? existing.id : uid('plot');
    const metadata = Object.assign({}, existing ? safeParse(existing.metadata_json, {}) : {}, input.metadata || {});
    getDb().prepare(`
        INSERT INTO game_farm_plots (id, user_id, plot_index, seed_id, stage, planted_at, watered_at, ready_at, metadata_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, plot_index) DO UPDATE SET
            seed_id = excluded.seed_id,
            stage = excluded.stage,
            planted_at = excluded.planted_at,
            watered_at = excluded.watered_at,
            ready_at = excluded.ready_at,
            metadata_json = excluded.metadata_json,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        id,
        userId,
        toInt(input.plot_index, 0),
        input.seed_id || null,
        input.stage || (existing ? existing.stage : 'planted'),
        input.planted_at || (existing ? existing.planted_at : nowIso()),
        input.watered_at || (existing ? existing.watered_at : null),
        input.ready_at || (existing ? existing.ready_at : null),
        json(metadata, {})
    );
    return getDb().prepare('SELECT * FROM game_farm_plots WHERE user_id = ? AND plot_index = ?').get(userId, toInt(input.plot_index, 0));
}

function listAchievements(userId) {
    return getDb().prepare('SELECT * FROM game_achievements WHERE user_id = ? ORDER BY unlocked_at DESC').all(String(userId)).map(hydrateAchievement);
}

function unlockAchievement(input) {
    if (!input || input.user_id == null || !input.achievement_id) throw new Error('user_id and achievement_id required');
    ensurePlayer(String(input.user_id));
    getDb().prepare(`
        INSERT INTO game_achievements (user_id, achievement_id, title, description, metadata_json, unlocked_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, achievement_id) DO UPDATE SET
            title = excluded.title,
            description = excluded.description,
            metadata_json = excluded.metadata_json
    `).run(
        String(input.user_id),
        String(input.achievement_id),
        input.title || String(input.achievement_id),
        input.description || null,
        json(input.metadata || {}, {})
    );
    return getDb().prepare('SELECT * FROM game_achievements WHERE user_id = ? AND achievement_id = ?').get(String(input.user_id), String(input.achievement_id));
}

function listCosmetics(userId) {
    return getDb().prepare('SELECT * FROM game_cosmetics WHERE user_id = ? ORDER BY slot ASC, acquired_at DESC').all(String(userId)).map(hydrateCosmetic);
}

function upsertCosmetic(input) {
    if (!input || input.user_id == null || !input.slot || !input.item_id) throw new Error('user_id, slot, and item_id required');
    const userId = String(input.user_id);
    ensurePlayer(userId);
    const tx = getDb().transaction(() => {
        if (input.equipped) {
            getDb().prepare('UPDATE game_cosmetics SET equipped = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND slot = ?').run(userId, String(input.slot));
        }
        getDb().prepare(`
            INSERT INTO game_cosmetics (user_id, slot, item_id, equipped, source, metadata_json, acquired_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, slot, item_id) DO UPDATE SET
                equipped = excluded.equipped,
                source = excluded.source,
                metadata_json = excluded.metadata_json,
                updated_at = CURRENT_TIMESTAMP
        `).run(
            userId,
            String(input.slot),
            String(input.item_id),
            input.equipped ? 1 : 0,
            input.source || 'import',
            json(input.metadata || {}, {})
        );
    });
    tx();
    return getDb().prepare('SELECT * FROM game_cosmetics WHERE user_id = ? AND slot = ? AND item_id = ?').get(userId, String(input.slot), String(input.item_id));
}

function ensureDailyQuests(userId) {
    ensurePlayer(userId);
    const questDate = todayKey();
    const stmt = getDb().prepare(`
        INSERT INTO game_daily_quests (user_id, quest_date, quest_id, title, description, progress, goal, reward_json, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, quest_date, quest_id) DO NOTHING
    `);
    for (const quest of DEFAULT_DAILY_QUESTS) {
        stmt.run(String(userId), questDate, quest.quest_id, quest.title, quest.description, quest.goal, json(quest.reward, {}));
    }
}

function listDailyQuests(userId) {
    ensureDailyQuests(String(userId));
    return getDb().prepare('SELECT * FROM game_daily_quests WHERE user_id = ? AND quest_date = ? ORDER BY quest_id ASC').all(String(userId), todayKey()).map(hydrateDailyQuest);
}

function incrementDailyQuestProgress(userId, questId, delta) {
    if (!userId || !questId || !delta) return null;
    ensureDailyQuests(String(userId));
    getDb().prepare(`
        UPDATE game_daily_quests
        SET progress = MIN(goal, progress + ?), updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND quest_date = ? AND quest_id = ?
    `).run(Math.max(0, toInt(delta, 0)), String(userId), todayKey(), String(questId));
    return getDb().prepare('SELECT * FROM game_daily_quests WHERE user_id = ? AND quest_date = ? AND quest_id = ?').get(String(userId), todayKey(), String(questId));
}

function claimDailyQuest(userId, questId) {
    ensureDailyQuests(String(userId));
    const row = getDb().prepare('SELECT * FROM game_daily_quests WHERE user_id = ? AND quest_date = ? AND quest_id = ?').get(String(userId), todayKey(), String(questId));
    if (!row) throw new Error('quest not found');
    if (row.claimed_at) throw new Error('quest already claimed');
    if (Number(row.progress || 0) < Number(row.goal || 1)) throw new Error('quest not complete');
    const reward = safeParse(row.reward_json, {});
    const tx = getDb().transaction(() => {
        getDb().prepare('UPDATE game_daily_quests SET claimed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND quest_date = ? AND quest_id = ?').run(String(userId), todayKey(), String(questId));
        const player = ensurePlayer(String(userId));
        upsertPlayer({
            user_id: String(userId),
            coins: player.coins + toInt(reward.coins, 0),
            loyalty_points: player.loyalty_points + toInt(reward.loyalty_points, 0),
        });
    });
    tx();
    return {
        quest: hydrateDailyQuest(getDb().prepare('SELECT * FROM game_daily_quests WHERE user_id = ? AND quest_date = ? AND quest_id = ?').get(String(userId), todayKey(), String(questId))),
        player: getPlayer(String(userId)),
    };
}

function listCanvasTiles() {
    ensureCanvasSettings();
    return getDb().prepare('SELECT * FROM canvas_tiles ORDER BY y ASC, x ASC').all().map(hydrateCanvasTile);
}

function listCanvasActions(limit) {
    ensureCanvasSettings();
    return getDb().prepare('SELECT * FROM canvas_actions ORDER BY created_at DESC, id DESC LIMIT ?').all(toInt(limit, 60)).map(hydrateCanvasAction);
}

function listCanvasRegions() {
    ensureCanvasSettings();
    return getDb().prepare('SELECT * FROM canvas_region_locks ORDER BY created_at DESC, id DESC').all().map(hydrateCanvasRegion);
}

function listCanvasBans() {
    ensureCanvasSettings();
    return getDb().prepare('SELECT * FROM canvas_bans ORDER BY created_at DESC, id DESC').all().map(hydrateCanvasBan);
}

function getCanvasOverride(userId) {
    if (!userId) return null;
    return getDb().prepare('SELECT * FROM canvas_user_overrides WHERE user_id = ?').get(String(userId));
}

function buildCanvasActorFilter(actor, ipAddress) {
    const userId = actor && actor.type === 'user' && actor.id ? String(actor.id) : null;
    const ip = ipAddress ? String(ipAddress) : null;
    if (userId && ip) {
        return {
            clause: '(user_id = ? OR ip_address = ?)',
            params: [userId, ip],
        };
    }
    if (userId) {
        return {
            clause: 'user_id = ?',
            params: [userId],
        };
    }
    if (ip) {
        return {
            clause: 'ip_address = ?',
            params: [ip],
        };
    }
    return {
        clause: null,
        params: [],
    };
}

function getCanvasCooldown(actor, ipAddress) {
    const settings = getCanvasSettings();
    const userId = actor && actor.type === 'user' ? String(actor.id) : null;
    const override = getCanvasOverride(userId);
    const cooldownSeconds = override && override.cooldown_seconds != null
        ? Number(override.cooldown_seconds)
        : Number(settings.tile_cooldown_seconds || DEFAULT_TILE_COOLDOWN_SECONDS);
    const placementsPerMinute = override && override.placements_per_minute != null
        ? Number(override.placements_per_minute)
        : Number(settings.placements_per_minute || DEFAULT_PLACEMENTS_PER_MINUTE);
    const actorFilter = buildCanvasActorFilter(actor, ipAddress);
    const recentCutoff = isoMinutesAgo(1);
    const lastPlacement = actorFilter.clause
        ? getDb().prepare(`
            SELECT created_at FROM canvas_actions
            WHERE action_type = 'place'
              AND ${actorFilter.clause}
            ORDER BY created_at DESC, id DESC
            LIMIT 1
        `).get(...actorFilter.params)
        : null;
    const placementsLastMinute = actorFilter.clause
        ? getDb().prepare(`
            SELECT COUNT(*) AS c FROM canvas_actions
            WHERE action_type = 'place'
              AND created_at > ?
              AND ${actorFilter.clause}
        `).get(recentCutoff, ...actorFilter.params).c
        : 0;
    const lastPlacementAt = normalizeTimestamp(lastPlacement && lastPlacement.created_at);
    const nextPlacementAt = lastPlacementAt
        ? new Date(new Date(lastPlacementAt).getTime() + (cooldownSeconds * 1000)).toISOString()
        : null;
    return {
        cooldown_seconds: cooldownSeconds,
        placements_per_minute: placementsPerMinute,
        last_placement_at: lastPlacementAt,
        next_placement_at: nextPlacementAt,
        remaining_ms: nextPlacementAt ? Math.max(0, new Date(nextPlacementAt).getTime() - Date.now()) : 0,
        placements_last_minute: Number(placementsLastMinute || 0),
    };
}

function canvasBanFor(actor, ipAddress) {
    const actorFilter = buildCanvasActorFilter(actor, ipAddress);
    if (!actorFilter.clause) return null;
    return getDb().prepare(`
        SELECT * FROM canvas_bans
        WHERE ${actorFilter.clause}
          AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
        ORDER BY created_at DESC, id DESC
        LIMIT 1
    `).get(...actorFilter.params);
}

function regionForTile(x, y) {
    return listCanvasRegions().find((region) => (
        x >= Math.min(region.x1, region.x2) &&
        x <= Math.max(region.x1, region.x2) &&
        y >= Math.min(region.y1, region.y2) &&
        y <= Math.max(region.y1, region.y2)
    )) || null;
}

function recordCanvasAction(actionType, payload) {
    getDb().prepare(`
        INSERT INTO canvas_actions (action_type, x, y, prev_color_index, color_index, user_id, username, ip_address, meta_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
        String(actionType),
        payload.x == null ? null : Number(payload.x),
        payload.y == null ? null : Number(payload.y),
        payload.prev_color_index == null ? null : Number(payload.prev_color_index),
        payload.color_index == null ? null : Number(payload.color_index),
        payload.user_id || null,
        payload.username || null,
        payload.ip_address || null,
        json(payload.meta || {}, {})
    );
}

function getCanvasState(actor, ipAddress) {
    const settings = getCanvasSettings();
    return {
        board: {
            width: settings.board_width,
            height: settings.board_height,
            palette: settings.palette,
        },
        settings: {
            frozen: settings.frozen,
            read_only: settings.read_only,
            tile_cooldown_seconds: settings.tile_cooldown_seconds,
            placements_per_minute: settings.placements_per_minute,
        },
        tiles: listCanvasTiles(),
        recent_actions: listCanvasActions(80),
        regions: listCanvasRegions(),
        cooldown: getCanvasCooldown(actor, ipAddress),
    };
}

function placeCanvasTile(input) {
    const actor = input.actor || { type: 'anonymous', id: null, username: 'anon' };
    const ipAddress = input.ip_address || null;
    const x = toInt(input.x, NaN);
    const y = toInt(input.y, NaN);
    const colorIndex = toInt(input.color_index, NaN);
    const settings = getCanvasSettings();
    const palette = settings.palette;

    if (!Number.isInteger(x) || x < 0 || x >= settings.board_width) throw Object.assign(new Error('tile x out of bounds'), { status: 400 });
    if (!Number.isInteger(y) || y < 0 || y >= settings.board_height) throw Object.assign(new Error('tile y out of bounds'), { status: 400 });
    if (!Number.isInteger(colorIndex) || colorIndex < 0 || colorIndex >= palette.length) throw Object.assign(new Error('invalid color index'), { status: 400 });

    const ban = canvasBanFor(actor, ipAddress);
    if (ban) throw Object.assign(new Error(ban.reason || 'You are blocked from placing on the canvas.'), { status: 403 });
    if (settings.read_only || settings.frozen) throw Object.assign(new Error('The canvas is currently read-only.'), { status: 403 });
    const region = regionForTile(x, y);
    if (region) throw Object.assign(new Error(region.reason || 'That canvas region is locked.'), { status: 403 });

    const cooldown = getCanvasCooldown(actor, ipAddress);
    if (cooldown.remaining_ms > 0) {
        throw Object.assign(new Error('You are on cooldown before your next placement.'), { status: 429, remaining_ms: cooldown.remaining_ms });
    }
    if (cooldown.placements_last_minute >= cooldown.placements_per_minute) {
        throw Object.assign(new Error('You have reached your placement rate limit for this minute.'), { status: 429 });
    }

    const existing = getDb().prepare('SELECT * FROM canvas_tiles WHERE x = ? AND y = ?').get(x, y);
    if (existing && Number(existing.color_index) === colorIndex) {
        throw Object.assign(new Error('That tile already has this color.'), { status: 400 });
    }

    const username = actor.username || (actor.type === 'user' ? `user:${actor.id}` : 'anon');
    getDb().prepare(`
        INSERT INTO canvas_tiles (x, y, color_index, user_id, username, ip_address, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(x, y) DO UPDATE SET
            color_index = excluded.color_index,
            user_id = excluded.user_id,
            username = excluded.username,
            ip_address = excluded.ip_address,
            updated_at = CURRENT_TIMESTAMP
    `).run(x, y, colorIndex, actor.type === 'user' ? String(actor.id) : null, username, ipAddress);

    recordCanvasAction('place', {
        x,
        y,
        prev_color_index: existing ? Number(existing.color_index || 0) : 0,
        color_index: colorIndex,
        user_id: actor.type === 'user' ? String(actor.id) : null,
        username,
        ip_address: ipAddress,
        meta: { actor_type: actor.type },
    });

    if (actor.type === 'user' && actor.id) incrementDailyQuestProgress(String(actor.id), 'canvas-placements', 1);

    return {
        tile: hydrateCanvasTile(getDb().prepare('SELECT * FROM canvas_tiles WHERE x = ? AND y = ?').get(x, y)),
        cooldown: getCanvasCooldown(actor, ipAddress),
    };
}

function createCanvasRegion(input) {
    const result = getDb().prepare(`
        INSERT INTO canvas_region_locks (label, mode, x1, y1, x2, y2, reason, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
        input.label || '',
        input.mode || 'locked',
        toInt(input.x1, 0),
        toInt(input.y1, 0),
        toInt(input.x2, 0),
        toInt(input.y2, 0),
        input.reason || '',
        input.created_by || null
    );
    return getDb().prepare('SELECT * FROM canvas_region_locks WHERE id = ?').get(result.lastInsertRowid);
}

function removeCanvasRegion(id) {
    getDb().prepare('DELETE FROM canvas_region_locks WHERE id = ?').run(toInt(id, 0));
}

function createCanvasBan(input) {
    const result = getDb().prepare(`
        INSERT INTO canvas_bans (user_id, ip_address, action_type, reason, expires_at, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
        input.user_id || null,
        input.ip_address || null,
        input.action_type || 'ban',
        input.reason || '',
        input.expires_at || null,
        input.created_by || null
    );
    return getDb().prepare('SELECT * FROM canvas_bans WHERE id = ?').get(result.lastInsertRowid);
}

function removeCanvasBan(id) {
    getDb().prepare('DELETE FROM canvas_bans WHERE id = ?').run(toInt(id, 0));
}

function recordLegacyMap({ source, kind, legacy_id, new_id }) {
    getDb().prepare(`
        INSERT INTO game_legacy_map (source, kind, legacy_id, new_id, created_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(source, kind, legacy_id) DO UPDATE SET new_id = excluded.new_id
    `).run(String(source), String(kind), String(legacy_id), String(new_id));
    return lookupLegacy(source, kind, legacy_id);
}

function lookupLegacy(source, kind, legacyId) {
    return getDb().prepare('SELECT * FROM game_legacy_map WHERE source = ? AND kind = ? AND legacy_id = ?').get(String(source), String(kind), String(legacyId)) || null;
}

function summarizeProduct() {
    const count = (table) => {
        const row = getDb().prepare(`SELECT COUNT(*) AS c FROM ${table}`).get();
        return Number(row && row.c || 0);
    };
    const canvas = getCanvasSettings();
    return {
        ok: true,
        product: 'games',
        players: {
            count: count('game_players'),
            active_recent: Number((getDb().prepare(`SELECT COUNT(*) AS c FROM game_players WHERE updated_at > ?`).get(isoMinutesAgo(30)) || {}).c || 0),
        },
        inventory_items: count('game_inventory'),
        bank_items: count('game_bank'),
        structures: count('game_structures'),
        farm_plots: count('game_farm_plots'),
        achievements: count('game_achievements'),
        cosmetics: count('game_cosmetics'),
        worlds: count('game_worlds'),
        world_snapshots: count('game_world_snapshots'),
        mods: count('game_mods'),
        runtime_entities: count('game_runtime_entities'),
        resources_seeded: count('game_resource_nodes'),
        canvas: {
            width: canvas.board_width,
            height: canvas.board_height,
            placements: count('canvas_actions'),
            locked_regions: count('canvas_region_locks'),
            bans: count('canvas_bans'),
        },
    };
}

module.exports = {
    DEFAULT_PALETTE,
    createCanvasBan,
    createCanvasRegion,
    createStructure,
    claimDailyQuest,
    ensureCanvasSettings,
    ensureDailyQuests,
    ensureFarmPlots,
    ensurePlayer,
    getCanvasSettings,
    getCanvasState,
    getPlayer,
    incrementDailyQuestProgress,
    levelFromXp,
    listAchievements,
    listBank,
    listCanvasActions,
    listCanvasBans,
    listCanvasRegions,
    listCanvasTiles,
    listCosmetics,
    listDailyQuests,
    listFarmPlots,
    listInventory,
    listLeaderboard,
    listPlayers,
    listStructures,
    lookupLegacy,
    placeCanvasTile,
    recordLegacyMap,
    removeCanvasBan,
    removeCanvasRegion,
    bankDeposit,
    bankWithdraw,
    addInventoryItem,
    summarizeProduct,
    unlockAchievement,
    upsertCosmetic,
    upsertFarmPlot,
    upsertPlayer,
};
