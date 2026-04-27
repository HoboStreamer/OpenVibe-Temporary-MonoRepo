'use strict';

// openvibe-ai — run executor. Resolves provider/model from route, applies
// idempotency, cache, quota, fallback, and source attachment.

const crypto = require('crypto');
const model = require('./model');
const providers = require('./providers');
const { shapeWorkflowOutput } = require('./product-output');

const TASK_FEATURES = ['chat', 'generate', 'summarize', 'classify', 'extract', 'enrich', 'embed'];

function _hash(o) {
    return crypto.createHash('sha256').update(JSON.stringify(o == null ? {} : o)).digest('hex');
}
function _normTask(t) {
    if (!t || !TASK_FEATURES.includes(t)) return 'chat';
    return t;
}

function _ensureRoute(routeKey) {
    const r = model.getRoute(routeKey || 'default.chat');
    if (!r) {
        const fallback = model.getRoute('default.chat');
        if (!fallback) throw Object.assign(new Error('no default route configured'), { status: 500, code: 'EAINOROUTE' });
        return fallback;
    }
    if (r.status !== 'active') {
        throw Object.assign(new Error(`route disabled: ${routeKey}`), { status: 400, code: 'EAIROUTE' });
    }
    return r;
}

function _resolveProvider(providerId) {
    if (!providerId) return null;
    const p = model.getProvider(providerId);
    if (!p || p.status !== 'active') return null;
    return p;
}

async function _runTask(providerKey, task, args, options) {
    const adapter = providers.get(providerKey);
    if (!adapter || !adapter.supports(task)) {
        throw Object.assign(new Error(`provider ${providerKey} does not support ${task}`), { status: 400, code: 'EAIFEATURE' });
    }
    return adapter[task](Object.assign({}, args, options || {}));
}

