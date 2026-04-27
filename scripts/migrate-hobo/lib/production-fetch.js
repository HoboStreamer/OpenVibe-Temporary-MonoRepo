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
    hobostreamerDbCandidates: [
        '/opt/hobostreamer/data/hobostreamer.db',
        '/srv/hobostreamer/data/hobostreamer.db',
        '/var/www/hobostreamer/data/hobostreamer.db',
        '~/hobostreamer/data/hobostreamer.db',
    ],
    hobotoolsDbCandidates: [
        '/opt/hobo/hobo-tools/data/hobo-tools.db',
        '/opt/hobo-tools/data/hobo-tools.db',
        '/srv/hobo-tools/data/hobo-tools.db',
        '~/hobo-tools/data/hobo-tools.db',
        '~/HoboApp/hobo-tools/data/hobo-tools.db',
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
    const args = [
        ...buildSshOptions(connection),
        remoteTarget(connection),
        `sh -lc ${shellQuote(script)}`,
    ];
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

function createRemoteSqliteSnapshot(executor, connection, remoteDbPath, label, remoteTempRoot) {
    const remoteSnapshotPath = remotePathJoin(remoteTempRoot, `${label}.db`);
    const script = [
        'set -e',
        `mkdir -p ${shellQuote(remoteTempRoot)}`,
        `if [ ! -f ${shellQuote(remoteDbPath)} ]; then echo 'missing sqlite database' >&2; exit 7; fi`,
        `if command -v sqlite3 >/dev/null 2>&1; then sqlite3 ${shellQuote(remoteDbPath)} ".timeout 5000" ".backup ${remoteSnapshotPath}" >/dev/null; else cp ${shellQuote(remoteDbPath)} ${shellQuote(remoteSnapshotPath)}; fi`,
        `printf '%s\\n' ${shellQuote(remoteSnapshotPath)}`,
    ].join('; ');

    const result = runRemote(executor, connection, script, {});
    return parseLines(result.stdout).slice(-1)[0] || remoteSnapshotPath;
}

function scpFile(executor, connection, remotePath, localPath) {
    ensureDir(path.dirname(localPath));
    const args = [
        ...buildSshOptions(connection),
        `${remoteTarget(connection)}:${remotePath}`,
        localPath,
    ];
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
    const args = [
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

    return {
        outDir,
        sourceRoot,
        hobostreamerLocalRoot: path.join(sourceRoot, 'hobostreamer'),
        hobotoolsLocalRoot: path.join(sourceRoot, 'hobotools'),
        hobostreamerLocalDb: path.join(sourceRoot, 'hobostreamer', 'data', 'hobostreamer.db'),
        hobotoolsLocalDb: path.join(sourceRoot, 'hobotools', 'data', 'hobo-tools.db'),
        hobostreamerManifestPath: path.join(outDir, 'hobostreamer', 'manifest.json'),
        hobotoolsManifestPath: path.join(outDir, 'hobotools', 'manifest.json'),
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
        remoteHobostreamerDb,
        remoteHobotoolsDb,
        dryRun,
        skipMedia,
        mediaMode,
        sshOptions,
        logger,
        executor = defaultExecutor,
    } = options;

    if (!host) {
        throw new Error('--host is required');
    }

    const connection = { host, user, sshOptions, sshKey: options.sshKey || null };
    ensureSshAgentAndKey(connection);
    const copyPlan = buildCopyPlan({ outDir });
    ensureDir(copyPlan.outDir);
    ensureDir(path.dirname(copyPlan.hobostreamerManifestPath));
    ensureDir(path.dirname(copyPlan.hobotoolsManifestPath));

    const hobostreamerRootDiscovery = discoverExisting(
        executor,
        connection,
        [
            remoteHobostreamerRoot,
            ...DEFAULT_DISCOVERY.hobostreamerRoots,
        ]
    );
    const hobotoolsRootDiscovery = discoverExisting(
        executor,
        connection,
        [
            remoteHobotoolsRoot,
            ...DEFAULT_DISCOVERY.hobotoolsRoots,
        ]
    );

    const hobostreamerRoot = remoteHobostreamerRoot || hobostreamerRootDiscovery.selected;
    const hobotoolsRoot = remoteHobotoolsRoot || hobotoolsRootDiscovery.selected;

    const hobostreamerDbDiscovery = discoverExisting(
        executor,
        connection,
        [
            remoteHobostreamerDb,
            hobostreamerRoot ? remotePathJoin(hobostreamerRoot, 'data/hobostreamer.db') : null,
            ...DEFAULT_DISCOVERY.hobostreamerDbCandidates,
        ]
    );
    const hobotoolsDbDiscovery = discoverExisting(
        executor,
        connection,
        [
            remoteHobotoolsDb,
            hobotoolsRoot ? remotePathJoin(hobotoolsRoot, 'data/hobo-tools.db') : null,
            ...DEFAULT_DISCOVERY.hobotoolsDbCandidates,
        ]
    );

    const resolvedHobostreamerDb = remoteHobostreamerDb || hobostreamerDbDiscovery.selected;
    const resolvedHobotoolsDb = remoteHobotoolsDb || hobotoolsDbDiscovery.selected;

    const mediaInventories = [];
    if (!skipMedia && hobostreamerRoot) {
        const mediaDiscovery = discoverRemoteMediaDirs(executor, connection, hobostreamerRoot, DEFAULT_DISCOVERY.hobostreamerMediaDirs);
        for (const remoteDir of mediaDiscovery.matches) {
            mediaInventories.push(inventoryRemoteDirectory(executor, connection, remoteDir));
        }
    }

    const remoteTempRoot = createRemoteTempRoot();
    let hobostreamerSnapshot = null;
    let hobotoolsSnapshot = null;

    if (!dryRun && resolvedHobostreamerDb) {
        hobostreamerSnapshot = createRemoteSqliteSnapshot(executor, connection, resolvedHobostreamerDb, 'hobostreamer', remoteTempRoot);
        scpFile(executor, connection, hobostreamerSnapshot, copyPlan.hobostreamerLocalDb);
    }

    if (!dryRun && resolvedHobotoolsDb) {
        hobotoolsSnapshot = createRemoteSqliteSnapshot(executor, connection, resolvedHobotoolsDb, 'hobo-tools', remoteTempRoot);
        scpFile(executor, connection, hobotoolsSnapshot, copyPlan.hobotoolsLocalDb);
    }

    if (!dryRun && !skipMedia && mediaMode === 'copy-hot') {
        for (const inventory of mediaInventories) {
            if (!inventory.exists) {
                continue;
            }
            const localParent = path.join(copyPlan.hobostreamerLocalRoot, 'data');
            const localDir = rsyncDirectory(executor, connection, inventory.remote_dir, localParent);
            const localInventory = inventoryLocalDirectory(localDir);
            inventory.local_dir = localDir;
            inventory.local_file_count = localInventory.file_count;
            inventory.local_total_bytes = localInventory.total_bytes;
            inventory.copied = true;
            inventory.verified = inventory.file_count === localInventory.file_count && inventory.total_bytes === localInventory.total_bytes;
            if (!inventory.verified) {
                throw new Error(`Media copy verification failed for ${inventory.remote_dir}: remote ${inventory.file_count} files/${inventory.total_bytes} bytes, local ${localInventory.file_count} files/${localInventory.total_bytes} bytes`);
            }
        }
    }

    const hobostreamerManifest = {
        service: 'hobostreamer',
        generated_at: new Date().toISOString(),
        dry_run: !!dryRun,
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
                copied: !dryRun && mediaMode === 'copy-hot' && inventory.exists,
                local_dir: inventory.local_dir || (inventory.exists ? path.join(copyPlan.hobostreamerLocalRoot, 'data', path.basename(inventory.remote_dir)) : null),
                local_file_count: inventory.local_file_count || 0,
                local_total_bytes: inventory.local_total_bytes || 0,
                verified: inventory.verified === true,
            })),
        },
        config_artifacts: hobostreamerRoot ? safeConfigEntries(hobostreamerRoot) : [],
    };

    const hobotoolsManifest = {
        service: 'hobotools',
        generated_at: new Date().toISOString(),
        dry_run: !!dryRun,
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
    if (!resolvedHobostreamerDb) {
        manualActions.push('Could not automatically discover the remote HoboStreamer SQLite database. Pass --remote-hobostreamer-db.');
    }
    if (!resolvedHobotoolsDb) {
        manualActions.push('Could not automatically discover the remote hobo-tools SQLite database. Pass --remote-hobotools-db.');
    }
    if (!skipMedia && mediaMode !== 'copy-hot') {
        manualActions.push('Media bytes were not copied because media mode is metadata-only. Later backfill steps will report missing local media files as diagnostics.');
    }

    if (!dryRun) {
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

    const report = {
        generated_at: new Date().toISOString(),
        dry_run: !!dryRun,
        connection: sanitizeConnection(connection),
        output_root: copyPlan.outDir,
        production_source_root: copyPlan.sourceRoot,
        remote_temp_root: dryRun ? remoteTempRoot : remoteTempRoot,
        media_mode: mediaMode,
        skip_media: !!skipMedia,
        hobostreamer: hobostreamerManifest,
        hobotools: hobotoolsManifest,
        manual_actions: manualActions,
    };

    writeJson(copyPlan.hobostreamerManifestPath, hobostreamerManifest);
    writeJson(copyPlan.hobotoolsManifestPath, hobotoolsManifest);
    writeJson(copyPlan.reportPath, report);

    if (logger) {
        logger.info(`Production fetch ${dryRun ? 'planned' : 'completed'} for ${host}`);
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
    shellQuote,
};
