'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-sourcevibe-test-')), 'games.db');
process.env.OPENVIBE_EVENTS_URL = 'http://127.0.0.1:1';
process.env.OPENVIBE_GAMES_CANVAS_TILE_COOLDOWN_SECONDS = '0';
process.env.OPENVIBE_GAMES_PLACEMENTS_PER_MINUTE = '60';

const { buildApp } = require('../server');

function headers() {
    return {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-OpenVibe-User-Id': 'sv-user-1',
        'X-OpenVibe-Display-Name': 'SourceVibe Tester',
        'X-OpenVibe-User-Role': 'user',
    };
}

async function jsonFetch(url, options = {}) {
    const response = await fetch(url, Object.assign({}, options, {
        headers: Object.assign({}, headers(), options.headers || {}),
    }));
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

async function main() {
    const { httpServer, realtime } = buildApp();
    const server = await new Promise((resolve) => {
        const listener = httpServer.listen(0, '127.0.0.1', () => resolve(listener));
    });

    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
        const launcherHtml = await fetch(`${baseUrl}/sourcevibe/`, { headers: headers() }).then((response) => response.text());
        assert.ok(launcherHtml.includes('SourceVibe Engine'));

        const bootstrap = await jsonFetch(`${baseUrl}/api/games/sourcevibe/bootstrap`);
        assert.strictEqual(bootstrap.engine.name, 'SourceVibe Engine');
        assert.ok(Array.isArray(bootstrap.engine.api) && bootstrap.engine.api.includes('hook'));
        assert.strictEqual(bootstrap.gamemode.id, '2dworld');
        assert.ok(Array.isArray(bootstrap.gamemodes) && bootstrap.gamemodes.some((entry) => entry.id === 'base'));
        assert.ok(Array.isArray(bootstrap.maps) && bootstrap.maps.some((entry) => entry.id === '2dworld_outpost'));

        const gamemodes = await jsonFetch(`${baseUrl}/api/games/sourcevibe/gamemodes`);
        assert.ok(gamemodes.items.some((entry) => entry.id === '2dworld'));
        assert.strictEqual(gamemodes.active.id, '2dworld');

        const gamemodeDetail = await jsonFetch(`${baseUrl}/api/games/sourcevibe/gamemodes/2dworld`);
        assert.strictEqual(gamemodeDetail.gamemode.id, '2dworld');
        assert.ok(gamemodeDetail.gamemode.routes.play.includes('/2d-world'));

        const created = await jsonFetch(`${baseUrl}/api/games/sourcevibe/servers`, {
            method: 'POST',
            body: JSON.stringify({
                name: 'My SourceVibe Sandbox',
                gamemode: '2dworld',
                map: '2dworld_outpost',
                maxPlayers: 24,
            }),
        });
        assert.strictEqual(created.server.gamemode, '2dworld');
        assert.ok(created.server.slug.includes('my-sourcevibe-sandbox'));

        const listed = await jsonFetch(`${baseUrl}/api/games/sourcevibe/servers`);
        assert.ok(listed.items.some((entry) => entry.id === created.server.id));

        const byId = await jsonFetch(`${baseUrl}/api/games/sourcevibe/servers/${created.server.id}`);
        assert.strictEqual(byId.server.id, created.server.id);

        const bySlug = await jsonFetch(`${baseUrl}/api/games/sourcevibe/servers/${created.server.slug}`);
        assert.strictEqual(bySlug.server.id, created.server.id);

        const connect = await jsonFetch(`${baseUrl}/api/games/sourcevibe/connect`, {
            method: 'POST',
            body: JSON.stringify({ id: created.server.slug }),
        });
        assert.strictEqual(connect.ok, true);
        assert.ok(connect.launch.url.includes('/sourcevibe') || connect.launch.url.includes('/2d-world'));

        const statusCommand = await jsonFetch(`${baseUrl}/api/games/sourcevibe/console/run`, {
            method: 'POST',
            body: JSON.stringify({ command: 'status' }),
        });
        assert.strictEqual(statusCommand.ok, true);
        assert.ok(statusCommand.output.includes('SourceVibe Engine'));

        const entityCreate = await jsonFetch(`${baseUrl}/api/games/sourcevibe/console/run`, {
            method: 'POST',
            body: JSON.stringify({ command: 'ent_create sv_storage_crate 64 128' }),
        });
        assert.strictEqual(entityCreate.ok, true);
        assert.ok(entityCreate.output.includes('sv_storage_crate'));

        const commandSwitch = await jsonFetch(`${baseUrl}/api/games/sourcevibe/console/run`, {
            method: 'POST',
            body: JSON.stringify({ command: 'gamemode_run base' }),
        });
        assert.strictEqual(commandSwitch.ok, true);

        const switchedBootstrap = await jsonFetch(`${baseUrl}/api/games/sourcevibe/bootstrap`);
        assert.strictEqual(switchedBootstrap.gamemode.id, 'base');

        console.log('sourcevibe-engine API smoke OK');
    } finally {
        await Promise.resolve(realtime && realtime.stop ? realtime.stop() : null).catch(() => {});
        await new Promise((resolve) => server.close(resolve));
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
