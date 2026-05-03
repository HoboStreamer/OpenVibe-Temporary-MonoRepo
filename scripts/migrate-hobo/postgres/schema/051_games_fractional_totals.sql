-- Preserve fractional battle-stat totals present in migrated HoboQuest data.
-- Earlier versions of the canonical Postgres migration schema used BIGINT
-- here, but the runtime services and legacy SQLite stores both allow floats.

SET search_path TO openvibe, public;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'openvibe'
            AND table_name = 'game_battle_stats'
            AND column_name = 'total_stolen'
            AND data_type <> 'real'
    ) THEN
        ALTER TABLE game_battle_stats
            ALTER COLUMN total_stolen TYPE REAL
            USING total_stolen::REAL;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'openvibe'
            AND table_name = 'game_battle_stats'
            AND column_name = 'total_lost'
            AND data_type <> 'real'
    ) THEN
        ALTER TABLE game_battle_stats
            ALTER COLUMN total_lost TYPE REAL
            USING total_lost::REAL;
    END IF;
END $$;