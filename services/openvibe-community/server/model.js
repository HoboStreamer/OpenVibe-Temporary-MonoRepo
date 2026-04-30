'use strict';

const crypto = require('crypto');
const db = require('./db');

function newId(prefix) { return `${prefix}_${crypto.randomBytes(12).toString('hex')}`; }
function safeJson(s, fb) { try { return JSON.parse(s); } catch { return fb; } }

function slugify(s) {
    return String(s || '').toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || `x-${Date.now()}`;
}

// ── spaces ───────────────────────────────────────────────
function hydrateSpace(r) {
    if (!r) return null;
    return {
        id: r.id, slug: r.slug, name: r.name, description: r.description,
        visibility: r.visibility,
        owner_type: r.owner_type, owner_id: r.owner_id,
        created_by_actor_type: r.created_by_actor_type, created_by_actor_id: r.created_by_actor_id,
        metadata: safeJson(r.metadata_json, {}),
        archived_at: r.archived_at || null,
        created_at: r.created_at, updated_at: r.updated_at,
    };
}
function createSpace(input) {
    const id = input.id || newId('cmty');
    const slug = input.slug ? slugify(input.slug) : slugify(input.name || id);
    db.get().prepare(`
        INSERT INTO community_spaces (id, slug, name, description, visibility, owner_type, owner_id,
            created_by_actor_type, created_by_actor_id, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id, slug, String(input.name || slug),
        input.description || null,
        input.visibility || 'public',
        input.owner_type || null,
        input.owner_id != null ? String(input.owner_id) : null,
        input.created_by_actor_type || null,
        input.created_by_actor_id != null ? String(input.created_by_actor_id) : null,
        JSON.stringify(input.metadata || {}),
    );
    return getSpace(id);
}
function getSpace(idOrSlug) {
    const v = String(idOrSlug);
    let r = db.get().prepare(`SELECT * FROM community_spaces WHERE id = ? OR slug = ? LIMIT 1`).get(v, v);
    return hydrateSpace(r);
}
function listSpaces({ visibility, owner_type, owner_id, limit }) {
    const where = ['archived_at IS NULL'];
    const args = [];
    if (visibility) { where.push('visibility = ?'); args.push(String(visibility)); }
    if (owner_type) { where.push('owner_type = ?'); args.push(String(owner_type)); }
    if (owner_id)   { where.push('owner_id = ?');   args.push(String(owner_id)); }
    const cap = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    return db.get().prepare(
        `SELECT * FROM community_spaces WHERE ${where.join(' AND ')} ORDER BY rowid DESC LIMIT ?`
    ).all(...args, cap).map(hydrateSpace);
}
function updateSpace(idOrSlug, patch) {
    const cur = getSpace(idOrSlug);
    if (!cur) return null;
    db.get().prepare(`
        UPDATE community_spaces SET
            name = ?, description = ?, visibility = ?, metadata_json = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(
        patch.name != null ? String(patch.name) : cur.name,
        patch.description !== undefined ? patch.description : cur.description,
        patch.visibility != null ? patch.visibility : cur.visibility,
        JSON.stringify(patch.metadata != null ? Object.assign({}, cur.metadata, patch.metadata) : cur.metadata),
        cur.id,
    );
    return getSpace(cur.id);
}
function archiveSpace(idOrSlug) {
    const cur = getSpace(idOrSlug);
    if (!cur) return null;
    db.get().prepare(`UPDATE community_spaces SET archived_at=CURRENT_TIMESTAMP WHERE id=?`).run(cur.id);
    return getSpace(cur.id);
}

// ── categories ───────────────────────────────────────────
function hydrateCategory(r) {
    if (!r) return null;
    return { id: r.id, community_id: r.community_id, slug: r.slug, name: r.name, description: r.description, sort_order: r.sort_order, created_at: r.created_at, updated_at: r.updated_at };
}
function createCategory(input) {
    const id = input.id || newId('cat');
    const slug = input.slug ? slugify(input.slug) : slugify(input.name || id);
    db.get().prepare(`
        INSERT INTO community_categories (id, community_id, slug, name, description, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, String(input.community_id), slug, String(input.name || slug), input.description || null, parseInt(input.sort_order, 10) || 0);
    return getCategory(id);
}
function getCategory(id) {
    return hydrateCategory(db.get().prepare(`SELECT * FROM community_categories WHERE id = ?`).get(String(id)));
}
function listCategories(community_id) {
    return db.get().prepare(`SELECT * FROM community_categories WHERE community_id = ? ORDER BY sort_order, rowid`).all(String(community_id)).map(hydrateCategory);
}

// ── threads ──────────────────────────────────────────────
function hydrateThread(r) {
    if (!r) return null;
    return {
        id: r.id, community_id: r.community_id, category_id: r.category_id,
        slug: r.slug, title: r.title, thread_type: r.thread_type, status: r.status,
        visibility: r.visibility, ref_type: r.ref_type, ref_id: r.ref_id,
        created_by_actor_type: r.created_by_actor_type, created_by_actor_id: r.created_by_actor_id,
        metadata: safeJson(r.metadata_json, {}),
        last_activity_at: r.last_activity_at, created_at: r.created_at, updated_at: r.updated_at,
    };
}
function createThread(input) {
    const id = input.id || newId('thr');
    const slug = input.slug ? slugify(input.slug) : slugify(input.title || id);
    db.get().prepare(`
        INSERT INTO community_threads (id, community_id, category_id, slug, title, thread_type, status, visibility,
            ref_type, ref_id, created_by_actor_type, created_by_actor_id, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        input.community_id || null,
        input.category_id || null,
        slug,
        String(input.title || 'Untitled'),
        input.thread_type || 'discussion',
        input.status || 'open',
        input.visibility || 'public',
        input.ref_type || null,
        input.ref_id != null ? String(input.ref_id) : null,
        input.created_by_actor_type || null,
        input.created_by_actor_id != null ? String(input.created_by_actor_id) : null,
        JSON.stringify(input.metadata || {}),
    );
    return getThread(id);
}
function getThread(idOrSlug) {
    const v = String(idOrSlug);
    return hydrateThread(db.get().prepare(`SELECT * FROM community_threads WHERE id = ? OR slug = ? LIMIT 1`).get(v, v));
}
function findThreadByRef(ref_type, ref_id) {
    return hydrateThread(db.get().prepare(`SELECT * FROM community_threads WHERE ref_type = ? AND ref_id = ? LIMIT 1`).get(String(ref_type), String(ref_id)));
}
function ensureThreadForRef(ref_type, ref_id, defaults) {
    const ex = findThreadByRef(ref_type, ref_id);
    if (ex) return ex;
    return createThread(Object.assign({ ref_type, ref_id }, defaults || {}));
}
function listThreads({ community_id, category_id, status, ref_type, ref_id, limit }) {
    const where = [];
    const args = [];
    if (community_id) { where.push('community_id = ?'); args.push(String(community_id)); }
    if (category_id)  { where.push('category_id = ?');  args.push(String(category_id)); }
    if (status)       { where.push('status = ?');       args.push(String(status)); }
    if (ref_type)     { where.push('ref_type = ?');     args.push(String(ref_type)); }
    if (ref_id)       { where.push('ref_id = ?');       args.push(String(ref_id)); }
    const cap = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const sql = `SELECT * FROM community_threads ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY last_activity_at DESC LIMIT ?`;
    return db.get().prepare(sql).all(...args, cap).map(hydrateThread);
}
function updateThread(id, patch) {
    const cur = getThread(id);
    if (!cur) return null;
    db.get().prepare(`
        UPDATE community_threads SET title = ?, status = ?, visibility = ?, metadata_json = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(
        patch.title != null ? String(patch.title) : cur.title,
        patch.status != null ? patch.status : cur.status,
        patch.visibility != null ? patch.visibility : cur.visibility,
        JSON.stringify(patch.metadata != null ? Object.assign({}, cur.metadata, patch.metadata) : cur.metadata),
        cur.id,
    );
    return getThread(cur.id);
}
function bumpThreadActivity(threadId) {
    db.get().prepare(`UPDATE community_threads SET last_activity_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(String(threadId));
}

// ── posts ────────────────────────────────────────────────
function hydratePost(r) {
    if (!r) return null;
    return {
        id: r.id, thread_id: r.thread_id, parent_post_id: r.parent_post_id,
        author_type: r.author_type, author_id: r.author_id,
        body: r.body, body_format: r.body_format,
        source_type: r.source_type, source_id: r.source_id,
        metadata: safeJson(r.metadata_json, {}),
        edited_at: r.edited_at || null,
        deleted_at: r.deleted_at || null,
        created_at: r.created_at,
    };
}
function createPost(input) {
    const id = input.id || newId('post');
    db.get().prepare(`
        INSERT INTO community_posts (id, thread_id, parent_post_id, author_type, author_id,
            body, body_format, source_type, source_id, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id, String(input.thread_id),
        input.parent_post_id || null,
        input.author_type || null,
        input.author_id != null ? String(input.author_id) : null,
        String(input.body || ''),
        input.body_format || 'markdown',
        input.source_type || 'openvibe',
        input.source_id || null,
        JSON.stringify(input.metadata || {}),
    );
    bumpThreadActivity(input.thread_id);
    return getPost(id);
}
function getPost(id) {
    return hydratePost(db.get().prepare(`SELECT * FROM community_posts WHERE id = ?`).get(String(id)));
}
function listPosts(thread_id, { limit, since_id } = {}) {
    const cap = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
    const args = [String(thread_id)];
    let sql = `SELECT * FROM community_posts WHERE thread_id = ? AND deleted_at IS NULL`;
    if (since_id) { sql += ` AND rowid > (SELECT rowid FROM community_posts WHERE id = ?)`; args.push(String(since_id)); }
    sql += ` ORDER BY rowid ASC LIMIT ?`;
    args.push(cap);
    return db.get().prepare(sql).all(...args).map(hydratePost);
}
function updatePost(id, patch) {
    const cur = getPost(id);
    if (!cur) return null;
    db.get().prepare(`UPDATE community_posts SET body = ?, body_format = ?, edited_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(patch.body != null ? String(patch.body) : cur.body, patch.body_format || cur.body_format, cur.id);
    return getPost(cur.id);
}
function deletePost(id) {
    db.get().prepare(`UPDATE community_posts SET deleted_at=CURRENT_TIMESTAMP WHERE id=?`).run(String(id));
    return getPost(id);
}
function findPostBySource(source_type, source_id) {
    return hydratePost(db.get().prepare(`SELECT * FROM community_posts WHERE source_type = ? AND source_id = ? LIMIT 1`).get(String(source_type), String(source_id)));
}

// ── pastes ───────────────────────────────────────────────
function hydratePaste(r) {
    if (!r) return null;
    return {
        id: r.id, slug: r.slug, title: r.title, body: r.body, language: r.language,
        visibility: r.visibility, expires_at: r.expires_at || null,
        created_by_actor_type: r.created_by_actor_type, created_by_actor_id: r.created_by_actor_id,
        view_count: r.view_count,
        metadata: safeJson(r.metadata_json, {}),
        deleted_at: r.deleted_at || null,
        created_at: r.created_at, updated_at: r.updated_at,
    };
}
function createPaste(input) {
    const id = input.id || newId('paste');
    let slug = input.slug ? slugify(input.slug) : slugify(input.title || id);
    // ensure unique
    if (db.get().prepare(`SELECT 1 FROM community_pastes WHERE slug=?`).get(slug)) {
        slug = `${slug}-${crypto.randomBytes(3).toString('hex')}`;
    }
    db.get().prepare(`
        INSERT INTO community_pastes (id, slug, title, body, language, visibility, expires_at,
            created_by_actor_type, created_by_actor_id, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id, slug, input.title || null, String(input.body || ''),
        input.language || null,
        input.visibility || 'public',
        input.expires_at || null,
        input.created_by_actor_type || null,
        input.created_by_actor_id != null ? String(input.created_by_actor_id) : null,
        JSON.stringify(input.metadata || {}),
    );
    // Phase 16 — record version 1 on create.
    recordPasteVersion({
        paste_id: id,
        title: input.title || null,
        body: String(input.body || ''),
        language: input.language || null,
        edited_by_actor_type: input.created_by_actor_type || null,
        edited_by_actor_id: input.created_by_actor_id != null ? String(input.created_by_actor_id) : null,
        change_summary: 'created',
        metadata: input.version_metadata || {},
    });
    return getPasteBySlug(slug);
}
function getPasteBySlug(slug) {
    return hydratePaste(db.get().prepare(`SELECT * FROM community_pastes WHERE slug = ? AND deleted_at IS NULL`).get(String(slug)));
}
function getPasteById(id) {
    return hydratePaste(db.get().prepare(`SELECT * FROM community_pastes WHERE id = ? AND deleted_at IS NULL`).get(String(id)));
}
function listPastes({ visibility, created_by_actor_type, created_by_actor_id, limit }) {
    const where = ['deleted_at IS NULL'];
    const args = [];
    if (visibility) { where.push('visibility = ?'); args.push(String(visibility)); }
    if (created_by_actor_type) { where.push('created_by_actor_type = ?'); args.push(String(created_by_actor_type)); }
    if (created_by_actor_id)   { where.push('created_by_actor_id = ?');   args.push(String(created_by_actor_id)); }
    const cap = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    return db.get().prepare(
        `SELECT * FROM community_pastes WHERE ${where.join(' AND ')} ORDER BY rowid DESC LIMIT ?`
    ).all(...args, cap).map(hydratePaste);
}
function updatePaste(slug, patch) {
    const cur = getPasteBySlug(slug);
    if (!cur) return null;
    const nextTitle = patch.title !== undefined ? patch.title : cur.title;
    const nextBody = patch.body != null ? String(patch.body) : cur.body;
    const nextLanguage = patch.language !== undefined ? patch.language : cur.language;
    const nextVisibility = patch.visibility != null ? patch.visibility : cur.visibility;
    const nextMetadata = patch.metadata != null ? Object.assign({}, cur.metadata, patch.metadata) : cur.metadata;
    db.get().prepare(`
        UPDATE community_pastes SET title = ?, body = ?, language = ?, visibility = ?, metadata_json = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(
        nextTitle,
        nextBody,
        nextLanguage,
        nextVisibility,
        JSON.stringify(nextMetadata),
        cur.id,
    );
    // Phase 16 — record a new version when content actually changed.
    const contentChanged = nextBody !== cur.body || nextTitle !== cur.title || nextLanguage !== cur.language;
    if (contentChanged) {
        recordPasteVersion({
            paste_id: cur.id,
            title: nextTitle,
            body: nextBody,
            language: nextLanguage,
            edited_by_actor_type: patch.edited_by_actor_type || null,
            edited_by_actor_id: patch.edited_by_actor_id != null ? String(patch.edited_by_actor_id) : null,
            change_summary: patch.change_summary || 'updated',
            metadata: patch.version_metadata || {},
        });
    }
    return getPasteBySlug(cur.slug);
}
function deletePaste(slug) {
    const cur = getPasteBySlug(slug);
    if (!cur) return null;
    db.get().prepare(`UPDATE community_pastes SET deleted_at=CURRENT_TIMESTAMP WHERE id=?`).run(cur.id);
    return Object.assign({}, cur, { deleted_at: new Date().toISOString() });
}
function bumpPasteView(slug) {
    db.get().prepare(`UPDATE community_pastes SET view_count = view_count + 1 WHERE slug = ?`).run(String(slug));
}

// ── attachments ──────────────────────────────────────────
function attachMedia({ attached_to_type, attached_to_id, media_id, attachment_type, sort_order }) {
    const id = newId('att');
    db.get().prepare(`
        INSERT INTO community_attachments (id, attached_to_type, attached_to_id, media_id, attachment_type, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, String(attached_to_type), String(attached_to_id), String(media_id), attachment_type || null, parseInt(sort_order, 10) || 0);
    return { id, attached_to_type, attached_to_id, media_id, attachment_type, sort_order };
}
function listAttachments(attached_to_type, attached_to_id) {
    return db.get().prepare(
        `SELECT * FROM community_attachments WHERE attached_to_type = ? AND attached_to_id = ? ORDER BY sort_order, rowid`
    ).all(String(attached_to_type), String(attached_to_id));
}

// ── discord relays ───────────────────────────────────────
function createRelay(input) {
    const id = input.id || newId('relay');
    db.get().prepare(`
        INSERT INTO community_discord_relays (id, community_id, discord_guild_id, discord_channel_id,
            openvibe_category_id, openvibe_thread_id, relay_direction, enabled, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        input.community_id || null,
        input.discord_guild_id || null,
        String(input.discord_channel_id),
        input.openvibe_category_id || null,
        input.openvibe_thread_id || null,
        input.relay_direction || 'discord_to_openvibe',
        input.enabled === false ? 0 : 1,
        JSON.stringify(input.metadata || {}),
    );
    return getRelay(id);
}
function getRelay(id) {
    const r = db.get().prepare(`SELECT * FROM community_discord_relays WHERE id = ?`).get(String(id));
    if (!r) return null;
    return Object.assign({}, r, { enabled: !!r.enabled, metadata: safeJson(r.metadata_json, {}) });
}
function findRelayByChannel(discord_channel_id) {
    const r = db.get().prepare(`SELECT * FROM community_discord_relays WHERE discord_channel_id = ?`).get(String(discord_channel_id));
    if (!r) return null;
    return Object.assign({}, r, { enabled: !!r.enabled, metadata: safeJson(r.metadata_json, {}) });
}
function listRelays() {
    return db.get().prepare(`SELECT * FROM community_discord_relays ORDER BY rowid DESC`).all()
        .map(r => Object.assign({}, r, { enabled: !!r.enabled, metadata: safeJson(r.metadata_json, {}) }));
}
function updateRelay(id, patch) {
    const cur = getRelay(id);
    if (!cur) return null;
    db.get().prepare(`
        UPDATE community_discord_relays SET enabled = ?, relay_direction = ?, openvibe_category_id = ?,
            openvibe_thread_id = ?, last_synced_at = COALESCE(?, last_synced_at), updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(
        patch.enabled === undefined ? (cur.enabled ? 1 : 0) : (patch.enabled ? 1 : 0),
        patch.relay_direction || cur.relay_direction,
        patch.openvibe_category_id !== undefined ? patch.openvibe_category_id : cur.openvibe_category_id,
        patch.openvibe_thread_id !== undefined ? patch.openvibe_thread_id : cur.openvibe_thread_id,
        patch.last_synced_at || null,
        cur.id,
    );
    return getRelay(cur.id);
}

function recordDiscordMessage({ discord_message_id, discord_channel_id, openvibe_post_id, openvibe_thread_id, relay_direction, metadata }) {
    db.get().prepare(`
        INSERT INTO community_discord_messages (discord_message_id, discord_channel_id, openvibe_post_id, openvibe_thread_id, relay_direction, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(discord_message_id) DO UPDATE SET
            openvibe_post_id = excluded.openvibe_post_id,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        String(discord_message_id),
        discord_channel_id || null,
        openvibe_post_id || null,
        openvibe_thread_id || null,
        relay_direction || 'discord_to_openvibe',
        JSON.stringify(metadata || {}),
    );
}
function findDiscordMessage(discord_message_id) {
    const r = db.get().prepare(`SELECT * FROM community_discord_messages WHERE discord_message_id = ?`).get(String(discord_message_id));
    if (!r) return null;
    return Object.assign({}, r, { metadata: safeJson(r.metadata_json, {}) });
}

// ── legacy ───────────────────────────────────────────────
function recordLegacyMap({ source, kind, legacy_id, new_id }) {
    db.get().prepare(
        `INSERT OR IGNORE INTO community_legacy_map (source, kind, legacy_id, new_id) VALUES (?, ?, ?, ?)`
    ).run(String(source), String(kind), String(legacy_id), String(new_id));
}
function lookupLegacy(source, kind, legacy_id) {
    return db.get().prepare(
        `SELECT new_id FROM community_legacy_map WHERE source = ? AND kind = ? AND legacy_id = ?`
    ).get(String(source), String(kind), String(legacy_id));
}

// ── Phase 16: paste versions ─────────────────────────────
function nextPasteVersionNumber(paste_id) {
    const row = db.get().prepare(
        `SELECT COALESCE(MAX(version), 0) AS max_version FROM community_paste_versions WHERE paste_id = ?`
    ).get(String(paste_id));
    return (row && row.max_version ? row.max_version : 0) + 1;
}
function hydratePasteVersion(r) {
    if (!r) return null;
    return {
        id: r.id, paste_id: r.paste_id, version: r.version,
        title: r.title, body: r.body, language: r.language,
        edited_by_actor_type: r.edited_by_actor_type,
        edited_by_actor_id: r.edited_by_actor_id,
        change_summary: r.change_summary,
        metadata: safeJson(r.metadata_json, {}),
        created_at: r.created_at,
    };
}
function recordPasteVersion(input) {
    const id = input.id || newId('pver');
    const version = input.version || nextPasteVersionNumber(input.paste_id);
    db.get().prepare(`
        INSERT INTO community_paste_versions (id, paste_id, version, title, body, language,
            edited_by_actor_type, edited_by_actor_id, change_summary, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id, String(input.paste_id), version,
        input.title || null,
        String(input.body || ''),
        input.language || null,
        input.edited_by_actor_type || null,
        input.edited_by_actor_id != null ? String(input.edited_by_actor_id) : null,
        input.change_summary || null,
        JSON.stringify(input.metadata || {}),
    );
    return getPasteVersion(input.paste_id, version);
}
function listPasteVersions(paste_id, { limit } = {}) {
    const cap = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    return db.get().prepare(
        `SELECT * FROM community_paste_versions WHERE paste_id = ? ORDER BY version DESC LIMIT ?`
    ).all(String(paste_id), cap).map(hydratePasteVersion);
}
function getPasteVersion(paste_id, version) {
    return hydratePasteVersion(db.get().prepare(
        `SELECT * FROM community_paste_versions WHERE paste_id = ? AND version = ?`
    ).get(String(paste_id), parseInt(version, 10)));
}

// ── Phase 16: discord relay audit ────────────────────────
function hydrateRelayAudit(r) {
    if (!r) return null;
    return {
        id: r.id,
        relay_direction: r.relay_direction,
        outcome: r.outcome,
        relay_id: r.relay_id,
        discord_channel_id: r.discord_channel_id,
        discord_message_id: r.discord_message_id,
        openvibe_post_id: r.openvibe_post_id,
        openvibe_thread_id: r.openvibe_thread_id,
        idempotency_key: r.idempotency_key,
        error_message: r.error_message,
        metadata: safeJson(r.metadata_json, {}),
        recorded_at: r.recorded_at,
    };
}
function recordRelayAudit(input) {
    const r = db.get().prepare(`
        INSERT INTO community_relay_audit (relay_direction, outcome, relay_id, discord_channel_id,
            discord_message_id, openvibe_post_id, openvibe_thread_id, idempotency_key, error_message, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        String(input.relay_direction),
        String(input.outcome),
        input.relay_id || null,
        input.discord_channel_id || null,
        input.discord_message_id || null,
        input.openvibe_post_id || null,
        input.openvibe_thread_id || null,
        input.idempotency_key || null,
        input.error_message || null,
        JSON.stringify(input.metadata || {}),
    );
    return { id: r.lastInsertRowid };
}
function listRelayAudit({ relay_direction, outcome, limit } = {}) {
    const where = [];
    const args = [];
    if (relay_direction) { where.push('relay_direction = ?'); args.push(String(relay_direction)); }
    if (outcome) { where.push('outcome = ?'); args.push(String(outcome)); }
    const cap = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
    const sql = `SELECT * FROM community_relay_audit ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`;
    return db.get().prepare(sql).all(...args, cap).map(hydrateRelayAudit);
}
function getRelayAuditSummary() {
    const rows = db.get().prepare(`
        SELECT relay_direction, outcome, COUNT(*) AS n
        FROM community_relay_audit
        GROUP BY relay_direction, outcome
    `).all();
    const summary = { totals: {}, by_direction: {} };
    for (const r of rows) {
        summary.totals[r.outcome] = (summary.totals[r.outcome] || 0) + Number(r.n);
        if (!summary.by_direction[r.relay_direction]) summary.by_direction[r.relay_direction] = {};
        summary.by_direction[r.relay_direction][r.outcome] = Number(r.n);
    }
    return summary;
}

module.exports = {
    newId, slugify,
    // spaces
    createSpace, getSpace, listSpaces, updateSpace, archiveSpace,
    // categories
    createCategory, getCategory, listCategories,
    // threads
    createThread, getThread, findThreadByRef, ensureThreadForRef, listThreads, updateThread, bumpThreadActivity,
    // posts
    createPost, getPost, listPosts, updatePost, deletePost, findPostBySource,
    // pastes
    createPaste, getPasteBySlug, getPasteById, listPastes, updatePaste, deletePaste, bumpPasteView,
    // Phase 16: paste versions
    recordPasteVersion, listPasteVersions, getPasteVersion,
    // Phase 16: relay audit
    recordRelayAudit, listRelayAudit, getRelayAuditSummary,
    // attachments
    attachMedia, listAttachments,
    // discord
    createRelay, getRelay, findRelayByChannel, listRelays, updateRelay, recordDiscordMessage, findDiscordMessage,
    // legacy
    recordLegacyMap, lookupLegacy,
};
