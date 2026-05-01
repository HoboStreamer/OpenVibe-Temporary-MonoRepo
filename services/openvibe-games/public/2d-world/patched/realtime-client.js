export class RealtimeClient {
    constructor({ path, identity }) {
        this.path = path;
        this.identity = identity;
        this.socket = null;
        this.handlers = new Map();
    }

    on(eventName, handler) {
        if (!this.handlers.has(eventName)) this.handlers.set(eventName, []);
        this.handlers.get(eventName).push(handler);
    }

    _emitLocal(eventName, payload) {
        for (const handler of this.handlers.get(eventName) || []) handler(payload);
    }

    connect() {
        if (this.socket) return this.socket;
        if (typeof window.io !== 'function') {
            throw new Error('Socket.IO client is not loaded');
        }
        this.socket = window.io({
            path: this.path,
            transports: ['websocket', 'polling'],
            auth: {
                userId: this.identity.userId,
                displayName: this.identity.displayName,
                role: this.identity.role || 'user',
            },
        });
        for (const eventName of ['connect', 'disconnect', 'snapshot', 'chat:message', 'world:joined', 'status', 'editor:snapshot', 'editor:saved']) {
            this.socket.on(eventName, (payload) => this._emitLocal(eventName, payload));
        }
        return this.socket;
    }

    request(eventName, payload = {}) {
        return new Promise((resolve) => {
            this.socket.emit(eventName, payload, resolve);
        });
    }

    joinWorld(payload) { return this.request('world:join', payload); }
    sendInput(payload) { return this.request('input', payload); }
    sendChat(message) { return this.request('chat:send', { message }); }
    craft(recipeId) { return this.request('craft', { recipe_id: recipeId }); }
    build(payload) { return this.request('build', payload); }
    travel(targetZone) { return this.request('travel', { targetZone }); }
    pickup() { return this.request('pickup'); }
    respawn() { return this.request('respawn'); }
    joinEditor(worldId) { return this.request('editor:join', { worldId }); }
    saveEditorEdit(payload) { return this.request('editor:save', payload); }
}
