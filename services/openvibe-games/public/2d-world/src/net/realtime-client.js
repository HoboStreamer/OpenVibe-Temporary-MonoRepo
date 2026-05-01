export class RealtimeClient {
    constructor({ path, identity, token = '' }) {
        this.path = path;
        this.identity = identity || null;
        this.token = String(token || '');
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

    setAuth({ identity, token } = {}) {
        if (identity) this.identity = identity;
        if (token !== undefined) this.token = String(token || '');
        if (this.socket) this.socket.auth = this._socketAuthPayload();
        return this;
    }

    _socketAuthPayload() {
        if (this.token) return { token: this.token };
        if (this.identity && this.identity.userId) {
            return {
                userId: this.identity.userId,
                displayName: this.identity.displayName,
                role: this.identity.role || 'user',
            };
        }
        return {};
    }

    connect() {
        if (this.socket) return this.socket;
        if (typeof window.io !== 'function') {
            throw new Error('Socket.IO client is not loaded');
        }
        this.socket = window.io({
            path: this.path,
            transports: ['websocket', 'polling'],
            auth: this._socketAuthPayload(),
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
    buyFromShop(npcId, itemId, quantity = 1) { return this.request('shop:buy', { npc_id: npcId, item_id: itemId, quantity }); }
    equipInventoryItem(itemId, slot) { return this.request('inventory:equip', { item_id: itemId, slot }); }
    clearEquipmentSlot(slot) { return this.request('inventory:equip', { slot, clear: true }); }
    updateHotbar(slot, itemId, options = {}) {
        return this.request('hotbar:update', { slot, item_id: itemId, ...options });
    }
    clearHotbar(slot) { return this.request('hotbar:update', { slot, clear: true }); }
    dropInventory(itemId, quantity = 1, extra = {}) {
        return this.request('inventory:drop', { item_id: itemId, quantity, ...extra });
    }
    closeInteraction() { return this.request('interaction:close', {}); }
    performInteraction(payload) { return this.request('interaction:perform', payload || {}); }
    travel(targetZone) { return this.request('travel', { targetZone }); }
    pickup() { return this.request('pickup'); }
    respawn() { return this.request('respawn'); }
    joinEditor(worldId) { return this.request('editor:join', { worldId }); }
    saveEditorEdit(payload) { return this.request('editor:save', payload); }
}
