'use strict';

// OpenVibe — canonical event envelope. Every event published into the
// backbone wears this shape. Producers may add arbitrary `payload` content;
// the wrapper is fixed so consumers can rely on it for tracing, dedup,
// versioning, and replay.

const crypto = require('crypto');

function nowIso() {
    return new Date().toISOString();
}

function newId(prefix) {
    return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

/**
 * Build a complete envelope. Required fields: event_type, source, payload.
 * Optional fields are filled from sane defaults.
 */
function createEnvelope(input) {
    const e = input || {};
    if (!e.event_type || typeof e.event_type !== 'string') {
        throw new Error('createEnvelope: event_type is required (string)');
    }
    if (!e.source || typeof e.source !== 'string') {
        throw new Error('createEnvelope: source is required (string, service id)');
    }
    return {
        event_id:    e.event_id || newId('evt'),
        trace_id:    e.trace_id || newId('trc'),
        event_type:  e.event_type,
        version:     Number.isInteger(e.version) ? e.version : 1,
        source:      e.source,
        actor_type:  e.actor_type || 'system',     // user | service | mod | system
        actor_id:    e.actor_id != null ? String(e.actor_id) : null,
        timestamp:   e.timestamp || nowIso(),
        payload:     e.payload != null ? e.payload : {},
    };
}

/**
 * Cheap shape check used at the publish boundary. Returns an array of error
 * strings; an empty array means the envelope is well-formed.
 */
function validateEnvelope(env) {
    const errs = [];
    if (!env || typeof env !== 'object') return ['envelope must be an object'];
    for (const k of ['event_id', 'trace_id', 'event_type', 'source', 'timestamp']) {
        if (!env[k] || typeof env[k] !== 'string') errs.push(`field '${k}' must be a non-empty string`);
    }
    if (!Number.isInteger(env.version) || env.version < 1) errs.push("field 'version' must be a positive integer");
    if (env.actor_type && typeof env.actor_type !== 'string') errs.push("field 'actor_type' must be a string");
    if (env.actor_id != null && typeof env.actor_id !== 'string') errs.push("field 'actor_id' must be a string or null");
    if (env.payload != null && typeof env.payload !== 'object') errs.push("field 'payload' must be an object");
    return errs;
}

module.exports = { createEnvelope, validateEnvelope, newId };
