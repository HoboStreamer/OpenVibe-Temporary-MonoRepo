-- 050_games.sql — games, progression, cosmetics, tags, and collaborative canvas.

SET search_path TO openvibe, public;

CREATE TABLE IF NOT EXISTS game_world_state (
    key         TEXT PRIMARY KEY,
    value       TEXT,
    value_type  TEXT NOT NULL DEFAULT 'json',
    updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS game_players (
    user_id       TEXT PRIMARY KEY,
    display_name  TEXT,
    avatar_url    TEXT,
    class_name    TEXT NOT NULL DEFAULT 'wanderer',
    world_id      TEXT NOT NULL DEFAULT 'main',
    zone          TEXT NOT NULL DEFAULT 'outpost',
    x             DOUBLE PRECISION NOT NULL DEFAULT 4096,
    y             DOUBLE PRECISION NOT NULL DEFAULT 4096,
    coins         BIGINT NOT NULL DEFAULT 0,
    loyalty_points BIGINT NOT NULL DEFAULT 0,
    mining_xp     BIGINT NOT NULL DEFAULT 0,
    fishing_xp    BIGINT NOT NULL DEFAULT 0,
    woodcut_xp    BIGINT NOT NULL DEFAULT 0,
    farming_xp    BIGINT NOT NULL DEFAULT 0,
    combat_xp     BIGINT NOT NULL DEFAULT 0,
    crafting_xp   BIGINT NOT NULL DEFAULT 0,
    smithing_xp   BIGINT NOT NULL DEFAULT 0,
    agility_xp    BIGINT NOT NULL DEFAULT 0,
    hp            BIGINT NOT NULL DEFAULT 100,
    max_hp        BIGINT NOT NULL DEFAULT 100,
    stamina       BIGINT NOT NULL DEFAULT 100,
    max_stamina   BIGINT NOT NULL DEFAULT 100,
    equip_pickaxe TEXT,
    equip_rod     TEXT,
    equip_axe     TEXT,
    equip_hat     TEXT NOT NULL DEFAULT '',
    equip_weapon  TEXT NOT NULL DEFAULT '',
    equip_armor   TEXT NOT NULL DEFAULT '',
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS game_inventory (
    user_id       TEXT NOT NULL,
    item_id       TEXT NOT NULL,
    quantity      BIGINT NOT NULL DEFAULT 0,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at    TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, item_id)
);

CREATE TABLE IF NOT EXISTS game_bank (
    user_id       TEXT NOT NULL,
    item_id       TEXT NOT NULL,
    quantity      BIGINT NOT NULL DEFAULT 0,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at    TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, item_id)
);

