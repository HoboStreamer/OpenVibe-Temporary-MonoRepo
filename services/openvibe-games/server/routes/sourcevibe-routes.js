'use strict';

const express = require('express');

function buildSourceVibeRouter({ sourcevibe, actorOfReq }) {
    const r = express.Router();
    const json = express.json({ limit: '512kb' });

    function actor(req) {
        return typeof actorOfReq === 'function' ? actorOfReq(req) : { type: 'anonymous', id: null, display_name: 'Anonymous' };
    }

    r.get('/product/status', (_req, res) => {
        res.json(sourcevibe.summary());
    });

    r.get('/bootstrap', (req, res) => {
        const a = actor(req);
        res.json(sourcevibe.buildClientBootstrap({
            gamemode: req.query.gamemode,
            serverId: req.query.server || req.query.server_id || req.query.world_id,
            userId: a.id,
            displayName: a.display_name || a.username,
        }));
    });

    r.get('/gamemodes', (_req, res) => {
        res.json({ items: sourcevibe.listGamemodes(), active: sourcevibe.getGamemode(sourcevibe.activeGamemode() && sourcevibe.activeGamemode().id) });
    });

    r.get('/gamemodes/:id', (req, res) => {
        const gamemode = sourcevibe.getGamemode(req.params.id);
        if (!gamemode) return res.status(404).json({ error: 'gamemode not found' });
        return res.json({ gamemode });
    });

    r.get('/maps', (_req, res) => {
        res.json({ items: sourcevibe.listMaps() });
    });

    r.get('/addons', (req, res) => {
        const serverId = req.query.server || req.query.server_id || req.query.world_id || null;
        const server = serverId ? sourcevibe.getServer(serverId) : null;
        res.json({ items: sourcevibe.listAddons(server && server.worldId || null) });
    });

    r.get('/servers', (_req, res) => {
        res.json({ items: sourcevibe.listServers() });
    });

    r.get('/servers/:id', (req, res) => {
        const server = sourcevibe.getServer(req.params.id);
        if (!server) return res.status(404).json({ error: 'server not found' });
        return res.json({ server });
    });

    r.post('/servers', json, (req, res) => {
        const a = actor(req);
        if (a.type === 'anonymous') return res.status(401).json({ error: 'auth required for server creation' });
        try {
            const server = sourcevibe.createServer(Object.assign({}, req.body || {}, {
                ownerId: a.id,
            }));
            return res.status(201).json({ server });
        } catch (error) {
            return res.status(error.status || 400).json({ error: error.message });
        }
    });

    r.post('/connect', json, (req, res) => {
        const a = actor(req);
        const result = sourcevibe.connect({
            id: req.body && (req.body.id || req.body.serverId || req.body.worldId || req.body.world_id),
            userId: a.id,
            displayName: a.display_name || a.username,
        });
        if (!result.ok) return res.status(404).json({ error: result.error });
        return res.json(result);
    });

    r.post('/console/run', json, (req, res) => {
        const a = actor(req);
        const result = sourcevibe.console.run(req.body && req.body.command, {
            userId: a.id,
            displayName: a.display_name || a.username,
            lastServerId: req.body && req.body.lastServerId,
        });
        res.json(result);
    });

    return r;
}

module.exports = {
    buildSourceVibeRouter,
};
