'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    resolveLegacyArtifactSummary,
    resolveLegacySource,
} = require('../lib/legacy-source-roots');

function mkdirp(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function writeDb(rootDir, fileName) {
    mkdirp(path.join(rootDir, 'data'));
    const dbPath = path.join(rootDir, 'data', fileName);
    fs.writeFileSync(dbPath, 'sqlite-placeholder', 'utf8');
    return dbPath;
}

function withTempDir(fn) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-legacy-roots-'));
    try {
        fn(tempDir);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

(function sharedRootResolvesParentLayout() {
    withTempDir((root) => {
        const sharedRoot = path.join(root, 'openvibe-parent');
        const hobostreamerRoot = path.join(sharedRoot, 'HoboStreamer.com');
        const hobotoolsRoot = path.join(sharedRoot, 'HoboApp', 'hobo-tools');
        const hoboquestRoot = path.join(sharedRoot, 'HoboApp', 'hobo-quest');
        const hobostreamerDb = writeDb(hobostreamerRoot, 'hobostreamer.db');
        const hobotoolsDb = writeDb(hobotoolsRoot, 'hobo-tools.db');
        const hoboquestDb = writeDb(hoboquestRoot, 'hobo-quest.db');

        const hobostreamer = resolveLegacySource('hobostreamer', { sharedRoot, env: {} });
        const hobotools = resolveLegacySource('hobotools', { sharedRoot, env: {} });
        const hoboquest = resolveLegacySource('hoboquest', { sharedRoot, env: {} });

        assert.strictEqual(hobostreamer.legacyRoot, hobostreamerRoot);
        assert.strictEqual(hobostreamer.dbPath, hobostreamerDb);
        assert.strictEqual(hobotools.legacyRoot, hobotoolsRoot);
        assert.strictEqual(hobotools.dbPath, hobotoolsDb);
        assert.strictEqual(hoboquest.legacyRoot, hoboquestRoot);
        assert.strictEqual(hoboquest.dbPath, hoboquestDb);
    });
})();

(function sourceDirProductionSourceWinsWhenPresent() {
    withTempDir((root) => {
        const sourceDir = path.join(root, 'staging');
        const fetchedRoot = path.join(sourceDir, 'production-source', 'hobostreamer');
        const fetchedDb = writeDb(fetchedRoot, 'hobostreamer.db');

        const resolved = resolveLegacySource('hobostreamer', {
            sourceDir,
            env: {},
        });

        assert.strictEqual(resolved.legacyRoot, fetchedRoot);
        assert.strictEqual(resolved.dbPath, fetchedDb);
    });
})();

(function artifactSummaryFallsBackToSharedRootWhenFetchedArtifactsAreMissing() {
    withTempDir((root) => {
        const sourceDir = path.join(root, 'staging');
        mkdirp(sourceDir);

        const sharedRoot = path.join(root, 'legacy-sources');
        const hobostreamerRoot = path.join(sharedRoot, 'HoboStreamer.com');
        const hobotoolsRoot = path.join(sharedRoot, 'HoboApp', 'hobo-tools');
        const hoboquestRoot = path.join(sharedRoot, 'HoboApp', 'hobo-quest');
        const hobostreamerDb = writeDb(hobostreamerRoot, 'hobostreamer.db');
        const hobotoolsDb = writeDb(hobotoolsRoot, 'hobo-tools.db');
        const hoboquestDb = writeDb(hoboquestRoot, 'hobo-quest.db');

        const summary = resolveLegacyArtifactSummary({
            sourceDir,
            args: { legacySourceRoot: sharedRoot },
            env: {},
        });

        assert.strictEqual(summary.hobostreamer_root, hobostreamerRoot);
        assert.strictEqual(summary.hobostreamer_db, hobostreamerDb);
        assert.strictEqual(summary.hobotools_root, hobotoolsRoot);
        assert.strictEqual(summary.hobotools_db, hobotoolsDb);
        assert.strictEqual(summary.hoboquest_root, hoboquestRoot);
        assert.strictEqual(summary.hoboquest_db, hoboquestDb);
    });
})();

(function sharedRootResolvesLocalHoboRootLayout() {
    withTempDir((root) => {
        const sharedRoot = path.join(root, 'hobo');
        const hobotoolsRoot = path.join(sharedRoot, 'hobo-tools');
        const hoboquestRoot = path.join(sharedRoot, 'hobo-quest');
        const hobotoolsDb = writeDb(hobotoolsRoot, 'hobo-tools.db');
        const hoboquestDb = writeDb(hoboquestRoot, 'hobo-quest.db');

        const summary = resolveLegacyArtifactSummary({
            sourceDir: path.join(root, 'staging'),
            args: { legacySourceRoot: sharedRoot },
            env: {},
        });

        assert.strictEqual(summary.hobotools_root, hobotoolsRoot);
        assert.strictEqual(summary.hobotools_db, hobotoolsDb);
        assert.strictEqual(summary.hoboquest_root, hoboquestRoot);
        assert.strictEqual(summary.hoboquest_db, hoboquestDb);
    });
})();

console.log('legacy source roots test OK');
