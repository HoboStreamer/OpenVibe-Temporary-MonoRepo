'use strict';

const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');

const db = require('./db');
const audit = require('./audit');
const staff = require('./api/staff');

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 2;
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const AUTH_CODE_TTL_SECONDS = 60 * 5;

function nowIso(offsetMs = 0) {
    return new Date(Date.now() + offsetMs).toISOString();
}

function randomOpaque(prefix) {
    return `${prefix}_${crypto.randomBytes(24).toString('base64url')}`;
}

function hashOpaque(value) {
    return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function parseJson(value, fallback) {
    if (!value) return fallback;
    try { return JSON.parse(value); } catch { return fallback; }
}

function slugifyUsername(value) {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-');
    return normalized.slice(0, 32);
}

function normalizeEmail(value) {
    const email = String(value || '').trim().toLowerCase();
    return email || null;
}

function deriveCookieDomain(url) {
    try {
        const hostname = new URL(url).hostname;
        if (!hostname || hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return null;
        const segments = hostname.split('.').filter(Boolean);
        if (segments.length <= 1) return null;
        if (segments[segments.length - 1] === 'localhost' && segments.length >= 3) {
            return `.${segments.slice(-2).join('.')}`;
        }
        return `.${segments.slice(1).join('.')}`;
    } catch {
        return null;
    }
}

function deriveLocalhostCookieDomain(url) {
    try {
        const hostname = new URL(url).hostname;
        if (!hostname || hostname === 'localhost' || !hostname.endsWith('.localhost')) return null;
        return '.localhost';
    } catch {
        return null;
    }
}

function deriveLegacyCookieDomain(url) {
    try {
        const hostname = new URL(url).hostname;
        if (!hostname || hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return null;
        const segments = hostname.split('.').filter(Boolean);
        if (segments.length <= 1) return null;
        return `.${segments.slice(1).join('.')}`;
    } catch {
        return null;
    }
}

function pkceChallengeForVerifier(verifier, method) {
    if (!verifier) return '';
    if (!method || method === 'plain') return String(verifier);
    if (String(method).toUpperCase() !== 'S256') return '';
    return crypto.createHash('sha256').update(String(verifier)).digest('base64url');
}

function normalizeAuthorizeRequest(req, config) {
    const source = Object.assign({}, req.query || {}, req.body || {});
    return {
        client_id: source.client_id ? String(source.client_id) : '',
        redirect_uri: source.redirect_uri ? String(source.redirect_uri) : '',
        response_type: source.response_type ? String(source.response_type) : 'code',
        scope: source.scope ? String(source.scope) : 'openid profile email theme',
        state: source.state ? String(source.state) : '',
        nonce: source.nonce ? String(source.nonce) : '',
        code_challenge: source.code_challenge ? String(source.code_challenge) : '',
        code_challenge_method: source.code_challenge_method ? String(source.code_challenge_method) : 'S256',
        prompt: source.prompt ? String(source.prompt) : '',
        return_to: source.return_to ? String(source.return_to) : (req.get('referer') || config.surfaces.my),
    };
}

function renderHiddenAuthorizeFields(request) {
    const fields = [
        'client_id', 'redirect_uri', 'response_type', 'scope', 'state', 'nonce',
        'code_challenge', 'code_challenge_method', 'return_to',
    ];
    return fields
        .filter((key) => request[key])
        .map((key) => `<input type="hidden" name="${key}" value="${escapeHtml(request[key])}">`)
        .join('');
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderAuthorizePage({ config, request, sessionUser, errorMessage }) {
    const continueTarget = request.return_to || config.surfaces.my;
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Sign in — OpenVibe</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="stylesheet" href="/assets/openvibe.css" />
<style>
    body {
        background:
            radial-gradient(circle at top left, rgba(124, 92, 255, .22), transparent 28%),
            radial-gradient(circle at 85% 10%, rgba(45, 212, 191, .18), transparent 24%),
            linear-gradient(180deg, #090c14 0%, #0a1020 46%, #090c14 100%);
    }
    .ov-auth-shell {
        max-width: 1180px;
        margin: 0 auto;
        padding: 1.25rem 1.25rem 4rem;
    }
    .ov-auth-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.15fr) minmax(360px, .95fr);
        gap: 1rem;
        align-items: stretch;
    }
    .ov-auth-panel,
    .ov-auth-hero,
    .ov-auth-metric {
        background: linear-gradient(180deg, rgba(19, 23, 34, .95), rgba(13, 17, 29, .96));
        border: 1px solid rgba(91, 100, 115, .24);
        box-shadow: 0 24px 80px rgba(0, 0, 0, .35);
    }
    .ov-auth-hero {
        border-radius: 30px;
        padding: 1.4rem;
        position: relative;
        overflow: hidden;
    }
    .ov-auth-hero::before {
        content: '';
        position: absolute;
        inset: -1px;
        border-radius: inherit;
        background: linear-gradient(125deg, rgba(124, 92, 255, .18), transparent 34%, rgba(45, 212, 191, .16));
        pointer-events: none;
    }
    .ov-auth-copy,
    .ov-auth-panel { position: relative; z-index: 1; }
    .ov-auth-kicker {
        display: inline-flex;
        padding: .45rem .75rem;
        border-radius: 999px;
        background: rgba(255,255,255,.06);
        border: 1px solid rgba(255,255,255,.08);
        text-transform: uppercase;
        letter-spacing: .14em;
        font-size: .76rem;
        font-weight: 800;
        color: #dbeafe;
    }
    .ov-auth-title {
        margin: 1rem 0 .8rem;
        font-size: clamp(2.4rem, 5vw, 4.4rem);
        line-height: .95;
        letter-spacing: -.05em;
    }
    .ov-auth-gradient {
        background: linear-gradient(120deg, #eef2ff 15%, #c7d2fe 48%, #67e8f9 100%);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
    }
    .ov-auth-copy p,
    .ov-auth-list,
    .ov-auth-muted,
    .ov-auth-panel p { color: var(--ov-text-dim); }
    .ov-auth-list { padding-left: 1.1rem; line-height: 1.7; }
    .ov-auth-list li + li { margin-top: .35rem; }
    .ov-auth-metrics {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: .85rem;
        margin-top: 1rem;
    }
    .ov-auth-metric {
        border-radius: 18px;
        padding: .95rem;
    }
    .ov-auth-metric strong {
        display: block;
        font-size: 1.45rem;
        letter-spacing: -.03em;
    }
    .ov-auth-metric span {
        color: var(--ov-text-dim);
        font-size: .84rem;
    }
    .ov-auth-panel {
        border-radius: 30px;
        padding: 1.2rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .ov-auth-panel h2 { margin: 0; font-size: 1.35rem; }
    .ov-auth-form { display: grid; gap: .85rem; }
    .ov-auth-form label { display: grid; gap: .35rem; font-weight: 600; }
    .ov-auth-form small { color: var(--ov-text-faint); font-weight: 400; }
    .ov-auth-actions { display: flex; gap: .75rem; flex-wrap: wrap; }
    .ov-auth-chip-row { display: flex; gap: .55rem; flex-wrap: wrap; }
    .ov-auth-chip {
        display: inline-flex;
        padding: .4rem .7rem;
        border-radius: 999px;
        border: 1px solid var(--ov-border);
        background: rgba(255,255,255,.04);
        color: var(--ov-text-dim);
        font-size: .78rem;
    }
    .ov-auth-callout {
        border-radius: 18px;
        padding: .9rem 1rem;
        background: rgba(124, 92, 255, .08);
        border: 1px solid rgba(124, 92, 255, .18);
    }
    @media (max-width: 980px) {
        .ov-auth-grid { grid-template-columns: 1fr; }
        .ov-auth-metrics { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 640px) {
        .ov-auth-metrics { grid-template-columns: 1fr; }
        .ov-auth-actions { flex-direction: column; }
        .ov-auth-actions .ov-btn { width: 100%; justify-content: center; }
    }
</style>
</head>
<body>
<div class="ov-auth-shell">
    <div class="ov-auth-grid">
        <section class="ov-auth-hero">
            <div class="ov-auth-copy">
                <div class="ov-auth-kicker">Native OpenVibe identity</div>
                <h1 class="ov-auth-title">One account for <span class="ov-auth-gradient">streams, chat, community, themes, and tools</span></h1>
                <p>Sign in once and your OpenVibe session follows you across the network. This native flow signs RS256 JWTs locally, publishes OIDC discovery, and no longer depends on a live Hobo auth redirect to work.</p>
                <ul class="ov-auth-list">
                    <li>Canonical session cookie shared across OpenVibe subdomains</li>
                    <li>OIDC discovery and JWKS stay live on <code>auth.openvibe.network</code></li>
                    <li>Works for both direct browser sign-in and authorization-code token exchange</li>
                </ul>
                <div class="ov-auth-metrics">
                    <div class="ov-auth-metric"><strong>RS256</strong><span>signed by native OpenVibe keys</span></div>
                    <div class="ov-auth-metric"><strong>@username</strong><span>portable creator identity</span></div>
                    <div class="ov-auth-metric"><strong>Cookie + OAuth</strong><span>browser and client flows</span></div>
                </div>
            </div>
        </section>
        <section class="ov-auth-panel">
            <div>
                <h2>${sessionUser ? `Continue as @${escapeHtml(sessionUser.username)}` : 'Create an account or sign in'}</h2>
                <p>${sessionUser
                    ? 'You already have a valid OpenVibe session. Continue, switch account, or sign out.'
                    : 'No password ceremony here yet — use a username, optional display name, and optional email to bootstrap a native OpenVibe identity in this environment.'}</p>
            </div>
            ${errorMessage ? `<div class="ov-banner warn">${escapeHtml(errorMessage)}</div>` : ''}
            ${sessionUser ? `<div class="ov-auth-callout">
                <div class="ov-auth-chip-row">
                    <span class="ov-auth-chip">@${escapeHtml(sessionUser.username)}</span>
                    <span class="ov-auth-chip">role=${escapeHtml(sessionUser.role || 'user')}</span>
                    ${sessionUser.email ? `<span class="ov-auth-chip">${escapeHtml(sessionUser.email)}</span>` : ''}
                </div>
                <div class="ov-auth-actions" style="margin-top:1rem;">
                    <a class="ov-btn ov-btn-primary" href="${escapeHtml(continueTarget)}">Continue</a>
                    <a class="ov-btn" href="/oauth/authorize?prompt=login&amp;return_to=${encodeURIComponent(continueTarget)}">Switch account</a>
                    <a class="ov-btn" href="/oauth/logout?return_to=${encodeURIComponent(config.surfaces.network)}">Sign out</a>
                </div>
            </div>` : ''}
            <form class="ov-auth-form" method="post" action="/oauth/authorize">
                ${renderHiddenAuthorizeFields(request)}
                <label>
                    Username
                    <input class="ov-input" type="text" name="username" maxlength="32" placeholder="openvibe-fan" required>
                    <small>Your canonical handle. Letters, numbers, dots, underscores, and hyphens are cleaned automatically.</small>
                </label>
                <label>
                    Display name
                    <input class="ov-input" type="text" name="display_name" maxlength="80" placeholder="OpenVibe Fan Club">
                </label>
                <label>
                    Email <small>(optional)</small>
                    <input class="ov-input" type="email" name="email" maxlength="160" placeholder="you@example.com">
                </label>
                <div class="ov-auth-actions">
                    <button class="ov-btn ov-btn-primary" type="submit">${request.client_id ? 'Authorize and continue' : 'Create account / sign in'}</button>
                    <a class="ov-btn" href="${escapeHtml(config.surfaces.auth)}/.well-known/openid-configuration">View OIDC discovery</a>
                </div>
            </form>
            <p class="ov-auth-muted">Return target: <code>${escapeHtml(continueTarget)}</code>${request.client_id ? ` · client=<code>${escapeHtml(request.client_id)}</code>` : ''}</p>
        </section>
    </div>
</div>
</body>
</html>`;
}

function buildNativeAuth({ config, identity }) {
    ensureTables();
    const secureCookies = /^https:/i.test(String(config.surfaces.auth || ''));
    const cookieDomain = deriveCookieDomain(config.surfaces.auth);
    const legacyCookieDomain = deriveLegacyCookieDomain(config.surfaces.auth);
    const localhostCookieDomain = deriveLocalhostCookieDomain(config.surfaces.auth);

    function ensureTables() {
        db.get().exec(`
            CREATE TABLE IF NOT EXISTS auth_users (
                id            TEXT PRIMARY KEY,
                username      TEXT NOT NULL UNIQUE,
                display_name  TEXT,
                email         TEXT UNIQUE,
                avatar_url    TEXT,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_login_at DATETIME
            );
            CREATE TABLE IF NOT EXISTS auth_authorization_codes (
                code_hash              TEXT PRIMARY KEY,
                user_id                TEXT NOT NULL,
                client_id              TEXT,
                redirect_uri           TEXT,
                scope                  TEXT NOT NULL,
                nonce                  TEXT,
                state                  TEXT,
                code_challenge         TEXT,
                code_challenge_method  TEXT,
                session_id             TEXT,
                expires_at             DATETIME NOT NULL,
                consumed_at            DATETIME,
                created_at             DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_auth_codes_user ON auth_authorization_codes(user_id, created_at DESC);

            CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
                token_hash   TEXT PRIMARY KEY,
                user_id      TEXT NOT NULL,
                client_id    TEXT,
                scope        TEXT NOT NULL,
                session_id   TEXT,
                expires_at   DATETIME NOT NULL,
                rotated_at   DATETIME,
                revoked_at   DATETIME,
                created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_refresh_user ON auth_refresh_tokens(user_id, created_at DESC);

            CREATE TABLE IF NOT EXISTS auth_sessions (
                id            TEXT PRIMARY KEY,
                user_id       TEXT NOT NULL,
                user_agent    TEXT,
                ip_address    TEXT,
                created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_seen_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
                revoked_at    DATETIME,
                metadata_json TEXT NOT NULL DEFAULT '{}'
            );
            CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id, created_at DESC);
        `);
    }

    function cookieParts(token, maxAgeSeconds, domain) {
        const parts = [
            `openvibe_token=${encodeURIComponent(token || '')}`,
            'Path=/',
            'HttpOnly',
            'SameSite=Lax',
            `Max-Age=${Math.max(0, Number(maxAgeSeconds) || 0)}`,
        ];
        if (domain) parts.push(`Domain=${domain}`);
        if (secureCookies) parts.push('Secure');
        return parts.join('; ');
    }

    function setSessionCookie(res, token) {
        res.append('Set-Cookie', cookieParts(token, ACCESS_TOKEN_TTL_SECONDS, cookieDomain));
        for (const domain of Array.from(new Set([legacyCookieDomain, localhostCookieDomain]))) {
            if (domain && domain !== cookieDomain) {
                res.append('Set-Cookie', cookieParts('', 0, domain));
            }
        }
        res.append('Set-Cookie', cookieParts('', 0, null));
    }

    function clearSessionCookie(res) {
        const domains = Array.from(new Set([cookieDomain, legacyCookieDomain, localhostCookieDomain, null]));
        for (const domain of domains) {
            res.append('Set-Cookie', cookieParts('', 0, domain));
        }
    }

    function isAllowedRedirectUri(redirectUri) {
        if (!redirectUri) return false;
        try {
            const parsed = new URL(String(redirectUri));
            const allowedHosts = new Set(
                Object.values(config.surfaces || {})
                    .map((surfaceUrl) => {
                        try { return new URL(surfaceUrl).hostname; } catch { return null; }
                    })
                    .filter(Boolean)
            );
            if (allowedHosts.has(parsed.hostname)) return true;
            if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') return true;
            if (parsed.hostname.endsWith('.openvibe.network')) return true;
            if (parsed.hostname.endsWith('.openvibe.network.localhost')) return true;
            if (parsed.hostname.endsWith('.localhost')) return true;
            return false;
        } catch {
            return false;
        }
    }

    function appendTokenToReturnUri(redirectUri, accessToken) {
        const target = new URL(String(redirectUri));
        const hash = String(target.hash || '').replace(/^#/, '');
        const params = new URLSearchParams(hash);
        params.set('openvibe_token', accessToken);
        target.hash = params.toString();
        return target.toString();
    }

    function hydrateUser(row) {
        if (!row) return null;
        const role = staff.getRole(row.id);
        return {
            id: row.id,
            sub: row.id,
            username: row.username,
            display_name: row.display_name || row.username,
            email: row.email || null,
            avatar_url: row.avatar_url || null,
            role,
            metadata: parseJson(row.metadata_json, {}),
            created_at: row.created_at,
            updated_at: row.updated_at,
            last_login_at: row.last_login_at || null,
        };
    }

    function getUserById(userId) {
        const row = db.get().prepare('SELECT * FROM auth_users WHERE id = ? LIMIT 1').get(String(userId));
        return hydrateUser(row);
    }

    function getUserByUsername(username) {
        const normalized = slugifyUsername(username);
        if (!normalized) return null;
        const row = db.get().prepare('SELECT * FROM auth_users WHERE username = ? LIMIT 1').get(normalized);
        return hydrateUser(row);
    }

    function listUsers({ ids, query, limit, excludeUserId }) {
        const cap = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 25);
        const sql = db.get();
        const excluded = excludeUserId ? String(excludeUserId) : null;
        const requestedIds = Array.from(new Set((ids || []).map((value) => String(value || '').trim()).filter(Boolean))).slice(0, cap);
        let rows = [];
        if (requestedIds.length) {
            const placeholders = requestedIds.map(() => '?').join(', ');
            rows = sql.prepare(`
                SELECT *
                  FROM auth_users
                 WHERE id IN (${placeholders})
                 ORDER BY username ASC
            `).all(...requestedIds);
        } else {
            const rawQuery = String(query || '').trim();
            const normalizedQuery = slugifyUsername(rawQuery);
            if (!rawQuery && !normalizedQuery) return [];
            rows = sql.prepare(`
                SELECT *
                  FROM auth_users
                 WHERE username = ?
                    OR username LIKE ?
                    OR display_name LIKE ?
                 ORDER BY CASE WHEN username = ? THEN 0 ELSE 1 END,
                          datetime(last_login_at) DESC,
                          username ASC
                 LIMIT ?
            `).all(
                normalizedQuery || rawQuery,
                `${normalizedQuery || rawQuery}%`,
                `${rawQuery}%`,
                normalizedQuery || rawQuery,
                cap
            );
        }
        return rows
            .map(hydrateUser)
            .filter((user) => user && (!excluded || user.id !== excluded))
            .slice(0, cap);
    }

    function upsertUser({ username, display_name, email }) {
        const normalizedUsername = slugifyUsername(username || (email ? String(email).split('@')[0] : ''));
        if (!normalizedUsername || normalizedUsername.length < 2) {
            throw new Error('username must contain at least 2 valid characters');
        }
        const normalizedEmail = normalizeEmail(email);
        const trimmedDisplayName = String(display_name || '').trim() || normalizedUsername;
        const sql = db.get();
        const byUsername = sql.prepare('SELECT * FROM auth_users WHERE username = ? LIMIT 1').get(normalizedUsername);
        const byEmail = normalizedEmail
            ? sql.prepare('SELECT * FROM auth_users WHERE email = ? LIMIT 1').get(normalizedEmail)
            : null;
        const existing = byUsername || byEmail || null;
        if (existing) {
            sql.prepare(`
                UPDATE auth_users
                   SET username = ?,
                       display_name = ?,
                       email = ?,
                       updated_at = CURRENT_TIMESTAMP,
                       last_login_at = CURRENT_TIMESTAMP
                 WHERE id = ?
            `).run(normalizedUsername, trimmedDisplayName, normalizedEmail, existing.id);
            return getUserById(existing.id);
        }
        const id = randomOpaque('usr');
        sql.prepare(`
            INSERT INTO auth_users (id, username, display_name, email, last_login_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(id, normalizedUsername, trimmedDisplayName, normalizedEmail);
        return getUserById(id);
    }

    function updateUserProfile(userId, patch) {
        const current = getUserById(userId);
        if (!current) return null;
        const nextUsername = patch.username ? slugifyUsername(patch.username) : current.username;
        const nextEmail = Object.prototype.hasOwnProperty.call(patch, 'email') ? normalizeEmail(patch.email) : current.email;
        const nextDisplayName = Object.prototype.hasOwnProperty.call(patch, 'display_name')
            ? (String(patch.display_name || '').trim() || nextUsername)
            : current.display_name;
        const nextAvatar = Object.prototype.hasOwnProperty.call(patch, 'avatar_url')
            ? (String(patch.avatar_url || '').trim() || null)
            : current.avatar_url;
        db.get().prepare(`
            UPDATE auth_users
               SET username = ?, display_name = ?, email = ?, avatar_url = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?
        `).run(nextUsername, nextDisplayName, nextEmail, nextAvatar, current.id);
        return getUserById(current.id);
    }

    function createSession(userId, req) {
        const sessionId = randomOpaque('sess');
        db.get().prepare(`
            INSERT INTO auth_sessions (id, user_id, user_agent, ip_address)
            VALUES (?, ?, ?, ?)
        `).run(sessionId, String(userId), req.get('user-agent') || null, req.ip || null);
        return { id: sessionId };
    }

    function touchSession(sessionId, req) {
        if (!sessionId) return;
        db.get().prepare(`
            UPDATE auth_sessions
               SET last_seen_at = CURRENT_TIMESTAMP,
                   user_agent = COALESCE(?, user_agent),
                   ip_address = COALESCE(?, ip_address)
             WHERE id = ? AND revoked_at IS NULL
        `).run(req.get('user-agent') || null, req.ip || null, String(sessionId));
    }

    function revokeSession(sessionId) {
        if (!sessionId) return;
        db.get().prepare('UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?').run(String(sessionId));
        db.get().prepare('UPDATE auth_refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE session_id = ?').run(String(sessionId));
    }

    function listSessionsForUser(userId) {
        return db.get().prepare(`
            SELECT id, user_agent, ip_address, created_at, last_seen_at, revoked_at
              FROM auth_sessions
             WHERE user_id = ?
             ORDER BY created_at DESC
             LIMIT 50
        `).all(String(userId));
    }

    function buildClaims(user, sessionId, scope, extra) {
        return Object.assign({
            sub: user.id,
            id: user.id,
            username: user.username,
            display_name: user.display_name || user.username,
            email: user.email || undefined,
            role: user.role || staff.getRole(user.id),
            sid: sessionId,
            scope,
        }, extra || {});
    }

    function issueAccessToken(user, sessionId, scope, extra) {
        return identity.issueToken(buildClaims(user, sessionId, scope, extra), {
            expiresIn: ACCESS_TOKEN_TTL_SECONDS,
            audience: 'openvibe',
            keyid: 'openvibe-1',
        });
    }

    function issueIdToken(user, sessionId, nonce) {
        return identity.issueToken(buildClaims(user, sessionId, 'openid profile email theme', {
            nonce: nonce || undefined,
        }), {
            expiresIn: ACCESS_TOKEN_TTL_SECONDS,
            audience: 'openvibe',
            keyid: 'openvibe-1',
        });
    }

    function mintRefreshToken({ userId, clientId, scope, sessionId }) {
        const token = randomOpaque('ovr');
        db.get().prepare(`
            INSERT INTO auth_refresh_tokens (token_hash, user_id, client_id, scope, session_id, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(hashOpaque(token), String(userId), clientId || null, scope, sessionId || null, nowIso(REFRESH_TOKEN_TTL_SECONDS * 1000));
        return token;
    }

    function mintAuthorizationCode({ userId, clientId, redirectUri, scope, nonce, state, codeChallenge, codeChallengeMethod, sessionId }) {
        const code = randomOpaque('ovc');
        db.get().prepare(`
            INSERT INTO auth_authorization_codes (
                code_hash, user_id, client_id, redirect_uri, scope, nonce, state,
                code_challenge, code_challenge_method, session_id, expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            hashOpaque(code),
            String(userId),
            clientId || null,
            redirectUri || null,
            scope,
            nonce || null,
            state || null,
            codeChallenge || null,
            codeChallengeMethod || null,
            sessionId || null,
            nowIso(AUTH_CODE_TTL_SECONDS * 1000)
        );
        return code;
    }

    function consumeAuthorizationCode({ code, clientId, redirectUri }) {
        const hash = hashOpaque(code);
        const row = db.get().prepare(`
            SELECT *
              FROM auth_authorization_codes
             WHERE code_hash = ?
               AND consumed_at IS NULL
               AND datetime(expires_at) > datetime('now')
             LIMIT 1
        `).get(hash);
        if (!row) return null;
        if ((row.client_id || '') !== String(clientId || '')) return null;
        if ((row.redirect_uri || '') !== String(redirectUri || '')) return null;
        db.get().prepare('UPDATE auth_authorization_codes SET consumed_at = CURRENT_TIMESTAMP WHERE code_hash = ?').run(hash);
        return row;
    }

    function consumeRefreshToken(refreshToken, clientId) {
        const row = db.get().prepare(`
            SELECT *
              FROM auth_refresh_tokens
             WHERE token_hash = ?
               AND revoked_at IS NULL
               AND rotated_at IS NULL
               AND datetime(expires_at) > datetime('now')
             LIMIT 1
        `).get(hashOpaque(refreshToken));
        if (!row) return null;
        if ((row.client_id || '') !== String(clientId || '')) return null;
        db.get().prepare('UPDATE auth_refresh_tokens SET rotated_at = CURRENT_TIMESTAMP WHERE token_hash = ?').run(hashOpaque(refreshToken));
        return row;
    }

    function verifyPkce(row, verifier) {
        if (!row.code_challenge) return true;
        if (!verifier) return false;
        return pkceChallengeForVerifier(verifier, row.code_challenge_method || 'S256') === String(row.code_challenge);
    }

    function buildBrowserBundle(user, req) {
        const session = createSession(user.id, req);
        const scope = 'openid profile email theme';
        return {
            session,
            access_token: issueAccessToken(user, session.id, scope),
            refresh_token: mintRefreshToken({ userId: user.id, clientId: 'openvibe-browser', scope, sessionId: session.id }),
            expires_in: ACCESS_TOKEN_TTL_SECONDS,
            scope,
        };
    }

    function finishAuthorize(req, res, user, request, sessionId) {
        if (request.client_id || request.redirect_uri) {
            if (request.response_type !== 'code') {
                return res.status(400).send(renderAuthorizePage({ config, request, sessionUser: user, errorMessage: 'Only response_type=code is supported right now.' }));
            }
            if (!request.client_id || !request.redirect_uri) {
                return res.status(400).send(renderAuthorizePage({ config, request, sessionUser: user, errorMessage: 'client_id and redirect_uri are both required for authorization-code flows.' }));
            }
            if (!isAllowedRedirectUri(request.redirect_uri)) {
                return res.status(400).send(renderAuthorizePage({ config, request, sessionUser: user, errorMessage: 'That redirect URI is not allowed in this environment.' }));
            }
            const code = mintAuthorizationCode({
                userId: user.id,
                clientId: request.client_id,
                redirectUri: request.redirect_uri,
                scope: request.scope || 'openid profile email theme',
                nonce: request.nonce,
                state: request.state,
                codeChallenge: request.code_challenge,
                codeChallengeMethod: request.code_challenge_method,
                sessionId,
            });
            const redirect = new URL(request.redirect_uri);
            redirect.searchParams.set('code', code);
            if (request.state) redirect.searchParams.set('state', request.state);
            return res.redirect(302, redirect.toString());
        }
        return res.redirect(302, request.return_to || config.surfaces.my);
    }

    function currentSessionUser(req) {
        if (!req.user) return null;
        return getUserById(req.user.sub || req.user.id) || req.user;
    }

    function handleAuthorizeGet(req, res) {
        const request = normalizeAuthorizeRequest(req, config);
        const sessionUser = currentSessionUser(req);
        if (sessionUser && request.prompt !== 'login') {
            touchSession(req.user && req.user.sid, req);
            return finishAuthorize(req, res, sessionUser, request, req.user && req.user.sid);
        }
        res.type('html').send(renderAuthorizePage({ config, request, sessionUser, errorMessage: '' }));
    }

    function handleAuthorizePost(req, res) {
        const request = normalizeAuthorizeRequest(req, config);
        let user;
        try {
            user = upsertUser(req.body || {});
        } catch (err) {
            return res.status(400).send(renderAuthorizePage({ config, request, sessionUser: null, errorMessage: err.message }));
        }
        const bundle = buildBrowserBundle(user, req);
        setSessionCookie(res, bundle.access_token);
        audit.record({
            actorType: 'user',
            actorId: user.id,
            action: 'auth.sign_in',
            resource: `auth_user:${user.id}`,
            outcome: 'allow',
            detail: { client_id: request.client_id || null },
        });
        return finishAuthorize(req, res, user, request, bundle.session.id);
    }

    function handleTokenPost(req, res) {
        if (!identity.hasNativeSigningKey()) {
            return res.status(503).json({ error: 'native signing key unavailable' });
        }
        const grantType = String((req.body && req.body.grant_type) || '');
        if (grantType === 'authorization_code') {
            const body = req.body || {};
            const codeRow = consumeAuthorizationCode({
                code: body.code,
                clientId: body.client_id,
                redirectUri: body.redirect_uri,
            });
            if (!codeRow) return res.status(400).json({ error: 'invalid_grant', error_description: 'authorization code is invalid, expired, or already used' });
            if (!verifyPkce(codeRow, body.code_verifier)) {
                return res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
            }
            const user = getUserById(codeRow.user_id);
            if (!user) return res.status(400).json({ error: 'invalid_grant', error_description: 'user no longer exists' });
            const sessionId = codeRow.session_id || createSession(user.id, req).id;
            const scope = codeRow.scope || 'openid profile email theme';
            const refreshToken = mintRefreshToken({ userId: user.id, clientId: body.client_id, scope, sessionId });
            const accessToken = issueAccessToken(user, sessionId, scope);
            return res.json({
                access_token: accessToken,
                token_type: 'Bearer',
                expires_in: ACCESS_TOKEN_TTL_SECONDS,
                refresh_token: refreshToken,
                scope,
                id_token: scope.includes('openid') ? issueIdToken(user, sessionId, codeRow.nonce) : undefined,
            });
        }
        if (grantType === 'refresh_token') {
            const body = req.body || {};
            const refreshRow = consumeRefreshToken(body.refresh_token, body.client_id);
            if (!refreshRow) {
                return res.status(400).json({ error: 'invalid_grant', error_description: 'refresh token is invalid, expired, or revoked' });
            }
            const user = getUserById(refreshRow.user_id);
            if (!user) return res.status(400).json({ error: 'invalid_grant', error_description: 'user no longer exists' });
            const sessionId = refreshRow.session_id || createSession(user.id, req).id;
            const scope = refreshRow.scope || 'openid profile email theme';
            const nextRefreshToken = mintRefreshToken({ userId: user.id, clientId: body.client_id, scope, sessionId });
            return res.json({
                access_token: issueAccessToken(user, sessionId, scope),
                token_type: 'Bearer',
                expires_in: ACCESS_TOKEN_TTL_SECONDS,
                refresh_token: nextRefreshToken,
                scope,
                id_token: scope.includes('openid') ? issueIdToken(user, sessionId) : undefined,
            });
        }
        return res.status(400).json({ error: 'unsupported_grant_type' });
    }

    function handleLogout(req, res) {
        if (req.user && req.user.sid) revokeSession(req.user.sid);
        clearSessionCookie(res);
        const returnTo = (req.query && req.query.return_to) ? String(req.query.return_to) : config.surfaces.network;
        res.redirect(302, returnTo);
    }

    function getUserModule(userId, namespace) {
        const row = db.get().prepare(`
            SELECT data_json, updated_at
              FROM user_modules
             WHERE user_id = ? AND namespace = ?
             LIMIT 1
        `).get(String(userId), String(namespace));
        if (!row) return null;
        return { data: parseJson(row.data_json, {}), updated_at: row.updated_at };
    }

    function upsertUserModule(userId, namespace, data) {
        const payload = JSON.stringify(data || {});
        db.get().prepare(`
            INSERT INTO user_modules (user_id, namespace, owner, schema_version, data_json, updated_by_actor_type, updated_by_actor_id, updated_at)
            VALUES (?, ?, ?, 1, ?, 'user', ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, namespace) DO UPDATE SET
                owner = excluded.owner,
                data_json = excluded.data_json,
                updated_by_actor_type = excluded.updated_by_actor_type,
                updated_by_actor_id = excluded.updated_by_actor_id,
                updated_at = CURRENT_TIMESTAMP
        `).run(String(userId), String(namespace), 'openvibe-network', payload, String(userId));
        db.get().prepare(`
            INSERT INTO user_modules_history (user_id, namespace, schema_version, data_json, actor_type, actor_id)
            VALUES (?, ?, 1, ?, 'user', ?)
        `).run(String(userId), String(namespace), payload, String(userId));
    }

    function requireNativeUser(req, res) {
        const userId = req.user && (req.user.sub || req.user.id);
        if (!userId) {
            res.status(401).json({ error: 'authentication required' });
            return null;
        }
        const user = getUserById(userId);
        if (!user) {
            res.status(401).json({ error: 'user not found' });
            return null;
        }
        touchSession(req.user.sid, req);
        return user;
    }

    function publicUser(user) {
        if (!user) return null;
        return {
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            avatar_url: user.avatar_url,
            role: user.role,
        };
    }

    function buildAccountRouter() {
        const router = express.Router();
        router.get('/session/bridge', (req, res) => {
            const returnTo = String(req.query.return_to || '').trim();
            if (!isAllowedRedirectUri(returnTo)) {
                return res.status(400).send('invalid return_to');
            }

            if (!req.user || !req.user.id) {
                const bridgeUrl = new URL('/api/v1/session/bridge', config.surfaces.network || config.surfaces.auth);
                bridgeUrl.searchParams.set('return_to', returnTo);
                const authorizeUrl = new URL('/oauth/authorize', config.surfaces.auth);
                authorizeUrl.searchParams.set('return_to', bridgeUrl.toString());
                return res.redirect(302, authorizeUrl.toString());
            }

            const user = getUserById(req.user.id);
            if (!user) {
                return res.status(401).send('user not found');
            }

            const sessionId = (req.user && req.user.sid) || createSession(user.id, req).id;
            if (req.user && req.user.sid) touchSession(req.user.sid, req);
            const scope = 'openid profile email theme';
            const accessToken = issueAccessToken(user, sessionId, scope);
            return res.redirect(302, appendTokenToReturnUri(returnTo, accessToken));
        });

        router.post('/session/exchange', (req, res) => {
            const user = requireNativeUser(req, res);
            if (!user) return;
            const sessionId = (req.user && req.user.sid) || createSession(user.id, req).id;
            const scope = 'openid profile email theme';
            res.json({
                access_token: issueAccessToken(user, sessionId, scope),
                token_type: 'Bearer',
                expires_in: ACCESS_TOKEN_TTL_SECONDS,
                scope,
                user,
            });
        });

        router.get('/users/lookup', (req, res) => {
            const user = requireNativeUser(req, res);
            if (!user) return;
            const ids = String(req.query.ids || '')
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean);
            const query = req.query.q || req.query.username || '';
            if (!ids.length && !String(query || '').trim()) {
                return res.json({ items: [] });
            }
            const items = listUsers({
                ids,
                query,
                limit: req.query.limit,
                excludeUserId: req.query.exclude_self === 'true' ? user.id : null,
            }).map(publicUser);
            res.json({ items });
        });

        router.get('/account/profile', (req, res) => {
            const user = requireNativeUser(req, res);
            if (!user) return;
            res.json({
                user,
                profile: getUserModule(user.id, 'identity.profile'),
                theme: getUserModule(user.id, 'openvibe.theme'),
                notifications: getUserModule(user.id, 'control.notification_preferences'),
                launcher: getUserModule(user.id, 'control.launcher'),
            });
        });

        router.put('/account/profile', express.json(), (req, res) => {
            const user = requireNativeUser(req, res);
            if (!user) return;
            const body = req.body || {};
            let nextUser;
            try {
                nextUser = updateUserProfile(user.id, body);
            } catch (err) {
                return res.status(400).json({ error: err.message });
            }
            if (body.profile) upsertUserModule(user.id, 'identity.profile', body.profile);
            if (body.theme) upsertUserModule(user.id, 'openvibe.theme', body.theme);
            if (body.notifications) upsertUserModule(user.id, 'control.notification_preferences', body.notifications);
            if (body.launcher) upsertUserModule(user.id, 'control.launcher', body.launcher);
            audit.record({
                actorType: 'user',
                actorId: user.id,
                action: 'account.profile.update',
                resource: `auth_user:${user.id}`,
                outcome: 'allow',
            });
            res.json({
                user: nextUser,
                profile: getUserModule(user.id, 'identity.profile'),
                theme: getUserModule(user.id, 'openvibe.theme'),
                notifications: getUserModule(user.id, 'control.notification_preferences'),
                launcher: getUserModule(user.id, 'control.launcher'),
            });
        });

        router.get('/account/sessions', (req, res) => {
            const user = requireNativeUser(req, res);
            if (!user) return;
            res.json({ items: listSessionsForUser(user.id) });
        });

        router.get('/account/linked', (req, res) => {
            const user = requireNativeUser(req, res);
            if (!user) return;
            res.json({ items: user.metadata.linked_accounts || [] });
        });

        router.post('/account/sign-out', (_req, res) => {
            clearSessionCookie(res);
            res.json({ ok: true });
        });

        return router;
    }

    return {
        buildAccountRouter,
        getUserById,
        getUserByUsername,
        handleAuthorizeGet,
        handleAuthorizePost,
        handleLogout,
        handleTokenPost,
        isAllowedRedirectUri,
        listSessionsForUser,
        upsertUser,
        updateUserProfile,
    };
}

module.exports = {
    ACCESS_TOKEN_TTL_SECONDS,
    buildNativeAuth,
    deriveCookieDomain,
    slugifyUsername,
};
