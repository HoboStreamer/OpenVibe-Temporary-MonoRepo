'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { fetchProductionArtifacts } = require('../lib/production-fetch');
const { resolveFetchCliOptions } = require('../lib/production-fetch-options');

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function writeLocalFile(filePath, contents) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, contents, 'utf8');
}

function makeExecutor(commands, options = {}) {
    return function executor(command, args) {
        const rendered = [command].concat(args).join(' ');
        commands.push(rendered);

        if (command === 'scp') {
            const localPath = args[args.length - 1];
            writeLocalFile(localPath, `copied:${path.basename(localPath)}`);
            return { status: 0, stdout: '', stderr: '' };
        }

        if (command === 'rsync') {
            const localParent = args[args.length - 1];
            const remotePath = args[args.length - 2].split(':').slice(1).join(':');
            const localDir = path.join(localParent, path.basename(remotePath));
            writeLocalFile(path.join(localDir, 'example.bin'), 'media bytes');
            return { status: 0, stdout: '', stderr: '' };
        }

        if (command !== 'ssh') {
            return { status: 0, stdout: '', stderr: '' };
        }

        if (rendered.includes('printf') && rendered.includes('/opt/hobostreamer/data/hobostreamer.db')) {
            return { status: 0, stdout: '/opt/hobostreamer/data/hobostreamer.db\n', stderr: '' };
        }
        if (rendered.includes('printf') && rendered.includes('/opt/hobo/hobo-tools/data/hobo-tools.db')) {
            return { status: 0, stdout: '/opt/hobo/hobo-tools/data/hobo-tools.db\n', stderr: '' };
        }
        if (rendered.includes('printf') && rendered.includes('/opt/hobo/hobo-quest/data/hobo-quest.db')) {
            return { status: 0, stdout: '/opt/hobo/hobo-quest/data/hobo-quest.db\n', stderr: '' };
        }
        if (rendered.includes('printf') && rendered.includes('/opt/hobostreamer/data/analytics.db')) {
            return { status: 0, stdout: '/opt/hobostreamer/data/analytics.db\n', stderr: '' };
        }
        if (rendered.includes('printf') && rendered.includes('/opt/hobostreamer/data/rs-companion.db')) {
            return { status: 0, stdout: '/opt/hobostreamer/data/rs-companion.db\n', stderr: '' };
        }
        if (rendered.includes('printf') && rendered.includes('/opt/hobo-img/data/analytics.db')) {
            return { status: 0, stdout: '/opt/hobo-img/data/analytics.db\n', stderr: '' };
        }
        if (rendered.includes('/opt/hobostreamer') && rendered.includes('printf')) {
            return { status: 0, stdout: '/opt/hobostreamer\n', stderr: '' };
        }
        if (rendered.includes('/opt/hobo/hobo-tools') && rendered.includes('printf')) {
            return { status: 0, stdout: '/opt/hobo/hobo-tools\n', stderr: '' };
        }
        if (rendered.includes('/opt/hobo/hobo-quest') && rendered.includes('printf')) {
            return { status: 0, stdout: '/opt/hobo/hobo-quest\n', stderr: '' };
        }
        if (rendered.includes('find') && rendered.includes('data/vods')) {
            return { status: 0, stdout: 'clip.mp4\t42\t2026-04-28T12:00:00\t/opt/hobostreamer/data/vods/clip.mp4\n', stderr: '' };
        }
        if (rendered.includes('find') && rendered.includes('data/clips')) {
            return { status: 3, stdout: '', stderr: '' };
        }
        if (rendered.includes('find') && rendered.includes('data/thumbnails')) {
            return { status: 3, stdout: '', stderr: '' };
        }
        if (rendered.includes('find') && rendered.includes('data/avatars')) {
            return { status: 3, stdout: '', stderr: '' };
        }
        if (rendered.includes('find') && rendered.includes('data/emotes')) {
            return { status: 3, stdout: '', stderr: '' };
        }
        if (rendered.includes('find') && rendered.includes('data/pastes')) {
            return { status: 3, stdout: '', stderr: '' };
        }
        if (rendered.includes('find') && rendered.includes('data/media')) {
            return { status: 3, stdout: '', stderr: '' };
        }
        if (rendered.includes('.backup') || rendered.includes('cp ')) {
            const match = rendered.match(/printf '%s\\n' '([^']+)'/);
            const remoteSnapshot = match ? match[1] : '/tmp/openvibe-migration-test/snapshot.db';
            return { status: 0, stdout: `${remoteSnapshot}\n`, stderr: '' };
        }
        if (rendered.includes('rm -rf')) {
            return { status: 0, stdout: '', stderr: '' };
        }
        if (options.allowEmptyDiscovery) {
            return { status: 0, stdout: '', stderr: '' };
        }
        return { status: 0, stdout: '', stderr: '' };
    };
}

