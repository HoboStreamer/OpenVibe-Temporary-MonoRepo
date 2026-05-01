export const API_BASE = '/api/games';
export const TWO_D_WORLD_API = `${API_BASE}/2d-world`;
export const REALTIME_PATH = '/games/realtime';
export const STORAGE_KEY = 'openvibe.games.2dworld.identity';

let socketClientPromise = null;

export function loadIdentity() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch {}
    const suffix = Math.random().toString(36).slice(2, 8);
    return {
        userId: `demo-${suffix}`,
        displayName: `Demo ${suffix}`,
        role: 'user',
    };
}

export function saveIdentity(identity) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
}

export function ensureSocketIoClient(path = REALTIME_PATH) {
    if (typeof window !== 'undefined' && typeof window.io === 'function') {
        return Promise.resolve(window.io);
    }
    if (!socketClientPromise) {
        socketClientPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `${String(path).replace(/\/$/, '')}/socket.io.js`;
            script.async = true;
            script.onload = () => {
                if (typeof window.io === 'function') {
                    resolve(window.io);
                } else {
                    socketClientPromise = null;
                    reject(new Error('Socket.IO client loaded but did not expose window.io'));
                }
            };
            script.onerror = () => {
                socketClientPromise = null;
                reject(new Error(`Failed to load Socket.IO client from ${script.src}`));
            };
            document.head.appendChild(script);
        });
    }
    return socketClientPromise;
}

export async function apiJson(path, options = {}, identity = loadIdentity()) {
    const headers = Object.assign({
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-OpenVibe-User-Id': identity.userId,
        'X-OpenVibe-Display-Name': identity.displayName,
        'X-OpenVibe-User-Role': identity.role || 'user',
    }, options.headers || {});
    const response = await fetch(path, Object.assign({}, options, { headers }));
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
        const error = new Error(body && body.error ? body.error : `request failed (${response.status})`);
        error.status = response.status;
        error.body = body;
        throw error;
    }
    return body;
}
