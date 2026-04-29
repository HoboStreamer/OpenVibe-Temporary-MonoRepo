'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const { ensureDir, writeJson } = require('./common');

const DEFAULT_DISCOVERY = {
    hobostreamerRoots: [
        '/opt/hobostreamer',
        '/srv/hobostreamer',
        '/var/www/hobostreamer',
        '~/hobostreamer',
    ],
    hobotoolsRoots: [
        '/opt/hobo/hobo-tools',
        '/opt/hobo-tools',
        '/srv/hobo-tools',
        '~/hobo-tools',
        '~/HoboApp/hobo-tools',
    ],
    hoboquestRoots: [
        '/opt/hobo/hobo-quest',
        '/opt/hobo-quest',
        '/srv/hobo-quest',
        '~/hobo-quest',
        '~/HoboApp/hobo-quest',
    ],
    hobostreamerDbCandidates: [
        '/opt/hobostreamer/data/hobostreamer.db',
        '/srv/hobostreamer/data/hobostreamer.db',
        '/var/www/hobostreamer/data/hobostreamer.db',
        '~/hobostreamer/data/hobostreamer.db',
    ],
    hobostreamerAnalyticsDbCandidates: [
        '/opt/hobostreamer/data/analytics.db',
        '/srv/hobostreamer/data/analytics.db',
        '/var/www/hobostreamer/data/analytics.db',
        '~/hobostreamer/data/analytics.db',
    ],
    rsCompanionDbCandidates: [
        '/opt/hobostreamer/data/rs-companion.db',
        '/srv/hobostreamer/data/rs-companion.db',
        '/var/www/hobostreamer/data/rs-companion.db',
        '~/hobostreamer/data/rs-companion.db',
    ],
    hobotoolsDbCandidates: [
        '/opt/hobo/hobo-tools/data/hobo-tools.db',
        '/opt/hobo-tools/data/hobo-tools.db',
        '/srv/hobo-tools/data/hobo-tools.db',
        '~/hobo-tools/data/hobo-tools.db',
        '~/HoboApp/hobo-tools/data/hobo-tools.db',
    ],
    hoboquestDbCandidates: [
        '/opt/hobo/hobo-quest/data/hobo-quest.db',
        '/opt/hobo-quest/data/hobo-quest.db',
        '/srv/hobo-quest/data/hobo-quest.db',
        '~/hobo-quest/data/hobo-quest.db',
        '~/HoboApp/hobo-quest/data/hobo-quest.db',
    ],
    hoboImgAnalyticsDbCandidates: [
        '/opt/hobo-img/data/analytics.db',
        '/srv/hobo-img/data/analytics.db',
        '~/HoboApp/hobo-img/data/analytics.db',
    ],
    hoboDocsAnalyticsDbCandidates: [
        '/opt/hobo/hobo-docs/data/analytics.db',
        '/opt/hobo-docs/data/analytics.db',
        '/srv/hobo-docs/data/analytics.db',
        '~/HoboApp/hobo-docs/data/analytics.db',
    ],
    hoboTextAnalyticsDbCandidates: [
        '/opt/hobo/hobo-text/data/analytics.db',
        '/opt/hobo-text/data/analytics.db',
        '/srv/hobo-text/data/analytics.db',
        '~/HoboApp/hobo-text/data/analytics.db',
    ],
    hoboAudioAnalyticsDbCandidates: [
        '/opt/hobo/hobo-audio/data/analytics.db',
        '/opt/hobo-audio/data/analytics.db',
        '/srv/hobo-audio/data/analytics.db',
        '~/HoboApp/hobo-audio/data/analytics.db',
    ],
    hoboMapsAnalyticsDbCandidates: [
        '/opt/hobo-maps/data/analytics.db',
        '/srv/hobo-maps/data/analytics.db',
        '~/HoboApp/hobo-maps/data/analytics.db',
    ],
    hoboFoodAnalyticsDbCandidates: [
        '/opt/hobo-food/data/analytics.db',
        '/srv/hobo-food/data/analytics.db',
        '~/HoboApp/hobo-food/data/analytics.db',
    ],
    hoboYtAnalyticsDbCandidates: [
        '/opt/hobo-yt/data/analytics.db',
        '/srv/hobo-yt/data/analytics.db',
        '~/HoboApp/hobo-yt/data/analytics.db',
    ],
    hobostreamerMediaDirs: [
        'data/vods',
        'data/clips',
        'data/thumbnails',
        'data/avatars',
        'data/emotes',
        'data/pastes',
        'data/media',
    ],
    safeConfigCandidates: [
        'README.md',
        'package.json',
        'server/config.js',
        'deploy/README.md',
        '.env',
        '.env.production',
    ],
};

