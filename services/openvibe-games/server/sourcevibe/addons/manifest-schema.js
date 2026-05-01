'use strict';

const REQUIRED_FIELDS = ['id', 'name', 'version', 'engine_version'];
const SCRIPT_REALMS = Object.freeze(['server', 'shared', 'client']);

function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validateManifest(manifest) {
    const errors = [];
    if (!isObject(manifest)) return { ok: false, errors: ['manifest must be an object'] };
    for (const field of REQUIRED_FIELDS) {
        if (!manifest[field] || typeof manifest[field] !== 'string') errors.push(`missing or invalid field: ${field}`);
    }
    if (manifest.kind != null && !['addon', 'gamemode'].includes(String(manifest.kind))) {
        errors.push('kind must be addon or gamemode');
    }
    if (manifest.scripts != null) {
        if (!isObject(manifest.scripts)) {
            errors.push('scripts must be an object keyed by realm');
        } else {
            for (const [realm, entries] of Object.entries(manifest.scripts)) {
                if (!SCRIPT_REALMS.includes(realm)) {
                    errors.push(`scripts.${realm} is not a recognized realm`);
                    continue;
                }
                if (!Array.isArray(entries)) {
                    errors.push(`scripts.${realm} must be an array`);
                    continue;
                }
                entries.forEach((entry, index) => {
                    if (!isObject(entry)) {
                        errors.push(`scripts.${realm}[${index}] must be an object`);
                        return;
                    }
                    if (!entry.name || typeof entry.name !== 'string') errors.push(`scripts.${realm}[${index}].name is required`);
                    if (!entry.code || typeof entry.code !== 'string') errors.push(`scripts.${realm}[${index}].code is required`);
                });
            }
        }
    }
    return { ok: errors.length === 0, errors };
}

module.exports = {
    SCRIPT_REALMS,
    validateManifest,
};