function testDefaultDryRunAndReportShape() {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-fetch-test-'));
    const commands = [];
    const executor = makeExecutor(commands);

    const report = fetchProductionArtifacts({
        host: 'hobo.tools',
        outDir,
        skipMedia: true,
        mediaMode: 'metadata-only',
        skipSshAgentSetup: true,
        sshOptions: '-o StrictHostKeyChecking=accept-new',
        executor,
        logger: { info() {}, warn() {}, error() {} },
    });

    assert.strictEqual(report.dry_run, true, 'expected dry-run by default');
    assert.strictEqual(report.confirm_used, false, 'expected confirm to be false by default');
    assert.strictEqual(report.hobostreamer.remote_root, '/opt/hobostreamer');
    assert.strictEqual(report.hobotools.remote_root, '/opt/hobo/hobo-tools');
    assert.strictEqual(report.hobostreamer.remote_db, '/opt/hobostreamer/data/hobostreamer.db');
    assert.strictEqual(report.hobotools.remote_db, '/opt/hobo/hobo-tools/data/hobo-tools.db');
    assert.ok(Array.isArray(report.commands_planned) && report.commands_planned.length > 0, 'expected planned commands');
    assert.ok(Array.isArray(report.commands_executed) && report.commands_executed.some((entry) => entry.startsWith('ssh ')), 'expected executed discovery commands');
    assert.ok(!commands.some((entry) => entry.startsWith('scp ')), 'dry-run should not copy files');
    assert.ok(fs.existsSync(path.join(outDir, 'production-fetch-report.json')));
    assert.ok(fs.existsSync(path.join(outDir, 'hobostreamer', 'manifest.json')));
    assert.ok(fs.existsSync(path.join(outDir, 'hobotools', 'manifest.json')));
    assert.ok(report.extra_databases.hobostreamer_analytics.remote_db, 'expected analytics db discovery');
    assert.ok(report.extra_databases.rs_companion.remote_db, 'expected rs-companion discovery');
}

function testConfirmRequiredForCopy() {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-fetch-test-'));
    assert.throws(() => {
        fetchProductionArtifacts({
            host: 'hobo.tools',
            outDir,
            dryRun: false,
            skipMedia: true,
            mediaMode: 'metadata-only',
            skipSshAgentSetup: true,
            executor: makeExecutor([]),
            logger: { info() {}, warn() {}, error() {} },
        });
    }, /without --confirm/);
}

function testConfirmedCopyAndCleanup() {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-fetch-test-'));
    const commands = [];
    const executor = makeExecutor(commands);

    const report = fetchProductionArtifacts({
        host: 'hobo.tools',
        outDir,
        confirm: true,
        skipMedia: true,
        mediaMode: 'metadata-only',
        skipSshAgentSetup: true,
        cleanupRemoteTemp: true,
        executor,
        logger: { info() {}, warn() {}, error() {} },
    });

    assert.strictEqual(report.dry_run, false, 'expected confirmed run to copy');
    assert.strictEqual(report.confirm_used, true);
    assert.strictEqual(report.cleanup_remote_temp, true);
    assert.ok(commands.some((entry) => entry.startsWith('scp ')), 'expected copied snapshots');
    assert.ok(commands.some((entry) => entry.includes('rm -rf')), 'expected cleanup command');
    assert.ok(report.db_snapshots.length >= 3, 'expected canonical db snapshots');
    assert.ok(report.checksums[report.hobostreamer.local_db], 'expected checksum for copied hobostreamer snapshot');
}

function testProductionPathsConfigSupport() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-fetch-config-'));
    const configPath = path.join(root, 'production-paths.json');
    fs.writeFileSync(configPath, JSON.stringify({
        host: 'hobo.tools',
        user: 'deploy',
        remoteHobostreamerRoot: '/opt/custom-hobostreamer',
        remoteHobostreamerDb: '/opt/custom-hobostreamer/data/hobostreamer.db',
        remoteAnalyticsDb: '/opt/custom-hobostreamer/data/analytics.db',
        confirm: true,
    }), 'utf8');

    const options = resolveFetchCliOptions({
        args: { productionPaths: configPath, dryRun: true },
        defaultOut: path.join(root, 'out'),
    });

    assert.strictEqual(options.host, 'hobo.tools');
    assert.strictEqual(options.user, 'deploy');
    assert.strictEqual(options.remoteHobostreamerRoot, '/opt/custom-hobostreamer');
    assert.strictEqual(options.remoteHobostreamerDb, '/opt/custom-hobostreamer/data/hobostreamer.db');
    assert.strictEqual(options.remoteHobostreamerAnalyticsDb, '/opt/custom-hobostreamer/data/analytics.db');
    assert.strictEqual(options.dryRun, true, 'CLI flags should override config confirm when dry-run is requested');
}

function main() {
    testDefaultDryRunAndReportShape();
    testConfirmRequiredForCopy();
    testConfirmedCopyAndCleanup();
    testProductionPathsConfigSupport();

    console.log('production fetch test passed');
}

main();