CREATE TABLE IF NOT EXISTS game_structures (
    id            TEXT PRIMARY KEY,
    structure_type TEXT NOT NULL,
    world_id      TEXT NOT NULL DEFAULT 'main',
    x             DOUBLE PRECISION NOT NULL,
    y             DOUBLE PRECISION NOT NULL,
    owner_user_id TEXT,
    data_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    legacy_source TEXT,
    legacy_id     TEXT,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS game_farm_plots (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL,
    plot_index    INTEGER NOT NULL,
    seed_id       TEXT,
    stage         TEXT NOT NULL DEFAULT 'empty',
    planted_at    TIMESTAMPTZ,
    watered_at    TIMESTAMPTZ,
    ready_at      TIMESTAMPTZ,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS game_recipes (
    user_id       TEXT NOT NULL,
    recipe_id     TEXT NOT NULL,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    unlocked_at   TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, recipe_id)
);

CREATE TABLE IF NOT EXISTS game_effects (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL,
    effect_type   TEXT NOT NULL,
    effect_id     TEXT,
    expires_at    TIMESTAMPTZ,
    charges       BIGINT,
    data_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS game_battle_stats (
    user_id       TEXT PRIMARY KEY,
    battles_won   BIGINT NOT NULL DEFAULT 0,
    battles_lost  BIGINT NOT NULL DEFAULT 0,
    total_stolen  REAL NOT NULL DEFAULT 0,
    total_lost    REAL NOT NULL DEFAULT 0,
    kill_streak   BIGINT NOT NULL DEFAULT 0,
    best_streak   BIGINT NOT NULL DEFAULT 0,
    fatalities    BIGINT NOT NULL DEFAULT 0,
    kills         BIGINT NOT NULL DEFAULT 0,
    deaths        BIGINT NOT NULL DEFAULT 0,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS game_dungeon_runs (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL,
    dungeon_id    TEXT NOT NULL,
    floor_reached BIGINT NOT NULL DEFAULT 1,
    status        TEXT NOT NULL DEFAULT 'active',
    party_json    JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at    TIMESTAMPTZ DEFAULT now(),
    ended_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS game_leaderboard (
    id            TEXT PRIMARY KEY,
    board         TEXT NOT NULL,
    rank          BIGINT NOT NULL DEFAULT 0,
    user_id       TEXT,
    username      TEXT,
    value         BIGINT NOT NULL DEFAULT 0,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS game_fish_collection (
    user_id       TEXT NOT NULL,
    fish_id       TEXT NOT NULL,
    count         BIGINT NOT NULL DEFAULT 0,
    best_weight   DOUBLE PRECISION NOT NULL DEFAULT 0,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    first_caught  TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, fish_id)
);

CREATE TABLE IF NOT EXISTS game_daily_quests (
    user_id       TEXT NOT NULL,
    quest_date    TEXT NOT NULL,
    quest_id      TEXT NOT NULL,
    title         TEXT,
    description   TEXT,
    progress      BIGINT NOT NULL DEFAULT 0,
    goal          BIGINT NOT NULL DEFAULT 1,
    reward_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
    claimed_at    TIMESTAMPTZ,
    updated_at    TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, quest_date, quest_id)
);

CREATE TABLE IF NOT EXISTS game_achievements (
    user_id       TEXT NOT NULL,
    achievement_id TEXT NOT NULL,
    title         TEXT,
    description   TEXT,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    unlocked_at   TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS game_cosmetics (
    user_id       TEXT NOT NULL,
    slot          TEXT NOT NULL,
    item_id       TEXT NOT NULL,
    equipped      BOOLEAN NOT NULL DEFAULT false,
    source_name   TEXT NOT NULL DEFAULT 'import',
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    acquired_at   TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, slot, item_id)
);

CREATE TABLE IF NOT EXISTS game_tags (
    user_id       TEXT NOT NULL,
    tag_id        TEXT NOT NULL,
    source_name   TEXT NOT NULL DEFAULT 'import',
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    granted_at    TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, tag_id)
);

CREATE TABLE IF NOT EXISTS game_equipped_tags (
    user_id       TEXT PRIMARY KEY,
    tag_id        TEXT NOT NULL,
    updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS game_tag_guardian_defeats (
    user_id       TEXT PRIMARY KEY,
    defeated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS canvas_settings (
    key           TEXT PRIMARY KEY,
    value         TEXT,
    setting_type  TEXT NOT NULL DEFAULT 'json',
    updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS canvas_tiles (
    x             INTEGER NOT NULL,
    y             INTEGER NOT NULL,
    color_index   INTEGER NOT NULL DEFAULT 0,
    user_id       TEXT,
    username      TEXT,
    ip_address    TEXT,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at    TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (x, y)
);

CREATE TABLE IF NOT EXISTS canvas_actions (
    id               BIGINT PRIMARY KEY,
    action_type      TEXT NOT NULL,
    x                INTEGER,
    y                INTEGER,
    prev_color_index INTEGER,
    color_index      INTEGER,
    user_id          TEXT,
    username         TEXT,
    ip_address       TEXT,
    metadata_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS canvas_snapshots (
    id                 TEXT PRIMARY KEY,
    name               TEXT NOT NULL,
    board_data_json    JSONB,
    created_by_user_id TEXT,
    metadata_json      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS canvas_region_locks (
    id                 BIGINT PRIMARY KEY,
    label              TEXT DEFAULT '',
    mode               TEXT NOT NULL DEFAULT 'locked',
    x1                 INTEGER NOT NULL,
    y1                 INTEGER NOT NULL,
    x2                 INTEGER NOT NULL,
    y2                 INTEGER NOT NULL,
    reason             TEXT DEFAULT '',
    created_by_user_id TEXT,
    metadata_json      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS canvas_bans (
    id                 BIGINT PRIMARY KEY,
    user_id            TEXT,
    ip_address         TEXT,
    action_type        TEXT NOT NULL DEFAULT 'ban',
    reason             TEXT DEFAULT '',
    expires_at         TIMESTAMPTZ,
    created_by_user_id TEXT,
    metadata_json      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS canvas_user_overrides (
    user_id               TEXT PRIMARY KEY,
    cooldown_seconds      BIGINT,
    placements_per_minute BIGINT,
    bypass_read_only      BOOLEAN NOT NULL DEFAULT false,
    note                  TEXT DEFAULT '',
    updated_by_user_id    TEXT,
    metadata_json         JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at            TIMESTAMPTZ DEFAULT now()
);