-- Preserve fractional battle-stat totals present in migrated HoboQuest data.
-- SQLite tolerated these values even when the legacy schema declared INTEGER,
-- so widen the Postgres runtime columns to REAL before replaying staging data.

ALTER TABLE game_battle_stats
    ALTER COLUMN total_stolen TYPE REAL
    USING total_stolen::REAL;

ALTER TABLE game_battle_stats
    ALTER COLUMN total_lost TYPE REAL
    USING total_lost::REAL;
