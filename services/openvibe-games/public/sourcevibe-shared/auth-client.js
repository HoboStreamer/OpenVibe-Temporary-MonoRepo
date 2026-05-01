const TOKEN_STORAGE_KEY = 'openvibe.games.access-token.v1';

const SURFACES = {
    network: { production: 'https://openvibe.network', localhostHost: 'openvibe.network.localhost', port: 4100 },
    auth: { production: 'https://auth.openvibe.network', localhostHost: 'auth.openvibe.network.localhost', port: 4100 },
    my: { production: 'https://my.openvibe.network', localhostHost: 'my.openvibe.network.localhost', port: 4100 },
    games: { production: 'https://openvibe.games', localhostHost: 'openvibe.games.localhost', port: 5200 },
};

const state = {
    initialized: false,
    token: '',
    session: {
        authenticated: false,
        anonymous: false,
        user: null,
    },
};

function isIpLikeHost(hostname) {
    return /^\d+\.\d+\.\d+\.\d+$/.test(String(hostname || ''));
}

function isLoopbackHost(hostname) {
    const value = String(hostname || '').toLowerCase();
    return value === 'localhost' || value === '127.0.0.1' || value === '0.0.0.0' || isIpLikeHost(value);
}

export function resolveSurfaceUrl(surface) {
    const normalized = String(surface || '').toLowerCase();
    const cfg = SURFACES[normalized];
    if (!cfg || typeof window === 'undefined') return '#';
    const protocol = window.location.protocol || 'http:';
    const hostname = window.location.hostname || 'localhost';
    if (hostname.endsWith('.localhost')) return `${protocol}//${cfg.localhostHost}:${cfg.port}`;
    if (isLoopbackHost(hostname)) {
        if (normalized === 'games') return window.location.origin;
        return `${protocol}//${cfg.localhostHost}:${cfg.port}`;
    }
    return cfg.production;
}

function parseJsonResponse(text, response) {
    try {
        return text ? JSON.parse(text) : null;
    } catch {
        return text ? { error: text } : null;
    }
}

async function requestJson(url, options = {}, { credentials = 'same-origin', includeAuth = true } = {}) {
    const opts = options || {};
    const headers = Object.assign({
        Accept: 'application/json',
    }, opts.headers || {});
    if (opts.body != null && !(opts.body instanceof FormData) && !headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
    }
    if (includeAuth && state.token) headers.Authorization = `Bearer ${state.token}`;
    const response = await fetch(url, Object.assign({}, opts, {
        credentials,
        headers,
    }));
    const text = await response.text();
    const body = parseJsonResponse(text, response);
    if (!response.ok) {
        const error = new Error(body && body.error ? body.error : `Request failed (${response.status})`);
        error.status = response.status;
        error.body = body;
        throw error;
    }
    return body || {};
}

function loadStoredToken() {
    try {
        return window.sessionStorage.getItem(TOKEN_STORAGE_KEY) || '';
    } catch {
        return '';
    }
}

function storeToken(token) {
    state.token = String(token || '').trim();
    try {
        if (state.token) window.sessionStorage.setItem(TOKEN_STORAGE_KEY, state.token);
        else window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
        // Ignore storage failures.
    }
}

function consumeBridgeToken() {
    if (typeof window === 'undefined') return '';
    const hash = String(window.location.hash || '').replace(/^#/, '');
    if (!hash) return '';
    const params = new URLSearchParams(hash);
    const token = String(params.get('openvibe_token') || '').trim();
    if (!token) return '';
    storeToken(token);
    params.delete('openvibe_token');
    const nextHash = params.toString();
    const nextUrl = `${window.location.pathname}${window.location.search}${nextHash ? `#${nextHash}` : ''}`;
    window.history.replaceState({}, document.title, nextUrl);
    return token;
}

function emptySession(errorMessage = '') {
    return {
        authenticated: false,
        anonymous: false,
        user: null,
        error: errorMessage || '',
    };
}

async function exchangeSessionToken() {
    const result = await requestJson(`${resolveSurfaceUrl('network')}/api/v1/session/exchange`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
    }, { credentials: 'include', includeAuth: false });
    if (result && result.access_token) storeToken(result.access_token);
    return result;
}

export async function networkApiJson(pathname, options = {}) {
    return requestJson(`${resolveSurfaceUrl('network')}${pathname}`, options, {
        credentials: 'include',
        includeAuth: true,
    });
}

export async function gamesApiJson(pathname, options = {}) {
    return requestJson(pathname, options, {
        credentials: 'same-origin',
        includeAuth: true,
    });
}

export async function refreshOpenVibeAuth() {
    state.token = loadStoredToken();
    let session = emptySession();
    try {
        session = await networkApiJson('/api/v1/session');
    } catch (error) {
        state.session = emptySession(error.message);
        state.initialized = true;
        return getAuthState();
    }
    if (state.token && !(session && session.authenticated)) {
        storeToken('');
        try {
            session = await requestJson(`${resolveSurfaceUrl('network')}/api/v1/session`, {}, {
                credentials: 'include',
                includeAuth: false,
            });
        } catch {
            session = emptySession();
        }
    }
    if (session && session.authenticated && !state.token) {
        try {
            const exchange = await exchangeSessionToken();
            session = Object.assign({}, session, {
                user: exchange && exchange.user ? exchange.user : session.user,
            });
        } catch (error) {
            session = Object.assign({}, session, { error: error.message || 'token exchange failed' });
        }
    }
    state.session = session || emptySession();
    state.initialized = true;
    return getAuthState();
}

export async function initializeOpenVibeAuth() {
    state.token = loadStoredToken();
    consumeBridgeToken();
    return refreshOpenVibeAuth();
}

export function getAuthState() {
    return {
        initialized: !!state.initialized,
        token: state.token || '',
        session: state.session || emptySession(),
        links: {
            signIn: buildSignInUrl(),
            signOut: buildSignOutUrl(),
            account: resolveSurfaceUrl('my'),
        },
        surfaces: {
            network: resolveSurfaceUrl('network'),
            auth: resolveSurfaceUrl('auth'),
            my: resolveSurfaceUrl('my'),
            games: resolveSurfaceUrl('games'),
        },
    };
}

export function currentIdentity() {
    const session = state.session || emptySession();
    const user = session.user || null;
    return {
        userId: user && (user.id || user.sub) ? String(user.id || user.sub) : '',
        displayName: user && (user.display_name || user.username) ? String(user.display_name || user.username) : '',
        role: user && user.role ? String(user.role) : session.anonymous ? 'anonymous' : 'guest',
        authenticated: !!session.authenticated,
        anonymous: !!session.anonymous,
        token: state.token || '',
    };
}

export function buildSignInUrl(returnTo = window.location.href) {
    return `${resolveSurfaceUrl('network')}/api/v1/session/bridge?return_to=${encodeURIComponent(returnTo)}`;
}

export function buildSignOutUrl(returnTo = window.location.href) {
    return `${resolveSurfaceUrl('auth')}/oauth/logout?return_to=${encodeURIComponent(returnTo)}`;
}

export function startSignIn(returnTo = window.location.href) {
    window.location.assign(buildSignInUrl(returnTo));
}

export function startSignOut(returnTo = window.location.href) {
    storeToken('');
    window.location.assign(buildSignOutUrl(returnTo));
}

export function clearStoredToken() {
    storeToken('');
}
