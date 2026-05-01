-- Widen media byte-count columns to BIGINT so large VODs and storage counters
-- from production migrations fit in Postgres without overflowing INTEGER.

ALTER TABLE media_objects
    ALTER COLUMN size_bytes TYPE BIGINT
    USING size_bytes::BIGINT;

ALTER TABLE media_derivatives
    ALTER COLUMN size_bytes TYPE BIGINT
    USING size_bytes::BIGINT;

ALTER TABLE media_quotas
    ALTER COLUMN max_storage_bytes TYPE BIGINT
    USING max_storage_bytes::BIGINT;
ALTER TABLE media_quotas
    ALTER COLUMN max_upload_bytes TYPE BIGINT
    USING max_upload_bytes::BIGINT;

ALTER TABLE media_usage
    ALTER COLUMN total_bytes TYPE BIGINT
    USING total_bytes::BIGINT;
ALTER TABLE media_usage
    ALTER COLUMN hot_bytes TYPE BIGINT
    USING hot_bytes::BIGINT;
ALTER TABLE media_usage
    ALTER COLUMN warm_bytes TYPE BIGINT
    USING warm_bytes::BIGINT;
ALTER TABLE media_usage
    ALTER COLUMN cold_bytes TYPE BIGINT
    USING cold_bytes::BIGINT;

ALTER TABLE media_object_locations
    ALTER COLUMN size_bytes TYPE BIGINT
    USING size_bytes::BIGINT;

ALTER TABLE media_upload_sessions
    ALTER COLUMN expected_size_bytes TYPE BIGINT
    USING expected_size_bytes::BIGINT;

ALTER TABLE media_upload_parts
    ALTER COLUMN size_bytes TYPE BIGINT
    USING size_bytes::BIGINT;

ALTER TABLE media_access_rollups
    ALTER COLUMN bytes_served_24h TYPE BIGINT
    USING bytes_served_24h::BIGINT;
ALTER TABLE media_access_rollups
    ALTER COLUMN bytes_served_7d TYPE BIGINT
    USING bytes_served_7d::BIGINT;
ALTER TABLE media_access_rollups
    ALTER COLUMN cache_miss_bytes_24h TYPE BIGINT
    USING cache_miss_bytes_24h::BIGINT;
ALTER TABLE media_access_rollups
    ALTER COLUMN cache_miss_bytes_7d TYPE BIGINT
    USING cache_miss_bytes_7d::BIGINT;

ALTER TABLE media_site_heat_rollups
    ALTER COLUMN media_origin_egress_bytes TYPE BIGINT
    USING media_origin_egress_bytes::BIGINT;
ALTER TABLE media_site_heat_rollups
    ALTER COLUMN media_cache_miss_bytes TYPE BIGINT
    USING media_cache_miss_bytes::BIGINT;

ALTER TABLE recording_segments
    ALTER COLUMN size_bytes TYPE BIGINT
    USING size_bytes::BIGINT;

ALTER TABLE vod_parts
    ALTER COLUMN total_bytes TYPE BIGINT
    USING total_bytes::BIGINT;

ALTER TABLE vod_partial_segments
    ALTER COLUMN size_bytes TYPE BIGINT
    USING size_bytes::BIGINT;

ALTER TABLE media_part_access_rollups
    ALTER COLUMN bytes_served_24h TYPE BIGINT
    USING bytes_served_24h::BIGINT;
ALTER TABLE media_part_access_rollups
    ALTER COLUMN cache_miss_bytes_24h TYPE BIGINT
    USING cache_miss_bytes_24h::BIGINT;
