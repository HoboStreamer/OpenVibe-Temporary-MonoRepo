'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { auditReferences, summaryMarkdown, classify } = require('../lib/hobo-audit');

function withTempDir(label, fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${label}-`));
    try { fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

function writeFile(root, rel, content) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
}

withTempDir('hobo-audit', (root) => {
    writeFile(root, 'README.md', '# Refers to hobo.tools');
    writeFile(root, 'docs/legacy.md', 'See hobostreamer.com');
    writeFile(root, 'compat/bridge.js', "// uses HOBO_TOOLS_URL\n");
    writeFile(root, 'HoboReposToMigrateFrom/HoboApp/x.js', "module.exports = 'hobotools'");
    writeFile(root, 'data/migrations/audit/old-summary.md', '- HoboStreamer');
    writeFile(root, 'services/openvibe-network/server/proxy.js', '// federation to hobo.tools');
    writeFile(root, 'services/openvibe-network/test/foo.test.js', '// test for hobo.tools fixture');
    writeFile(root, 'services/openvibe-network/server/runtime.js', "require('hobotools')");
    // No-hobo file
    writeFile(root, 'services/openvibe-network/server/clean.js', "module.exports = {};\n");

    const { summary, occurrences } = auditReferences({ root });
    assert.ok(summary.total_occurrences > 0, 'expected occurrences');
    assert.ok(summary.total_files >= 6, 'expected several files matched');

    const byClass = summary.by_classification;
    assert.ok(byClass['migration-source'] >= 1, 'migration-source classified');
    assert.ok(byClass['archive'] >= 1, 'archive classified');
    assert.ok(byClass['documentation'] >= 1, 'documentation classified');
    assert.ok(byClass['legacy-compatibility'] >= 1, 'legacy-compatibility classified');
    assert.ok(byClass['test-fixture'] >= 1, 'test-fixture classified');

    const md = summaryMarkdown(summary);
    assert.match(md, /Hobo reference audit/);
    assert.match(md, /By classification/);

    // classify() handles a few common paths
    assert.strictEqual(classify('docs/openvibe/foo.md'), 'documentation');
    assert.strictEqual(classify('compat/hobo/bridge.js'), 'legacy-compatibility');
    assert.strictEqual(classify('HoboReposToMigrateFrom/HoboApp/x.js'), 'migration-source');
    assert.strictEqual(classify('data/migrations/audit/x.json'), 'archive');

    assert.ok(occurrences.every((o) => o.file && o.line > 0 && o.term), 'occurrences shaped');
    console.log('hobo-reference-audit: OK');
});
