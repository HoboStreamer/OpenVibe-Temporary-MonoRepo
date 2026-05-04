'use strict';

/**
 * api-key-middleware.js
 *
 * Reads an API key from the `Authorization: ApiKey <raw-key>` header,
 * hashes it, looks it up in the local DB, and sets `req.apiKey` on match.
 *
 * If both a JWT (`req.user`) and an API key are present, the JWT wins.
 * If only an API key is present, `req.user` is synthesized from the key record.
 */

const db = require('./db');

function apiKeyAuth(req, _res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('ApiKey ')) return next();

    const rawKey = authHeader.slice('ApiKey '.length).trim();
    if (!rawKey) return next();

    const hash = db.hashKey(rawKey);
    const record = db.getApiKeyByHash(hash);
    if (!record) return next();

    // Async touch (best-effort; don't block the request)
    setImmediate(() => db.touchApiKey(record.id));

    req.apiKey = {
        id:      record.id,
        name:    record.name,
        user_id: record.user_id,
        scopes:  (() => { try { return JSON.parse(record.scopes); } catch { return []; } })(),
    };

    // If the JWT middleware didn't set req.user, synthesize a minimal user from the key
    if (!req.user) {
        req.user = {
            id:   record.user_id,
            sub:  record.user_id,
            role: 'user',
            _via: 'api_key',
        };
    }

    return next();
}

module.exports = { apiKeyAuth };
