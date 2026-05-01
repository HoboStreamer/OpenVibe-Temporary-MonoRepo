'use strict';

class SourceVibeRoomHost {
	constructor({ engine, gamemodeId, descriptor, room }) {
		if (!room) throw new Error('room instance required');
		this.engine = engine || null;
		this.gamemodeId = String(gamemodeId || 'base').trim().toLowerCase();
		this.descriptor = descriptor || null;
		this.room = room;
		this.world = room.world || null;
	}

	get players() {
		return this.room && this.room.players instanceof Map ? this.room.players : new Map();
	}

	playerForSocket(socketId) {
		return this.players.get(socketId) || null;
	}

	join(payload) {
		return this.room.join(payload);
	}

	leave(socketId) {
		return this.room.leave(socketId);
	}

	receiveInput(socketId, payload) {
		return this.room.receiveInput(socketId, payload);
	}

	sendChat(socketId, text) {
		return this.room.sendChat(socketId, text);
	}

	craft(socketId, payload = {}) {
		const player = this.playerForSocket(socketId);
		return player && typeof this.room._handleCraft === 'function'
			? this.room._handleCraft(player, payload)
			: { ok: false, reason: 'room not joined' };
	}

	build(socketId, payload = {}) {
		const player = this.playerForSocket(socketId);
		return player && typeof this.room._handleBuild === 'function'
			? this.room._handleBuild(player, payload)
			: { ok: false, reason: 'room not joined' };
	}

	buyFromShop(socketId, payload = {}) {
		const player = this.playerForSocket(socketId);
		return player && typeof this.room.handleShopPurchase === 'function'
			? this.room.handleShopPurchase(player, payload)
			: { ok: false, reason: 'room not joined' };
	}

	equipInventory(socketId, payload = {}) {
		const player = this.playerForSocket(socketId);
		return player && typeof this.room.handleInventoryEquip === 'function'
			? this.room.handleInventoryEquip(player, payload)
			: { ok: false, reason: 'room not joined' };
	}

	updateHotbar(socketId, payload = {}) {
		const player = this.playerForSocket(socketId);
		return player && typeof this.room.handleHotbarUpdate === 'function'
			? this.room.handleHotbarUpdate(player, payload)
			: { ok: false, reason: 'room not joined' };
	}

	dropInventory(socketId, payload = {}) {
		const player = this.playerForSocket(socketId);
		return player && typeof this.room.handleInventoryDrop === 'function'
			? this.room.handleInventoryDrop(player, payload, Date.now())
			: { ok: false, reason: 'room not joined' };
	}

	closeInteraction(socketId) {
		const player = this.playerForSocket(socketId);
		return player && typeof this.room.closeInteraction === 'function'
			? this.room.closeInteraction(player)
			: { ok: false, reason: 'room not joined' };
	}

	travel(socketId, payload = {}) {
		const player = this.playerForSocket(socketId);
		return player && typeof this.room._handleTravel === 'function'
			? this.room._handleTravel(player, payload)
			: { ok: false, reason: 'room not joined' };
	}

	pickup(socketId) {
		const player = this.playerForSocket(socketId);
		return player && typeof this.room._handleInteract === 'function'
			? this.room._handleInteract(player, Date.now())
			: { ok: false, reason: 'room not joined' };
	}

	respawn(socketId) {
		const player = this.playerForSocket(socketId);
		return player && typeof this.room._processAction === 'function'
			? this.room._processAction(player, { action: 'respawn' }, Date.now())
			: { ok: false, reason: 'room not joined' };
	}

	tick(dt, now) {
		return this.room.tick(dt, now);
	}

	setCatalog(catalog) {
		if (typeof this.room.setCatalog === 'function') this.room.setCatalog(catalog);
		return this;
	}

	buildSnapshotForPlayer(player, now) {
		return typeof this.room.buildSnapshotForPlayer === 'function'
			? this.room.buildSnapshotForPlayer(player, now)
			: null;
	}

	summary() {
		const summary = typeof this.room.summary === 'function' ? this.room.summary() : {};
		return Object.assign({}, summary, {
			gamemode: this.gamemodeId,
			gamemode_title: this.descriptor && this.descriptor.manifest && (this.descriptor.manifest.title || this.descriptor.manifest.name) || this.gamemodeId,
		});
	}
}

module.exports = {
	SourceVibeRoomHost,
};