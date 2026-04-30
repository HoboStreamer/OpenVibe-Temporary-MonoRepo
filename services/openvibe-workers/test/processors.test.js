'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createProcessorCatalog, describeProcessorCatalog } = require('../server/processors');

async function main() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-workers-processors-'));
    const bundleDir = path.join(tmp, 'bundle');
    const auditDir = path.join(bundleDir, 'audit');
    fs.mkdirSync(auditDir, { recursive: true });
    const cutoverPath = path.join(tmp, 'cutover-report.json');

    fs.writeFileSync(path.join(auditDir, 'validation-summary.json'), JSON.stringify({ ok: true, checks: [{}], mismatches: [], duplicates: [], missing_refs: [] }), 'utf8');
    fs.writeFileSync(path.join(auditDir, 'readiness-report.json'), JSON.stringify({ summary: { green: 3, yellow: 0, red: 0 }, manual_actions: [] }), 'utf8');
    fs.writeFileSync(cutoverPath, JSON.stringify({ gate: 'green', summary: { green: 2, yellow: 0, red: 0 }, artifacts: { validation_summary: true } }), 'utf8');

    const config = {
        serviceId: 'openvibe-workers',
        internalKey: 'test-internal',
        requestTimeoutMs: 250,
        mediaUrl: '',
        contentUrl: '',
        billingUrl: '',
        networkUrl: '',
        migrationBundleDir: bundleDir,
        migrationCutoverReportPath: cutoverPath,
    };

    const catalog = createProcessorCatalog(config);
    const described = describeProcessorCatalog(config);

    assert.strictEqual(described['clips.materialize'].available, false);
    assert.strictEqual(described['clips.materialize'].dependency.status, 'missing-config');
    assert.strictEqual(described['migration.bundle-verify'].available, true);

    const bundleResult = await catalog['migration.bundle-verify'].run({ data: {} });
    assert.strictEqual(bundleResult.ok, true);
    assert.strictEqual(bundleResult.gate, 'green');
    assert.strictEqual(bundleResult.validation.ok, true);
    assert.strictEqual(bundleResult.artifacts.validation_summary.exists, true);

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log('openvibe-workers processors test OK');
}

main().catch((error) => {
    console.error(error && error.stack || error);
    process.exit(1);
});
