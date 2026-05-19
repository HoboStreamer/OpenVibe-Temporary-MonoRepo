'use strict';

// openvibe-network — host-aware routing.
//
// Single Express app, multiple logical surfaces. The surface a request maps
// to is decided by its Host header. Surfaces mirror the OpenVibe domain map
// (auth/api/admin/my/themes); each one gets the same kernel APIs available
// under /api/v1 and a static UI shell when relevant.

const path = require('path');
const express = require('express');

const SURFACE_HOSTS = {
    auth:   ['auth.openvibe.network'],
    api:    ['api.openvibe.network'],
    admin:  ['admin.openvibe.network'],
    my:     ['my.openvibe.network'],
    themes: ['themes.openvibe.network'],
    tools:  ['openvibe.tools', 'tools.openvibe.network'],
};

// Localhost convenience suffix support: any subdomain of *.localhost or
// *.openvibe.network.localhost maps to the matching surface.
function detectSurface(host, surfaces) {
    if (!host) return 'network';
    const h = String(host).split(':')[0].toLowerCase();
    for (const [name, hosts] of Object.entries(SURFACE_HOSTS)) {
        for (const target of hosts) {
            if (h === target || h.endsWith('.' + target) || h.startsWith(name + '.')) {
                return name;
            }
        }
    }
    // Allow OPENVIBE_*_URL overrides to resolve too
    for (const name of Object.keys(SURFACE_HOSTS)) {
        const url = surfaces[name];
        if (!url) continue;
        try {
            const surfHost = new URL(url).hostname.toLowerCase();
            if (h === surfHost) return name;
        } catch { /* ignore */ }
    }
    return 'network';
}

function attachHostRouter({ app, config, identity, nativeAuth }) {
    const publicDir = path.resolve(__dirname, '..', 'public');
    const authUrl = String(config.surfaces.auth || '').replace(/\/$/, '');

    app.use((req, _res, next) => {
        req.openvibeSurface = detectSurface(req.headers.host, config.surfaces);
        next();
    });

    // ── auth.openvibe.network ────────────────────────────────
    app.get('/.well-known/openid-configuration', (req, res) => {
        if (req.openvibeSurface !== 'auth' && req.openvibeSurface !== 'network') return res.status(404).end();
        res.json(identity.getDiscovery());
    });
    app.get('/.well-known/jwks.json', (req, res) => {
        if (req.openvibeSurface !== 'auth' && req.openvibeSurface !== 'network') return res.status(404).end();
        res.json(identity.getJwks());
    });

    // OpenVibe-native auth should be served directly by the network service.
    // If another surface receives an auth link, bounce to auth.openvibe.network
    // instead of 404ing.
    app.get('/oauth/authorize', (req, res, next) => {
        if (req.openvibeSurface !== 'auth') {
            const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
            return res.redirect(302, `${authUrl}/oauth/authorize${qs}`);
        }
        return nativeAuth.handleAuthorizeGet(req, res);
    });
    app.post('/oauth/authorize', express.urlencoded({ extended: false }), (req, res, next) => {
        if (req.openvibeSurface !== 'auth') {
            const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
            return res.redirect(307, `${authUrl}/oauth/authorize${qs}`);
        }
        return nativeAuth.handleAuthorizePost(req, res);
    });
    app.post('/oauth/token', express.urlencoded({ extended: false }), (req, res, next) => {
        if (req.openvibeSurface !== 'auth') return res.redirect(307, `${authUrl}/oauth/token`);
        return nativeAuth.handleTokenPost(req, res);
    });
    app.get('/oauth/logout', (req, res, next) => {
        if (req.openvibeSurface !== 'auth') {
            const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
            return res.redirect(302, `${authUrl}/oauth/logout${qs}`);
        }
        return nativeAuth.handleLogout(req, res);
    });

    // ── per-surface static shells ────────────────────────────
    // OpenVibe-native shells are authoritative. Legacy Hobo UI fallback is
    // not used by the default runtime.
    function serveSurface(surface, htmlFile) {
        const staticHandler = express.static(publicDir, { fallthrough: true, index: false });
        return (req, res, next) => {
            if (req.openvibeSurface !== surface) return next();
            // API and well-known paths are handled before this point
            if (req.path.startsWith('/api/') || req.path.startsWith('/.well-known/')) return next();
            // Native OpenVibe shell takes precedence for the index.
            if (req.method === 'GET' && (req.path === '/' || req.path === `/${htmlFile}`)) {
                return res.sendFile(path.join(publicDir, htmlFile));
            }
            // Serve static assets (CSS/JS/images) from the OpenVibe public dir.
            return staticHandler(req, res, (err) => {
                if (err) return next(err);
                return res.status(404).type('text/plain').send('Not found');
            });
        };
    }

    app.use(serveSurface('admin',  'admin.html'));
    app.use(serveSurface('my',     'my.html'));
    app.use(serveSurface('themes', 'themes.html'));
    app.use(serveSurface('tools',  'tools.html'));

    // auth surface: serve a small landing page on GET / when not handled above
    app.get('/', (req, res, next) => {
        if (req.openvibeSurface !== 'auth') return next();
        res.sendFile(path.join(publicDir, 'auth.html'));
    });

    // network surface (default) — public landing
    app.get('/', (req, res, next) => {
        if (req.openvibeSurface !== 'network') return next();
        res.sendFile(path.join(publicDir, 'index.html'));
    });
}

module.exports = { attachHostRouter, detectSurface };