const EXTRA_DATABASE_TARGETS = Object.freeze({
    hobostreamerAnalytics: {
        optionKey: 'remoteHobostreamerAnalyticsDb',
        localPathSegments: ['hobostreamer', 'data', 'analytics.db'],
        reportKey: 'hobostreamer_analytics',
        snapshotLabel: 'hobostreamer-analytics',
        description: 'HoboStreamer analytics SQLite database',
        candidatesKey: 'hobostreamerAnalyticsDbCandidates',
    },
    rsCompanion: {
        optionKey: 'remoteRsCompanionDb',
        localPathSegments: ['hobostreamer', 'data', 'rs-companion.db'],
        reportKey: 'rs_companion',
        snapshotLabel: 'rs-companion',
        description: 'RobotStreamer / rs-companion SQLite database',
        candidatesKey: 'rsCompanionDbCandidates',
    },
    hoboImgAnalytics: {
        optionKey: 'remoteHoboImgAnalyticsDb',
        localPathSegments: ['hobo-img', 'data', 'analytics.db'],
        reportKey: 'hobo_img_analytics',
        snapshotLabel: 'hobo-img-analytics',
        description: 'hobo-img analytics SQLite database',
        candidatesKey: 'hoboImgAnalyticsDbCandidates',
    },
    hoboDocsAnalytics: {
        optionKey: 'remoteHoboDocsAnalyticsDb',
        localPathSegments: ['hobo-docs', 'data', 'analytics.db'],
        reportKey: 'hobo_docs_analytics',
        snapshotLabel: 'hobo-docs-analytics',
        description: 'hobo-docs analytics SQLite database',
        candidatesKey: 'hoboDocsAnalyticsDbCandidates',
    },
    hoboTextAnalytics: {
        optionKey: 'remoteHoboTextAnalyticsDb',
        localPathSegments: ['hobo-text', 'data', 'analytics.db'],
        reportKey: 'hobo_text_analytics',
        snapshotLabel: 'hobo-text-analytics',
        description: 'hobo-text analytics SQLite database',
        candidatesKey: 'hoboTextAnalyticsDbCandidates',
    },
    hoboAudioAnalytics: {
        optionKey: 'remoteHoboAudioAnalyticsDb',
        localPathSegments: ['hobo-audio', 'data', 'analytics.db'],
        reportKey: 'hobo_audio_analytics',
        snapshotLabel: 'hobo-audio-analytics',
        description: 'hobo-audio analytics SQLite database',
        candidatesKey: 'hoboAudioAnalyticsDbCandidates',
    },
    hoboMapsAnalytics: {
        optionKey: 'remoteHoboMapsAnalyticsDb',
        localPathSegments: ['hobo-maps', 'data', 'analytics.db'],
        reportKey: 'hobo_maps_analytics',
        snapshotLabel: 'hobo-maps-analytics',
        description: 'hobo-maps analytics SQLite database',
        candidatesKey: 'hoboMapsAnalyticsDbCandidates',
    },
    hoboFoodAnalytics: {
        optionKey: 'remoteHoboFoodAnalyticsDb',
        localPathSegments: ['hobo-food', 'data', 'analytics.db'],
        reportKey: 'hobo_food_analytics',
        snapshotLabel: 'hobo-food-analytics',
        description: 'hobo-food analytics SQLite database',
        candidatesKey: 'hoboFoodAnalyticsDbCandidates',
    },
    hoboYtAnalytics: {
        optionKey: 'remoteHoboYtAnalyticsDb',
        localPathSegments: ['hobo-yt', 'data', 'analytics.db'],
        reportKey: 'hobo_yt_analytics',
        snapshotLabel: 'hobo-yt-analytics',
        description: 'hobo-yt analytics SQLite database',
        candidatesKey: 'hoboYtAnalyticsDbCandidates',
    },
});

function parseSshOptions(value) {
    if (!value) return [];

    const tokens = [];
    const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let match = pattern.exec(String(value));
    while (match) {
        tokens.push(match[1] || match[2] || match[3]);
        match = pattern.exec(String(value));
    }
    return tokens;
}

