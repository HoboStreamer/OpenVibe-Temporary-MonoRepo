'use strict';

const crypto = require('crypto');

function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function clonePlain(value) {
    if (Array.isArray(value)) return value.map((entry) => clonePlain(entry));
    if (isObject(value)) {
        return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clonePlain(entry)]));
    }
    return value;
}

function deepMerge(baseValue, nextValue) {
    if (Array.isArray(nextValue)) return clonePlain(nextValue);
    if (!isObject(baseValue) || !isObject(nextValue)) return clonePlain(nextValue === undefined ? baseValue : nextValue);
    const merged = clonePlain(baseValue);
    for (const [key, value] of Object.entries(nextValue)) {
        merged[key] = key in merged ? deepMerge(merged[key], value) : clonePlain(value);
    }
    return merged;
}

function composeDefinition(baseDefinition = {}, childDefinition = {}) {
    const merged = Object.assign({}, clonePlain(baseDefinition), clonePlain(childDefinition));
    merged.shared = deepMerge(baseDefinition.shared || {}, childDefinition.shared || {});
    for (const [key, value] of Object.entries(baseDefinition)) {
        if (typeof value === 'function' && typeof childDefinition[key] !== 'function') merged[key] = value;
    }
    for (const [key, value] of Object.entries(childDefinition)) {
        if (typeof value === 'function') merged[key] = value;
    }
    return merged;
}

function uniqueEntityId(prefix = 'ent') {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

module.exports = {
    clonePlain,
    composeDefinition,
    deepMerge,
    isObject,
    uniqueEntityId,
};
