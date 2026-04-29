'use strict';

const assert = require('assert');
const {
    defaultOriginForSurface,
    resolveAuthIssuer,
    resolveInternalOrigin,
    resolvePublicOrigin,
} = require('..');

(() => {
    const env = { NODE_ENV: 'development' };
    assert.strictEqual(defaultOriginForSurface('live', env), 'http://openvibe.live.localhost:4600');
    assert.strictEqual(defaultOriginForSurface('tools', env), 'http://openvibe.tools.localhost:4100');
})();

(() => {
    const env = { NODE_ENV: 'production' };
    assert.strictEqual(defaultOriginForSurface('network', env), 'https://openvibe.network');
    assert.strictEqual(defaultOriginForSurface('billing', env), 'https://billing.openvibe.network');
})();

(() => {
    const env = {
        NODE_ENV: 'development',
        PUBLIC_BASE_URL: 'http://staging.openvibe.live:9999',
    };
    assert.strictEqual(resolvePublicOrigin({ env, surface: 'live', envKeys: ['PUBLIC_BASE_URL', 'OPENVIBE_LIVE_URL'] }), 'http://staging.openvibe.live:9999');
})();

(() => {
    const env = {
        NODE_ENV: 'development',
        OPENVIBE_MEDIA_URL: 'http://127.0.0.1:4500',
    };
    assert.strictEqual(resolvePublicOrigin({ env, surface: 'media' }), 'http://openvibe.media.localhost:4500');
})();

(() => {
    const env = {
        NODE_ENV: 'development',
        OPENVIBE_CHAT_URL: 'http://openvibe.chat.localhost:4800',
    };
    assert.strictEqual(resolveInternalOrigin({
        env,
        envKeys: ['OPENVIBE_CHAT_INTERNAL_URL'],
        publicEnvKeys: ['OPENVIBE_CHAT_URL'],
        fallbackPort: 4800,
    }), 'http://openvibe.chat.localhost:4800');
})();

(() => {
    const env = { NODE_ENV: 'development' };
    assert.strictEqual(resolveAuthIssuer(env), 'http://auth.openvibe.network.localhost:4100');
})();

console.log('url-defaults ok');