'use strict';

// openvibe-ai — DB model helpers (SQL only). Pure data access; business logic
// lives in policy/runner/seo/sources/search.

const crypto = require('crypto');
const db = require('./db');

function uid(prefix) {
    return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}
function now() { return new Date().toISOString(); }
function jstr(o)  { return JSON.stringify(o == null ? {} : o); }
function jparse(s, fb) {
    if (s == null) return fb == null ? {} : fb;
    try { return JSON.parse(s); } catch { return fb == null ? {} : fb; }
}
function row(r, fields) {
    if (!r) return null;
    const out = Object.assign({}, r);
    for (const f of (fields || [])) {
        if (f in out) out[f] = jparse(out[f], Array.isArray(out[f]) ? [] : {});
    }
    return out;
}

const JSON_FIELDS = {
    provider:   ['metadata_json'],
    model:      ['metadata_json'],
    route:      ['metadata_json'],
    template:   ['input_schema_json', 'output_schema_json', 'metadata_json'],
    workflow:   ['input_schema_json', 'steps_json', 'output_schema_json', 'metadata_json'],
    run:        ['input_json', 'output_json', 'metadata_json'],
    request:    ['metadata_json'],
    source:     ['metadata_json'],
    seo:        ['structured_data_json', 'breadcrumbs_json', 'metadata_json'],
    csource:    ['metadata_json'],
    ijob:       ['input_json', 'output_json', 'metadata_json'],
    sdoc:       ['tags_json', 'source_ids_json', 'metadata_json'],
};

