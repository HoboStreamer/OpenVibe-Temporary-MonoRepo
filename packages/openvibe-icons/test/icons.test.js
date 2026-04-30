'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const modulePath = require.resolve('../index');

function freshIconsModule() {
    delete require.cache[modulePath];
    return require('../index');
}

function resetEnv(key, value) {
    if (value == null) {
        delete process.env[key];
    } else {
        process.env[key] = value;
    }
}

(function browserBundleExposesRuntimeHelpers() {
    resetEnv('FONTAWESOME_PRO_LOCAL_PATH');
    resetEnv('FONTAWESOME_PRO_STYLE');
    resetEnv('FONTAWESOME_PRO_VERSION_HINT');

    const icons = freshIconsModule();
    const bundle = icons.buildBrowserBundle();
    assert(bundle.includes('global.OpenVibeIcons'), 'browser bundle should attach OpenVibeIcons');
    assert(icons.renderIcon('network').includes('ov-icon'), 'renderIcon should emit icon markup');

    const runtime = icons.describeIconRuntime();
    assert.strictEqual(runtime.free.enabled, true);
    assert.strictEqual(runtime.pro.style, 'solid');
})();

(function localInstallCanBeDescribed() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-icons-local-'));
    const localPackageDir = path.join(tmp, 'node_modules', '@fortawesome', 'pro-solid-svg-icons');
    fs.mkdirSync(localPackageDir, { recursive: true });
    fs.writeFileSync(path.join(localPackageDir, 'package.json'), JSON.stringify({
        name: '@fortawesome/pro-solid-svg-icons',
        version: '6.7.2',
    }, null, 2), 'utf8');
    fs.writeFileSync(path.join(localPackageDir, 'index.js'), 'module.exports = { faGlobe: [\'fass\', \'globe\', [], \'f0ac\', \'M0 0\'] };\n', 'utf8');

    resetEnv('FONTAWESOME_PRO_LOCAL_PATH', tmp);
    resetEnv('FONTAWESOME_PRO_STYLE', 'solid');
    resetEnv('FONTAWESOME_PRO_VERSION_HINT', '6.7.2');

    const icons = freshIconsModule();
    const runtime = icons.describeIconRuntime();
    assert.strictEqual(runtime.pro.style_supported, true);
    assert.strictEqual(runtime.pro.package_name, '@fortawesome/pro-solid-svg-icons');
    assert(runtime.pro.candidate_paths.some((candidate) => candidate.includes('pro-solid-svg-icons')));

    fs.rmSync(tmp, { recursive: true, force: true });
    resetEnv('FONTAWESOME_PRO_LOCAL_PATH');
    resetEnv('FONTAWESOME_PRO_STYLE');
    resetEnv('FONTAWESOME_PRO_VERSION_HINT');
    delete require.cache[modulePath];
})();

console.log('openvibe-icons test OK');