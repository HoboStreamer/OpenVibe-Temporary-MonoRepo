'use strict';

const express = require('express');

const model = require('./model');
const policy = require('./policy');
const worldStore = require('./realtime/world-store');
const modRegistry = require('./mods/registry');
const { worldSnapshotPayload } = require('./realtime/systems/persistence-system');
const { GAME_EVENT_TYPES } = require('@openvibe/contracts');

function build2dWorldRouter({ eventBus, realtime, config }) {
    const r = express.Router();
    const json = express.json({ limit: '1mb' });

    function actor(req) {
        return policy.actorOfReq(req);
    }

    function actorMeta(req) {
        const a = actor(req);
        return { actor_type: a.type, actor_id: a.id || a.username || 'anonymous' };
    }

    function publish(req, eventType, payload) {
        if (eventBus) eventBus.publishGameEvent(eventType, payload, actorMeta(req));
    }

    function requireAuthenticated(req) {
        const a = actor(req);
        if (a.type === 'anonymous') {
            const err = new Error('authentication required');
            err.status = 401;
            throw err;
        }
        return a;
    }

    function fail(res, err) {
        return res.status(err.status || 400).json({ error: err.message, reason: err.reason || null });
    }

    function playerBundle(userId) {
        return {
            player: model.ensurePlayer(userId),
            inventory: model.listInventory(userId),
            bank: model.listBank(userId),
            quests: model.listDailyQuests(userId),
            achievements: model.listAchievements(userId),
            cosmetics: model.listCosmetics(userId),
        };
    }

    r.get('/status', (_req, res) => {
        res.json({
            ok: true,
            product: 'games-2d-world',
            worlds: worldStore.listWorlds({ limit: 100 }).length,
            realtime: realtime.summary(),
            product_status: model.summarizeProduct(),
            seams: {
                media_url: config.media && config.media.url,
                network_url: config.network && config.network.url,
                chat_url: config.chat && config.chat.url,
                billing_url: config.billing && config.billing.url,
                ai_url: config.ai && config.ai.url,
                community_url: config.community && config.community.url,
            },
        });
    });

    r.get('/worlds', (_req, res) => {
        const worlds = worldStore.listWorlds({ limit: 100 }).map((world) => Object.assign({}, world, { zones: worldStore.listZones(world.id) }));
        res.json({ worlds });
    });

    r.get('/catalog', (_req, res) => {
        const worlds = worldStore.listWorlds({ limit: 100 });
        const requestedWorld = _req.query && (_req.query.world_id || _req.query.world_slug);
        const world = requestedWorld ? (worldStore.getWorld(requestedWorld) || realtime.rootWorld) : realtime.rootWorld;
        const catalog = typeof realtime.getCatalog === 'function' ? realtime.getCatalog(world.id) : realtime.catalog;
        res.json(Object.assign({ worlds }, catalog));
    });

    r.get('/player/:userId', (req, res) => {
        const userId = String(req.params.userId);
        try {
            policy.assert(policy.decidePlayerRead({ req, userId }), actorMeta(req));
            res.json(playerBundle(userId));
        } catch (err) {
            fail(res, err);
        }
    });

    r.post('/worlds', json, (req, res) => {
        try {
            const a = requireAuthenticated(req);
            const body = req.body || {};
            const world = worldStore.upsertWorld({
                slug: body.slug || String(body.name || 'world').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64),
                name: body.name || 'Untitled World',
                owner_id: a.id,
                mode: body.mode || 'sandbox',
                seed: Number(body.seed) || 0,
                status: body.status || 'draft',
                metadata: Object.assign({ description: body.description || '' }, body.metadata || {}),
            });
            if (Array.isArray(body.zones)) worldStore.setZones(world.id, body.zones);
            if (Array.isArray(body.resources)) worldStore.setResourceNodes(world.id, body.resources);
            publish(req, GAME_EVENT_TYPES.WORLD_CREATED, { world_id: world.id, slug: world.slug, owner_id: a.id });
            res.status(201).json({ world, zones: worldStore.listZones(world.id) });
        } catch (err) {
            fail(res, err);
        }
    });

    r.post('/worlds/:worldId/publish', json, (req, res) => {
        try {
            const a = requireAuthenticated(req);
            const world = worldStore.getWorld(req.params.worldId);
            if (!world) return res.status(404).json({ error: 'world not found' });
            if (world.owner_id && world.owner_id !== a.id && a.role !== 'admin') return res.status(403).json({ error: 'world publish requires owner or admin' });
            const updated = worldStore.upsertWorld({
                slug: world.slug,
                name: world.name,
                owner_id: world.owner_id,
                mode: world.mode,
                seed: world.seed,
                status: 'published',
                metadata: world.metadata,
            });
            publish(req, GAME_EVENT_TYPES.WORLD_UPDATED, { world_id: updated.id, status: 'published' });
            res.json({ world: updated, zones: worldStore.listZones(updated.id) });
        } catch (err) {
            fail(res, err);
        }
    });

    r.post('/worlds/:worldId/snapshot', json, (req, res) => {
        try {
            requireAuthenticated(req);
            const world = worldStore.getWorld(req.params.worldId);
            if (!world) return res.status(404).json({ error: 'world not found' });
            const room = realtime.getRoom({ worldId: world.id, roomType: req.body && req.body.room_type === 'dungeon' ? 'dungeon' : 'world' });
            const snapshot = worldStore.recordSnapshot(world.id, worldSnapshotPayload(room));
            publish(req, GAME_EVENT_TYPES.WORLD_SNAPSHOT_CREATED, { world_id: world.id, snapshot_id: snapshot.id, sequence: snapshot.sequence });
            res.status(201).json({ snapshot });
        } catch (err) {
            fail(res, err);
        }
    });

    r.post('/player/:userId/skills/xp', json, (req, res) => {
        const a = actor(req);
        if (!(a.type === 'service' || a.role === 'admin')) {
            return res.status(403).json({ error: 'service or admin access required' });
        }
        const userId = String(req.params.userId);
        const player = model.ensurePlayer(userId);
        const skill = String(req.body && req.body.skill || 'attack');
        const amount = Math.max(0, Number(req.body && req.body.amount) || 0);
        const fieldMap = {
            attack: 'combat_xp', strength: 'combat_xp', defense: 'combat_xp', ranged: 'combat_xp', magic: 'combat_xp', hoarding: 'combat_xp',
            mining: 'mining_xp', fishing: 'fishing_xp', woodcut: 'woodcut_xp', farming: 'farming_xp', crafting: 'crafting_xp', cooking: 'crafting_xp', smithing: 'smithing_xp', construction: 'crafting_xp', agility: 'agility_xp',
        };
        const field = fieldMap[skill] || 'combat_xp';
        const updated = model.upsertPlayer({ user_id: userId, [field]: Number(player[field] || 0) + amount });
        publish(req, GAME_EVENT_TYPES.PLAYER_SKILL_XP_ADDED, { user_id: userId, skill, amount, world_id: updated.world_id });
        res.json({ player: updated });
    });

    r.get('/mods', (_req, res) => {
        res.json({ mods: modRegistry.listMods({ limit: 100 }) });
    });

    r.post('/mods', json, (req, res) => {
        try {
            const a = requireAuthenticated(req);
            const mod = modRegistry.registerMod({ manifest: req.body || {}, owner_id: a.id });
            publish(req, GAME_EVENT_TYPES.MOD_REGISTERED, { mod_id: mod.id, slug: mod.slug, owner_id: a.id });
            res.status(201).json({ mod });
        } catch (err) {
            fail(res, err);
        }
    });

    r.post('/mods/:modId/enable', json, (req, res) => {
        try {
            requireAuthenticated(req);
            const worldId = req.body && req.body.world_id || realtime.rootWorld.id;
            const enabled = modRegistry.setEnabled(req.params.modId, worldId, true);
            if (typeof realtime.refreshWorldCatalog === 'function') realtime.refreshWorldCatalog(worldId);
            publish(req, GAME_EVENT_TYPES.MOD_ENABLED, { mod_id: enabled.mod_id, world_id: enabled.world_id });
            res.json({ mod_world: enabled });
        } catch (err) {
            fail(res, err);
        }
    });

    r.post('/mods/:modId/disable', json, (req, res) => {
        try {
            requireAuthenticated(req);
            const worldId = req.body && req.body.world_id || realtime.rootWorld.id;
            const disabled = modRegistry.setEnabled(req.params.modId, worldId, false);
            if (typeof realtime.refreshWorldCatalog === 'function') realtime.refreshWorldCatalog(worldId);
            publish(req, GAME_EVENT_TYPES.MOD_DISABLED, { mod_id: disabled.mod_id, world_id: disabled.world_id });
            res.json({ mod_world: disabled });
        } catch (err) {
            fail(res, err);
        }
    });

    r.post('/mods/:modId/assets', json, (req, res) => {
        try {
            requireAuthenticated(req);
            const asset = modRegistry.uploadAsset({
                modId: req.params.modId,
                namespace: req.body && req.body.namespace,
                media_id: req.body && req.body.media_id,
                asset_path: req.body && req.body.asset_path,
                metadata: req.body && req.body.metadata,
            });
            publish(req, GAME_EVENT_TYPES.MOD_ASSET_UPLOADED, { mod_id: req.params.modId, asset_id: asset.id });
            res.status(201).json({ asset });
        } catch (err) {
            fail(res, err);
        }
    });

    return r;
}

module.exports = { build2dWorldRouter };