// ── Providers ─────────────────────────────────────────────────────
function createProvider(p) {
    const id = uid('aip');
    db.get().prepare(`
        INSERT INTO ai_providers (id, provider_key, display_name, status, base_url, auth_mode,
            api_key_env, default_model, supports_chat, supports_json, supports_embeddings,
            supports_tools, supports_streaming, timeout_ms, priority, metadata_json, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(id, p.provider_key, p.display_name || p.provider_key,
        p.status || 'active', p.base_url || null, p.auth_mode || 'none',
        p.api_key_env || null, p.default_model || null,
        p.supports_chat ? 1 : 0, p.supports_json ? 1 : 0,
        p.supports_embeddings ? 1 : 0, p.supports_tools ? 1 : 0,
        p.supports_streaming ? 1 : 0, p.timeout_ms || 30000,
        p.priority == null ? 100 : p.priority, jstr(p.metadata), now(), now());
    return getProvider(id);
}
function getProvider(id)            { return row(db.get().prepare(`SELECT * FROM ai_providers WHERE id=?`).get(id), JSON_FIELDS.provider); }
function getProviderByKey(key)      { return row(db.get().prepare(`SELECT * FROM ai_providers WHERE provider_key=?`).get(key), JSON_FIELDS.provider); }
function listProviders()            { return db.get().prepare(`SELECT * FROM ai_providers ORDER BY priority ASC, created_at ASC`).all().map(r => row(r, JSON_FIELDS.provider)); }
function updateProvider(id, patch) {
    const cur = getProvider(id); if (!cur) return null;
    const m = Object.assign({}, cur, patch);
    db.get().prepare(`
        UPDATE ai_providers SET display_name=?, status=?, base_url=?, auth_mode=?, api_key_env=?,
            default_model=?, supports_chat=?, supports_json=?, supports_embeddings=?,
            supports_tools=?, supports_streaming=?, timeout_ms=?, priority=?,
            metadata_json=?, updated_at=? WHERE id=?
    `).run(m.display_name, m.status, m.base_url, m.auth_mode, m.api_key_env,
        m.default_model, m.supports_chat ? 1 : 0, m.supports_json ? 1 : 0,
        m.supports_embeddings ? 1 : 0, m.supports_tools ? 1 : 0,
        m.supports_streaming ? 1 : 0, m.timeout_ms, m.priority,
        jstr(m.metadata_json || m.metadata || {}), now(), id);
    return getProvider(id);
}
function disableProvider(id) { return updateProvider(id, { status: 'disabled' }); }

// ── Models ────────────────────────────────────────────────────────
function createModel(m) {
    const id = uid('aim');
    db.get().prepare(`
        INSERT INTO ai_models (id, provider_id, model_key, display_name, model_type, status,
            context_window, max_output_tokens, cost_input_per_million, cost_output_per_million,
            supports_json, supports_tools, supports_streaming, metadata_json, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(id, m.provider_id, m.model_key, m.display_name || m.model_key,
        m.model_type || 'chat', m.status || 'active',
        m.context_window || null, m.max_output_tokens || null,
        m.cost_input_per_million || null, m.cost_output_per_million || null,
        m.supports_json ? 1 : 0, m.supports_tools ? 1 : 0,
        m.supports_streaming ? 1 : 0, jstr(m.metadata), now(), now());
    return getModel(id);
}
function getModel(id)               { return row(db.get().prepare(`SELECT * FROM ai_models WHERE id=?`).get(id), JSON_FIELDS.model); }
function listModels()               { return db.get().prepare(`SELECT * FROM ai_models ORDER BY created_at ASC`).all().map(r => row(r, JSON_FIELDS.model)); }
function getModelByKey(providerId, key) {
    return row(db.get().prepare(`SELECT * FROM ai_models WHERE provider_id=? AND model_key=?`).get(providerId, key), JSON_FIELDS.model);
}
function updateModel(id, patch) {
    const cur = getModel(id); if (!cur) return null;
    const m = Object.assign({}, cur, patch);
    db.get().prepare(`
        UPDATE ai_models SET display_name=?, model_type=?, status=?, context_window=?,
            max_output_tokens=?, cost_input_per_million=?, cost_output_per_million=?,
            supports_json=?, supports_tools=?, supports_streaming=?, metadata_json=?, updated_at=? WHERE id=?
    `).run(m.display_name, m.model_type, m.status, m.context_window,
        m.max_output_tokens, m.cost_input_per_million, m.cost_output_per_million,
        m.supports_json ? 1 : 0, m.supports_tools ? 1 : 0, m.supports_streaming ? 1 : 0,
        jstr(m.metadata_json || m.metadata || {}), now(), id);
    return getModel(id);
}
function disableModel(id) { return updateModel(id, { status: 'disabled' }); }

// ── Routes ────────────────────────────────────────────────────────
function upsertRoute(r) {
    const existing = getRoute(r.route_key);
    if (existing) {
        const m = Object.assign({}, existing, r);
        db.get().prepare(`
            UPDATE ai_routes SET primary_provider_id=?, primary_model_id=?, fallback_provider_id=?,
                fallback_model_id=?, temperature=?, max_output_tokens=?, response_format=?, status=?,
                metadata_json=?, updated_at=? WHERE route_key=?
        `).run(m.primary_provider_id || null, m.primary_model_id || null,
            m.fallback_provider_id || null, m.fallback_model_id || null,
            m.temperature == null ? null : m.temperature,
            m.max_output_tokens || null, m.response_format || 'text',
            m.status || 'active', jstr(m.metadata_json || m.metadata || {}), now(), r.route_key);
        return getRoute(r.route_key);
    }
    const id = uid('air');
    db.get().prepare(`
        INSERT INTO ai_routes (id, route_key, primary_provider_id, primary_model_id,
            fallback_provider_id, fallback_model_id, temperature, max_output_tokens,
            response_format, status, metadata_json, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(id, r.route_key, r.primary_provider_id || null, r.primary_model_id || null,
        r.fallback_provider_id || null, r.fallback_model_id || null,
        r.temperature == null ? null : r.temperature,
        r.max_output_tokens || null, r.response_format || 'text',
        r.status || 'active', jstr(r.metadata), now(), now());
    return getRoute(r.route_key);
}
function getRoute(routeKey) {
    return row(db.get().prepare(`SELECT * FROM ai_routes WHERE route_key=?`).get(routeKey), JSON_FIELDS.route);
}
function listRoutes() {
    return db.get().prepare(`SELECT * FROM ai_routes ORDER BY route_key ASC`).all().map(r => row(r, JSON_FIELDS.route));
}
function disableRoute(routeKey) { return upsertRoute({ route_key: routeKey, status: 'disabled' }); }

// ── Templates ─────────────────────────────────────────────────────
function upsertTemplate(t) {
    const existing = getTemplate(t.template_key);
    if (existing) {
        const m = Object.assign({}, existing, t);
        db.get().prepare(`
            UPDATE ai_prompt_templates SET name=?, description=?, version=?, input_schema_json=?,
                output_schema_json=?, system_prompt=?, user_prompt_template=?, default_route_key=?,
                owner_type=?, owner_id=?, visibility=?, status=?, metadata_json=?, updated_at=? WHERE template_key=?
        `).run(m.name, m.description || null, m.version || 1,
            jstr(m.input_schema_json || m.input_schema || {}),
            jstr(m.output_schema_json || m.output_schema || {}),
            m.system_prompt || null, m.user_prompt_template || null,
            m.default_route_key || null, m.owner_type || null, m.owner_id || null,
            m.visibility || 'system', m.status || 'active',
            jstr(m.metadata_json || m.metadata || {}), now(), t.template_key);
        return getTemplate(t.template_key);
    }
    const id = uid('ait');
    db.get().prepare(`
        INSERT INTO ai_prompt_templates (id, template_key, name, description, version,
            input_schema_json, output_schema_json, system_prompt, user_prompt_template,
            default_route_key, owner_type, owner_id, visibility, status, metadata_json, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(id, t.template_key, t.name, t.description || null, t.version || 1,
        jstr(t.input_schema), jstr(t.output_schema),
        t.system_prompt || null, t.user_prompt_template || null,
        t.default_route_key || null, t.owner_type || null, t.owner_id || null,
        t.visibility || 'system', t.status || 'active', jstr(t.metadata), now(), now());
    return getTemplate(t.template_key);
}
function getTemplate(key)   { return row(db.get().prepare(`SELECT * FROM ai_prompt_templates WHERE template_key=?`).get(key), JSON_FIELDS.template); }
function listTemplates()    { return db.get().prepare(`SELECT * FROM ai_prompt_templates ORDER BY template_key ASC`).all().map(r => row(r, JSON_FIELDS.template)); }

// ── Workflows ─────────────────────────────────────────────────────
function upsertWorkflow(w) {
    const existing = getWorkflow(w.workflow_key);
    if (existing) {
        const m = Object.assign({}, existing, w);
        db.get().prepare(`
            UPDATE ai_workflows SET name=?, description=?, service_namespace=?, version=?,
                input_schema_json=?, steps_json=?, output_schema_json=?, default_route_key=?,
                status=?, metadata_json=?, updated_at=? WHERE workflow_key=?
        `).run(m.name, m.description || null, m.service_namespace || 'system', m.version || 1,
            jstr(m.input_schema_json || m.input_schema || {}),
            jstr(m.steps_json || m.steps || []),
            jstr(m.output_schema_json || m.output_schema || {}),
            m.default_route_key || null, m.status || 'active',
            jstr(m.metadata_json || m.metadata || {}), now(), w.workflow_key);
        return getWorkflow(w.workflow_key);
    }
    const id = uid('aiw');
    db.get().prepare(`
        INSERT INTO ai_workflows (id, workflow_key, name, description, service_namespace,
            version, input_schema_json, steps_json, output_schema_json, default_route_key,
            status, metadata_json, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(id, w.workflow_key, w.name, w.description || null,
        w.service_namespace || 'system', w.version || 1,
        jstr(w.input_schema), jstr(w.steps || []), jstr(w.output_schema),
        w.default_route_key || null, w.status || 'active',
        jstr(w.metadata), now(), now());
    return getWorkflow(w.workflow_key);
}
function getWorkflow(key)   { return row(db.get().prepare(`SELECT * FROM ai_workflows WHERE workflow_key=?`).get(key), JSON_FIELDS.workflow); }
function listWorkflows()    { return db.get().prepare(`SELECT * FROM ai_workflows ORDER BY workflow_key ASC`).all().map(r => row(r, JSON_FIELDS.workflow)); }

// ── Runs ─────────────────────────────────────────────────────────
function createRun(r) {
    const id = uid('run');
    try {
        db.get().prepare(`
            INSERT INTO ai_runs (id, workflow_key, workflow_version, template_key, route_key,
                status, requested_by_type, requested_by_id, source_service,
                target_type, target_id, input_json, trace_id, idempotency_key, metadata_json, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(id, r.workflow_key || null, r.workflow_version || null,
            r.template_key || null, r.route_key || null,
            r.status || 'queued', r.requested_by_type || null, r.requested_by_id || null,
            r.source_service || null, r.target_type || null, r.target_id || null,
            jstr(r.input || {}), r.trace_id || null, r.idempotency_key || null,
            jstr(r.metadata), now());
    } catch (e) {
        if (String(e.message).includes('UNIQUE constraint failed') && r.idempotency_key) {
            const existing = db.get().prepare(`SELECT * FROM ai_runs WHERE idempotency_key=?`).get(r.idempotency_key);
            if (existing) return Object.assign({ replayed: true }, row(existing, JSON_FIELDS.run));
        }
        throw e;
    }
    return Object.assign({ replayed: false }, getRun(id));
}
function getRun(id) { return row(db.get().prepare(`SELECT * FROM ai_runs WHERE id=?`).get(id), JSON_FIELDS.run); }
function listRuns(query) {
    query = query || {};
    const where = []; const args = [];
    if (query.status)        { where.push('status=?');       args.push(query.status); }
    if (query.workflow_key)  { where.push('workflow_key=?'); args.push(query.workflow_key); }
    if (query.target_type)   { where.push('target_type=?');  args.push(query.target_type); }
    if (query.target_id)     { where.push('target_id=?');    args.push(query.target_id); }
    const limit = Math.min(parseInt(query.limit, 10) || 100, 500);
    const sql = `SELECT * FROM ai_runs ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT ${limit}`;
    return db.get().prepare(sql).all(...args).map(r => row(r, JSON_FIELDS.run));
}
function updateRun(id, patch) {
    const cur = getRun(id); if (!cur) return null;
    const fields = [];
    const args = [];
    for (const k of ['status', 'output_json', 'error', 'started_at', 'completed_at']) {
        if (k in patch) {
            if (k === 'output_json') { fields.push('output_json=?'); args.push(jstr(patch[k])); }
            else { fields.push(`${k}=?`); args.push(patch[k]); }
        }
    }
    if (!fields.length) return cur;
    args.push(id);
    db.get().prepare(`UPDATE ai_runs SET ${fields.join(', ')} WHERE id=?`).run(...args);
    return getRun(id);
}

// ── Requests log ──────────────────────────────────────────────────
function logRequest(req) {
    const id = uid('aiq');
    db.get().prepare(`
        INSERT INTO ai_requests (id, run_id, provider_id, model_id, route_key, status,
            prompt_hash, input_tokens_estimate, output_tokens_estimate, cost_estimate,
            latency_ms, error, metadata_json, created_at, completed_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(id, req.run_id || null, req.provider_id || null, req.model_id || null,
        req.route_key || null, req.status || 'started',
        req.prompt_hash || null, req.input_tokens_estimate || 0,
        req.output_tokens_estimate || 0, req.cost_estimate || 0,
        req.latency_ms || null, req.error || null, jstr(req.metadata),
        now(), req.completed_at || now());
    return id;
}
function listRequests(runId) {
    return db.get().prepare(`SELECT * FROM ai_requests WHERE run_id=? ORDER BY created_at ASC`).all(runId)
        .map(r => row(r, JSON_FIELDS.request));
}

// ── Sources / citations ──────────────────────────────────────────
function attachSource(s) {
    const id = uid('src');
    db.get().prepare(`
        INSERT INTO ai_sources (id, run_id, source_type, source_id, url, title, author,
            published_at, retrieved_at, snippet, content_hash, trust_score, metadata_json)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(id, s.run_id || null, s.source_type || null, s.source_id || null,
        s.url || null, s.title || null, s.author || null,
        s.published_at || null, s.retrieved_at || now(), s.snippet || null,
        s.content_hash || null, s.trust_score == null ? null : s.trust_score,
        jstr(s.metadata));
    return getSource(id);
}
function getSource(id)        { return row(db.get().prepare(`SELECT * FROM ai_sources WHERE id=?`).get(id), JSON_FIELDS.source); }
function listSourcesForRun(runId) {
    return db.get().prepare(`SELECT * FROM ai_sources WHERE run_id=? ORDER BY retrieved_at ASC`).all(runId)
        .map(r => row(r, JSON_FIELDS.source));
}

// ── SEO content metadata ─────────────────────────────────────────
function upsertSeoContent(s) {
    const id = s.id || uid('seo');
    const existing = s.id ? db.get().prepare(`SELECT * FROM seo_content WHERE id=?`).get(s.id) : null;
    if (existing) {
        const m = Object.assign({}, row(existing, JSON_FIELDS.seo), s);
        db.get().prepare(`
            UPDATE seo_content SET content_type=?, target_product=?, target_id=?, seo_title=?,
                seo_description=?, slug=?, canonical_url=?, canonical_domain=?, robots_directive=?,
                og_title=?, og_description=?, og_image_media_id=?, twitter_card=?,
                structured_data_json=?, breadcrumbs_json=?, source_count=?, citation_count=?,
                freshness_score=?, quality_score=?, duplicate_group_id=?, canonical_content_hash=?,
                generated_by=?, ai_disclosure=?, sensitive_category=?, requires_manual_review=?,
                review_required=?, indexing_status=?, published_at=?, expires_at=?,
                metadata_json=?, updated_at=? WHERE id=?
        `).run(m.content_type, m.target_product || null, m.target_id || null,
            m.seo_title || null, m.seo_description || null, m.slug || null,
            m.canonical_url || null, m.canonical_domain || null,
            m.robots_directive || 'noindex,follow',
            m.og_title || null, m.og_description || null, m.og_image_media_id || null,
            m.twitter_card || null, jstr(m.structured_data_json || m.structured_data || {}),
            jstr(m.breadcrumbs_json || m.breadcrumbs || []),
            m.source_count || 0, m.citation_count || 0,
            m.freshness_score == null ? null : m.freshness_score,
            m.quality_score == null ? null : m.quality_score,
            m.duplicate_group_id || null, m.canonical_content_hash || null,
            m.generated_by || 'ai', m.ai_disclosure || null,
            m.sensitive_category || null, m.requires_manual_review ? 1 : 0,
            m.review_required ? 1 : 0, m.indexing_status || 'draft',
            m.published_at || null, m.expires_at || null,
            jstr(m.metadata_json || m.metadata || {}), now(), id);
        return getSeoContent(id);
    }
    db.get().prepare(`
        INSERT INTO seo_content (id, content_type, target_product, target_id, seo_title,
            seo_description, slug, canonical_url, canonical_domain, robots_directive,
            og_title, og_description, og_image_media_id, twitter_card,
            structured_data_json, breadcrumbs_json, source_count, citation_count,
            freshness_score, quality_score, duplicate_group_id, canonical_content_hash,
            generated_by, ai_disclosure, sensitive_category, requires_manual_review,
            review_required, indexing_status, published_at, generated_at, updated_at, expires_at, metadata_json)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(id, s.content_type, s.target_product || null, s.target_id || null,
        s.seo_title || null, s.seo_description || null, s.slug || null,
        s.canonical_url || null, s.canonical_domain || null,
        s.robots_directive || 'noindex,follow',
        s.og_title || null, s.og_description || null, s.og_image_media_id || null,
        s.twitter_card || null, jstr(s.structured_data || {}),
        jstr(s.breadcrumbs || []),
        s.source_count || 0, s.citation_count || 0,
        s.freshness_score == null ? null : s.freshness_score,
        s.quality_score == null ? null : s.quality_score,
        s.duplicate_group_id || null, s.canonical_content_hash || null,
        s.generated_by || 'ai', s.ai_disclosure || null,
        s.sensitive_category || null, s.requires_manual_review ? 1 : 0,
        s.review_required ? 1 : 0, s.indexing_status || 'draft',
        s.published_at || null, now(), now(),
        s.expires_at || null, jstr(s.metadata));
    return getSeoContent(id);
}
function getSeoContent(id)  { return row(db.get().prepare(`SELECT * FROM seo_content WHERE id=?`).get(id), JSON_FIELDS.seo); }
function listSeoContent(q) {
    q = q || {};
    const where = []; const args = [];
    if (q.indexing_status) { where.push('indexing_status=?'); args.push(q.indexing_status); }
    if (q.target_product)  { where.push('target_product=?');  args.push(q.target_product); }
    const limit = Math.min(parseInt(q.limit, 10) || 200, 1000);
    const sql = `SELECT * FROM seo_content ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY updated_at DESC LIMIT ${limit}`;
    return db.get().prepare(sql).all(...args).map(r => row(r, JSON_FIELDS.seo));
}
function findDuplicateSeoByHash(hash) {
    return row(db.get().prepare(`SELECT * FROM seo_content WHERE canonical_content_hash=? LIMIT 1`).get(hash), JSON_FIELDS.seo);
}

// ── Content sources ───────────────────────────────────────────────
function upsertContentSource(s) {
    const existing = getContentSourceByKey(s.source_key);
    if (existing) {
        const m = Object.assign({}, existing, s);
        db.get().prepare(`
            UPDATE ai_content_sources SET source_name=?, source_type=?, category=?, base_url=?,
                api_base_url=?, auth_mode=?, api_key_env=?, rss_url=?, sitemap_url=?,
                robots_txt_url=?, rate_limit_per_minute=?, enabled=?, respect_robots=?,
                requires_review=?, terms_notes=?, sensitive_category=?, default_indexing_status=?,
                metadata_json=?, updated_at=? WHERE id=?
        `).run(m.source_name, m.source_type, m.category || null,
            m.base_url || null, m.api_base_url || null,
            m.auth_mode || 'none', m.api_key_env || null,
            m.rss_url || null, m.sitemap_url || null, m.robots_txt_url || null,
            m.rate_limit_per_minute || null,
            m.enabled ? 1 : 0, m.respect_robots ? 1 : 0,
            m.requires_review ? 1 : 0,
            m.terms_notes || null, m.sensitive_category || null,
            m.default_indexing_status || 'draft',
            jstr(m.metadata_json || m.metadata || {}), now(), existing.id);
        return getContentSource(existing.id);
    }
    const id = uid('csrc');
    db.get().prepare(`
        INSERT INTO ai_content_sources (id, source_key, source_name, source_type, category,
            base_url, api_base_url, auth_mode, api_key_env, rss_url, sitemap_url,
            robots_txt_url, rate_limit_per_minute, enabled, respect_robots, requires_review,
            terms_notes, sensitive_category, default_indexing_status, metadata_json, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(id, s.source_key, s.source_name, s.source_type, s.category || null,
        s.base_url || null, s.api_base_url || null,
        s.auth_mode || 'none', s.api_key_env || null,
        s.rss_url || null, s.sitemap_url || null, s.robots_txt_url || null,
        s.rate_limit_per_minute || null,
        s.enabled === false ? 0 : 1, s.respect_robots === false ? 0 : 1,
        s.requires_review ? 1 : 0,
        s.terms_notes || null, s.sensitive_category || null,
        s.default_indexing_status || 'draft', jstr(s.metadata), now(), now());
    return getContentSource(id);
}
function getContentSource(id)         { return row(db.get().prepare(`SELECT * FROM ai_content_sources WHERE id=?`).get(id), JSON_FIELDS.csource); }
function getContentSourceByKey(key)   { return row(db.get().prepare(`SELECT * FROM ai_content_sources WHERE source_key=?`).get(key), JSON_FIELDS.csource); }
function listContentSources(q) {
    q = q || {};
    const where = []; const args = [];
    if (q.category) { where.push('category=?'); args.push(q.category); }
    if (q.enabled != null) { where.push('enabled=?'); args.push(q.enabled ? 1 : 0); }
    const sql = `SELECT * FROM ai_content_sources ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY source_key ASC`;
    return db.get().prepare(sql).all(...args).map(r => row(r, JSON_FIELDS.csource));
}

// ── Ingestion jobs ────────────────────────────────────────────────
function createIngestionJob(j) {
    const id = uid('ij');
    db.get().prepare(`
        INSERT INTO ai_content_ingestion_jobs (id, source_id, job_type, target_product, status,
            input_json, trace_id, metadata_json, created_at)
        VALUES (?,?,?,?,?,?,?,?,?)
    `).run(id, j.source_id || null, j.job_type, j.target_product || null,
        j.status || 'queued', jstr(j.input || {}), j.trace_id || null,
        jstr(j.metadata), now());
    return getIngestionJob(id);
}
function getIngestionJob(id) { return row(db.get().prepare(`SELECT * FROM ai_content_ingestion_jobs WHERE id=?`).get(id), JSON_FIELDS.ijob); }
function updateIngestionJob(id, patch) {
    const cur = getIngestionJob(id); if (!cur) return null;
    const fields = []; const args = [];
    for (const k of ['status', 'output_json', 'error', 'started_at', 'completed_at']) {
        if (k in patch) {
            if (k === 'output_json') { fields.push('output_json=?'); args.push(jstr(patch[k])); }
            else { fields.push(`${k}=?`); args.push(patch[k]); }
        }
    }
    if (!fields.length) return cur;
    args.push(id);
    db.get().prepare(`UPDATE ai_content_ingestion_jobs SET ${fields.join(', ')} WHERE id=?`).run(...args);
    return getIngestionJob(id);
}
function listIngestionJobs(q) {
    q = q || {};
    const where = []; const args = [];
    if (q.status)         { where.push('status=?'); args.push(q.status); }
    if (q.source_id)      { where.push('source_id=?'); args.push(q.source_id); }
    if (q.target_product) { where.push('target_product=?'); args.push(q.target_product); }
    const limit = Math.min(parseInt(q.limit, 10) || 200, 1000);
    const sql = `SELECT * FROM ai_content_ingestion_jobs ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT ${limit}`;
    return db.get().prepare(sql).all(...args).map(r => row(r, JSON_FIELDS.ijob));
}

// ── Search documents (default local provider) ────────────────────
function searchDocCacheKey(indexKey, docType, docId) {
    return `${indexKey}:${docType}:${docId}`;
}
function indexSearchDocument(d) {
    const cacheKey = searchDocCacheKey(d.index_key, d.document_type, d.document_id);
    const existing = db.get().prepare(`SELECT * FROM search_documents WHERE cache_key=?`).get(cacheKey);
    if (existing) {
        const m = Object.assign({}, row(existing, JSON_FIELDS.sdoc), d);
        db.get().prepare(`
            UPDATE search_documents SET title=?, summary=?, body_text=?, canonical_url=?,
                tags_json=?, source_ids_json=?, freshness_score=?, quality_score=?,
                visibility=?, indexing_status=?, embedding_ref=?, metadata_json=?, updated_at=?
            WHERE cache_key=?
        `).run(m.title || null, m.summary || null, m.body_text || null,
            m.canonical_url || null,
            jstr(m.tags || m.tags_json || []),
            jstr(m.source_ids || m.source_ids_json || []),
            m.freshness_score == null ? null : m.freshness_score,
            m.quality_score == null ? null : m.quality_score,
            m.visibility || 'public', m.indexing_status || 'ready',
            m.embedding_ref || null,
            jstr(m.metadata_json || m.metadata || {}), now(), cacheKey);
        return getSearchDocument(cacheKey);
    }
    db.get().prepare(`
        INSERT INTO search_documents (cache_key, index_key, document_type, document_id, title,
            summary, body_text, canonical_url, tags_json, source_ids_json,
            freshness_score, quality_score, visibility, indexing_status, embedding_ref,
            metadata_json, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(cacheKey, d.index_key, d.document_type, d.document_id,
        d.title || null, d.summary || null, d.body_text || null,
        d.canonical_url || null, jstr(d.tags || []), jstr(d.source_ids || []),
        d.freshness_score == null ? null : d.freshness_score,
        d.quality_score == null ? null : d.quality_score,
        d.visibility || 'public', d.indexing_status || 'ready',
        d.embedding_ref || null, jstr(d.metadata), now(), now());
    return getSearchDocument(cacheKey);
}
function getSearchDocument(cacheKey) {
    return row(db.get().prepare(`SELECT * FROM search_documents WHERE cache_key=?`).get(cacheKey), JSON_FIELDS.sdoc);
}
function deleteSearchDocument(d) {
    const cacheKey = searchDocCacheKey(d.index_key, d.document_type, d.document_id);
    return db.get().prepare(`DELETE FROM search_documents WHERE cache_key=?`).run(cacheKey).changes;
}
function querySearchIndex(q) {
    q = q || {};
    const where = ['indexing_status != ?'];
    const args = ['blocked'];
    if (q.index_key)     { where.push('index_key=?');     args.push(q.index_key); }
    if (q.document_type) { where.push('document_type=?'); args.push(q.document_type); }
    if (q.visibility)    { where.push('visibility=?');    args.push(q.visibility); }
    if (q.q && String(q.q).trim()) {
        where.push('(LOWER(title) LIKE ? OR LOWER(summary) LIKE ? OR LOWER(body_text) LIKE ?)');
        const needle = '%' + String(q.q).toLowerCase() + '%';
        args.push(needle, needle, needle);
    }
    const limit = Math.min(parseInt(q.limit, 10) || 25, 100);
    const sql = `SELECT * FROM search_documents WHERE ${where.join(' AND ')} ORDER BY (quality_score IS NULL), quality_score DESC, updated_at DESC LIMIT ${limit}`;
    return db.get().prepare(sql).all(...args).map(r => row(r, JSON_FIELDS.sdoc));
}
function searchIndexStatus() {
    const totals = db.get().prepare(`SELECT indexing_status, COUNT(*) AS n FROM search_documents GROUP BY indexing_status`).all();
    return { provider: 'local-sqlite', totals };
}

// ── Cache ─────────────────────────────────────────────────────────
function cacheGet(key) {
    const r = db.get().prepare(`SELECT * FROM ai_cache WHERE cache_key=?`).get(key);
    if (!r) return null;
    if (r.expires_at && new Date(r.expires_at).getTime() < Date.now()) {
        db.get().prepare(`DELETE FROM ai_cache WHERE cache_key=?`).run(key);
        return null;
    }
    return Object.assign({}, r, { output: jparse(r.output_json, {}) });
}
function cachePut(key, route_key, prompt_hash, input_hash, output, ttlSeconds, metadata) {
    const expires = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000).toISOString() : null;
    db.get().prepare(`
        INSERT INTO ai_cache (cache_key, route_key, prompt_hash, input_hash, output_json,
            expires_at, created_at, metadata_json)
        VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(cache_key) DO UPDATE SET output_json=excluded.output_json,
            expires_at=excluded.expires_at, created_at=excluded.created_at,
            metadata_json=excluded.metadata_json
    `).run(key, route_key || null, prompt_hash || null, input_hash || null,
        jstr(output), expires, now(), jstr(metadata));
    return cacheGet(key);
}
function cacheDelete(key) { return db.get().prepare(`DELETE FROM ai_cache WHERE cache_key=?`).run(key).changes; }
function listCache(limit) {
    return db.get().prepare(`SELECT cache_key, route_key, expires_at, created_at FROM ai_cache ORDER BY created_at DESC LIMIT ?`).all(Math.min(limit || 100, 500));
}

// ── Quotas / usage ────────────────────────────────────────────────
function _quotaWindow(period) {
    const d = new Date();
    if (period === 'minute') { d.setSeconds(0, 0); return [d.toISOString(), new Date(d.getTime() + 60 * 1000).toISOString()]; }
    if (period === 'hour')   { d.setMinutes(0, 0, 0); return [d.toISOString(), new Date(d.getTime() + 60 * 60 * 1000).toISOString()]; }
    if (period === 'day')    { d.setHours(0, 0, 0, 0); return [d.toISOString(), new Date(d.getTime() + 24 * 60 * 60 * 1000).toISOString()]; }
    if (period === 'month')  { d.setDate(1); d.setHours(0, 0, 0, 0); const e = new Date(d); e.setMonth(e.getMonth() + 1); return [d.toISOString(), e.toISOString()]; }
    return [null, null];
}
function getOrInitQuota(actor_type, actor_id, namespace, period, defaults) {
    const [start, end] = _quotaWindow(period);
    let q = db.get().prepare(`
        SELECT * FROM ai_quotas WHERE actor_type=? AND actor_id=? AND service_namespace IS ? AND period=? AND window_start=?
    `).get(actor_type, actor_id, namespace || null, period, start);
    if (q) return q;
    const id = uid('q');
    db.get().prepare(`
        INSERT INTO ai_quotas (id, actor_type, actor_id, service_namespace, period,
            limit_requests, limit_tokens, limit_cost,
            used_requests, used_tokens, used_cost, window_start, window_end, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(id, actor_type, actor_id, namespace || null, period,
        defaults && defaults.limit_requests || null,
        defaults && defaults.limit_tokens || null,
        defaults && defaults.limit_cost || null,
        0, 0, 0, start, end, now());
    return db.get().prepare(`SELECT * FROM ai_quotas WHERE id=?`).get(id);
}
function incrementQuota(actor_type, actor_id, namespace, period, defaults, delta) {
    const q = getOrInitQuota(actor_type, actor_id, namespace, period, defaults);
    db.get().prepare(`
        UPDATE ai_quotas SET used_requests=used_requests+?, used_tokens=used_tokens+?,
            used_cost=used_cost+?, updated_at=? WHERE id=?
    `).run(delta.requests || 0, delta.tokens || 0, delta.cost || 0, now(), q.id);
    return db.get().prepare(`SELECT * FROM ai_quotas WHERE id=?`).get(q.id);
}
function listUsage(limit) {
    return db.get().prepare(`SELECT * FROM ai_quotas ORDER BY updated_at DESC LIMIT ?`).all(Math.min(limit || 100, 500));
}

// ── Audit ─────────────────────────────────────────────────────────
function audit(entry) {
    db.get().prepare(`
        INSERT INTO ai_audit (actor_type, actor_id, action, target_type, target_id, trace_id, metadata_json, created_at)
        VALUES (?,?,?,?,?,?,?,?)
    `).run(entry.actor_type || null, entry.actor_id || null, entry.action,
        entry.target_type || null, entry.target_id || null, entry.trace_id || null,
        jstr(entry.metadata), now());
}

module.exports = {
    uid, now,
    createProvider, getProvider, getProviderByKey, listProviders, updateProvider, disableProvider,
    createModel, getModel, listModels, getModelByKey, updateModel, disableModel,
    upsertRoute, getRoute, listRoutes, disableRoute,
    upsertTemplate, getTemplate, listTemplates,
    upsertWorkflow, getWorkflow, listWorkflows,
    createRun, getRun, listRuns, updateRun,
    logRequest, listRequests,
    attachSource, getSource, listSourcesForRun,
    upsertSeoContent, getSeoContent, listSeoContent, findDuplicateSeoByHash,
    upsertContentSource, getContentSource, getContentSourceByKey, listContentSources,
    createIngestionJob, getIngestionJob, updateIngestionJob, listIngestionJobs,
    indexSearchDocument, getSearchDocument, deleteSearchDocument, querySearchIndex, searchIndexStatus,
    cacheGet, cachePut, cacheDelete, listCache,
    getOrInitQuota, incrementQuota, listUsage,
    audit,
};
