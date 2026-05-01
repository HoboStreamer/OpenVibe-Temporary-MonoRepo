'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DEFAULT_REPO_LEGACY_ROOT = path.join(REPO_ROOT, 'HoboReposToMigrateFrom');
const DEFAULT_PARENT_LEGACY_ROOT = path.resolve(REPO_ROOT, '..');
const DEFAULT_PARENT_LEGACY_HOBO_ROOT = path.join(DEFAULT_PARENT_LEGACY_ROOT, 'hobo');

const SOURCE_SPECS = Object.freeze({
    hobostreamer: {
        artifactDir: 'hobostreamer',
        dbFile: 'hobostreamer.db',
        envRootKey: 'OPENVIBE_HOBOSTREAMER_ROOT',
        envDbKey: 'OPENVIBE_HOBOSTREAMER_DB_PATH',
        directBaseNames: new Set(['hobostreamer.com', 'hobostreamer', 'hobo-streamer']),
        sharedRootSegments: [
            ['HoboStreamer.com'],
            ['hobostreamer'],
        ],
    },
    hobotools: {
        artifactDir: 'hobotools',
        dbFile: 'hobo-tools.db',
        envRootKey: 'OPENVIBE_HOBOTOOLS_ROOT',
        envDbKey: 'OPENVIBE_HOBOTOOLS_DB_PATH',
        directBaseNames: new Set(['hobo-tools', 'hobotools', 'hobo_tools']),
        sharedRootSegments: [
            ['HoboApp', 'hobo-tools'],
            ['hobo-tools'],
            ['hobotools'],
        ],
    },
    hoboquest: {
        artifactDir: 'hoboquest',
        dbFile: 'hobo-quest.db',
        envRootKey: 'OPENVIBE_HOBOQUEST_ROOT',
        envDbKey: 'OPENVIBE_HOBOQUEST_DB_PATH',
        directBaseNames: new Set(['hobo-quest', 'hoboquest']),
        sharedRootSegments: [
            ['HoboApp', 'hobo-quest'],
            ['hobo-quest'],
            ['hoboquest'],
        ],
    },
});

function normalizePath(value) {
    if (value == null) return null;
    const trimmed = String(value).trim();
    if (!trimmed) return null;
    return path.resolve(trimmed);
}

function uniquePaths(values) {
    const seen = new Set();
    const items = [];
    for (const value of values || []) {
        const normalized = normalizePath(value);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        items.push(normalized);
    }
    return items;
}

function addSharedRootCandidates(target, basePath, spec) {
    const resolvedBase = normalizePath(basePath);
    if (!resolvedBase) return;

    const baseName = path.basename(resolvedBase).toLowerCase();
    if (spec.directBaseNames.has(baseName)) {
        target.push(resolvedBase);
    }

    for (const segments of spec.sharedRootSegments) {
        target.push(path.join(resolvedBase, ...segments));
    }
}

function addSourceDirCandidates(target, sourceDir, spec) {
    const resolvedSourceDir = normalizePath(sourceDir);
    if (!resolvedSourceDir) return;
    target.push(path.join(resolvedSourceDir, 'production-source', spec.artifactDir));
}

function resolveFirstExisting(candidates) {
    const unique = uniquePaths(candidates);
    const existing = unique.find((candidate) => fs.existsSync(candidate));
    return {
        value: existing || unique[0] || null,
        candidates: unique,
        exists: !!existing,
    };
}

function deriveRootFromDbPath(dbPath) {
    const resolvedDbPath = normalizePath(dbPath);
    if (!resolvedDbPath) return null;
    return path.dirname(path.dirname(resolvedDbPath));
}

function resolveLegacySource(sourceName, options = {}) {
    const spec = SOURCE_SPECS[sourceName];
    if (!spec) {
        throw new Error(`Unsupported legacy source: ${sourceName}`);
    }

    const env = options.env || process.env;
    const sharedRoot = options.sharedRoot || env.OPENVIBE_LEGACY_SOURCE_ROOT || null;
    const rootCandidates = [];
    const dbCandidates = [];

    if (options.explicitRoot) rootCandidates.push(options.explicitRoot);
    if (env[spec.envRootKey]) rootCandidates.push(env[spec.envRootKey]);
    if (sharedRoot) addSharedRootCandidates(rootCandidates, sharedRoot, spec);
    if (options.sourceDir) addSourceDirCandidates(rootCandidates, options.sourceDir, spec);
    addSharedRootCandidates(rootCandidates, DEFAULT_REPO_LEGACY_ROOT, spec);
    addSharedRootCandidates(rootCandidates, DEFAULT_PARENT_LEGACY_ROOT, spec);
    addSharedRootCandidates(rootCandidates, DEFAULT_PARENT_LEGACY_HOBO_ROOT, spec);

    if (options.explicitDbPath) dbCandidates.push(options.explicitDbPath);
    if (env[spec.envDbKey]) dbCandidates.push(env[spec.envDbKey]);

    const rootResolution = resolveFirstExisting(rootCandidates);
    if (rootResolution.value) {
        dbCandidates.push(path.join(rootResolution.value, 'data', spec.dbFile));
    }
    if (options.sourceDir) {
        dbCandidates.push(path.join(path.resolve(options.sourceDir), 'production-source', spec.artifactDir, 'data', spec.dbFile));
    }

    const dbResolution = resolveFirstExisting(dbCandidates);
    const resolvedRoot = rootResolution.value || deriveRootFromDbPath(dbResolution.value);

    return {
        sourceName,
        artifactDir: spec.artifactDir,
        dbFile: spec.dbFile,
        legacyRoot: resolvedRoot,
        dbPath: dbResolution.value,
        legacyRootExists: !!(resolvedRoot && fs.existsSync(resolvedRoot)),
        dbExists: !!(dbResolution.value && fs.existsSync(dbResolution.value)),
        legacyRootCandidates: rootResolution.candidates,
        dbCandidates: dbResolution.candidates,
    };
}

function resolveLegacyArtifactSummary(options = {}) {
    const args = options.args || {};
    const env = options.env || process.env;
    const sharedRoot = args.legacySourceRoot || args.sharedLegacyRoot || env.OPENVIBE_LEGACY_SOURCE_ROOT || null;
    const sourceDir = options.sourceDir || args.source || args.out || null;

    const hobostreamer = resolveLegacySource('hobostreamer', {
        explicitRoot: args.hobostreamerRoot || args.legacyRoot,
        explicitDbPath: args.hobostreamerDb,
        sharedRoot,
        sourceDir,
        env,
    });
    const hobotools = resolveLegacySource('hobotools', {
        explicitRoot: args.hobotoolsRoot,
        explicitDbPath: args.hobotoolsDb,
        sharedRoot,
        sourceDir,
        env,
    });
    const hoboquest = resolveLegacySource('hoboquest', {
        explicitRoot: args.hoboquestRoot,
        explicitDbPath: args.hoboquestDb,
        sharedRoot,
        sourceDir,
        env,
    });

    return {
        hobostreamer_db: hobostreamer.dbPath,
        hobotools_db: hobotools.dbPath,
        hoboquest_db: hoboquest.dbPath,
        hobostreamer_root: hobostreamer.legacyRoot,
        hobotools_root: hobotools.legacyRoot,
        hoboquest_root: hoboquest.legacyRoot,
        details: {
            hobostreamer,
            hobotools,
            hoboquest,
        },
    };
}

module.exports = {
    DEFAULT_PARENT_LEGACY_ROOT,
    DEFAULT_REPO_LEGACY_ROOT,
    SOURCE_SPECS,
    resolveLegacyArtifactSummary,
    resolveLegacySource,
};
