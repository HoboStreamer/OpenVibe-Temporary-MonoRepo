'use strict';

function safeClone(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
}

function unwrapDataSchema(schema) {
    if (!schema || typeof schema !== 'object') return null;
    if (
        schema.type === 'object'
        && schema.properties
        && schema.properties.data
        && Object.keys(schema.properties).length <= 4
    ) {
        return schema.properties.data;
    }
    return schema;
}

function mergePatch(target, patch) {
    if (!isPlainObject(patch)) {
        return safeClone(patch);
    }
    const base = isPlainObject(target) ? safeClone(target) : {};
    for (const [key, value] of Object.entries(patch)) {
        if (value === null) {
            delete base[key];
            continue;
        }
        if (isPlainObject(value) && isPlainObject(base[key])) {
            base[key] = mergePatch(base[key], value);
            continue;
        }
        base[key] = safeClone(value);
    }
    return base;
}

function validateSchema(schema, value, path = '$') {
    const errors = [];
    visit(schema, value, path, errors);
    return { ok: errors.length === 0, errors };
}

function visit(schema, value, path, errors) {
    if (!schema || typeof schema !== 'object') return;

    if (schema.anyOf) {
        const ok = schema.anyOf.some((candidate) => validateSchema(candidate, value, path).ok);
        if (!ok) errors.push(`${path}: value does not satisfy anyOf`);
        return;
    }
    if (schema.oneOf) {
        const matches = schema.oneOf.filter((candidate) => validateSchema(candidate, value, path).ok).length;
        if (matches !== 1) errors.push(`${path}: value must satisfy exactly one oneOf branch`);
        return;
    }

    if (value === null) {
        if (!allowsNull(schema)) errors.push(`${path}: expected non-null value`);
        return;
    }
    if (value === undefined) {
        return;
    }

    if (schema.const !== undefined && value !== schema.const) {
        errors.push(`${path}: value must equal ${JSON.stringify(schema.const)}`);
        return;
    }
    if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
        errors.push(`${path}: value must be one of ${schema.enum.map((item) => JSON.stringify(item)).join(', ')}`);
        return;
    }

    const type = normalizeType(schema.type, value);
    switch (type) {
        case 'object':
            validateObject(schema, value, path, errors);
            break;
        case 'array':
            validateArray(schema, value, path, errors);
            break;
        case 'string':
            validateString(schema, value, path, errors);
            break;
        case 'integer':
            validateInteger(schema, value, path, errors);
            break;
        case 'number':
            validateNumber(schema, value, path, errors);
            break;
        case 'boolean':
            validateBoolean(schema, value, path, errors);
            break;
        default:
            break;
    }
}

function validateObject(schema, value, path, errors) {
    if (!isPlainObject(value)) {
        errors.push(`${path}: expected object`);
        return;
    }
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of required) {
        if (value[key] === undefined) {
            errors.push(`${path}.${key}: is required`);
        }
    }

    const properties = schema.properties || {};
    const additionalProperties = schema.additionalProperties;
    for (const key of Object.keys(value)) {
        if (properties[key]) {
            visit(properties[key], value[key], `${path}.${key}`, errors);
            continue;
        }
        if (additionalProperties === false) {
            errors.push(`${path}.${key}: additional property is not allowed`);
            continue;
        }
        if (isPlainObject(additionalProperties)) {
            visit(additionalProperties, value[key], `${path}.${key}`, errors);
        }
    }
}

function validateArray(schema, value, path, errors) {
    if (!Array.isArray(value)) {
        errors.push(`${path}: expected array`);
        return;
    }
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) {
        errors.push(`${path}: expected at least ${schema.minItems} items`);
    }
    if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) {
        errors.push(`${path}: expected at most ${schema.maxItems} items`);
    }
    if (schema.items) {
        value.forEach((item, index) => visit(schema.items, item, `${path}[${index}]`, errors));
    }
}

function validateString(schema, value, path, errors) {
    if (typeof value !== 'string') {
        errors.push(`${path}: expected string`);
        return;
    }
    if (Number.isInteger(schema.minLength) && value.length < schema.minLength) {
        errors.push(`${path}: expected minimum length ${schema.minLength}`);
    }
    if (Number.isInteger(schema.maxLength) && value.length > schema.maxLength) {
        errors.push(`${path}: expected maximum length ${schema.maxLength}`);
    }
    if (schema.pattern) {
        try {
            const re = new RegExp(schema.pattern);
            if (!re.test(value)) errors.push(`${path}: does not match required pattern`);
        } catch {
            // ignore invalid pattern definitions rather than crashing the API.
        }
    }
    if (schema.format === 'uri') {
        try {
            // eslint-disable-next-line no-new
            new URL(value);
        } catch {
            errors.push(`${path}: expected valid uri`);
        }
    }
}

function validateInteger(schema, value, path, errors) {
    if (!Number.isInteger(value)) {
        errors.push(`${path}: expected integer`);
        return;
    }
    validateNumber(schema, value, path, errors, true);
}

