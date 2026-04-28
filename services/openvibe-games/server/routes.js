'use strict';

const express = require('express');
const model = require('./model');
const policy = require('./policy');
const { GAME_EVENT_TYPES } = require('@openvibe/contracts');

function buildRouter({ eventBus }) {
    const r = express.Router();
    const json = express.json({ limit: '512kb' });

    function actor(req) {
        return policy.actorOfReq(req);
    }

    function actorMeta(req) {
        const a = actor(req);
        return { actor_type: a.type, actor_id: a.id || a.username || 'anonymous' };
    }

    function denied(res, err) {
        return res.status(err.status || 403).json({ error: err.message, reason: err.reason });
    }

    function fail(res, err) {
        return res.status(err.status || 400).json({ error: err.message });
    }

    function requireUserId(req) {
        return String(req.params.userId || req.query.user_id || (req.user && (req.user.sub || req.user.id)) || '');
    }

    function publish(req, eventType, payload) {
        if (!eventBus) return;
        eventBus.publishGameEvent(eventType, payload, actorMeta(req));
    }

    r.get('/leaderboard/:type', (req, res) => {
        res.json({ board: req.params.type, items: model.listLeaderboard(req.params.type, req.query.limit) });
    });

    r.get('/player/:userId?', (req, res) => {
        const userId = requireUserId(req);
        if (!userId) return res.status(400).json({ error: 'userId required' });
        try {
            policy.assert(policy.decidePlayerRead({ req, userId }), actorMeta(req));
        } catch (err) {
            return denied(res, err);
        }
        const displayName = req.query.display_name || (req.user && (req.user.display_name || req.user.username)) || `Player ${userId}`;
        res.json({ player: model.ensurePlayer(userId, displayName) });
    });

    r.put('/player/:userId', json, (req, res) => {
        const userId = String(req.params.userId);
        try {
            policy.assert(policy.decidePlayerWrite({ req, userId }), actorMeta(req));
        } catch (err) {
            return denied(res, err);
        }
        try {
            const player = model.upsertPlayer(Object.assign({}, req.body || {}, { user_id: userId }));
            publish(req, GAME_EVENT_TYPES.PLAYER_UPSERTED, { user_id: userId, world_id: player.world_id, zone: player.zone });
            res.json({ player });
        } catch (err) {
            return fail(res, err);
        }
    });

    r.get('/inventory/:userId', (req, res) => {
        const userId = String(req.params.userId);
        try {
            policy.assert(policy.decideInventoryRead({ req, userId }), actorMeta(req));
        } catch (err) {
            return denied(res, err);
        }
        res.json({ items: model.listInventory(userId) });
    });

    r.post('/inventory/:userId/items', json, (req, res) => {
        const userId = String(req.params.userId);
        try {
            policy.assert(policy.decideInventoryWrite({ req, userId }), actorMeta(req));
        } catch (err) {
            return denied(res, err);
        }
        try {
            const items = model.addInventoryItem({
                user_id: userId,
                item_id: req.body && req.body.item_id,
                quantity: req.body && req.body.quantity,
                metadata: req.body && req.body.metadata,
            });
            publish(req, GAME_EVENT_TYPES.INVENTORY_UPDATED, { user_id: userId, item_id: req.body && req.body.item_id });
            res.status(201).json({ items });
        } catch (err) {
            return fail(res, err);
        }
    });

    r.get('/bank/:userId', (req, res) => {
        const userId = String(req.params.userId);
        try {
            policy.assert(policy.decideInventoryRead({ req, userId }), actorMeta(req));
        } catch (err) {
            return denied(res, err);
        }
        res.json({ items: model.listBank(userId) });
    });

    r.post('/bank/:userId/deposit', json, (req, res) => {
        const userId = String(req.params.userId);
        try {
            policy.assert(policy.decideInventoryWrite({ req, userId }), actorMeta(req));
        } catch (err) {
            return denied(res, err);
        }
        try {
            const result = model.bankDeposit(userId, req.body && req.body.item_id, req.body && req.body.quantity);
            publish(req, GAME_EVENT_TYPES.BANK_UPDATED, { user_id: userId, item_id: req.body && req.body.item_id, action: 'deposit' });
            res.json(result);
        } catch (err) {
            return fail(res, err);
        }
    });

    r.post('/bank/:userId/withdraw', json, (req, res) => {
        const userId = String(req.params.userId);
        try {
            policy.assert(policy.decideInventoryWrite({ req, userId }), actorMeta(req));
        } catch (err) {
            return denied(res, err);
        }
        try {
            const result = model.bankWithdraw(userId, req.body && req.body.item_id, req.body && req.body.quantity);
            publish(req, GAME_EVENT_TYPES.BANK_UPDATED, { user_id: userId, item_id: req.body && req.body.item_id, action: 'withdraw' });
            res.json(result);
        } catch (err) {
            return fail(res, err);
        }
    });

    r.get('/structures', (req, res) => {
        res.json({ items: model.listStructures({ world_id: req.query.world_id, owner_id: req.query.owner_id, limit: req.query.limit }) });
    });

    r.post('/structures', json, (req, res) => {
        const a = actor(req);
        if (a.type === 'anonymous') return res.status(401).json({ error: 'auth required for structures' });
        try {
            const structure = model.createStructure({
                type: req.body && req.body.type,
                world_id: req.body && req.body.world_id,
                x: req.body && req.body.x,
                y: req.body && req.body.y,
                owner_id: req.body && req.body.owner_id ? req.body.owner_id : a.id,
                data: req.body && req.body.data,
            });
            publish(req, GAME_EVENT_TYPES.STRUCTURE_CREATED, { structure_id: structure.id, type: structure.type, owner_id: structure.owner_id });
            res.status(201).json({ structure: model.listStructures({ owner_id: structure.owner_id, limit: 1 })[0] || structure });
        } catch (err) {
            return fail(res, err);
        }
    });

    r.get('/farm/:userId', (req, res) => {
        const userId = String(req.params.userId);
        try {
            policy.assert(policy.decideInventoryRead({ req, userId }), actorMeta(req));
        } catch (err) {
            return denied(res, err);
        }
        res.json({ plots: model.listFarmPlots(userId) });
    });

    r.put('/farm/:userId/plots/:plotIndex', json, (req, res) => {
        const userId = String(req.params.userId);
        try {
            policy.assert(policy.decideInventoryWrite({ req, userId }), actorMeta(req));
        } catch (err) {
            return denied(res, err);
        }
        try {
            const plot = model.upsertFarmPlot(Object.assign({}, req.body || {}, {
                user_id: userId,
                plot_index: req.params.plotIndex,
            }));
            publish(req, GAME_EVENT_TYPES.FARM_UPDATED, { user_id: userId, plot_index: Number(req.params.plotIndex), stage: plot.stage });
            res.json({ plot });
        } catch (err) {
            return fail(res, err);
        }
    });

    r.get('/achievements/:userId', (req, res) => {
        res.json({ items: model.listAchievements(String(req.params.userId)) });
    });

    r.post('/achievements/:userId', json, (req, res) => {
        const userId = String(req.params.userId);
        try {
            policy.assert(policy.decidePlayerWrite({ req, userId }), actorMeta(req));
        } catch (err) {
            return denied(res, err);
        }
        try {
            const achievement = model.unlockAchievement(Object.assign({}, req.body || {}, { user_id: userId }));
            publish(req, GAME_EVENT_TYPES.ACHIEVEMENT_UNLOCKED, { user_id: userId, achievement_id: achievement.achievement_id });
            res.status(201).json({ achievement });
        } catch (err) {
            return fail(res, err);
        }
    });

    r.get('/cosmetics/:userId', (req, res) => {
        const userId = String(req.params.userId);
        try {
            policy.assert(policy.decideInventoryRead({ req, userId }), actorMeta(req));
        } catch (err) {
            return denied(res, err);
        }
        res.json({ items: model.listCosmetics(userId) });
    });

    r.put('/cosmetics/:userId', json, (req, res) => {
        const userId = String(req.params.userId);
        try {
            policy.assert(policy.decideInventoryWrite({ req, userId }), actorMeta(req));
        } catch (err) {
            return denied(res, err);
        }
        try {
            const cosmetic = model.upsertCosmetic(Object.assign({}, req.body || {}, { user_id: userId }));
            publish(req, GAME_EVENT_TYPES.COSMETIC_UPDATED, { user_id: userId, slot: cosmetic.slot, item_id: cosmetic.item_id });
            res.json({ cosmetic });
        } catch (err) {
            return fail(res, err);
        }
    });

    r.get('/daily-quests/:userId', (req, res) => {
        const userId = String(req.params.userId);
        try {
            policy.assert(policy.decideInventoryRead({ req, userId }), actorMeta(req));
        } catch (err) {
            return denied(res, err);
        }
        res.json({ items: model.listDailyQuests(userId) });
    });

    r.post('/daily-quests/:userId/claim', json, (req, res) => {
        const userId = String(req.params.userId);
        try {
            policy.assert(policy.decideInventoryWrite({ req, userId }), actorMeta(req));
        } catch (err) {
            return denied(res, err);
        }
        try {
            const result = model.claimDailyQuest(userId, req.body && req.body.quest_id);
            publish(req, GAME_EVENT_TYPES.DAILY_QUEST_CLAIMED, { user_id: userId, quest_id: req.body && req.body.quest_id });
            res.json(result);
        } catch (err) {
            return fail(res, err);
        }
    });

    r.get('/canvas/state', (req, res) => {
        res.json(model.getCanvasState(actor(req), req.ip));
    });

    r.get('/canvas/history', (req, res) => {
        res.json({ actions: model.listCanvasActions(req.query.limit) });
    });

    r.post('/canvas/place', json, (req, res) => {
        try {
            policy.assert(policy.decideCanvasPlace({ req }), actorMeta(req));
        } catch (err) {
            return denied(res, err);
        }
        try {
            const result = model.placeCanvasTile({
                actor: actor(req),
                ip_address: req.ip,
                x: req.body && req.body.x,
                y: req.body && req.body.y,
                color_index: req.body && req.body.color_index,
            });
            publish(req, GAME_EVENT_TYPES.CANVAS_TILE_PLACED, {
                x: result.tile.x,
                y: result.tile.y,
                color_index: result.tile.color_index,
                user_id: result.tile.user_id,
            });
            res.status(201).json(result);
        } catch (err) {
            return fail(res, err);
        }
    });

    r.get('/canvas/staff/regions', (req, res) => {
        try {
            policy.assert(policy.decideCanvasModeration({ req }), actorMeta(req));
        } catch (err) {
            return denied(res, err);
        }
        res.json({ regions: model.listCanvasRegions() });
    });

    r.post('/canvas/staff/regions', json, (req, res) => {
        try {
            policy.assert(policy.decideCanvasModeration({ req }), actorMeta(req));
        } catch (err) {
            return denied(res, err);
        }
        try {
            const region = model.createCanvasRegion(Object.assign({}, req.body || {}, { created_by: actor(req).id || actor(req).username || 'staff' }));
            publish(req, GAME_EVENT_TYPES.CANVAS_REGION_CREATED, { region_id: region.id, label: region.label });
            res.status(201).json({ region });
        } catch (err) {
            return fail(res, err);
        }
    });

    r.delete('/canvas/staff/regions/:id', (req, res) => {
        try {
            policy.assert(policy.decideCanvasModeration({ req }), actorMeta(req));
        } catch (err) {
            return denied(res, err);
        }
        model.removeCanvasRegion(req.params.id);
        publish(req, GAME_EVENT_TYPES.CANVAS_REGION_REMOVED, { region_id: Number(req.params.id) });
        res.json({ ok: true });
    });

    r.get('/canvas/staff/bans', (req, res) => {
        try {
            policy.assert(policy.decideCanvasModeration({ req }), actorMeta(req));
        } catch (err) {
            return denied(res, err);
        }
        res.json({ bans: model.listCanvasBans() });
    });

    r.post('/canvas/staff/bans', json, (req, res) => {
        try {
            policy.assert(policy.decideCanvasModeration({ req }), actorMeta(req));
        } catch (err) {
            return denied(res, err);
        }
        try {
            const ban = model.createCanvasBan(Object.assign({}, req.body || {}, { created_by: actor(req).id || actor(req).username || 'staff' }));
            publish(req, GAME_EVENT_TYPES.CANVAS_BAN_CREATED, { ban_id: ban.id, user_id: ban.user_id, ip_address: ban.ip_address });
            res.status(201).json({ ban });
        } catch (err) {
            return fail(res, err);
        }
    });

    r.delete('/canvas/staff/bans/:id', (req, res) => {
        try {
            policy.assert(policy.decideCanvasModeration({ req }), actorMeta(req));
        } catch (err) {
            return denied(res, err);
        }
        model.removeCanvasBan(req.params.id);
        publish(req, GAME_EVENT_TYPES.CANVAS_BAN_REMOVED, { ban_id: Number(req.params.id) });
        res.json({ ok: true });
    });

    return r;
}

module.exports = { buildRouter };
