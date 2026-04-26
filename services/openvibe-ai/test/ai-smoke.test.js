'use strict';

// openvibe-ai smoke test — exercises the in-process app against an isolated
// SQLite DB. Set env BEFORE requiring config/db.

const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const assert = require('assert');

const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-ai-'));
process.env.NODE_ENV = 'development';
process.env.PORT = '0';
process.env.DB_PATH = path.join(tmpdir, 'ai.db');
process.env.OPENVIBE_EVENTS_URL = 'http://127.0.0.1:1';
process.env.INTERNAL_API_KEY = 'test-internal-key';

const config = require('../server/config');
const db = require('../server/db');
const seeds = require('../server/seeds');
const model = require('../server/model');
const seo = require('../server/seo');
const runner = require('../server/runner');
const sources = require('../server/sources');

function _req(server, method, urlPath, body, headers) {
    return new Promise((resolve, reject) => {
        const data = body == null ? null : JSON.stringify(body);
        const port = server.address().port;
        const req = http.request({
            host: '127.0.0.1', port, method, path: urlPath,
            headers: Object.assign({
                'content-type': 'application/json',
                'content-length': data ? Buffer.byteLength(data) : 0,
                'x-internal-key': 'test-internal-key',
                'x-openvibe-service': 'test-suite',
            }, headers || {}),
        }, res => {
            let buf = '';
            res.on('data', c => { buf += c; });
            res.on('end', () => {
                let json = null;
                try { json = JSON.parse(buf); } catch { json = buf; }
                resolve({ status: res.statusCode, body: json, headers: res.headers });
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

async function main() {
    console.log('[ai-smoke] tmp db:', config.db.path);
    db.init(config.db.path);
    const counts = seeds.seedAll();
    assert.ok(counts.providers >= 1, 'providers seeded');
    assert.ok(counts.routes >= 5, 'routes seeded');
    assert.ok(counts.workflows >= 10, 'workflows seeded');
    assert.ok(counts.sources >= 5, 'sources seeded');
    console.log('[ai-smoke] seeds:', counts);

    // Direct runner: deterministic stub run + idempotency replay
    const idem = 'idem-test-1';
    const r1 = await runner.executeRun({
        config, events: null, actor: { actor_type: 'service', actor_id: 'test-suite' },
        namespace: 'wiki', workflow_key: 'wiki.generate_space',
        task: 'generate', input: { topic: 'OpenVibe' }, idempotency_key: idem,
    });
    assert.ok(!r1.replayed, 'first run not replayed');
    assert.ok(r1.run && r1.run.id, 'run created');
    assert.ok(r1.output && (r1.output.text || typeof r1.output === 'object'), 'has output');
    const r2 = await runner.executeRun({
        config, events: null, actor: { actor_type: 'service', actor_id: 'test-suite' },
        namespace: 'wiki', workflow_key: 'wiki.generate_space',
        task: 'generate', input: { topic: 'OpenVibe' }, idempotency_key: idem,
    });
    assert.ok(r2.replayed, 'second run replayed via idempotency');
    assert.strictEqual(r2.run.id, r1.run.id, 'replay returns same run id');

    // Cache hit on identical (non-idempotent) call
    const c1 = await runner.executeRun({
        config, events: null, actor: { actor_type: 'service', actor_id: 'test-suite' },
        namespace: 'system', task: 'generate', input: { prompt: 'hello world' },
    });
    const c2 = await runner.executeRun({
        config, events: null, actor: { actor_type: 'service', actor_id: 'test-suite' },
        namespace: 'system', task: 'generate', input: { prompt: 'hello world' },
    });
    assert.ok(c2.cached, 'second identical task served from cache');

    // Quota: drop limit to 1 then attempt
    const provider = model.getProviderByKey('stub');
    assert.ok(provider, 'stub provider present');
    config.ai.perDayLimit = 1;
    let threw = false;
    try {
        await runner.executeRun({
            config, events: null, actor: { actor_type: 'service', actor_id: 'quota-test' },
            namespace: 'system', task: 'generate', input: { prompt: 'qtest-' + Date.now() },
        });
        await runner.executeRun({
            config, events: null, actor: { actor_type: 'service', actor_id: 'quota-test' },
            namespace: 'system', task: 'generate', input: { prompt: 'qtest2-' + Date.now() },
        });
    } catch (e) {
        threw = e && e.code === 'EAIQUOTA';
    }
    assert.ok(threw, 'quota limit enforced');
    config.ai.perDayLimit = 20000; // restore

    // SEO: indexability gate (thin, sufficient, duplicate, stub-in-prod)
    const thin = seo.evaluateIndexability({ content_type: 'wiki_page', body: 'short', source_count: 0, generated_by: 'ai', provider_key: 'stub', production_mode: false });
    assert.strictEqual(thin.indexing_status, 'noindex', 'thin → noindex');
    assert.ok(thin.reasons.find(x => x.startsWith('thin_content')), 'thin reason present');

    const longBody = 'word '.repeat(800);
    const ok = seo.evaluateIndexability({
        content_type: 'wiki_page', body: longBody, word_count: 800, source_count: 3,
        generated_by: 'ai', provider_key: 'stub', production_mode: false,
    });
    assert.strictEqual(ok.indexing_status, 'ready', 'sufficient + dev-stub allowed');

    const prodStub = seo.evaluateIndexability({
        content_type: 'wiki_page', word_count: 800, source_count: 3,
        generated_by: 'ai', provider_key: 'stub', production_mode: true,
    });
    assert.strictEqual(prodStub.indexing_status, 'noindex', 'stub-in-production noindex');

    const dupe = seo.evaluateIndexability({
        content_type: 'wiki_page', word_count: 800, source_count: 3,
        generated_by: 'ai', provider_key: 'openai', production_mode: true,
        duplicate_hash_seen: true, canonical_url: '',
    });
    assert.strictEqual(dupe.indexing_status, 'noindex', 'duplicate without canonical noindex');

    // JSON-LD never fabricates
    const review = seo.generateStructuredData({ type: 'Review', fields: { itemReviewed: 'X', reviewBody: 'good' } });
    assert.ok(review && !review.reviewRating, 'Review without ratingValue omits reviewRating');
    const offerNoPrice = seo.generateStructuredData({ type: 'Offer', fields: { url: 'http://x' } });
    assert.strictEqual(offerNoPrice, null, 'Offer without price returns null (no fabrication)');

    // Sitemap excludes indexable=false rows
    const sitemap = seo.generateSitemap({ entries: [
        { loc: 'https://x/a', indexable: true },
        { loc: 'https://x/b', indexable: false },
    ]});
    assert.ok(sitemap.includes('https://x/a'), 'sitemap includes indexable url');
    assert.ok(!sitemap.includes('https://x/b'), 'sitemap excludes noindex url');

    // Source registry: stub adapter test + disabled fetch rejection (via direct adapter)
    const src = model.getContentSourceByKey('rss_news_generic');
    assert.ok(src, 'rss source present');
    const adapter = sources.adapterFor(src);
    const test = await adapter.test(src);
    assert.ok(test.ok, 'stub adapter test ok');

    // Ingestion job lifecycle
    const job = model.createIngestionJob({ source_id: src.id, job_type: 'fetch' });
    assert.strictEqual(job.status, 'queued', 'job queued');
    const out = await adapter.fetch(src, {});
    const done = model.updateIngestionJob(job.id, { status: 'succeeded', output_json: out, completed_at: new Date().toISOString() });
    assert.strictEqual(done.status, 'succeeded', 'job succeeded');

    // Search index + query + delete
    const doc = model.indexSearchDocument({
        index_key: 'wiki', document_type: 'wiki_page', document_id: 'p1',
        title: 'OpenVibe Wiki', body_text: 'about openvibe', visibility: 'public',
    });
    assert.ok(doc.cache_key, 'doc indexed');
    const q = model.querySearchIndex({ q: 'openvibe' });
    assert.ok(q.length >= 1, 'query returns indexed doc');
    const n = model.deleteSearchDocument({ index_key: 'wiki', document_type: 'wiki_page', document_id: 'p1' });
    assert.strictEqual(n, 1, 'doc deleted');

    // Provider responses must never include raw API key values — only api_key_env
    const { buildApp } = require('../server/index');
    // Need a fresh app since we already initialized DB; reuse same DB.
    const { app } = buildApp();
    const server = app.listen(0);
    try {
        const provs = await _req(server, 'GET', '/api/v1/ai/providers');
        assert.strictEqual(provs.status, 200);
        for (const p of provs.body.providers) {
            assert.ok(!('api_key' in p),  'no api_key value returned');
            assert.ok(!('apiKey'  in p),  'no apiKey value returned');
            assert.ok(!('token'   in p),  'no token value returned');
        }
        const status = await _req(server, 'GET', '/api/v1/ai/status');
        assert.strictEqual(status.status, 200);
        assert.strictEqual(status.body.canonical_host, 'ai.openvibe.network');

        const slug = await _req(server, 'POST', '/api/v1/ai/seo/slug', { text: 'Hello, World! 2024' });
        assert.strictEqual(slug.body.slug, 'hello-world-2024');

        const trade = await _req(server, 'POST', '/api/v1/ai/trade/summarize-market-context', {
            input: { asset: 'BTC' }, idempotency_key: 'trade-' + Date.now(),
        });
        assert.strictEqual(trade.status, 200);
        assert.strictEqual(trade.body.output.not_financial_advice, true, 'trade output marked not financial advice');
    } finally {
        server.close();
    }

    console.log('[ai-smoke] OK');
}

main().catch(e => { console.error('[ai-smoke] FAIL:', e && e.stack || e); process.exit(1); });
