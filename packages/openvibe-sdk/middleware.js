'use strict';

// OpenVibe — Express middleware helpers. Mirrors the shape of
// hobo-shared/middleware so existing services can adopt the SDK with minimal
// churn. Adds `requireInternalKey` for service-to-service calls and
// `requireRole` for role-gated endpoints.

function extractToken(req) {
    const auth = req.headers && req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
    if (req.cookies) {
        if (req.cookies.openvibe_token) return req.cookies.openvibe_token;
        if (req.cookies.hobo_token)     return req.cookies.hobo_token;
        if (req.cookies.token)          return req.cookies.token;
    }
    if (req.query && req.query.token) return req.query.token;
    return null;
}

function requireOpenVibeAuth(authClient) {
    return (req, res, next) => {
        const token = extractToken(req);
        const user = authClient.verifyToken(token);
        if (!user) {
            const reason = authClient.lastError || 'no token';
            console.warn(`[Auth] reject ${req.method} ${req.path}: ${reason}`);
            return res.status(401).json({ error: 'authentication required', reason });
        }
        req.user = user;
        req.token = token;
        next();
    };
}

function optionalOpenVibeAuth(authClient) {
    return (req, _res, next) => {
        const token = extractToken(req);
        if (token) {
            const user = authClient.verifyToken(token);
            if (user) {
                req.user = user;
                req.token = token;
            }
        }
        next();
    };
}

function requireInternalKey(internalKey) {
    return (req, res, next) => {
        const provided = req.headers['x-internal-key'];
        if (!provided || provided !== internalKey) {
            console.warn(`[InternalAuth] reject ${req.method} ${req.path}`);
            return res.status(403).json({ error: 'forbidden' });
        }
        next();
    };
}

function requireRole(...roles) {
    const allowed = new Set(roles.flat());
    return (req, res, next) => {
        if (!req.user || !allowed.has(req.user.role)) {
            return res.status(403).json({ error: 'insufficient role' });
        }
        next();
    };
}

module.exports = {
    extractToken,
    requireOpenVibeAuth,
    optionalOpenVibeAuth,
    requireInternalKey,
    requireRole,
};