async function executeRun(input) {
    const cfg = input.config;
    const events = input.events;
    const actor = input.actor || { actor_type: 'service', actor_id: 'openvibe-ai' };
    const namespace = input.namespace || 'system';
    const task = _normTask(input.task);
    const workflowKey = input.workflow_key || null;
    const templateKey = input.template_key || null;
    const noCache = !!input.no_cache;

    // Workflow / template resolution (optional — direct task calls bypass).
    let workflow = null;
    let template = null;
    if (workflowKey)  workflow = model.getWorkflow(workflowKey);
    if (templateKey)  template = model.getTemplate(templateKey);

    const routeKey = input.route_key
        || (template && template.default_route_key)
        || (workflow && workflow.default_route_key)
        || 'default.chat';
    const route = _ensureRoute(routeKey);

    // 1) idempotency: createRun returns {replayed:true} on UNIQUE collision
    const created = model.createRun({
        workflow_key: workflowKey, workflow_version: workflow && workflow.version,
        template_key: templateKey, route_key: route.route_key,
        status: 'queued',
        requested_by_type: actor.actor_type, requested_by_id: actor.actor_id,
        source_service: input.source_service || null,
        target_type: input.target_type || null, target_id: input.target_id || null,
        input: input.input || {},
        trace_id: input.trace_id || null,
        idempotency_key: input.idempotency_key || null,
        metadata: { task, namespace },
    });
    if (created.replayed) {
        return { run: created, replayed: true, output: created.output_json || {}, cached: false };
    }
    const runId = created.id;

    // 2) quota
    const quotaDefaults = {
        limit_requests: cfg.ai.perDayLimit,
        limit_tokens:   null,
        limit_cost:     null,
    };
    const quota = model.getOrInitQuota(actor.actor_type, actor.actor_id, namespace, 'day', quotaDefaults);
    if (quota.limit_requests && quota.used_requests >= quota.limit_requests) {
        model.updateRun(runId, { status: 'failed', error: 'quota_exceeded', completed_at: new Date().toISOString() });
        const err = new Error('ai quota exceeded');
        err.status = 429; err.code = 'EAIQUOTA';
        if (events) events.publishAi('ai.run.failed', { run_id: runId, route_key: route.route_key, status: 'failed' }, { actor_type: actor.actor_type, actor_id: actor.actor_id, payload: { reason: 'quota_exceeded' } });
        throw err;
    }

    // 3) cache lookup
    const promptHash = _hash({ route: route.route_key, task, args: input.input || {}, options: input.options || {} });
    const cacheKey = `${route.route_key}:${task}:${promptHash}`;
    if (!noCache) {
        const hit = model.cacheGet(cacheKey);
        if (hit) {
            model.updateRun(runId, { status: 'cached', output_json: hit.output, started_at: new Date().toISOString(), completed_at: new Date().toISOString() });
            model.incrementQuota(actor.actor_type, actor.actor_id, namespace, 'day', quotaDefaults, { requests: 1 });
            if (events) events.publishAi('ai.run.cached', { run_id: runId, route_key: route.route_key, status: 'cached' }, { actor_type: actor.actor_type, actor_id: actor.actor_id });
            return { run: model.getRun(runId), replayed: false, cached: true, output: hit.output };
        }
    }

    // 4) provider attempts (primary then fallback)
    model.updateRun(runId, { status: 'running', started_at: new Date().toISOString() });
    const primary  = _resolveProvider(route.primary_provider_id);
    const fallback = _resolveProvider(route.fallback_provider_id);
    const attempts = [];
    if (primary)  attempts.push({ provider: primary,  model_id: route.primary_model_id });
    if (fallback) attempts.push({ provider: fallback, model_id: route.fallback_model_id });
    if (!attempts.length) {
        // Pure fallback to stub if route has no providers wired
        const stub = model.getProviderByKey('stub');
        if (stub) attempts.push({ provider: stub, model_id: null });
    }

    let output = null;
    let usedAttemptIndex = -1;
    let lastErr = null;
    for (let i = 0; i < attempts.length; i++) {
        const { provider, model_id } = attempts[i];
        const started = Date.now();
        try {
            const args = Object.assign({}, input.input || {}, { _api_key_env: provider.api_key_env || null, model: model_id });
            output = await _runTask(provider.provider_key, task, args, input.options || {});
            usedAttemptIndex = i;
            model.logRequest({
                run_id: runId, provider_id: provider.id, model_id: model_id || null,
                route_key: route.route_key,
                status: i === 0 ? 'succeeded' : 'fallback_used',
                prompt_hash: promptHash,
                latency_ms: Date.now() - started, completed_at: new Date().toISOString(),
                metadata: { attempt: i },
            });
            break;
        } catch (e) {
            lastErr = e;
            model.logRequest({
                run_id: runId, provider_id: provider.id, model_id: model_id || null,
                route_key: route.route_key, status: 'failed',
                prompt_hash: promptHash, latency_ms: Date.now() - started,
                error: String(e && e.message || e), completed_at: new Date().toISOString(),
                metadata: { attempt: i },
            });
        }
    }

    if (output == null) {
        model.updateRun(runId, { status: 'failed', error: String(lastErr && lastErr.message || lastErr || 'unknown'), completed_at: new Date().toISOString() });
        if (events) events.publishAi('ai.run.failed', { run_id: runId, route_key: route.route_key, status: 'failed' }, { actor_type: actor.actor_type, actor_id: actor.actor_id });
        const err = new Error('ai run failed: ' + (lastErr && lastErr.message || 'all providers failed'));
        err.status = 502; err.code = 'EAIPROVIDER';
        throw err;
    }

    // 5) attach sources
    const attachedSources = [];
    if (Array.isArray(input.sources)) {
        for (const s of input.sources) {
            try {
                const attached = model.attachSource(Object.assign({}, s, { run_id: runId }));
                if (attached) attachedSources.push(attached);
            }
            catch (e) { /* tolerate bad source rows */ }
        }
    }

    output = shapeWorkflowOutput({
        workflowKey,
        workflow,
        route,
        input: input.input || {},
        output,
        sourceRecords: attachedSources,
        suppliedSources: input.sources || [],
        providerKey: usedAttemptIndex >= 0 && attempts[usedAttemptIndex] && attempts[usedAttemptIndex].provider
            ? attempts[usedAttemptIndex].provider.provider_key
            : null,
        config: cfg,
        targetType: input.target_type || null,
        targetId: input.target_id || null,
    });

    // 6) cache + quota + finalize
    model.cachePut(cacheKey, route.route_key, promptHash, _hash(input.input || {}), output, cfg.ai.cacheTtlSeconds, { task, namespace });
    model.incrementQuota(actor.actor_type, actor.actor_id, namespace, 'day', quotaDefaults, { requests: 1 });
    model.updateRun(runId, { status: 'succeeded', output_json: output, completed_at: new Date().toISOString() });
    if (events) events.publishAi('ai.run.succeeded', { run_id: runId, route_key: route.route_key, status: 'succeeded' }, { actor_type: actor.actor_type, actor_id: actor.actor_id, payload: { fallback_used: usedAttemptIndex > 0 } });

    return { run: model.getRun(runId), replayed: false, cached: false, output, fallback_used: usedAttemptIndex > 0 };
}

module.exports = { executeRun };
