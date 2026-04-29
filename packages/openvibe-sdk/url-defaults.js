'use strict';

const SERVICE_DEFAULTS = Object.freeze({
    network:   { envKey: 'OPENVIBE_NETWORK_URL', productionOrigin: 'https://openvibe.network', port: 4100 },
    auth:      { envKey: 'OPENVIBE_AUTH_URL', productionOrigin: 'https://auth.openvibe.network', port: 4100 },
    api:       { envKey: 'OPENVIBE_API_URL', productionOrigin: 'https://api.openvibe.network', port: 4100 },
    admin:     { envKey: 'OPENVIBE_ADMIN_URL', productionOrigin: 'https://admin.openvibe.network', port: 4100 },
    my:        { envKey: 'OPENVIBE_MY_URL', productionOrigin: 'https://my.openvibe.network', port: 4100 },
    themes:    { envKey: 'OPENVIBE_THEMES_URL', productionOrigin: 'https://themes.openvibe.network', port: 4100 },
    tools:     { envKey: 'OPENVIBE_TOOLS_URL', productionOrigin: 'https://openvibe.tools', port: 4100 },
    media:     { envKey: 'OPENVIBE_MEDIA_URL', productionOrigin: 'https://openvibe.media', port: 4500 },
    live:      { envKey: 'OPENVIBE_LIVE_URL', productionOrigin: 'https://openvibe.live', port: 4600 },
    restream:  { envKey: 'OPENRE_STREAM_URL', productionOrigin: 'https://openre.stream', port: 4700 },
    chat:      { envKey: 'OPENVIBE_CHAT_URL', productionOrigin: 'https://openvibe.chat', port: 4800 },
    community: { envKey: 'OPENVIBE_COMMUNITY_URL', productionOrigin: 'https://openvibe.community', port: 4900 },
    billing:   { envKey: 'OPENVIBE_BILLING_URL', productionOrigin: 'https://billing.openvibe.network', port: 5000 },
    ai:        { envKey: 'OPENVIBE_AI_URL', productionOrigin: 'https://ai.openvibe.network', port: 5100 },
    games:     { envKey: 'OPENVIBE_GAMES_URL', productionOrigin: 'https://openvibe.games', port: 5200 },
});

function trimUrl(value) {
    return value ? String(value).trim().replace(/\/$/, '') : '';
}

function firstValue(env, keys) {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const key of list) {
        if (!key) continue;
        const value = trimUrl(env[key]);
        if (value) return value;
    }
    return '';
}

function urlMode(env = process.env) {
    const explicit = trimUrl(env.OPENVIBE_URL_MODE).toLowerCase();
    if (['local', 'localhost', 'dev', 'development', 'preview'].includes(explicit)) return 'local';
    if (['prod', 'production'].includes(explicit)) return 'production';
    return String(env.NODE_ENV || 'development').toLowerCase() === 'production' ? 'production' : 'local';
}

function isLocalUrlMode(env = process.env) {
    return urlMode(env) === 'local';
}

function localProtocol(env = process.env) {
    return trimUrl(env.OPENVIBE_LOCAL_PROTOCOL) || 'http';
}

function localHostSuffix(env = process.env) {
    return trimUrl(env.OPENVIBE_LOCAL_HOST_SUFFIX) || 'localhost';
}

function buildOrigin(protocol, hostname, port) {
    return `${protocol}://${hostname}${port ? `:${port}` : ''}`;
}

function deriveLocalOrigin(productionOrigin, port, env = process.env) {
    const target = new URL(productionOrigin);
    return buildOrigin(localProtocol(env), `${target.hostname}.${localHostSuffix(env)}`, port);
}

function isRawLoopbackOrigin(value) {
    if (!value) return false;
    try {
        const hostname = new URL(value).hostname.toLowerCase();
        return hostname === 'localhost'
            || hostname === '127.0.0.1'
            || hostname === '0.0.0.0'
            || hostname === '::1';
    } catch {
        return false;
    }
}

function defaultOriginForSurface(surface, env = process.env) {
    const definition = SERVICE_DEFAULTS[surface];
    if (!definition) throw new Error(`Unknown OpenVibe surface: ${surface}`);
    return isLocalUrlMode(env)
        ? deriveLocalOrigin(definition.productionOrigin, definition.port, env)
        : trimUrl(definition.productionOrigin);
}

function resolvePublicOrigin({ env = process.env, surface, envKeys } = {}) {
    if (!surface) throw new Error('resolvePublicOrigin: surface is required');
    const definition = SERVICE_DEFAULTS[surface];
    if (!definition) throw new Error(`Unknown OpenVibe surface: ${surface}`);
    const explicit = firstValue(env, Array.isArray(envKeys) && envKeys.length ? envKeys : [definition.envKey]);
    if (explicit) {
        if (isLocalUrlMode(env) && isRawLoopbackOrigin(explicit)) {
            return defaultOriginForSurface(surface, env);
        }
        return explicit;
    }
    return defaultOriginForSurface(surface, env);
}

function resolveInternalOrigin({ env = process.env, envKeys, publicEnvKeys, fallbackPort } = {}) {
    const explicit = firstValue(env, envKeys || []);
    if (explicit) return explicit;
    const fromPublic = firstValue(env, publicEnvKeys || []);
    if (fromPublic) return fromPublic;
    return buildOrigin('http', '127.0.0.1', fallbackPort);
}

function resolveAuthIssuer(env = process.env) {
    return resolvePublicOrigin({
        env,
        surface: 'auth',
        envKeys: ['OPENVIBE_AUTH_ISSUER', 'OPENVIBE_AUTH_URL'],
    });
}

module.exports = {
    SERVICE_DEFAULTS,
    defaultOriginForSurface,
    deriveLocalOrigin,
    isRawLoopbackOrigin,
    isLocalUrlMode,
    resolveAuthIssuer,
    resolveInternalOrigin,
    resolvePublicOrigin,
    trimUrl,
    urlMode,
};