function shellQuote(value) {
    return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function renderCommand(command, args) {
    return [command].concat((args || []).map((arg) => {
        const value = String(arg);
        return /[\s'"$`\\]/.test(value) ? shellQuote(value) : value;
    })).join(' ');
}

function sha256ForString(value) {
    return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function sha256ForFile(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function digestFile(filePath) {
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        return null;
    }
    return {
        size_bytes: fs.statSync(filePath).size,
        sha256: sha256ForFile(filePath),
    };
}

function recordPlannedCommand(trace, command, args) {
    trace.planned.push(renderCommand(command, args));
}

function createTracingExecutor(executor, trace) {
    return (command, args, options) => {
        trace.executed.push(renderCommand(command, args));
        return executor(command, args, options);
    };
}

function buildRemoteCommandArgs(connection, script) {
    return [
        ...buildSshOptions(connection),
        remoteTarget(connection),
        `sh -lc ${shellQuote(script)}`,
    ];
}

function remoteTarget(options) {
    return options.user ? `${options.user}@${options.host}` : options.host;
}

function defaultExecutor(command, args, options) {
    const result = spawnSync(command, args, {
        encoding: 'utf8',
        stdio: 'pipe',
        ...options,
    });
    return {
        status: result.status == null ? 1 : result.status,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
    };
}

function runCommand(executor, command, args, options) {
    const result = executor(command, args, options);
    return {
        command,
        args,
        status: result.status,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
    };
}

function runChecked(executor, command, args, options) {
    const result = runCommand(executor, command, args, options);
    if (result.status !== 0 && !(options && options.allowFailure)) {
        const rendered = [command].concat(args).join(' ');
        throw new Error(`${rendered} failed with status ${result.status}: ${result.stderr || result.stdout || 'no output'}`);
    }
    return result;
}

function runRemote(executor, connection, script, options) {
    const args = buildRemoteCommandArgs(connection, script);
    return runChecked(executor, 'ssh', args, options);
}

function remotePathJoin(root, relativePath) {
    const cleanRoot = String(root || '').replace(/\/+$/, '');
    const cleanRelative = String(relativePath || '').replace(/^\/+/, '');
    if (!cleanRoot) return cleanRelative;
    if (!cleanRelative) return cleanRoot;
    return `${cleanRoot}/${cleanRelative}`;
}

function uniq(values) {
    return Array.from(new Set((values || []).filter(Boolean)));
}

function parseLines(stdout) {
    return String(stdout || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
}

function expandHome(filePath) {
    if (!filePath) return filePath;
    if (filePath.startsWith('~')) {
        return path.join(process.env.HOME || '', filePath.slice(1));
    }
    return filePath;
}

function parseSshAgentOutput(output) {
    const env = {};
    for (const line of String(output).split(/;\s*/)) {
        const match = line.match(/^(SSH_AUTH_SOCK|SSH_AGENT_PID)=([^;]+)/);
        if (match) {
            env[match[1]] = match[2];
        }
    }
    return env;
}

function resolveSshKeyFromConfig(host) {
    if (!host) return null;
    const result = spawnSync('ssh', ['-G', host], { encoding: 'utf8' });
    if (result.status !== 0 || !result.stdout) {
        return null;
    }
    const lines = String(result.stdout).split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parts = trimmed.split(/\s+/);
        if (parts[0] !== 'identityfile') continue;
        const candidate = expandHome(parts.slice(1).join(' '));
        if (candidate && fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return null;
}

function hasSshAgent() {
    return Boolean(process.env.SSH_AUTH_SOCK);
}

function startSshAgent() {
    const result = spawnSync('ssh-agent', ['-s'], { encoding: 'utf8' });
    if (result.status !== 0) {
        throw new Error(`ssh-agent failed: ${result.stderr || result.stdout || 'no output'}`);
    }
    const env = parseSshAgentOutput(result.stdout);
    if (!env.SSH_AUTH_SOCK) {
        throw new Error('ssh-agent did not return SSH_AUTH_SOCK');
    }
    process.env.SSH_AUTH_SOCK = env.SSH_AUTH_SOCK;
    if (env.SSH_AGENT_PID) {
        process.env.SSH_AGENT_PID = env.SSH_AGENT_PID;
    }
}

function isSshKeyLoaded(sshKey) {
    const expandedKey = expandHome(sshKey);
    if (!hasSshAgent() || !fs.existsSync(expandedKey)) {
        return false;
    }
    const publicKeyResult = spawnSync('ssh-keygen', ['-y', '-f', expandedKey], { encoding: 'utf8' });
    if (publicKeyResult.status !== 0) {
        return false;
    }
    const publicKey = String(publicKeyResult.stdout || '').trim();
    const listResult = spawnSync('ssh-add', ['-L'], { encoding: 'utf8', stdio: 'pipe' });
    if (listResult.status !== 0) {
        return false;
    }
    return String(listResult.stdout || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .some((line) => line === publicKey);
}

function addSshKeyToAgent(sshKey) {
    const expandedKey = expandHome(sshKey);
    if (!fs.existsSync(expandedKey)) {
        throw new Error(`SSH key not found: ${sshKey}`);
    }
    const addResult = spawnSync('ssh-add', [expandedKey], { stdio: 'inherit' });
    if (addResult.status !== 0) {
        throw new Error(`ssh-add failed for ${sshKey}`);
    }
}

function ensureSshAgentAndKey(connection) {
    if (!connection.sshKey) {
        connection.sshKey = resolveSshKeyFromConfig(connection.host) || null;
    }
    if (!connection.sshKey) {
        return;
    }
    if (!hasSshAgent()) {
        startSshAgent();
    }
    if (!isSshKeyLoaded(connection.sshKey)) {
        addSshKeyToAgent(connection.sshKey);
    }
}

function buildSshOptions(connection) {
    const options = [
        '-o',
        'ControlMaster=auto',
        '-o',
        'ControlPersist=600',
    ];
    if (connection.sshKey) {
        options.push('-i', expandHome(connection.sshKey));
    }
    if (connection.ssh_options && connection.ssh_options.length) {
        options.push(...connection.ssh_options);
    }
    return options;
}

function buildScpFileArgs(connection, remotePath, localPath) {
    return [
        ...buildSshOptions(connection),
        `${remoteTarget(connection)}:${remotePath}`,
        localPath,
    ];
}

function buildRsyncArgs(connection, remotePath, localParentDir) {
    return [
        '-a',
        '--delete',
        '--checksum',
        '-e',
        [
            'ssh',
            ...buildSshOptions(connection),
        ].join(' '),
        `${remoteTarget(connection)}:${remotePath}`,
        localParentDir,
    ];
}

function discoverExisting(executor, connection, candidates) {
    const uniqueCandidates = uniq(candidates);
    if (!uniqueCandidates.length) {
        return { selected: null, matches: [], candidates: [] };
    }

    const script = [
        'set +e',
        ...uniqueCandidates.map((candidate) => `if [ -e ${shellQuote(candidate)} ]; then printf '%s\\n' ${shellQuote(candidate)}; fi`),
    ].join('; ');

    const result = runRemote(executor, connection, script, { allowFailure: true });
    const matches = parseLines(result.stdout);
    return {
        selected: matches[0] || null,
        matches,
        candidates: uniqueCandidates,
    };
}

function discoverRemoteMediaDirs(executor, connection, remoteRoot, candidates) {
    const remoteCandidates = candidates.map((entry) => remotePathJoin(remoteRoot, entry));
    return discoverExisting(executor, connection, remoteCandidates);
}

function inventoryRemoteDirectory(executor, connection, remoteDir) {
    const script = [
        'set -e',
        `if [ ! -d ${shellQuote(remoteDir)} ]; then exit 3; fi`,
        `find ${shellQuote(remoteDir)} -type f -printf '%P\\t%s\\t%TY-%Tm-%TdT%TH:%TM:%TS\\t%p\\n'`,
    ].join('; ');

    const result = runRemote(executor, connection, script, { allowFailure: true });
    if (result.status !== 0) {
        return {
            remote_dir: remoteDir,
            exists: false,
            files: [],
            file_count: 0,
            total_bytes: 0,
        };
    }

    const files = String(result.stdout || '')
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
            const [relativePath, sizeBytes, modifiedAt, fullPath] = line.split('\t');
            return {
                relative_path: relativePath,
                size_bytes: Number(sizeBytes) || 0,
                modified_at: modifiedAt || null,
                full_path: fullPath || null,
            };
        });

    return {
        remote_dir: remoteDir,
        exists: true,
        files,
        file_count: files.length,
        total_bytes: files.reduce((sum, file) => sum + (file.size_bytes || 0), 0),
    };
}

function createRemoteTempRoot() {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const suffix = crypto.randomBytes(4).toString('hex');
    return `/tmp/openvibe-migration-${stamp}-${suffix}`;
}

function buildSqliteSnapshotScript(remoteDbPath, label, remoteTempRoot) {
    const remoteSnapshotPath = remotePathJoin(remoteTempRoot, `${label}.db`);
    const script = [
        'set -e',
        `mkdir -p ${shellQuote(remoteTempRoot)}`,
        `if [ ! -f ${shellQuote(remoteDbPath)} ]; then echo 'missing sqlite database' >&2; exit 7; fi`,
        `if command -v sqlite3 >/dev/null 2>&1; then sqlite3 ${shellQuote(remoteDbPath)} ".timeout 5000" ".backup ${remoteSnapshotPath}" >/dev/null; else cp ${shellQuote(remoteDbPath)} ${shellQuote(remoteSnapshotPath)}; fi`,
        `printf '%s\\n' ${shellQuote(remoteSnapshotPath)}`,
    ].join('; ');
    return { remoteSnapshotPath, script };
}

function planRemoteSqliteSnapshot(trace, connection, remoteDbPath, label, remoteTempRoot) {
    const plan = buildSqliteSnapshotScript(remoteDbPath, label, remoteTempRoot);
    recordPlannedCommand(trace, 'ssh', buildRemoteCommandArgs(connection, plan.script));
    return plan.remoteSnapshotPath;
}

function createRemoteSqliteSnapshot(executor, connection, remoteDbPath, label, remoteTempRoot) {
    const plan = buildSqliteSnapshotScript(remoteDbPath, label, remoteTempRoot);
    const result = runRemote(executor, connection, plan.script, {});
    return parseLines(result.stdout).slice(-1)[0] || plan.remoteSnapshotPath;
}

function scpFile(executor, connection, remotePath, localPath) {
    ensureDir(path.dirname(localPath));
    const args = buildScpFileArgs(connection, remotePath, localPath);
    runChecked(executor, 'scp', args, {});
}

function inventoryLocalDirectory(localDir) {
    const inventory = {
        local_dir: localDir,
        exists: false,
        file_count: 0,
        total_bytes: 0,
    };

    if (!fs.existsSync(localDir) || !fs.statSync(localDir).isDirectory()) {
        return inventory;
    }

    inventory.exists = true;
    const stack = [path.resolve(localDir)];
    while (stack.length) {
        const current = stack.pop();
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(fullPath);
                continue;
            }
            if (!entry.isFile()) continue;
            const stat = fs.statSync(fullPath);
            inventory.file_count += 1;
            inventory.total_bytes += stat.size;
        }
    }

    return inventory;
}

function rsyncDirectory(executor, connection, remotePath, localParentDir) {
    ensureDir(localParentDir);
    const args = buildRsyncArgs(connection, remotePath, localParentDir);
    runChecked(executor, 'rsync', args, {});
    return path.join(localParentDir, path.basename(remotePath));
}

function scpDirectory(executor, connection, remotePath, localParentDir) {
    ensureDir(localParentDir);
    const args = [
        '-r',
        ...parseSshOptions(connection.sshOptions),
        `${remoteTarget(connection)}:${remotePath}`,
        localParentDir,
    ];
    runChecked(executor, 'scp', args, {});
}

function buildCopyPlan(options) {
    const outDir = path.resolve(options.outDir);
    const sourceRoot = path.join(outDir, 'production-source');
    const extraDatabaseLocalPaths = {};

    for (const [key, target] of Object.entries(EXTRA_DATABASE_TARGETS)) {
        extraDatabaseLocalPaths[key] = path.join(sourceRoot, ...target.localPathSegments);
    }

    return {
        outDir,
        sourceRoot,
        hobostreamerLocalRoot: path.join(sourceRoot, 'hobostreamer'),
        hobotoolsLocalRoot: path.join(sourceRoot, 'hobotools'),
        hoboquestLocalRoot: path.join(sourceRoot, 'hoboquest'),
        hobostreamerLocalDb: path.join(sourceRoot, 'hobostreamer', 'data', 'hobostreamer.db'),
        hobotoolsLocalDb: path.join(sourceRoot, 'hobotools', 'data', 'hobo-tools.db'),
        hoboquestLocalDb: path.join(sourceRoot, 'hoboquest', 'data', 'hobo-quest.db'),
        hobostreamerManifestPath: path.join(outDir, 'hobostreamer', 'manifest.json'),
        hobotoolsManifestPath: path.join(outDir, 'hobotools', 'manifest.json'),
        hoboquestManifestPath: path.join(outDir, 'hoboquest', 'manifest.json'),
        extraDatabaseLocalPaths,
        reportPath: path.join(outDir, 'production-fetch-report.json'),
    };
}

function sanitizeConnection(options) {
    return {
        host: options.host,
        user: options.user || null,
        ssh_options: parseSshOptions(options.sshOptions || ''),
        sshKey: options.sshKey || null,
    };
}

function buildExtraDatabaseState(copyPlan) {
    return Object.entries(EXTRA_DATABASE_TARGETS).map(([key, target]) => ({
        key,
        target,
        localPath: copyPlan.extraDatabaseLocalPaths[key],
        discovery: null,
        resolvedRemotePath: null,
        remoteSnapshot: null,
        digest: null,
    }));
}

function validateRemoteTempPath(remoteTempRoot) {
    return /^\/tmp\/openvibe-migration-[A-Za-z0-9.-]+$/.test(String(remoteTempRoot || ''));
}

function cleanupRemoteTempDir(executor, connection, remoteTempRoot) {
    if (!validateRemoteTempPath(remoteTempRoot)) {
        throw new Error(`Refusing to clean unexpected remote temp dir: ${remoteTempRoot}`);
    }
    const script = [
        'set -e',
        `rm -rf -- ${shellQuote(remoteTempRoot)}`,
    ].join('; ');
    runRemote(executor, connection, script, {});
}

function mediaManifestChecksum(inventory) {
    const payload = (inventory.files || []).map((file) => [file.relative_path, file.size_bytes, file.modified_at, file.full_path].join('\t')).join('\n');
    return sha256ForString(payload);
}

function safeConfigEntries(remoteRoot) {
    return DEFAULT_DISCOVERY.safeConfigCandidates.map((candidate) => ({
        remote_path: remotePathJoin(remoteRoot, candidate),
        copied: false,
        reason: candidate.startsWith('.env')
            ? 'Skipped by default because deployed env files may contain secrets.'
            : 'Not copied by default; local repo already contains the safe source-controlled variant.',
    }));
}

function fetchProductionArtifacts(options) {
    const {
        host,
        user,
        outDir,
        remoteHobostreamerRoot,
        remoteHobotoolsRoot,
        remoteHoboquestRoot,
        remoteHobostreamerDb,
        remoteHobostreamerAnalyticsDb,
        remoteRsCompanionDb,
        remoteHobotoolsDb,
        remoteHoboquestDb,
        remoteHoboImgAnalyticsDb,
        remoteHoboDocsAnalyticsDb,
        remoteHoboTextAnalyticsDb,
        remoteHoboAudioAnalyticsDb,
        remoteHoboMapsAnalyticsDb,
        remoteHoboFoodAnalyticsDb,
        remoteHoboYtAnalyticsDb,
        dryRun,
        confirm,
        skipMedia,
        mediaMode,
        sshOptions,
        cleanupRemoteTemp,
        skipSshAgentSetup,
        strict,
        logger,
        executor = defaultExecutor,
    } = options;

    if (!host) {
        throw new Error('--host is required');
    }

    const confirmUsed = !!confirm;
    const effectiveDryRun = dryRun == null ? !confirmUsed : !!dryRun;
    if (!effectiveDryRun && !confirmUsed) {
        throw new Error('Production fetch refuses to snapshot or copy artifacts without --confirm. Use --dry-run to inspect or add --confirm to execute.');
    }
    if (!['metadata-only', 'copy-hot'].includes(mediaMode)) {
        throw new Error(`Unsupported --media-mode: ${mediaMode}`);
    }

    const commandTrace = { planned: [], executed: [] };
    const tracedExecutor = createTracingExecutor(executor, commandTrace);
    const warnings = [];
    const redactions = [];
    const skippedItems = [];
    const copiedArtifacts = [];
    const sizes = {};
    const checksums = {};

    if (effectiveDryRun && confirmUsed) {
        warnings.push('Both --dry-run and --confirm were supplied; dry-run wins and no remote copy/snapshot commands will run.');
    }
    if (!confirmUsed) {
        warnings.push('Running in dry-run mode by default because --confirm was not supplied.');
    }

    const connection = {
        host,
        user,
        sshOptions,
        ssh_options: parseSshOptions(sshOptions || ''),
        sshKey: options.sshKey || null,
    };
    if (!skipSshAgentSetup) {
        ensureSshAgentAndKey(connection);
    }
    const copyPlan = buildCopyPlan({ outDir });
    const extraDatabases = buildExtraDatabaseState(copyPlan);
    ensureDir(copyPlan.outDir);
    ensureDir(path.dirname(copyPlan.hobostreamerManifestPath));
    ensureDir(path.dirname(copyPlan.hobotoolsManifestPath));
    ensureDir(path.dirname(copyPlan.hoboquestManifestPath));

    const hobostreamerRootDiscovery = discoverExisting(
        tracedExecutor,
        connection,
        [
            remoteHobostreamerRoot,
            ...DEFAULT_DISCOVERY.hobostreamerRoots,
        ]
    );
    const hobotoolsRootDiscovery = discoverExisting(
        tracedExecutor,
        connection,
        [
            remoteHobotoolsRoot,
            ...DEFAULT_DISCOVERY.hobotoolsRoots,
        ]
    );
    const hoboquestRootDiscovery = discoverExisting(
        tracedExecutor,
        connection,
        [
            remoteHoboquestRoot,
            ...DEFAULT_DISCOVERY.hoboquestRoots,
        ]
    );

    const hobostreamerRoot = remoteHobostreamerRoot || hobostreamerRootDiscovery.selected;
    const hobotoolsRoot = remoteHobotoolsRoot || hobotoolsRootDiscovery.selected;
    const hoboquestRoot = remoteHoboquestRoot || hoboquestRootDiscovery.selected;

    const hobostreamerDbDiscovery = discoverExisting(
        tracedExecutor,
        connection,
        [
            remoteHobostreamerDb,
            hobostreamerRoot ? remotePathJoin(hobostreamerRoot, 'data/hobostreamer.db') : null,
            ...DEFAULT_DISCOVERY.hobostreamerDbCandidates,
        ]
    );
    const hobotoolsDbDiscovery = discoverExisting(
        tracedExecutor,
        connection,
        [
            remoteHobotoolsDb,
            hobotoolsRoot ? remotePathJoin(hobotoolsRoot, 'data/hobo-tools.db') : null,
            ...DEFAULT_DISCOVERY.hobotoolsDbCandidates,
        ]
    );
    const hoboquestDbDiscovery = discoverExisting(
        tracedExecutor,
        connection,
        [
            remoteHoboquestDb,
            hoboquestRoot ? remotePathJoin(hoboquestRoot, 'data/hobo-quest.db') : null,
            ...DEFAULT_DISCOVERY.hoboquestDbCandidates,
        ]
    );

    const resolvedHobostreamerDb = remoteHobostreamerDb || hobostreamerDbDiscovery.selected;
    const resolvedHobotoolsDb = remoteHobotoolsDb || hobotoolsDbDiscovery.selected;
    const resolvedHoboquestDb = remoteHoboquestDb || hoboquestDbDiscovery.selected;

    const explicitExtraPaths = {
        remoteHobostreamerAnalyticsDb,
        remoteRsCompanionDb,
        remoteHoboImgAnalyticsDb,
        remoteHoboDocsAnalyticsDb,
        remoteHoboTextAnalyticsDb,
        remoteHoboAudioAnalyticsDb,
        remoteHoboMapsAnalyticsDb,
        remoteHoboFoodAnalyticsDb,
        remoteHoboYtAnalyticsDb,
    };

    for (const entry of extraDatabases) {
        const explicit = explicitExtraPaths[entry.target.optionKey] || null;
        entry.discovery = discoverExisting(
            tracedExecutor,
            connection,
            [
                explicit,
                ...(DEFAULT_DISCOVERY[entry.target.candidatesKey] || []),
            ]
        );
        entry.resolvedRemotePath = explicit || entry.discovery.selected;
    }

    const mediaInventories = [];
    let mediaDiscovery = null;
    if (!skipMedia && hobostreamerRoot) {
        mediaDiscovery = discoverRemoteMediaDirs(tracedExecutor, connection, hobostreamerRoot, DEFAULT_DISCOVERY.hobostreamerMediaDirs);
        for (const remoteDir of mediaDiscovery.matches) {
            mediaInventories.push(inventoryRemoteDirectory(tracedExecutor, connection, remoteDir));
        }
    }

    const remoteTempRoot = createRemoteTempRoot();
    let hobostreamerSnapshot = null;
    let hobotoolsSnapshot = null;
    let hoboquestSnapshot = null;

    const dbSnapshots = [];

    if (resolvedHobostreamerDb) {
        hobostreamerSnapshot = planRemoteSqliteSnapshot(commandTrace, connection, resolvedHobostreamerDb, 'hobostreamer', remoteTempRoot);
        recordPlannedCommand(commandTrace, 'scp', buildScpFileArgs(connection, hobostreamerSnapshot, copyPlan.hobostreamerLocalDb));
    }
    if (resolvedHobotoolsDb) {
        hobotoolsSnapshot = planRemoteSqliteSnapshot(commandTrace, connection, resolvedHobotoolsDb, 'hobo-tools', remoteTempRoot);
        recordPlannedCommand(commandTrace, 'scp', buildScpFileArgs(connection, hobotoolsSnapshot, copyPlan.hobotoolsLocalDb));
    }
    if (resolvedHoboquestDb) {
        hoboquestSnapshot = planRemoteSqliteSnapshot(commandTrace, connection, resolvedHoboquestDb, 'hobo-quest', remoteTempRoot);
        recordPlannedCommand(commandTrace, 'scp', buildScpFileArgs(connection, hoboquestSnapshot, copyPlan.hoboquestLocalDb));
    }
    for (const entry of extraDatabases) {
        if (!entry.resolvedRemotePath) continue;
        entry.remoteSnapshot = planRemoteSqliteSnapshot(commandTrace, connection, entry.resolvedRemotePath, entry.target.snapshotLabel, remoteTempRoot);
        recordPlannedCommand(commandTrace, 'scp', buildScpFileArgs(connection, entry.remoteSnapshot, entry.localPath));
    }
    if (!skipMedia && mediaMode === 'copy-hot') {
        for (const inventory of mediaInventories) {
            if (!inventory.exists) continue;
            const localParent = path.join(copyPlan.hobostreamerLocalRoot, 'data');
            recordPlannedCommand(commandTrace, 'rsync', buildRsyncArgs(connection, inventory.remote_dir, localParent));
        }
    }
    if (cleanupRemoteTemp) {
        const cleanupScript = ['set -e', `rm -rf -- ${shellQuote(remoteTempRoot)}`].join('; ');
        recordPlannedCommand(commandTrace, 'ssh', buildRemoteCommandArgs(connection, cleanupScript));
    }

    let operationError = null;
    try {
        if (!effectiveDryRun && resolvedHobostreamerDb) {
            hobostreamerSnapshot = createRemoteSqliteSnapshot(tracedExecutor, connection, resolvedHobostreamerDb, 'hobostreamer', remoteTempRoot);
            scpFile(tracedExecutor, connection, hobostreamerSnapshot, copyPlan.hobostreamerLocalDb);
            const digest = digestFile(copyPlan.hobostreamerLocalDb);
            if (digest) {
                dbSnapshots.push({
                    id: 'hobostreamer',
                    remote_db: resolvedHobostreamerDb,
                    remote_snapshot: hobostreamerSnapshot,
                    local_path: copyPlan.hobostreamerLocalDb,
                    size_bytes: digest.size_bytes,
                    sha256: digest.sha256,
                    copied: true,
                });
                copiedArtifacts.push({ type: 'sqlite_snapshot', id: 'hobostreamer', local_path: copyPlan.hobostreamerLocalDb, size_bytes: digest.size_bytes });
                sizes[copyPlan.hobostreamerLocalDb] = digest.size_bytes;
                checksums[copyPlan.hobostreamerLocalDb] = digest.sha256;
            }
        }
        if (!effectiveDryRun && resolvedHobotoolsDb) {
            hobotoolsSnapshot = createRemoteSqliteSnapshot(tracedExecutor, connection, resolvedHobotoolsDb, 'hobo-tools', remoteTempRoot);
            scpFile(tracedExecutor, connection, hobotoolsSnapshot, copyPlan.hobotoolsLocalDb);
            const digest = digestFile(copyPlan.hobotoolsLocalDb);
            if (digest) {
                dbSnapshots.push({
                    id: 'hobotools',
                    remote_db: resolvedHobotoolsDb,
                    remote_snapshot: hobotoolsSnapshot,
                    local_path: copyPlan.hobotoolsLocalDb,
                    size_bytes: digest.size_bytes,
                    sha256: digest.sha256,
                    copied: true,
                });
                copiedArtifacts.push({ type: 'sqlite_snapshot', id: 'hobotools', local_path: copyPlan.hobotoolsLocalDb, size_bytes: digest.size_bytes });
                sizes[copyPlan.hobotoolsLocalDb] = digest.size_bytes;
                checksums[copyPlan.hobotoolsLocalDb] = digest.sha256;
            }
        }
        if (!effectiveDryRun && resolvedHoboquestDb) {
            hoboquestSnapshot = createRemoteSqliteSnapshot(tracedExecutor, connection, resolvedHoboquestDb, 'hobo-quest', remoteTempRoot);
            scpFile(tracedExecutor, connection, hoboquestSnapshot, copyPlan.hoboquestLocalDb);
            const digest = digestFile(copyPlan.hoboquestLocalDb);
            if (digest) {
                dbSnapshots.push({
                    id: 'hoboquest',
                    remote_db: resolvedHoboquestDb,
                    remote_snapshot: hoboquestSnapshot,
                    local_path: copyPlan.hoboquestLocalDb,
                    size_bytes: digest.size_bytes,
                    sha256: digest.sha256,
                    copied: true,
                });
                copiedArtifacts.push({ type: 'sqlite_snapshot', id: 'hoboquest', local_path: copyPlan.hoboquestLocalDb, size_bytes: digest.size_bytes });
                sizes[copyPlan.hoboquestLocalDb] = digest.size_bytes;
                checksums[copyPlan.hoboquestLocalDb] = digest.sha256;
            }
        }
        for (const entry of extraDatabases) {
            if (effectiveDryRun || !entry.resolvedRemotePath) continue;
            entry.remoteSnapshot = createRemoteSqliteSnapshot(tracedExecutor, connection, entry.resolvedRemotePath, entry.target.snapshotLabel, remoteTempRoot);
            scpFile(tracedExecutor, connection, entry.remoteSnapshot, entry.localPath);
            entry.digest = digestFile(entry.localPath);
            if (entry.digest) {
                dbSnapshots.push({
                    id: entry.target.reportKey,
                    remote_db: entry.resolvedRemotePath,
                    remote_snapshot: entry.remoteSnapshot,
                    local_path: entry.localPath,
                    size_bytes: entry.digest.size_bytes,
                    sha256: entry.digest.sha256,
                    copied: true,
                });
                copiedArtifacts.push({ type: 'sqlite_snapshot', id: entry.target.reportKey, local_path: entry.localPath, size_bytes: entry.digest.size_bytes });
                sizes[entry.localPath] = entry.digest.size_bytes;
                checksums[entry.localPath] = entry.digest.sha256;
            }
        }

        if (!effectiveDryRun && !skipMedia && mediaMode === 'copy-hot') {
            for (const inventory of mediaInventories) {
                if (!inventory.exists) {
                    continue;
                }
                const localParent = path.join(copyPlan.hobostreamerLocalRoot, 'data');
                const localDir = rsyncDirectory(tracedExecutor, connection, inventory.remote_dir, localParent);
                const localInventory = inventoryLocalDirectory(localDir);
                inventory.local_dir = localDir;
                inventory.local_file_count = localInventory.file_count;
                inventory.local_total_bytes = localInventory.total_bytes;
                inventory.copied = true;
                inventory.verified = inventory.file_count === localInventory.file_count && inventory.total_bytes === localInventory.total_bytes;
                if (!inventory.verified) {
                    throw new Error(`Media copy verification failed for ${inventory.remote_dir}: remote ${inventory.file_count} files/${inventory.total_bytes} bytes, local ${localInventory.file_count} files/${localInventory.total_bytes} bytes`);
                }
                copiedArtifacts.push({ type: 'media_directory', id: inventory.remote_dir, local_path: localDir, size_bytes: localInventory.total_bytes });
                sizes[localDir] = localInventory.total_bytes;
                checksums[localDir] = mediaManifestChecksum(inventory);
            }
        }
    } catch (error) {
        operationError = error;
    } finally {
        if (!effectiveDryRun && cleanupRemoteTemp) {
            try {
                cleanupRemoteTempDir(tracedExecutor, connection, remoteTempRoot);
            } catch (cleanupError) {
                warnings.push(`Remote temp cleanup failed for ${remoteTempRoot}: ${cleanupError.message}`);
                if (!operationError) {
                    operationError = cleanupError;
                }
            }
        }
    }

    if (operationError) {
        throw operationError;
    }

    const hobostreamerManifest = {
        service: 'hobostreamer',
        generated_at: new Date().toISOString(),
        dry_run: !!effectiveDryRun,
        remote_root: hobostreamerRoot || null,
        remote_db: resolvedHobostreamerDb || null,
        remote_snapshot: hobostreamerSnapshot,
        local_root: copyPlan.hobostreamerLocalRoot,
        local_db: copyPlan.hobostreamerLocalDb,
        discovery: {
            roots: hobostreamerRootDiscovery,
            db: hobostreamerDbDiscovery,
        },
        media: {
            skipped: !!skipMedia,
            mode: mediaMode,
            inventories: mediaInventories.map((inventory) => ({
                remote_dir: inventory.remote_dir,
                exists: inventory.exists,
                file_count: inventory.file_count,
                total_bytes: inventory.total_bytes,
                copied: !effectiveDryRun && mediaMode === 'copy-hot' && inventory.exists,
                local_dir: inventory.local_dir || (inventory.exists ? path.join(copyPlan.hobostreamerLocalRoot, 'data', path.basename(inventory.remote_dir)) : null),
                local_file_count: inventory.local_file_count || 0,
                local_total_bytes: inventory.local_total_bytes || 0,
                verified: inventory.verified === true,
                manifest_sha256: mediaManifestChecksum(inventory),
            })),
        },
        config_artifacts: hobostreamerRoot ? safeConfigEntries(hobostreamerRoot) : [],
    };

    const hobotoolsManifest = {
        service: 'hobotools',
        generated_at: new Date().toISOString(),
        dry_run: !!effectiveDryRun,
        remote_root: hobotoolsRoot || null,
        remote_db: resolvedHobotoolsDb || null,
        remote_snapshot: hobotoolsSnapshot,
        local_root: copyPlan.hobotoolsLocalRoot,
        local_db: copyPlan.hobotoolsLocalDb,
        discovery: {
            roots: hobotoolsRootDiscovery,
            db: hobotoolsDbDiscovery,
        },
        media: {
            skipped: true,
            mode: 'none',
            inventories: [],
        },
        config_artifacts: hobotoolsRoot ? safeConfigEntries(hobotoolsRoot) : [],
    };

    const hoboquestManifest = {
        service: 'hoboquest',
        generated_at: new Date().toISOString(),
        dry_run: !!effectiveDryRun,
        remote_root: hoboquestRoot || null,
        remote_db: resolvedHoboquestDb || null,
        remote_snapshot: hoboquestSnapshot,
        local_root: copyPlan.hoboquestLocalRoot,
        local_db: copyPlan.hoboquestLocalDb,
        discovery: {
            roots: hoboquestRootDiscovery,
            db: hoboquestDbDiscovery,
        },
        media: {
            skipped: true,
            mode: 'none',
            inventories: [],
        },
        config_artifacts: hoboquestRoot ? safeConfigEntries(hoboquestRoot) : [],
    };

    const extraDatabaseReport = {};
    for (const entry of extraDatabases) {
        extraDatabaseReport[entry.target.reportKey] = {
            description: entry.target.description,
            remote_db: entry.resolvedRemotePath || null,
            remote_snapshot: entry.remoteSnapshot || null,
            local_db: entry.localPath,
            discovery: entry.discovery,
            copied: !effectiveDryRun && !!entry.digest,
            size_bytes: entry.digest ? entry.digest.size_bytes : 0,
            sha256: entry.digest ? entry.digest.sha256 : null,
        };
    }

    const manualActions = [];
    if (!remoteHobostreamerRoot) {
        manualActions.push('Explicit --remote-hobostreamer-root was not provided; explicit remote roots improve fetch determinism.');
    }
    if (!remoteHobostreamerDb) {
        manualActions.push('Explicit --remote-hobostreamer-db was not provided; explicit remote DB paths improve fetch determinism.');
    }
    if (!hobostreamerRoot) {
        manualActions.push('Could not automatically discover the remote HoboStreamer root. Pass --remote-hobostreamer-root to avoid guesswork.');
    }
    if (!hobotoolsRoot) {
        manualActions.push('Could not automatically discover the remote hobo-tools root. Pass --remote-hobotools-root to avoid guesswork.');
    }
    if (!remoteHoboquestRoot) {
        manualActions.push('Explicit --remote-hoboquest-root was not provided; explicit remote roots improve fetch determinism for HoboQuest game/canvas exports.');
    }
    if (!remoteHoboquestDb) {
        manualActions.push('Explicit --remote-hoboquest-db was not provided; explicit remote DB paths improve fetch determinism for HoboQuest game/canvas exports.');
    }
    if (!hoboquestRoot) {
        manualActions.push('Could not automatically discover the remote HoboQuest root. Pass --remote-hoboquest-root if game/canvas data lives outside the default paths.');
    }
    if (!resolvedHoboquestDb) {
        manualActions.push('Could not automatically discover the remote HoboQuest SQLite database. Pass --remote-hoboquest-db if game/canvas data is deployed separately.');
    }
    if (!resolvedHobostreamerDb) {
        manualActions.push('Could not automatically discover the remote HoboStreamer SQLite database. Pass --remote-hobostreamer-db.');
    }
    if (!resolvedHobotoolsDb) {
        manualActions.push('Could not automatically discover the remote hobo-tools SQLite database. Pass --remote-hobotools-db.');
    }
    for (const entry of extraDatabases) {
        if (!entry.resolvedRemotePath) {
            manualActions.push(`Could not automatically discover the remote ${entry.target.description}. Pass --${entry.target.optionKey.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} if this dataset should be archived.`);
        }
    }
    if (!skipMedia && mediaMode !== 'copy-hot') {
        manualActions.push('Media bytes were not copied because media mode is metadata-only. Later backfill steps will report missing local media files as diagnostics.');
    }

    if (!effectiveDryRun) {
        if (!hobostreamerRoot) {
            throw new Error('Remote HoboStreamer root could not be discovered; pass --remote-hobostreamer-root.');
        }
        if (!resolvedHobostreamerDb) {
            throw new Error('Remote HoboStreamer SQLite database could not be discovered; pass --remote-hobostreamer-db.');
        }
        if (!hobotoolsRoot) {
            throw new Error('Remote hobo-tools root could not be discovered; pass --remote-hobotools-root.');
        }
        if (!resolvedHobotoolsDb) {
            throw new Error('Remote hobo-tools SQLite database could not be discovered; pass --remote-hobotools-db.');
        }
    }

    const configExports = [
        ...hobostreamerManifest.config_artifacts,
        ...hobotoolsManifest.config_artifacts,
        ...hoboquestManifest.config_artifacts,
    ];
    for (const entry of configExports) {
        if ((entry.remote_path || '').includes('/.env')) {
            redactions.push({ remote_path: entry.remote_path, action: 'skipped', reason: entry.reason });
        }
        skippedItems.push({ type: 'config_artifact', remote_path: entry.remote_path, reason: entry.reason });
    }
    if (!skipMedia && mediaMode !== 'copy-hot') {
        for (const inventory of mediaInventories) {
            skippedItems.push({ type: 'media_copy', remote_path: inventory.remote_dir, reason: 'metadata-only mode does not copy media bytes' });
        }
    }

    const discoveredCandidates = {
        hobostreamer: {
            roots: hobostreamerRootDiscovery,
            db: hobostreamerDbDiscovery,
            media_dirs: mediaDiscovery,
        },
        hobotools: {
            roots: hobotoolsRootDiscovery,
            db: hobotoolsDbDiscovery,
        },
        hoboquest: {
            roots: hoboquestRootDiscovery,
            db: hoboquestDbDiscovery,
        },
        extra_databases: Object.fromEntries(extraDatabases.map((entry) => [entry.target.reportKey, entry.discovery])),
    };

    const selectedPaths = {
        hobostreamer: {
            root: hobostreamerRoot || null,
            db: resolvedHobostreamerDb || null,
        },
        hobotools: {
            root: hobotoolsRoot || null,
            db: resolvedHobotoolsDb || null,
        },
        hoboquest: {
            root: hoboquestRoot || null,
            db: resolvedHoboquestDb || null,
        },
        extra_databases: Object.fromEntries(extraDatabases.map((entry) => [entry.target.reportKey, entry.resolvedRemotePath || null])),
    };

    const mediaManifests = mediaInventories.map((inventory) => ({
        remote_dir: inventory.remote_dir,
        exists: inventory.exists,
        file_count: inventory.file_count,
        total_bytes: inventory.total_bytes,
        local_dir: inventory.local_dir || null,
        local_file_count: inventory.local_file_count || 0,
        local_total_bytes: inventory.local_total_bytes || 0,
        verified: inventory.verified === true,
        manifest_sha256: mediaManifestChecksum(inventory),
    }));

    if (strict && manualActions.length > 0) {
        throw new Error(`Strict mode refused production fetch with unresolved warnings: ${manualActions.join(' | ')}`);
    }

    const report = {
        generated_at: new Date().toISOString(),
        host,
        user: user || null,
        dry_run: !!effectiveDryRun,
        confirm_used: confirmUsed,
        remote_temp_dir: remoteTempRoot,
        remote_temp_root: remoteTempRoot,
        cleanup_remote_temp: !!cleanupRemoteTemp,
        connection: sanitizeConnection(connection),
        output_root: copyPlan.outDir,
        production_source_root: copyPlan.sourceRoot,
        media_mode: mediaMode,
        skip_media: !!skipMedia,
        discovered_candidates: discoveredCandidates,
        selected_paths: selectedPaths,
        db_snapshots: dbSnapshots,
        config_exports: configExports,
        media_manifests: mediaManifests,
        copied_artifacts: copiedArtifacts,
        sizes,
        checksums,
        redactions: redactions,
        skipped_items: skippedItems,
        warnings,
        commands_planned: commandTrace.planned,
        commands_executed: commandTrace.executed,
        hobostreamer: hobostreamerManifest,
        hobotools: hobotoolsManifest,
        hoboquest: hoboquestManifest,
        extra_databases: extraDatabaseReport,
        manual_actions: manualActions,
    };

    writeJson(copyPlan.hobostreamerManifestPath, hobostreamerManifest);
    writeJson(copyPlan.hobotoolsManifestPath, hobotoolsManifest);
    writeJson(copyPlan.hoboquestManifestPath, hoboquestManifest);
    writeJson(copyPlan.reportPath, report);

    if (logger) {
        logger.info(`Production fetch ${effectiveDryRun ? 'planned' : 'completed'} for ${host}`);
        logger.info(`Report written to ${copyPlan.reportPath}`);
    }

    return report;
}

module.exports = {
    DEFAULT_DISCOVERY,
    buildCopyPlan,
    createRemoteSqliteSnapshot,
    defaultExecutor,
    discoverExisting,
    fetchProductionArtifacts,
    inventoryRemoteDirectory,
    parseSshOptions,
    remotePathJoin,
    remoteTarget,
    runRemote,
    renderCommand,
    shellQuote,
};
