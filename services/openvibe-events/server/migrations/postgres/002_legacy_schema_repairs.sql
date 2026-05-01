-- Repairs older openvibe-events Postgres installs that were created before the
-- canonical event envelope columns were finalized.

ALTER TABLE events ADD COLUMN IF NOT EXISTS event_id TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS trace_id TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS topic TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE events ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS actor_type TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS actor_id TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS timestamp TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS payload_json TEXT DEFAULT '{}';
ALTER TABLE events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

UPDATE events
SET event_id = COALESCE(event_id, 'evt_legacy_' || id::TEXT),
    trace_id = COALESCE(trace_id, 'trc_legacy_' || id::TEXT),
    topic = COALESCE(topic, 'legacy'),
    event_type = COALESCE(event_type, 'legacy.event'),
    version = COALESCE(version, 1),
    source = COALESCE(source, 'legacy'),
    timestamp = COALESCE(timestamp, created_at::TEXT, CURRENT_TIMESTAMP::TEXT),
    payload_json = COALESCE(payload_json, '{}');

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS subscription_id TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS consumer TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS topic TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS delivery TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS target_url TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS internal_key TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS active INTEGER DEFAULT 1;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

UPDATE subscriptions
SET subscription_id = COALESCE(subscription_id, 'sub_legacy_' || id::TEXT),
    consumer = COALESCE(consumer, 'legacy'),
    topic = COALESCE(topic, 'legacy'),
    delivery = COALESCE(delivery, 'log'),
    active = COALESCE(active, 1);

ALTER TABLE delivery_queue ADD COLUMN IF NOT EXISTS event_id TEXT;
ALTER TABLE delivery_queue ADD COLUMN IF NOT EXISTS subscription_id TEXT;
ALTER TABLE delivery_queue ADD COLUMN IF NOT EXISTS state TEXT DEFAULT 'pending';
ALTER TABLE delivery_queue ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0;
ALTER TABLE delivery_queue ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE delivery_queue ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE delivery_queue ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE delivery_queue ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

UPDATE delivery_queue
SET event_id = COALESCE(event_id, 'evt_legacy_queue_' || id::TEXT),
    subscription_id = COALESCE(subscription_id, 'sub_legacy_queue_' || id::TEXT),
    state = COALESCE(state, 'pending'),
    attempts = COALESCE(attempts, 0),
    next_attempt_at = COALESCE(next_attempt_at, CURRENT_TIMESTAMP);

ALTER TABLE dead_letters ADD COLUMN IF NOT EXISTS event_id TEXT;
ALTER TABLE dead_letters ADD COLUMN IF NOT EXISTS subscription_id TEXT;
ALTER TABLE dead_letters ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0;
ALTER TABLE dead_letters ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE dead_letters ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

UPDATE dead_letters
SET event_id = COALESCE(event_id, 'evt_legacy_dlq_' || id::TEXT),
    subscription_id = COALESCE(subscription_id, 'sub_legacy_dlq_' || id::TEXT),
    attempts = COALESCE(attempts, 0),
    failed_at = COALESCE(failed_at, CURRENT_TIMESTAMP);