function validateNumber(schema, value, path, errors, alreadyTyped) {
    if (!alreadyTyped && (typeof value !== 'number' || !Number.isFinite(value))) {
        errors.push(`${path}: expected number`);
        return;
    }
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
        errors.push(`${path}: expected minimum ${schema.minimum}`);
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
        errors.push(`${path}: expected maximum ${schema.maximum}`);
    }
}

function validateBoolean(_schema, value, path, errors) {
    if (typeof value !== 'boolean') {
        errors.push(`${path}: expected boolean`);
    }
}

function filterReadableFields(schema, value, context, path = '$') {
    if (!canReadSchema(schema, context, path)) return undefined;
    if (!schema || typeof schema !== 'object' || value == null) return safeClone(value);

    const type = normalizeType(schema.type, value);
    if (type === 'object' && isPlainObject(value)) {
        const out = {};
        const properties = schema.properties || {};
        for (const [key, current] of Object.entries(value)) {
            const childSchema = properties[key] || schema.additionalProperties;
            const filtered = filterReadableFields(childSchema, current, context, `${path}.${key}`);
            if (filtered !== undefined) out[key] = filtered;
        }
        return out;
    }
    if (type === 'array' && Array.isArray(value)) {
        return value
            .map((item, index) => filterReadableFields(schema.items, item, context, `${path}[${index}]`))
            .filter((item) => item !== undefined);
    }
    return safeClone(value);
}

function collectWriteErrors(schema, value, context, errors, path = '$') {
    if (!schema || typeof schema !== 'object' || value === undefined) return;
    if (!canWriteSchema(schema, context, path)) {
        errors.push(`${path}: field is not writable by this actor`);
        return;
    }

    const type = normalizeType(schema.type, value);
    if (type === 'object' && isPlainObject(value)) {
        const properties = schema.properties || {};
        for (const [key, current] of Object.entries(value)) {
            const childSchema = properties[key] || schema.additionalProperties;
            collectWriteErrors(childSchema, current, context, errors, `${path}.${key}`);
        }
        return;
    }
    if (type === 'array' && Array.isArray(value) && schema.items) {
        value.forEach((item, index) => collectWriteErrors(schema.items, item, context, errors, `${path}[${index}]`));
    }
}

function canReadSchema(schema, context, _path) {
    if (!schema || typeof schema !== 'object') return true;
    const scope = schema.read_scope || schema['x-read-scope'] || inferReadScope(schema);
    if (context.publicOnly) return scope === 'public';
    if (scope === 'public') return true;
    if (scope === 'self') return context.isSelf || context.isAdmin || context.isOwnerService;
    if (scope === 'service') return context.isOwnerService || context.isAdmin;
    if (scope === 'admin') return context.isAdmin;
    return true;
}

function canWriteSchema(schema, context, _path) {
    if (!schema || typeof schema !== 'object') return true;
    if (context.isAdmin || context.isOwnerService) return true;
    if (schema.readOnly === true || schema.user_writable === false || schema['x-user-writable'] === false) return false;
    const scope = schema.write_scope || schema['x-write-scope'] || inferWriteScope(schema);
    if (scope === 'public') return true;
    if (scope === 'self') return context.isSelf;
    if (scope === 'service') return false;
    if (scope === 'admin') return false;
    return true;
}

function inferReadScope(schema) {
    if (schema.private === true || schema['x-private'] === true) return 'service';
    return 'public';
}

function inferWriteScope(schema) {
    if (schema.private === true || schema['x-private'] === true) return 'service';
    return 'public';
}

function allowsNull(schema) {
    if (!schema || typeof schema !== 'object') return false;
    if (schema.nullable === true) return true;
    if (schema.type === 'null') return true;
    return Array.isArray(schema.type) && schema.type.includes('null');
}

function normalizeType(type, value) {
    if (Array.isArray(type)) {
        if (value === null && type.includes('null')) return 'null';
        if (type.includes('object') && isPlainObject(value)) return 'object';
        if (type.includes('array') && Array.isArray(value)) return 'array';
        if (type.includes('string') && typeof value === 'string') return 'string';
        if (type.includes('integer') && Number.isInteger(value)) return 'integer';
        if (type.includes('number') && typeof value === 'number') return 'number';
        if (type.includes('boolean') && typeof value === 'boolean') return 'boolean';
    }
    if (!type) {
        if (Array.isArray(value)) return 'array';
        if (isPlainObject(value)) return 'object';
        if (typeof value === 'string') return 'string';
        if (Number.isInteger(value)) return 'integer';
        if (typeof value === 'number') return 'number';
        if (typeof value === 'boolean') return 'boolean';
        return null;
    }
    return type;
}

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

module.exports = {
    safeClone,
    unwrapDataSchema,
    mergePatch,
    validateSchema,
    filterReadableFields,
    collectWriteErrors,
    isPlainObject,
};
