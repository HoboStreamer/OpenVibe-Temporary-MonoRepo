'use strict';

const express = require('express');
const {
    buildCallbackPage,
    buildSessionResponse,
    clearSessionCookies,
    normalizeReturnTo,
    setSessionCookie,
} = require('./session');

function buildAuthRouter({ authClient, config, deriveBaseUrl, serviceName }) {
    if (!authClient) throw new Error('buildAuthRouter: authClient required');
    if (!config || !config.auth || !config.network) throw new Error('buildAuthRouter: config.auth + config.network required');
    if (typeof deriveBaseUrl !== 'function') throw new Error('buildAuthRouter: deriveBaseUrl required');

    const r = express.Router();
    const json = express.json({ limit: '32kb' });

    function buildBridgeUrl(req, returnTo) {
        const baseUrl = deriveBaseUrl(req);
        const callbackUrl = new URL('/auth/callback', baseUrl);
        callbackUrl.searchParams.set('return_to', normalizeReturnTo(returnTo, baseUrl, '/'));
        const bridgeUrl = new URL('/api/v1/session/bridge', config.network.url);
        bridgeUrl.searchParams.set('return_to', callbackUrl.toString());
        return bridgeUrl.toString();
    }

    function buildAuthorizeUrl(req, query) {
        const authUrl = new URL('/oauth/authorize', config.auth.url);
        authUrl.searchParams.set('return_to', buildBridgeUrl(req, query && query.return_to));
        if (query && String(query.prompt || '').toLowerCase() === 'login') {
            authUrl.searchParams.set('prompt', 'login');
        }
        return authUrl.toString();
    }

    function handleLogout(req, res) {
        const baseUrl = deriveBaseUrl(req);
        const returnTo = normalizeReturnTo(
            req.method === 'POST' ? req.body && req.body.return_to : req.query && req.query.return_to,
            baseUrl,
            '/'
        );
        clearSessionCookies(res, baseUrl);
        const logoutUrl = new URL('/oauth/logout', config.auth.url);
        logoutUrl.searchParams.set('return_to', returnTo);
        if (req.method === 'POST') {
            return res.json({ ok: true, return_to: returnTo, redirect_to: logoutUrl.toString() });
        }
        return res.redirect(302, logoutUrl.toString());
    }

    r.get('/auth/login', (req, res) => {
        res.redirect(302, buildAuthorizeUrl(req, req.query || {}));
    });

    r.get('/auth/callback', (req, res) => {
        const baseUrl = deriveBaseUrl(req);
        const returnTo = normalizeReturnTo(req.query && req.query.return_to, baseUrl, '/');
        res.type('html').send(buildCallbackPage({
            serviceName: serviceName || 'OpenVibe',
            returnTo,
            callbackPath: '/auth/callback',
        }));
    });

    r.post('/auth/callback', json, (req, res) => {
        const baseUrl = deriveBaseUrl(req);
        const returnTo = normalizeReturnTo(req.body && req.body.return_to, baseUrl, '/');
        const token = String(req.body && req.body.token || '').trim();
        if (!token) return res.status(400).json({ error: 'token required' });
        const user = authClient.verifyToken(token);
        if (!user) {
            return res.status(401).json({ error: authClient.lastError || 'invalid token' });
        }
        setSessionCookie(res, token, baseUrl, user);
        res.json(buildSessionResponse({ user }, { return_to: returnTo }));
    });

    r.get('/auth/logout', handleLogout);
    r.post('/auth/logout', json, handleLogout);

    return r;
}

module.exports = { buildAuthRouter };
