'use strict';

// Mod manifest validation. Mods are data-only in Phase 17 — no script
// execution. Manifests describe content, permissions, and asset references.

const REQUIRED_FIELDS = ['id', 'name', 'version', 'engine_version'];

function isObject(value) { return value && typeof value === 'object' && !Array.isArray(value); }

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
    // Phase 17: forbid arbitrary script payloads.
    if (isObject(manifest.scripts) || Array.isArray(manifest.scripts)) {
        errors.push('scripts are not permitted in Phase 17 manifests');
    }
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

module.exports = { validateManifest, namespaceAllowed };
