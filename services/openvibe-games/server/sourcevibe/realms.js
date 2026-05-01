'use strict';

const REALMS = Object.freeze({
    SHARED: 'shared',
    SERVER: 'server',
    CLIENT: 'client',
});

function normalizeRealm(value) {
    const raw = String(value || REALMS.SHARED).trim().toLowerCase();
    if (raw === REALMS.SERVER || raw === REALMS.CLIENT || raw === REALMS.SHARED) return raw;
    return REALMS.SHARED;
}

function realmFlags(value) {
    const realm = normalizeRealm(value);
    return {
        shared: realm === REALMS.SHARED,
        server: realm === REALMS.SERVER,
        client: realm === REALMS.CLIENT,
    };
}

module.exports = {
    REALMS,
    normalizeRealm,
    realmFlags,
};
