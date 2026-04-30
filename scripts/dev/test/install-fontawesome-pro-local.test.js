'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    findPackageDir,
    installFromPlan,
    normalizeStyle,
    packageInstallPath,
    resolveInstallPlan,
} = require('../install-fontawesome-pro-local');

async function main() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-fontawesome-pro-test-'));
    const sourceRoot = path.join(tmp, 'download');
    const packageDir = path.join(sourceRoot, 'vendor', 'node_modules', '@fortawesome', 'pro-solid-svg-icons');
    const targetRoot = path.join(tmp, 'target', 'node_modules');
    const metadataPath = path.join(tmp, 'target', 'install.json');

    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({
        name: '@fortawesome/pro-solid-svg-icons',
        version: '6.7.2',
    }, null, 2), 'utf8');
    fs.writeFileSync(path.join(packageDir, 'index.js'), 'module.exports = { faGlobe: [\'fass\', \'globe\', [], \'f0ac\', \'M0 0\'] };\n', 'utf8');

    assert.strictEqual(normalizeStyle('solid'), 'solid');
    assert.throws(() => normalizeStyle('regular'), /unsupported Font Awesome Pro style/);
    assert.strictEqual(findPackageDir(sourceRoot, '@fortawesome/pro-solid-svg-icons'), packageDir);

    const plan = resolveInstallPlan({
        sourcePath: sourceRoot,
        style: 'solid',
    });
    const metadata = installFromPlan(plan, {
        targetRoot,
        metadataPath,
        versionHint: '6.7.2',
    });

    const installedPackageJson = path.join(packageInstallPath(targetRoot, '@fortawesome/pro-solid-svg-icons'), 'package.json');
    assert(fs.existsSync(installedPackageJson), 'installer should copy the local package into the compat target root');
    assert.strictEqual(metadata.package_name, '@fortawesome/pro-solid-svg-icons');
    assert.strictEqual(metadata.style, 'solid');
    assert.strictEqual(metadata.version_hint, '6.7.2');
    assert.strictEqual(fs.existsSync(metadataPath), true, 'installer should write install metadata');

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log('fontawesome local installer test OK');
}

main().catch((error) => {
    console.error(error && error.stack || error);
    process.exit(1);
});