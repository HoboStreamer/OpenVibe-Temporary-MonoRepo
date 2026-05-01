import {
    currentIdentity,
    gamesApiJson,
    getAuthState,
    initializeOpenVibeAuth,
    refreshOpenVibeAuth,
    resolveSurfaceUrl,
    startSignIn,
    startSignOut,
} from '/sourcevibe-shared/auth-client.js';

export const API_BASE = '/api/games';
export const TWO_D_WORLD_API = `${API_BASE}/2d-world`;
export const REALTIME_PATH = '/games/realtime';

let socketClientPromise = null;

export function loadIdentity() {
    return currentIdentity();
}

export function saveIdentity() {
    return currentIdentity();
}

export {
    getAuthState,
    initializeOpenVibeAuth as initializeAuth,
    refreshOpenVibeAuth as refreshAuth,
    resolveSurfaceUrl,
    startSignIn,
    startSignOut,
};

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

export async function apiJson(path, options = {}) {
    return gamesApiJson(path, options);
}
