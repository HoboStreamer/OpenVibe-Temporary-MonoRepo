'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');

const db = require('./db');
const audit = require('./audit');
const staff = require('./api/staff');

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 2;
const ANON_ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const AUTH_CODE_TTL_SECONDS = 60 * 5;

function normalizeAnonNumber(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function anonUsernameForNumber(anonNumber) {
    const normalized = normalizeAnonNumber(anonNumber);
    return normalized ? `anon${normalized}` : 'anon';
}

function anonDisplayNameForNumber(anonNumber) {
    const normalized = normalizeAnonNumber(anonNumber);
    return normalized ? `Anonymous #${normalized}` : 'Anonymous';
}

function isAnonActor(user) {
    return !!user && (user.actor_type === 'anon' || user.anonymous === true);
}

function nowIso(offsetMs = 0) {
    return new Date(Date.now() + offsetMs).toISOString();
}

function randomOpaque(prefix) {
    return `${prefix}_${crypto.randomBytes(24).toString('base64url')}`;
}

function isTruthy(value) {
    if (value == null || value === '') return false;
    const normalized = String(value).trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function hashOpaque(value) {
    return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function looksLikeBcryptHash(value) {
    return /^\$2[aby]?\$/.test(String(value || ''));
}

function passwordAlgorithmForHash(value) {
    return looksLikeBcryptHash(value) ? 'bcrypt' : 'none';
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
                    : (request.prompt === 'login'
                        ? 'Sign in with your native OpenVibe password using your username or email.'
                        : 'Create a native OpenVibe account with a password, or continue with imported credentials after migration.')}</p>
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
            ${request.prompt === 'login' ? `<form class="ov-auth-form" method="post" action="/oauth/authorize">
                ${renderHiddenAuthorizeFields(request)}
                <input type="hidden" name="mode" value="login">
                <label>
                    Username or email
                    <input class="ov-input" type="text" name="identifier" maxlength="160" placeholder="alice or alice@example.com" autocomplete="username" required>
                </label>
                <label>
                    Password
                    <input class="ov-input" type="password" name="password" minlength="8" autocomplete="current-password" required>
                </label>
                <div class="ov-auth-actions">
                    <button class="ov-btn ov-btn-primary" type="submit">${request.client_id ? 'Sign in and continue' : 'Sign in'}</button>
                    <a class="ov-btn" href="/oauth/authorize?return_to=${encodeURIComponent(continueTarget)}">Need an account?</a>
                </div>
            </form>` : `<form class="ov-auth-form" method="post" action="/oauth/authorize">
                ${renderHiddenAuthorizeFields(request)}
                <input type="hidden" name="mode" value="register">
                <label>
                    Username
                    <input class="ov-input" type="text" name="username" maxlength="32" placeholder="openvibe-fan" autocomplete="username" required>
                    <small>Your canonical handle. Letters, numbers, dots, underscores, and hyphens are cleaned automatically.</small>
                </label>
                <label>
                    Display name
                    <input class="ov-input" type="text" name="display_name" maxlength="80" placeholder="OpenVibe Fan Club">
                </label>
                <label>
                    Email <small>(optional)</small>
                    <input class="ov-input" type="email" name="email" maxlength="160" placeholder="you@example.com" autocomplete="email">
                </label>
                <label>
                    Password
                    <input class="ov-input" type="password" name="password" minlength="8" autocomplete="new-password" required>
                    <small>Use at least 8 characters. Imported bcrypt credentials continue to work after migration.</small>
                </label>
                <label>
                    Confirm password
                    <input class="ov-input" type="password" name="confirm_password" minlength="8" autocomplete="new-password" required>
                </label>
                <div class="ov-auth-actions">
                    <button class="ov-btn ov-btn-primary" type="submit">${request.client_id ? 'Create account and continue' : 'Create account'}</button>
                    <a class="ov-btn" href="/oauth/authorize?prompt=login&amp;return_to=${encodeURIComponent(continueTarget)}">Already have an account?</a>
                    <a class="ov-btn" href="${escapeHtml(config.surfaces.auth)}/.well-known/openid-configuration">View OIDC discovery</a>
                </div>
            </form>`}
            ${sessionUser ? '' : `<form class="ov-auth-form" method="post" action="/api/v1/session/anonymous">
                <input type="hidden" name="return_to" value="${escapeHtml(continueTarget)}">
                <div class="ov-auth-callout">
                    <strong>Need to stay anonymous?</strong>
                    <p style="margin:.45rem 0 0;">OpenVibe can issue a numbered anonymous identity like <code>Anonymous #27115</code> without letting arbitrary display names drift between surfaces.</p>
                </div>
                <div class="ov-auth-actions">
                    <button class="ov-btn" type="submit">Continue with anonymous identity</button>
                </div>
            </form>`}
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
        db.get().exec(db.AUTH_SCHEMA_SQL);
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

    function setSessionCookie(res, token, maxAgeSeconds = ACCESS_TOKEN_TTL_SECONDS) {
        res.append('Set-Cookie', cookieParts(token, maxAgeSeconds, cookieDomain));
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

    function getOauthClientManifest(clientId) {
        if (!clientId) return null;
        try {
            const row = db.get().prepare(`
                SELECT client_id, redirect_uris_json, is_first_party
                  FROM control_oauth_clients
                 WHERE client_id = ?
                 LIMIT 1
            `).get(String(clientId));
            if (!row) return null;
            return {
                client_id: row.client_id,
                redirect_uris: parseJson(row.redirect_uris_json, []),
                is_first_party: Boolean(row.is_first_party),
            };
        } catch {
            return null;
        }
    }

    function normalizeAbsoluteUrl(value) {
        try {
            return new URL(String(value || '')).toString();
        } catch {
            return null;
        }
    }

    function configuredPublicUrls() {
        const urls = [];
        for (const value of Object.values(config || {})) {
            if (!value || typeof value !== 'object') continue;
            if (typeof value.url === 'string') urls.push(value.url);
        }
        return urls;
    }

    function manifestAllowsRedirectUri(clientId, redirectUri) {
        const manifest = getOauthClientManifest(clientId);
        if (!manifest) return null;
        const normalizedRedirect = normalizeAbsoluteUrl(redirectUri);
        if (!normalizedRedirect) return false;
        const allowed = new Set(
            Array.isArray(manifest.redirect_uris)
                ? manifest.redirect_uris.map(normalizeAbsoluteUrl).filter(Boolean)
                : []
        );
        return allowed.has(normalizedRedirect);
    }

    function isAllowedRedirectUri(redirectUri, clientId) {
        if (!redirectUri) return false;
        const manifestDecision = manifestAllowsRedirectUri(clientId, redirectUri);
        if (manifestDecision != null) return manifestDecision;
        try {
            const parsed = new URL(String(redirectUri));
            const allowedHosts = new Set(
                Object.values(config.surfaces || {})
                    .concat(configuredPublicUrls())
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
            primary_source: row.primary_source || null,
            is_banned: Boolean(row.is_banned),
            ban_reason: row.ban_reason || null,
            metadata: parseJson(row.metadata_json, {}),
            created_at: row.created_at,
            updated_at: row.updated_at,
            last_login_at: row.last_login_at || null,
        };
    }

    function hydrateAnonUser(row) {
        if (!row) return null;
        const anonNumber = normalizeAnonNumber(row.anon_number);
        return {
            id: row.id,
            sub: row.id,
            actor_type: 'anon',
            anonymous: true,
            anon_number: anonNumber,
            username: anonUsernameForNumber(anonNumber),
            display_name: anonDisplayNameForNumber(anonNumber),
            email: null,
            avatar_url: null,
            role: 'anonymous',
            session_token: row.session_token || null,
            preferences: parseJson(row.preferences_json, {}),
            total_messages: Number(row.total_messages) || 0,
            total_commands: Number(row.total_commands) || 0,
            primary_source: row.primary_source || null,
            legacy_source: row.legacy_source || null,
            legacy_id: row.legacy_id || null,
            first_seen: row.first_seen || row.created_at || null,
            last_seen: row.last_seen || null,
            created_at: row.created_at,
            updated_at: row.updated_at,
        };
    }

    function getUserById(userId) {
        const row = db.get().prepare('SELECT * FROM auth_users WHERE id = ? LIMIT 1').get(String(userId));
        return hydrateUser(row);
    }

    function getAnonUserById(userId) {
        const row = db.get().prepare('SELECT * FROM auth_anon_users WHERE id = ? LIMIT 1').get(String(userId));
        return hydrateAnonUser(row);
    }

    function getAnonUserBySessionToken(sessionToken) {
        const token = String(sessionToken || '').trim();
        if (!token) return null;
        const row = db.get().prepare('SELECT * FROM auth_anon_users WHERE session_token = ? LIMIT 1').get(token);
        return hydrateAnonUser(row);
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

    function getUserByEmail(email) {
        const normalizedEmail = normalizeEmail(email);
        if (!normalizedEmail) return null;
        const row = db.get().prepare('SELECT * FROM auth_users WHERE email = ? LIMIT 1').get(normalizedEmail);
        return hydrateUser(row);
    }

    function getRawUserRowByIdentifier(identifier) {
        const normalizedIdentifier = String(identifier || '').trim();
        if (!normalizedIdentifier) return null;
        const sql = db.get();
        const username = slugifyUsername(normalizedIdentifier);
        if (username) {
            const byUsername = sql.prepare('SELECT * FROM auth_users WHERE username = ? LIMIT 1').get(username);
            if (byUsername) return byUsername;
        }
        const email = normalizeEmail(normalizedIdentifier);
        if (email) {
            return sql.prepare('SELECT * FROM auth_users WHERE email = ? LIMIT 1').get(email) || null;
        }
        return null;
    }

    function touchUserLastLogin(userId) {
        db.get().prepare(`
            UPDATE auth_users
               SET last_login_at = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP
             WHERE id = ?
        `).run(String(userId));
    }

    function registerUser({ username, display_name, email, password, confirm_password }) {
        const normalizedUsername = slugifyUsername(username || (email ? String(email).split('@')[0] : ''));
        if (!normalizedUsername || normalizedUsername.length < 2) {
            throw new Error('username must contain at least 2 valid characters');
        }
        if (/^anon/i.test(normalizedUsername)) {
            throw new Error('username cannot start with "anon" — this prefix is reserved for anonymous identities');
        }
        const normalizedEmail = normalizeEmail(email);
        const trimmedDisplayName = String(display_name || '').trim() || normalizedUsername;
        const rawPassword = String(password || '');
        if (rawPassword.length < 8) {
            throw new Error('password must be at least 8 characters');
        }
        if (rawPassword !== String(confirm_password || '')) {
            throw new Error('password confirmation does not match');
        }
        const sql = db.get();
        if (sql.prepare('SELECT 1 FROM auth_users WHERE username = ? LIMIT 1').get(normalizedUsername)) {
            throw new Error('username is already taken');
        }
        if (normalizedEmail && sql.prepare('SELECT 1 FROM auth_users WHERE email = ? LIMIT 1').get(normalizedEmail)) {
            throw new Error('email is already registered');
        }
        const passwordHash = bcrypt.hashSync(rawPassword, 12);
        const id = randomOpaque('usr');
        sql.prepare(`
            INSERT INTO auth_users (
                id, username, display_name, email, password_hash, password_algorithm,
                password_updated_at, primary_source, last_login_at
            )
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)
        `).run(id, normalizedUsername, trimmedDisplayName, normalizedEmail, passwordHash, passwordAlgorithmForHash(passwordHash), 'native');
        return getUserById(id);
    }

    function authenticateUser({ identifier, password }) {
        const rawPassword = String(password || '');
        const row = getRawUserRowByIdentifier(identifier);
        if (!row || !rawPassword) {
            throw new Error('invalid username/email or password');
        }
        if (Boolean(row.is_banned)) {
            throw new Error(row.ban_reason ? `account banned: ${row.ban_reason}` : 'account banned');
        }
        if (passwordAlgorithmForHash(row.password_hash) !== 'bcrypt') {
            throw new Error('password login is not available for this account yet');
        }
        if (!bcrypt.compareSync(rawPassword, row.password_hash)) {
            throw new Error('invalid username/email or password');
        }
        touchUserLastLogin(row.id);
        return getUserById(row.id);
    }

    function upsertUser(fields) {
        return registerUser(fields);
    }

    function updateUserProfile(userId, patch) {
        const current = getUserById(userId);
        if (!current) return null;
        const nextUsername = patch.username ? slugifyUsername(patch.username) : current.username;
        if (!nextUsername || nextUsername.length < 2) {
            throw new Error('username must contain at least 2 valid characters');
        }
        if (/^anon/i.test(nextUsername)) {
            throw new Error('username cannot start with "anon" — this prefix is reserved for anonymous identities');
        }
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

    function createSession(userId, req, options) {
        const sessionId = randomOpaque('sess');
        const metadata = Object.assign({}, options && options.metadata ? options.metadata : {});
        db.get().prepare(`
            INSERT INTO auth_sessions (id, user_id, user_agent, ip_address, metadata_json)
            VALUES (?, ?, ?, ?, ?)
        `).run(
            sessionId,
            String(userId),
            req.get('user-agent') || null,
            req.ip || null,
            JSON.stringify(metadata || {})
        );
        return { id: sessionId };
    }

    function nextAnonNumber() {
        const row = db.get().prepare('SELECT COALESCE(MAX(anon_number), 0) + 1 AS next_number FROM auth_anon_users').get();
        return normalizeAnonNumber(row && row.next_number) || 1;
    }

    function touchAnonLastSeen(anonId) {
        db.get().prepare(`
            UPDATE auth_anon_users
               SET last_seen = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP
             WHERE id = ?
        `).run(String(anonId));
    }

    function normalizeIpAddress(value) {
        const candidate = String(value == null ? '' : value).trim().toLowerCase();
        if (!candidate || candidate === 'unknown') return null;
        return candidate.replace(/^::ffff:/, '') || null;
    }

    function normalizeFingerprint(value) {
        const candidate = String(value == null ? '' : value).trim();
        return candidate || null;
    }

    function getRequestIp(req, overrideIp) {
        const forwarded = overrideIp
            || req && req.get && (req.get('cf-connecting-ip') || req.get('x-forwarded-for'))
            || req && req.ip
            || req && req.socket && req.socket.remoteAddress
            || req && req.connection && req.connection.remoteAddress
            || null;
        const primary = String(forwarded || '').split(',')[0].trim();
        return normalizeIpAddress(primary);
    }

    function getAnonUserByAnonNumber(anonNumber) {
        const normalized = normalizeAnonNumber(anonNumber);
        if (!normalized) return null;
        const row = db.get().prepare('SELECT * FROM auth_anon_users WHERE anon_number = ? LIMIT 1').get(normalized);
        return hydrateAnonUser(row);
    }

    function getAnonUserByFingerprint(fingerprint) {
        const normalizedFingerprint = normalizeFingerprint(fingerprint);
        if (!normalizedFingerprint) return null;
        const row = db.get().prepare(`
            SELECT u.*
              FROM auth_anon_fingerprints f
              JOIN auth_anon_users u ON u.id = f.anon_user_id
             WHERE f.fingerprint = ?
             ORDER BY u.anon_number ASC,
                      datetime(f.last_seen) DESC,
                      datetime(u.last_seen) DESC
             LIMIT 1
        `).get(normalizedFingerprint);
        return hydrateAnonUser(row);
    }

    function getAnonUserByIpAddress(ipAddress) {
        const normalizedIp = normalizeIpAddress(ipAddress);
        if (!normalizedIp) return null;
        const row = db.get().prepare(`
            SELECT u.*
              FROM auth_anon_ip_links l
              JOIN auth_anon_users u ON u.id = l.anon_user_id
             WHERE l.ip_address = ?
             ORDER BY u.anon_number ASC,
                      datetime(l.last_seen) DESC,
                      datetime(u.last_seen) DESC
             LIMIT 1
        `).get(normalizedIp);
        return hydrateAnonUser(row);
    }

    function anonUserMatchesContinuity(anonUserId, ipAddress, fingerprint) {
        if (!anonUserId) return false;
        const normalizedFingerprint = normalizeFingerprint(fingerprint);
        if (normalizedFingerprint) {
            const byFingerprint = db.get().prepare(`
                SELECT 1
                  FROM auth_anon_fingerprints
                 WHERE anon_user_id = ? AND fingerprint = ?
                 LIMIT 1
            `).get(String(anonUserId), normalizedFingerprint);
            if (byFingerprint) return true;
        }
        const normalizedIp = normalizeIpAddress(ipAddress);
        if (!normalizedIp) return false;
        const byIp = db.get().prepare(`
            SELECT 1
              FROM auth_anon_ip_links
             WHERE anon_user_id = ? AND ip_address = ?
             LIMIT 1
        `).get(String(anonUserId), normalizedIp);
        return !!byIp;
    }

    function ensureAnonSessionToken(anonId, preferredToken) {
        const nextToken = String(preferredToken || '').trim() || crypto.randomUUID();
        db.get().prepare(`
            UPDATE auth_anon_users
               SET session_token = ?,
                   last_seen = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP
             WHERE id = ?
        `).run(nextToken, String(anonId));
        return getAnonUserById(anonId);
    }

    function mergeAnonContinuityMetadata(existingJson, patch) {
        const current = parseJson(existingJson, {});
        const next = Object.assign({}, current, patch || {});
        if (patch && patch.legacy_ref) {
            next.legacy_ref = patch.legacy_ref;
        }
        return next;
    }

    function upsertAnonIpLink(anonUserId, ipAddress, options) {
        const normalizedIp = normalizeIpAddress(ipAddress);
        if (!anonUserId || !normalizedIp) return;
        const row = db.get().prepare(`
            SELECT *
              FROM auth_anon_ip_links
             WHERE anon_user_id = ? AND ip_address = ?
             LIMIT 1
        `).get(String(anonUserId), normalizedIp);
        const nextId = row && row.id ? row.id : `anon-ip:${hashOpaque(`${anonUserId}:${normalizedIp}`)}`;
        const metadataJson = JSON.stringify(mergeAnonContinuityMetadata(row && row.metadata_json, options && options.metadata));
        db.get().prepare(`
            INSERT INTO auth_anon_ip_links (
                id, anon_user_id, ip_address, source, metadata_json,
                first_seen, last_seen, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                anon_user_id = excluded.anon_user_id,
                ip_address = excluded.ip_address,
                source = COALESCE(excluded.source, auth_anon_ip_links.source),
                metadata_json = excluded.metadata_json,
                first_seen = COALESCE(auth_anon_ip_links.first_seen, excluded.first_seen),
                last_seen = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
        `).run(
            nextId,
            String(anonUserId),
            normalizedIp,
            options && options.source || 'openvibe-runtime',
            metadataJson,
            row && row.first_seen || options && options.firstSeen || nowIso()
        );
    }

    function upsertAnonFingerprint(anonUserId, fingerprint, options) {
        const normalizedFingerprint = normalizeFingerprint(fingerprint);
        if (!anonUserId || !normalizedFingerprint) return;
        const row = db.get().prepare(`
            SELECT *
              FROM auth_anon_fingerprints
             WHERE anon_user_id = ? AND fingerprint = ?
             LIMIT 1
        `).get(String(anonUserId), normalizedFingerprint);
        const nextId = row && row.id ? row.id : `anon-fingerprint:${hashOpaque(`${anonUserId}:${normalizedFingerprint}`)}`;
        const metadataJson = JSON.stringify(mergeAnonContinuityMetadata(row && row.metadata_json, options && options.metadata));
        db.get().prepare(`
            INSERT INTO auth_anon_fingerprints (
                id, anon_user_id, fingerprint, source, metadata_json,
                first_seen, last_seen, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                anon_user_id = excluded.anon_user_id,
                fingerprint = excluded.fingerprint,
                source = COALESCE(excluded.source, auth_anon_fingerprints.source),
                metadata_json = excluded.metadata_json,
                first_seen = COALESCE(auth_anon_fingerprints.first_seen, excluded.first_seen),
                last_seen = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
        `).run(
            nextId,
            String(anonUserId),
            normalizedFingerprint,
            options && options.source || 'openvibe-runtime',
            metadataJson,
            row && row.first_seen || options && options.firstSeen || nowIso()
        );
    }

    function rememberAnonContinuity(anonUser, params) {
        if (!anonUser || !anonUser.id) return anonUser;
        const metadata = {
            anon_number: anonUser.anon_number || null,
            actor_type: 'anon',
            user_agent: params && params.userAgent || null,
        };
        upsertAnonIpLink(anonUser.id, params && params.ipAddress, {
            source: params && params.source || 'openvibe-runtime',
            firstSeen: anonUser.first_seen || anonUser.created_at || nowIso(),
            metadata,
        });
        upsertAnonFingerprint(anonUser.id, params && params.fingerprint, {
            source: params && params.source || 'openvibe-runtime',
            firstSeen: anonUser.first_seen || anonUser.created_at || nowIso(),
            metadata,
        });
        return getAnonUserById(anonUser.id) || anonUser;
    }

    function listAnonIdentitiesForRequest(req, options) {
        const ipAddress = getRequestIp(req, options && options.ipAddress);
        const fingerprint = normalizeFingerprint(options && options.fingerprint);
        const items = new Map();

        if (ipAddress) {
            const rows = db.get().prepare(`
                SELECT u.*
                  FROM auth_anon_ip_links l
                  JOIN auth_anon_users u ON u.id = l.anon_user_id
                 WHERE l.ip_address = ?
                 ORDER BY u.anon_number ASC,
                          datetime(l.last_seen) DESC,
                          datetime(u.last_seen) DESC
            `).all(ipAddress);
            for (const row of rows) {
                const user = hydrateAnonUser(row);
                if (user) items.set(user.id, user);
            }
        }

        if (fingerprint) {
            const rows = db.get().prepare(`
                SELECT u.*
                  FROM auth_anon_fingerprints f
                  JOIN auth_anon_users u ON u.id = f.anon_user_id
                 WHERE f.fingerprint = ?
                 ORDER BY u.anon_number ASC,
                          datetime(f.last_seen) DESC,
                          datetime(u.last_seen) DESC
            `).all(fingerprint);
            for (const row of rows) {
                const user = hydrateAnonUser(row);
                if (user) items.set(user.id, user);
            }
        }

        const currentAnon = isAnonActor(req && req.user) ? resolveSessionUser(req) : null;
        if (currentAnon && currentAnon.id) {
            items.set(currentAnon.id, currentAnon);
        }

        return [...items.values()].sort((left, right) => {
            const leftNumber = normalizeAnonNumber(left && left.anon_number) || Number.MAX_SAFE_INTEGER;
            const rightNumber = normalizeAnonNumber(right && right.anon_number) || Number.MAX_SAFE_INTEGER;
            if (leftNumber !== rightNumber) return leftNumber - rightNumber;
            return String(left && left.id || '').localeCompare(String(right && right.id || ''));
        });
    }

    function ensureAnonUser({ sessionToken, req, forceNew, fingerprint, anonUserId, anonNumber, ipAddress, source }) {
        const requestedToken = String(sessionToken || '').trim() || null;
        const requestedIp = getRequestIp(req, ipAddress);
        const requestedFingerprint = normalizeFingerprint(fingerprint);
        let existing = requestedToken ? getAnonUserBySessionToken(requestedToken) : null;

        if (!existing && !forceNew && anonUserId) {
            const candidate = getAnonUserById(anonUserId);
            if (candidate && anonUserMatchesContinuity(candidate.id, requestedIp, requestedFingerprint)) {
                existing = candidate;
            }
        }

        if (!existing && !forceNew && anonNumber) {
            const candidate = getAnonUserByAnonNumber(anonNumber);
            if (candidate && anonUserMatchesContinuity(candidate.id, requestedIp, requestedFingerprint)) {
                existing = candidate;
            }
        }

        if (!existing && !forceNew && requestedFingerprint) {
            existing = getAnonUserByFingerprint(requestedFingerprint);
        }

        if (!existing && !forceNew && requestedIp) {
            existing = getAnonUserByIpAddress(requestedIp);
        }

        if (existing) {
            touchAnonLastSeen(existing.id);
            const userWithToken = existing.session_token ? (getAnonUserById(existing.id) || existing) : ensureAnonSessionToken(existing.id, requestedToken);
            return {
                created: false,
                user: rememberAnonContinuity(userWithToken, {
                    ipAddress: requestedIp,
                    fingerprint: requestedFingerprint,
                    source: source || 'openvibe-runtime',
                    userAgent: req && req.get ? req.get('user-agent') || null : null,
                }),
            };
        }
        const nextAnon = nextAnonNumber();
        const id = `anon-user:openvibe:${nextAnon}`;
        const nextSessionToken = requestedToken || crypto.randomUUID();
        db.get().prepare(`
            INSERT INTO auth_anon_users (
                id, anon_number, session_token, display_name, preferences_json,
                total_messages, total_commands, primary_source, legacy_source, legacy_id,
                first_seen, last_seen, created_at, updated_at
            ) VALUES (?, ?, ?, ?, '{}', 0, 0, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(id, nextAnon, nextSessionToken, anonDisplayNameForNumber(nextAnon), 'openvibe', 'openvibe', String(nextAnon));
        audit.record({
            actorType: 'anonymous',
            actorId: id,
            action: 'auth.anon.provision',
            resource: `auth_anon_user:${id}`,
            outcome: 'allow',
            detail: { anon_number: nextAnon, ip: requestedIp || null, source: source || 'openvibe-runtime' },
        });
        return {
            created: true,
            user: rememberAnonContinuity(getAnonUserById(id), {
                ipAddress: requestedIp,
                fingerprint: requestedFingerprint,
                source: source || 'openvibe-runtime',
                userAgent: req && req.get ? req.get('user-agent') || null : null,
            }),
        };
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
            role: user.role || (isAnonActor(user) ? 'anonymous' : staff.getRole(user.id)),
            sid: sessionId,
            scope,
        }, extra || {});
    }

    function issueTokenForActor(user, sessionId, scope, extra, expiresIn) {
        return identity.issueToken(buildClaims(user, sessionId, scope, extra), {
            expiresIn: expiresIn || ACCESS_TOKEN_TTL_SECONDS,
            audience: 'openvibe',
            keyid: 'openvibe-1',
        });
    }

    function issueAccessToken(user, sessionId, scope, extra) {
        return issueTokenForActor(user, sessionId, scope, extra, ACCESS_TOKEN_TTL_SECONDS);
    }

    function issueAnonAccessToken(user, sessionId, scope, extra) {
        return issueTokenForActor(user, sessionId, scope, extra, ANON_ACCESS_TOKEN_TTL_SECONDS);
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

    function buildAnonBrowserBundle(user, req) {
        const session = createSession(user.id, req, {
            metadata: {
                actor_type: 'anon',
                anon_number: user.anon_number,
                session_token: user.session_token || null,
            },
        });
        const scope = 'anonymous';
        return {
            session,
            access_token: issueAnonAccessToken(user, session.id, scope, {
                actor_type: 'anon',
                anonymous: true,
                anon_number: user.anon_number,
                session_token: user.session_token || null,
            }),
            expires_in: ANON_ACCESS_TOKEN_TTL_SECONDS,
            scope,
        };
    }

    function resolveSessionUser(req) {
        if (!req || !req.user) return null;
        if (isAnonActor(req.user)) {
            return getAnonUserById(req.user.sub || req.user.id) || req.user;
        }
        return getUserById(req.user.sub || req.user.id) || req.user;
    }

    function buildSessionResponse(req) {
        const user = resolveSessionUser(req);
        const anonymous = isAnonActor(user);
        return {
            authenticated: !!user && !anonymous,
            anonymous,
            user: user || null,
        };
    }

    function ensureActorSession(user, req) {
        if (req && req.user && req.user.sid) {
            touchSession(req.user.sid, req);
            return { id: req.user.sid };
        }
        if (isAnonActor(user)) {
            return createSession(user.id, req, {
                metadata: {
                    actor_type: 'anon',
                    anon_number: user.anon_number,
                    session_token: user.session_token || null,
                },
            });
        }
        return createSession(user.id, req);
    }

    function buildExchangeResponse(user, req) {
        const session = ensureActorSession(user, req);
        if (isAnonActor(user)) {
            return {
                access_token: issueAnonAccessToken(user, session.id, 'anonymous', {
                    actor_type: 'anon',
                    anonymous: true,
                    anon_number: user.anon_number,
                    session_token: user.session_token || null,
                }),
                token_type: 'Bearer',
                expires_in: ANON_ACCESS_TOKEN_TTL_SECONDS,
                scope: 'anonymous',
                user,
            };
        }
        return {
            access_token: issueAccessToken(user, session.id, 'openid profile email theme'),
            token_type: 'Bearer',
            expires_in: ACCESS_TOKEN_TTL_SECONDS,
            scope: 'openid profile email theme',
            user,
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
            if (!isAllowedRedirectUri(request.redirect_uri, request.client_id)) {
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
        return resolveSessionUser(req);
    }

    function handleAuthorizeGet(req, res) {
        const request = normalizeAuthorizeRequest(req, config);
        const sessionUser = currentSessionUser(req);
        const nativeSessionUser = isAnonActor(sessionUser) ? null : sessionUser;
        if (nativeSessionUser && request.prompt !== 'login') {
            touchSession(req.user && req.user.sid, req);
            return finishAuthorize(req, res, nativeSessionUser, request, req.user && req.user.sid);
        }
        res.type('html').send(renderAuthorizePage({ config, request, sessionUser: nativeSessionUser, errorMessage: '' }));
    }

    function handleAuthorizePost(req, res) {
        const request = normalizeAuthorizeRequest(req, config);
        const mode = String((req.body && req.body.mode) || (request.prompt === 'login' ? 'login' : 'register')).toLowerCase();
        let user;
        try {
            user = mode === 'login'
                ? authenticateUser(req.body || {})
                : registerUser(req.body || {});
        } catch (err) {
            return res.status(400).send(renderAuthorizePage({ config, request, sessionUser: null, errorMessage: err.message }));
        }
        const bundle = buildBrowserBundle(user, req);
        setSessionCookie(res, bundle.access_token);
        audit.record({
            actorType: 'user',
            actorId: user.id,
            action: mode === 'login' ? 'auth.login' : 'auth.register',
            resource: `auth_user:${user.id}`,
            outcome: 'allow',
            detail: { client_id: request.client_id || null, mode },
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
        if (isAnonActor(req.user)) {
            res.status(403).json({ error: 'anonymous sessions cannot use native account routes' });
            return null;
        }
        const user = getUserById(userId);
        if (!user) {
            res.status(401).json({ error: 'user not found' });
            return null;
        }
        if (user.is_banned) {
            res.status(403).json({ error: user.ban_reason ? `account banned: ${user.ban_reason}` : 'account banned' });
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
        router.post('/session/anonymous', express.json(), (req, res) => {
            const body = req.body || {};
            const requestedFingerprint = body.fingerprint || req.query && req.query.fingerprint || null;
            const requestedAnonUserId = body.anon_user_id || req.query && req.query.anon_user_id || null;
            const requestedAnonNumber = body.anon_number || req.query && req.query.anon_number || null;
            const forceNew = isTruthy(body.force_new || req.query && req.query.force_new);
            const shouldReuseCurrentAnonToken = !forceNew && !requestedAnonUserId && !requestedAnonNumber;
            const legacySessionToken = String(
                (body && (body.legacy_session_token || body.session_token))
                || (req.query && (req.query.legacy_session_token || req.query.session_token))
                || (shouldReuseCurrentAnonToken && isAnonActor(req.user) ? (req.user.session_token || '') : '')
            ).trim() || null;
            const ensured = ensureAnonUser({
                sessionToken: legacySessionToken,
                req,
                forceNew,
                fingerprint: requestedFingerprint,
                anonUserId: requestedAnonUserId,
                anonNumber: requestedAnonNumber,
                source: 'browser',
            });
            const anonUser = ensured.user;
            const bundle = buildAnonBrowserBundle(anonUser, req);
            setSessionCookie(res, bundle.access_token, bundle.expires_in);
            const returnTo = String((body && body.return_to) || (req.query && req.query.return_to) || '').trim();
            if (returnTo && isAllowedRedirectUri(returnTo)) {
                return res.redirect(302, returnTo);
            }
            res.status(ensured.created ? 201 : 200).json(buildSessionResponse({ user: anonUser }));
        });

        router.get('/session/anonymous/identities', (req, res) => {
            const fingerprint = req.query && req.query.fingerprint ? String(req.query.fingerprint) : null;
            const items = listAnonIdentitiesForRequest(req, { fingerprint }).map((user) => Object.assign({}, user, {
                current: !!(isAnonActor(req.user) && String((req.user.sub || req.user.id || '')) === String(user.id)),
            }));
            res.json({ items });
        });

        router.post('/internal/resolve-anon', express.json(), (req, res) => {
            if (!req.serviceActor) {
                return res.status(403).json({ error: 'internal service actor required' });
            }
            const body = req.body || {};
            const ensured = ensureAnonUser({
                sessionToken: body.session_token || null,
                req,
                forceNew: isTruthy(body.force_new),
                fingerprint: body.fingerprint || null,
                anonUserId: body.anon_user_id || null,
                anonNumber: body.anon_number || null,
                ipAddress: body.ip || body.ip_address || null,
                source: req.serviceActor,
            });
            res.json({
                ok: true,
                created: !!ensured.created,
                user: ensured.user,
            });
        });

        router.get('/session/bridge', (req, res) => {
            const returnTo = String(req.query.return_to || '').trim();
            if (!isAllowedRedirectUri(returnTo)) {
                return res.status(400).send('invalid return_to');
            }

            const sessionUser = resolveSessionUser(req);
            if (!sessionUser) {
                const bridgeUrl = new URL('/api/v1/session/bridge', config.surfaces.network || config.surfaces.auth);
                bridgeUrl.searchParams.set('return_to', returnTo);
                const authorizeUrl = new URL('/oauth/authorize', config.surfaces.auth);
                authorizeUrl.searchParams.set('return_to', bridgeUrl.toString());
                return res.redirect(302, authorizeUrl.toString());
            }

            const exchange = buildExchangeResponse(sessionUser, req);
            return res.redirect(302, appendTokenToReturnUri(returnTo, exchange.access_token));
        });

        router.post('/session/exchange', (req, res) => {
            const sessionUser = resolveSessionUser(req);
            if (!sessionUser) {
                return res.status(401).json({ error: 'authentication required' });
            }
            if (!isAnonActor(sessionUser)) {
                const user = requireNativeUser(req, res);
                if (!user) return;
                return res.json(buildExchangeResponse(user, req));
            }
            return res.json(buildExchangeResponse(sessionUser, req));
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

        router.put('/account/password', express.json(), (req, res) => {
            const user = requireNativeUser(req, res);
            if (!user) return;
            const body = req.body || {};
            const newPassword = String(body.new_password || '');
            const confirmPassword = String(body.confirm_password || '');
            if (newPassword.length < 8) {
                return res.status(400).json({ error: 'new_password must be at least 8 characters' });
            }
            if (newPassword !== confirmPassword) {
                return res.status(400).json({ error: 'password confirmation does not match' });
            }
            const current = db.get().prepare('SELECT password_hash FROM auth_users WHERE id = ? LIMIT 1').get(String(user.id));
            if (current && current.password_hash) {
                const currentPassword = String(body.current_password || '');
                if (!currentPassword) {
                    return res.status(400).json({ error: 'current_password is required' });
                }
                if (passwordAlgorithmForHash(current.password_hash) !== 'bcrypt' || !bcrypt.compareSync(currentPassword, current.password_hash)) {
                    return res.status(400).json({ error: 'current password is incorrect' });
                }
            }
            const passwordHash = bcrypt.hashSync(newPassword, 12);
            db.get().prepare(`
                UPDATE auth_users
                   SET password_hash = ?,
                       password_algorithm = ?,
                       password_updated_at = CURRENT_TIMESTAMP,
                       updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?
            `).run(passwordHash, passwordAlgorithmForHash(passwordHash), String(user.id));
            audit.record({
                actorType: 'user',
                actorId: user.id,
                action: 'account.password.update',
                resource: `auth_user:${user.id}`,
                outcome: 'allow',
            });
            res.json({ ok: true });
        });

        router.post('/account/sign-out', (_req, res) => {
            clearSessionCookie(res);
            res.json({ ok: true });
        });

        return router;
    }

    return {
        buildSessionResponse,
        buildAccountRouter,
        getUserById,
        getUserByUsername,
        handleAuthorizeGet,
        handleAuthorizePost,
        handleLogout,
        handleTokenPost,
        isAllowedRedirectUri,
        listSessionsForUser,
        resolveSessionUser,
        upsertUser,
        updateUserProfile,
    };
}

module.exports = {
    ACCESS_TOKEN_TTL_SECONDS,
    ANON_ACCESS_TOKEN_TTL_SECONDS,
    anonDisplayNameForNumber,
    anonUsernameForNumber,
    buildNativeAuth,
    deriveCookieDomain,
    slugifyUsername,
};
