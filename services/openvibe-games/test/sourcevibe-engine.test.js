'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-sourcevibe-test-')), 'games.db');
process.env.NODE_ENV = 'development';
process.env.OPENVIBE_EVENTS_URL = 'http://127.0.0.1:1';
process.env.OPENVIBE_GAMES_CANVAS_TILE_COOLDOWN_SECONDS = '0';
process.env.OPENVIBE_GAMES_CANVAS_PLACEMENTS_PER_MINUTE = '60';
process.env.OPENVIBE_PERSISTENCE_MODE = 'sqlite';
process.env.OPENVIBE_OPENVIBE_GAMES_PERSISTENCE_MODE = 'sqlite';
process.env.OPENVIBE_DATABASE_URL = '';
process.env.OPENVIBE_STAGING_DATABASE_URL = '';
process.env.OPENVIBE_OPENVIBE_GAMES_DATABASE_URL = '';

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
        const homepageHtml = await fetch(`${baseUrl}/`, { headers: headers() }).then((response) => response.text());
        assert.ok(homepageHtml.includes('SourceVibe front door'));
        assert.ok(homepageHtml.includes('Gamemode packages'));
        assert.ok(!homepageHtml.includes('user-id'));

        const launcherHtml = await fetch(`${baseUrl}/sourcevibe/`, { headers: headers() }).then((response) => response.text());
        assert.ok(launcherHtml.includes('SourceVibe Engine'));
        assert.ok(launcherHtml.includes('Directory'));
        assert.ok(launcherHtml.includes('Console'));
        assert.ok(launcherHtml.includes('Editor'));

        const worldShellRedirect = await fetch(`${baseUrl}/2d-world/`, {
            headers: headers(),
            redirect: 'manual',
        });
        assert.strictEqual(worldShellRedirect.status, 302);
        assert.ok(String(worldShellRedirect.headers.get('location') || '').includes('/sourcevibe?gamemode=2dworld&view=home'));

        const worldPlayHtml = await fetch(`${baseUrl}/2d-world/?gamemode=2dworld&server=2d-world&launch=play`, { headers: headers() }).then((response) => response.text());
        assert.ok(worldPlayHtml.includes('join-status'));
        assert.ok(!worldPlayHtml.includes('welcome-root'));

        const editorRedirect = await fetch(`${baseUrl}/2d-world/editor/?gamemode=2dworld`, {
            headers: headers(),
            redirect: 'manual',
        });
        assert.strictEqual(editorRedirect.status, 302);
        assert.ok(String(editorRedirect.headers.get('location') || '').includes('/sourcevibe?gamemode=2dworld&view=editor'));

        const statusRedirect = await fetch(`${baseUrl}/2d-world/status/?gamemode=2dworld`, {
            headers: headers(),
            redirect: 'manual',
        });
        assert.strictEqual(statusRedirect.status, 302);
        assert.ok(String(statusRedirect.headers.get('location') || '').includes('/sourcevibe?gamemode=2dworld&view=diagnostics'));

        const bootstrap = await jsonFetch(`${baseUrl}/api/games/sourcevibe/bootstrap`);
        assert.strictEqual(bootstrap.engine.name, 'SourceVibe Engine');
        assert.ok(Array.isArray(bootstrap.engine.api) && bootstrap.engine.api.includes('hook'));
        assert.ok(Array.isArray(bootstrap.engine.sharedWindows) && bootstrap.engine.sharedWindows.includes('console'));
        assert.strictEqual(bootstrap.gamemode.id, '2dworld');
        assert.strictEqual(bootstrap.gamemodeUi.theme, 'sourcevibe-foundation');
        assert.strictEqual(bootstrap.gamemodeUi.inventory.owner, 'gamemode');
        assert.strictEqual(bootstrap.gamemodeUi.inventory.showBankOnInteractionOnly, true);
        assert.ok(Array.isArray(bootstrap.gamemodes) && bootstrap.gamemodes.some((entry) => entry.id === 'base'));
        assert.ok(Array.isArray(bootstrap.maps) && bootstrap.maps.some((entry) => entry.id === '2dworld_outpost'));
        assert.ok(Array.isArray(bootstrap.directory) && bootstrap.directory.some((entry) => entry.id === '2dworld'));
        assert.deepStrictEqual(bootstrap.menu.connected, ['Resume Game', 'Directory', 'Console', 'Options', 'Leave World', 'Return to Homepage']);

        const gamemodes = await jsonFetch(`${baseUrl}/api/games/sourcevibe/gamemodes`);
        assert.ok(gamemodes.items.some((entry) => entry.id === '2dworld'));
        assert.strictEqual(gamemodes.active.id, '2dworld');
        assert.ok(Array.isArray(gamemodes.directory) && gamemodes.directory.some((entry) => entry.id === '2dworld'));

        const gamemodeDetail = await jsonFetch(`${baseUrl}/api/games/sourcevibe/gamemodes/2dworld`);
        assert.strictEqual(gamemodeDetail.gamemode.id, '2dworld');
        assert.ok(gamemodeDetail.gamemode.routes.play.includes('/2d-world'));
        assert.ok(gamemodeDetail.gamemode.routes.status.includes('/sourcevibe'));
        assert.ok(gamemodeDetail.gamemode.routes.editor.includes('/sourcevibe'));
        assert.strictEqual(gamemodeDetail.permissions.canPlay, true);

        const directory = await jsonFetch(`${baseUrl}/api/games/sourcevibe/directory`);
        const directoryEntry = directory.items.find((entry) => entry.id === '2dworld');
        assert.ok(directoryEntry);
        assert.strictEqual(directoryEntry.featured, true);
        assert.strictEqual(directoryEntry.permissions.canPlay, true);
        assert.strictEqual(directoryEntry.permissions.canLocalTest, true);
        assert.ok(directoryEntry.surfaces.play.includes('/2d-world'));
        assert.ok(directoryEntry.surfaces.status.includes('/sourcevibe'));
        assert.ok(directoryEntry.surfaces.editor.includes('/sourcevibe'));

        const permissions = await jsonFetch(`${baseUrl}/api/games/sourcevibe/gamemodes/2dworld/permissions`);
        assert.strictEqual(permissions.permissions.gamemode, '2dworld');
        assert.strictEqual(permissions.permissions.canPlay, true);
        assert.strictEqual(permissions.permissions.canLocalTest, true);

        const play = await jsonFetch(`${baseUrl}/api/games/sourcevibe/gamemodes/2dworld/play`, {
            method: 'POST',
            body: JSON.stringify({}),
        });
        assert.strictEqual(play.ok, true);
        assert.strictEqual(play.launch.auth.userId, 'sv-user-1');
        assert.ok(play.launch.url.includes('/2d-world'));
        assert.ok(play.launch.url.includes('launch=play'));

        const legacyImportRejected = await fetch(`${baseUrl}/api/games/2d-world/worlds`, {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({
                name: 'Legacy Import Block Test',
                legacy_entities: [{ class: 'car1' }],
            }),
        });
        const legacyImportBody = await legacyImportRejected.json();
        assert.strictEqual(legacyImportRejected.status, 400);
        assert.strictEqual(legacyImportBody.reason, 'sourcevibe_only');

        const localTest = await jsonFetch(`${baseUrl}/api/games/sourcevibe/gamemodes/2dworld/local-test`, {
            method: 'POST',
            body: JSON.stringify({}),
        });
        assert.strictEqual(localTest.ok, true);
        assert.strictEqual(localTest.server.gamemode, '2dworld');
        assert.ok(localTest.server.slug.includes('local'));
        assert.strictEqual(localTest.launch.auth.userId, 'sv-user-1');

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
