'use strict';

// Mod manifest validation. Manifests describe content, permissions, and asset references.

const REQUIRED_FIELDS = ['id', 'name', 'version', 'engine_version'];
const SCRIPT_REALMS = Object.freeze(['server', 'shared', 'client']);

function isObject(value) { return value && typeof value === 'object' && !Array.isArray(value); }

function listScriptRealms(manifest) {
    if (!manifest || !isObject(manifest.scripts)) return [];
    return SCRIPT_REALMS.filter((realm) => Array.isArray(manifest.scripts[realm]) && manifest.scripts[realm].length > 0);
}

function listScriptsForRealm(manifest, realm) {
    if (!manifest || !isObject(manifest.scripts)) return [];
    return Array.isArray(manifest.scripts[realm]) ? manifest.scripts[realm].filter(isObject) : [];
}

function validateScripts(scripts, errors) {
    if (scripts == null) return;
    if (!isObject(scripts)) {
        errors.push('scripts must be an object keyed by realm');
        return;
    }

    for (const key of Object.keys(scripts)) {
        if (!SCRIPT_REALMS.includes(key)) {
            errors.push(`scripts.${key} is not a recognized realm`);
            continue;
        }
        if (!Array.isArray(scripts[key])) {
            errors.push(`scripts.${key} must be an array`);
            continue;
        }

        scripts[key].forEach((entry, index) => {
            const prefix = `scripts.${key}[${index}]`;
            if (!isObject(entry)) {
                errors.push(`${prefix} must be an object`);
                return;
            }
            if (!entry.name || typeof entry.name !== 'string') {
                errors.push(`${prefix}.name is required`);
            }
            if (entry.name && !/^[a-z0-9][a-z0-9._-]{1,127}$/i.test(String(entry.name))) {
                errors.push(`${prefix}.name must be 2-128 chars, [a-z0-9._-]`);
            }
            if (!entry.code || typeof entry.code !== 'string') {
                errors.push(`${prefix}.code is required`);
            }
            if (typeof entry.code === 'string' && entry.code.length > 20000) {
                errors.push(`${prefix}.code must be 20000 chars or less`);
            }
            if (entry.description != null && typeof entry.description !== 'string') {
                errors.push(`${prefix}.description must be a string`);
            }
        });
    }
}

function validateManifest(manifest) {
    const errors = [];
    if (!isObject(manifest)) return { ok: false, errors: ['manifest must be an object'] };
    for (const field of REQUIRED_FIELDS) {
        if (!manifest[field] || typeof manifest[field] !== 'string') {
            errors.push(`missing or invalid field: ${field}`);
        }
    }
    if (manifest.id && !/^[a-z0-9][a-z0-9._-]{2,127}$/i.test(String(manifest.id))) {
        errors.push('id must be 3-128 chars, [a-z0-9._-]');
    }
    if (manifest.permissions != null && !isObject(manifest.permissions)) {
        errors.push('permissions must be an object');
    }
    if (manifest.content != null && !isObject(manifest.content)) {
        errors.push('content must be an object');
    }
    if (isObject(manifest.permissions)) {
        const allowedKeys = ['events', 'capabilities', 'media_namespaces', 'user_modules'];
        for (const key of Object.keys(manifest.permissions)) {
            if (!allowedKeys.includes(key)) errors.push(`permissions.${key} is not a recognized scope`);
        }
        for (const arrayKey of ['events', 'capabilities', 'media_namespaces']) {
            const value = manifest.permissions[arrayKey];
            if (value != null && !Array.isArray(value)) errors.push(`permissions.${arrayKey} must be an array`);
        }
    }
    validateScripts(manifest.scripts, errors);
    return { ok: errors.length === 0, errors };
}

function namespaceAllowed(manifest, namespace) {
    if (!manifest || !isObject(manifest.permissions)) return false;
    const list = manifest.permissions.media_namespaces;
    if (!Array.isArray(list)) return false;
    return list.some((entry) => {
        if (typeof entry !== 'string') return false;
        if (entry === namespace) return true;
        if (entry.endsWith('.*')) return namespace.startsWith(entry.slice(0, -1));
        return false;
    });
}

module.exports = {
    SCRIPT_REALMS,
    listScriptRealms,
    listScriptsForRealm,
    validateManifest,
    namespaceAllowed,
};
