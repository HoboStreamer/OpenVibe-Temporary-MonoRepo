'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { fetchProductionArtifacts } = require('../lib/production-fetch');

function main() {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-fetch-test-'));
    const commands = [];

    function executor(command, args) {
        commands.push([command].concat(args).join(' '));
        if (command !== 'ssh') {
            return { status: 0, stdout: '', stderr: '' };
        }
        const rendered = args.join(' ');
        if (rendered.includes('hobostreamer.db')) {
            return { status: 0, stdout: '/opt/hobostreamer/data/hobostreamer.db\n', stderr: '' };
        }
        if (rendered.includes('hobo-tools.db')) {
            return { status: 0, stdout: '/opt/hobo/hobo-tools/data/hobo-tools.db\n', stderr: '' };
        }
        if (rendered.includes('/opt/hobostreamer')) {
            return { status: 0, stdout: '/opt/hobostreamer\n', stderr: '' };
        }
        if (rendered.includes('/opt/hobo/hobo-tools')) {
            return { status: 0, stdout: '/opt/hobo/hobo-tools\n', stderr: '' };
        }
        return { status: 0, stdout: '', stderr: '' };
    }

    const report = fetchProductionArtifacts({
        host: 'hobo.tools',
        outDir,
        dryRun: true,
        skipMedia: true,
        mediaMode: 'metadata-only',
        sshOptions: '-o StrictHostKeyChecking=accept-new',
        executor,
        logger: { info() {}, warn() {}, error() {} },
    });

    assert.strictEqual(report.hobostreamer.remote_root, '/opt/hobostreamer');
    assert.strictEqual(report.hobotools.remote_root, '/opt/hobo/hobo-tools');
    assert.strictEqual(report.hobostreamer.remote_db, '/opt/hobostreamer/data/hobostreamer.db');
    assert.strictEqual(report.hobotools.remote_db, '/opt/hobo/hobo-tools/data/hobo-tools.db');
    assert.ok(commands.some((entry) => entry.startsWith('ssh ')), 'expected ssh discovery commands to be planned');
    assert.ok(!commands.some((entry) => entry.startsWith('scp ')), 'dry-run should not copy files');
    assert.ok(fs.existsSync(path.join(outDir, 'production-fetch-report.json')));
    assert.ok(fs.existsSync(path.join(outDir, 'hobostreamer', 'manifest.json')));
    assert.ok(fs.existsSync(path.join(outDir, 'hobotools', 'manifest.json')));

    console.log('production fetch test passed');
}

main();
