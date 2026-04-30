'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createProcessorCatalog, describeProcessorCatalog } = require('../server/processors');

async function main() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-workers-native-migration-'));
    const bundleDir = path.join(tmp, 'bundle');
    const auditDir = path.join(bundleDir, 'audit');
    fs.mkdirSync(auditDir, { recursive: true });
    const cutoverPath = path.join(tmp, 'cutover-report.json');

    const baseConfig = {
        serviceId: 'openvibe-workers',
        internalKey: 'test-internal',
        requestTimeoutMs: 250,
        workerBackendMode: 'native',
        mediaUrl: '',
        contentUrl: '',
        billingUrl: '',
        networkUrl: '',
        migrationBundleDir: bundleDir,
        migrationCutoverReportPath: cutoverPath,
    };

    // Missing artifacts → describe reports unavailable; run yields red gate.
    const initialDescribed = describeProcessorCatalog(baseConfig);
    assert.strictEqual(initialDescribed['migration.bundle-verify'].available, false);
    assert.strictEqual(initialDescribed['migration.bundle-verify'].dependency.status, 'missing-artifact');
    assert.strictEqual(initialDescribed['migration.bundle-verify'].dependency.fallback_backend, null);

    // Populate artifacts
    fs.writeFileSync(path.join(auditDir, 'validation-summary.json'), JSON.stringify({
        ok: true, checks: [{}], mismatches: [], duplicates: [], missing_refs: [],
    }), 'utf8');
    fs.writeFileSync(path.join(auditDir, 'readiness-report.json'), JSON.stringify({
        summary: { green: 3, yellow: 0, red: 0 }, manual_actions: [],
    }), 'utf8');
    fs.writeFileSync(cutoverPath, JSON.stringify({
        gate: 'green', summary: { green: 2, yellow: 0, red: 0 }, artifacts: { validation_summary: true },
    }), 'utf8');

    const ready = describeProcessorCatalog(baseConfig);
    assert.strictEqual(ready['migration.bundle-verify'].available, true);
    assert.strictEqual(ready['migration.bundle-verify'].backend, 'native');
    assert.strictEqual(ready['migration.bundle-verify'].dependency.backend, 'migration-bundle-verifier');

    const catalog = createProcessorCatalog(baseConfig);
    const result = await catalog['migration.bundle-verify'].run({ data: {} });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.gate, 'green');
    assert.strictEqual(result.backend, 'migration-bundle-verifier');
    assert.strictEqual(result.artifacts.validation_summary.exists, true);

    // Override paths via payload
    const customCutover = path.join(tmp, 'cutover-yellow.json');
    fs.writeFileSync(customCutover, JSON.stringify({
        gate: 'yellow', summary: { green: 1, yellow: 1, red: 0 },
    }), 'utf8');
    const overridden = await catalog['migration.bundle-verify'].run({
        data: { cutover_report_path: customCutover },
    });
    assert.strictEqual(overridden.gate, 'yellow');

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log('openvibe-workers native-migration test OK');
}

main().catch((error) => {
    console.error(error && error.stack || error);
    process.exit(1);
});
