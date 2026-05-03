import { REALTIME_PATH, TWO_D_WORLD_API, apiJson, ensureSocketIoClient, getAuthState, initializeAuth, loadIdentity, resolveSurfaceUrl, startSignIn, startSignOut } from './app/config.js';
import { EditorScene } from './scenes/editor-scene.js';
import { RealtimeClient } from './net/realtime-client.js';

const DEFAULT_BOUNDS = Object.freeze({ x: 0, y: 0, w: 16384, h: 16384 });
const DEFAULT_CELL_SIZE = 64;
const DEFAULT_CAMERA = Object.freeze({ x: 4096, y: 4096, zoom: 0.72 });
const TERRAIN_TO_COLOR = Object.freeze({
    grass: '#31543b',
    sand: '#b99c68',
    water: '#2b6d9d',
});

function parseQuery() {
    const params = new URLSearchParams(window.location.search);
    return {
        embedded: params.get('embedded') === '1',
        direct: params.get('direct') === '1',
        gamemode: params.get('gamemode') || '2dworld',
        server: params.get('server') || '',
    };
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function buildSeedDraft() {
    const tiles = [];
    for (let x = 60; x <= 69; x += 1) {
        for (let y = 61; y <= 67; y += 1) {
            tiles.push({ x, y, terrain: 'grass' });
        }
    }
    for (let x = 61; x <= 67; x += 1) {
        tiles.push({ x, y: 64, terrain: 'sand' });
    }
    for (let y = 65; y <= 68; y += 1) {
        tiles.push({ x: 59, y, terrain: 'water' });
        tiles.push({ x: 60, y, terrain: 'water' });
    }
    return {
        worldId: null,
        bounds: clone(DEFAULT_BOUNDS),
        cellSize: DEFAULT_CELL_SIZE,
        camera: clone(DEFAULT_CAMERA),
        tiles,
        objects: [
            { x: 62, y: 62, type: 'tree' },
            { x: 67, y: 66, type: 'tree' },
            { x: 68, y: 63, type: 'rock' },
            { x: 66, y: 65, type: 'chest' },
            { x: 64, y: 61, type: 'sign' },
            { x: 62, y: 67, type: 'bus' },
            { x: 64, y: 64, type: 'spawn' },
        ],
    };
}

function worldPointForCell(cell, cellSize = DEFAULT_CELL_SIZE, bounds = DEFAULT_BOUNDS) {
    return {
        x: bounds.x + ((Number(cell && cell.x) || 0) * cellSize) + (cellSize / 2),
        y: bounds.y + ((Number(cell && cell.y) || 0) * cellSize) + (cellSize / 2),
    };
}

function cellKey(entry) {
    return `${Number(entry && entry.x) || 0}:${Number(entry && entry.y) || 0}`;
}

function upsertByCell(list, entry, replacePredicate = null) {
    const next = Array.isArray(list) ? [...list] : [];
    const predicate = typeof replacePredicate === 'function'
        ? replacePredicate
        : (candidate) => cellKey(candidate) === cellKey(entry);
    const index = next.findIndex(predicate);
    if (index >= 0) next.splice(index, 1, entry);
    else next.push(entry);
    return next;
}

function removeByCell(list, cell, predicate = null) {
    const rule = typeof predicate === 'function'
        ? predicate
        : (entry) => cellKey(entry) === cellKey(cell);
    return (Array.isArray(list) ? list : []).filter((entry) => !rule(entry));
}

function isTerrainTool(tool) {
    return ['grass', 'sand', 'water'].includes(String(tool || '').toLowerCase());
}

function toolLabel(tool) {
    return String(tool || '').replace(/(^|_)(\w)/g, (_match, prefix, letter) => `${prefix ? ' ' : ''}${letter.toUpperCase()}`);
}

function terrainPatchForTile(tile, cellSize, bounds) {
    const world = worldPointForCell(tile, cellSize, bounds);
    return {
        type: 'rect',
        x: world.x - (cellSize / 2),
        y: world.y - (cellSize / 2),
        w: cellSize,
        h: cellSize,
        color: TERRAIN_TO_COLOR[tile.terrain] || TERRAIN_TO_COLOR.grass,
        alpha: tile.terrain === 'water' ? 0.92 : 0.78,
    };
}

function buildRuntimeEntityFromObject(object, cellSize, bounds) {
    const world = worldPointForCell(object, cellSize, bounds);
    switch (object.type) {
    case 'bus':
        return {
            id: `editor-bus-${cellKey(object)}`,
            zone_id: 'outpost',
            kind: 'vehicle_bus',
            x: world.x,
            y: world.y,
            metadata: { size: 148, route: 'Editor preview shuttle' },
        };
    case 'chest':
        return {
            id: `editor-chest-${cellKey(object)}`,
            zone_id: 'outpost',
            kind: 'chest',
            x: world.x,
            y: world.y,
            metadata: { size: 48, container: [{ item_id: 'wood', quantity: 4 }] },
        };
    case 'sign':
        return {
            id: `editor-sign-${cellKey(object)}`,
            zone_id: 'outpost',
            kind: 'text_sign',
            x: world.x,
            y: world.y,
            metadata: { size: 36, sign_text: 'SourceVibe editor draft waypoint.' },
        };
    default:
        return null;
    }
}

function buildResourceNode(object, cellSize, bounds) {
    const world = worldPointForCell(object, cellSize, bounds);
    if (object.type === 'tree') {
        return {
            zone_id: 'outpost',
            kind: 'tree',
            x: world.x,
            y: world.y,
            hp: 4,
            max_hp: 4,
            loot_table_id: 'loot.tree.oak',
        };
    }
    if (object.type === 'rock') {
        return {
            zone_id: 'outpost',
            kind: 'rock',
            x: world.x,
            y: world.y,
            hp: 5,
            max_hp: 5,
            loot_table_id: 'loot.rock.basic',
        };
    }
    return null;
}

const state = {
    auth: getAuthState(),
    identity: loadIdentity(),
    realtimeReady: false,
    remoteSnapshotLoaded: false,
    query: parseQuery(),
    activeTool: 'grass',
    panning: null,
    panWithSpace: false,
};

const draft = buildSeedDraft();

const dom = {
    sessionSummary: document.getElementById('editor-session-summary'),
    sessionMeta: document.getElementById('editor-session-meta'),
    name: document.getElementById('world-name'),
    slug: document.getElementById('world-slug'),
    saveBtn: document.getElementById('save-world-btn'),
    publishBtn: document.getElementById('publish-world-btn'),
    openShellBtn: document.getElementById('open-sourcevibe-btn'),
    signInBtn: document.getElementById('editor-sign-in-btn'),
    signOutBtn: document.getElementById('editor-sign-out-btn'),
    accountBtn: document.getElementById('editor-account-btn'),
    status: document.getElementById('editor-status'),
    canvas: document.getElementById('editor-canvas'),
    toolPalette: document.getElementById('tool-palette'),
    zoom: document.getElementById('editor-zoom'),
    cell: document.getElementById('editor-cell'),
    tileCount: document.getElementById('editor-tile-count'),
    objectCount: document.getElementById('editor-object-count'),
};

const scene = new EditorScene(dom.canvas);
let client = null;

function updateStatus(message, tone = 'neutral') {
    dom.status.textContent = message;
    dom.status.dataset.tone = tone;
}

function isAuthenticated() {
    return !!(state.auth && state.auth.session && state.auth.session.authenticated);
}

function syncAuthState(auth = getAuthState()) {
    state.auth = auth;
    state.identity = loadIdentity();
}

function currentEditorWorldId() {
    return draft.worldId || state.query.server || dom.slug.value.trim() || '2d-world-editor';
}

function renderSession() {
    const user = state.auth && state.auth.session && state.auth.session.user || null;
    if (dom.sessionSummary) {
        dom.sessionSummary.textContent = isAuthenticated()
            ? `${user && (user.display_name || user.username || user.id) || 'Signed in'} · collaborative edit enabled`
            : 'Preview mode · sign in with OpenVibe to sync, save, and publish';
    }
    if (dom.sessionMeta) {
        dom.sessionMeta.textContent = isAuthenticated()
            ? `Draft ownership, publish actions, and shared editor rooms resolve from ${user && (user.username || user.id) || 'your account'} through the unified SourceVibe shell.`
            : 'Guests can still block out terrain and props locally on this direct route, but the unified SourceVibe shell owns authentication and persistent saves.';
    }
    dom.saveBtn.disabled = !isAuthenticated();
    dom.publishBtn.disabled = !isAuthenticated();
    dom.signInBtn?.classList.toggle('hidden', isAuthenticated());
    dom.signOutBtn?.classList.toggle('hidden', !isAuthenticated());
}

function updateToolButtons() {
    dom.toolPalette?.querySelectorAll('[data-tool]').forEach((button) => {
        button.classList.toggle('active', button.dataset.tool === state.activeTool);
    });
    dom.canvas.style.cursor = state.panning ? 'grabbing' : (state.panWithSpace ? 'grab' : 'crosshair');
}

function updateWorkspaceStats(cell = scene.hoverCell) {
    if (dom.zoom) dom.zoom.textContent = `${Math.round((scene.camera.zoom || 1) * 100)}%`;
    if (dom.cell) dom.cell.textContent = cell ? `${cell.x}, ${cell.y}` : '—';
    if (dom.tileCount) dom.tileCount.textContent = String(draft.tiles.length);
    if (dom.objectCount) dom.objectCount.textContent = String(draft.objects.length);
}

function applyDraftToScene() {
    draft.camera = Object.assign({}, scene.camera || draft.camera || DEFAULT_CAMERA);
    scene.setWorld(draft);
    updateToolButtons();
    updateWorkspaceStats();
}

function applyRemoteSnapshot(snapshot) {
    if (!snapshot) return;
    const hasMeaningfulData = (Array.isArray(snapshot.tiles) && snapshot.tiles.length > 0)
        || (Array.isArray(snapshot.objects) && snapshot.objects.length > 0)
        || state.remoteSnapshotLoaded;
    if (!hasMeaningfulData) return;
    state.remoteSnapshotLoaded = true;
    draft.tiles = Array.isArray(snapshot.tiles) ? clone(snapshot.tiles) : [];
    draft.objects = Array.isArray(snapshot.objects) ? clone(snapshot.objects) : [];
    draft.bounds = Object.assign({}, draft.bounds, snapshot.bounds || {});
    draft.cellSize = Math.max(16, Number(snapshot.cellSize) || draft.cellSize || DEFAULT_CELL_SIZE);
    draft.camera = Object.assign({}, draft.camera, snapshot.camera || {});
    applyDraftToScene();
}

function ensureEditorClient() {
    if (!client) {
        client = new RealtimeClient({ path: REALTIME_PATH, identity: state.identity, token: state.auth && state.auth.token });
        client.on('connect', async () => {
            const joined = await client.joinEditor(currentEditorWorldId());
            applyRemoteSnapshot(joined);
            updateStatus('Collaborative editor connected.', 'ok');
        });
        client.on('disconnect', () => {
            state.realtimeReady = false;
            updateStatus('Realtime editor disconnected. Local preview remains available.', 'warn');
        });
        client.on('editor:snapshot', (snapshot) => {
            applyRemoteSnapshot(snapshot);
        });
    }
    client.setAuth({ identity: state.identity, token: state.auth && state.auth.token });
    return client;
}

async function setupRealtime() {
    if (!isAuthenticated()) return;
    await ensureSocketIoClient(REALTIME_PATH);
    const nextClient = ensureEditorClient();
    if (!nextClient.socket) nextClient.connect();
    state.realtimeReady = true;
}

async function pushRealtimeEdit(payloads) {
    if (!isAuthenticated()) return;
    if (!state.realtimeReady) await setupRealtime();
    const nextClient = ensureEditorClient();
    const edits = Array.isArray(payloads) ? payloads : [payloads];
    for (const payload of edits.filter(Boolean)) {
        await nextClient.saveEditorEdit(Object.assign({}, payload, {
            bounds: draft.bounds,
            cellSize: draft.cellSize,
            camera: draft.camera,
        }));
    }
}

function removeCellContent(cell) {
    const previousTiles = draft.tiles.length;
    const previousObjects = draft.objects.length;
    draft.tiles = removeByCell(draft.tiles, cell);
    draft.objects = removeByCell(draft.objects, cell);
    return previousTiles !== draft.tiles.length || previousObjects !== draft.objects.length;
}

async function applyEditorAction(cell, overrideTool = null) {
    const tool = String(overrideTool || state.activeTool || 'grass');
    let changed = false;
    if (tool === 'erase') {
        changed = removeCellContent(cell);
        if (changed) {
            applyDraftToScene();
            await pushRealtimeEdit([
                { kind: 'tile', x: cell.x, y: cell.y, remove: true },
                { kind: 'object', x: cell.x, y: cell.y, remove: true },
            ]);
        }
    } else if (isTerrainTool(tool)) {
        draft.tiles = upsertByCell(draft.tiles, { x: cell.x, y: cell.y, terrain: tool });
        changed = true;
        applyDraftToScene();
        await pushRealtimeEdit({ kind: 'tile', x: cell.x, y: cell.y, terrain: tool });
    } else {
        const object = { x: cell.x, y: cell.y, type: tool };
        draft.objects = tool === 'spawn'
            ? upsertByCell(removeByCell(draft.objects, null, (entry) => entry.type === 'spawn'), object)
            : upsertByCell(draft.objects, object);
        changed = true;
        applyDraftToScene();
        await pushRealtimeEdit({ kind: 'object', x: cell.x, y: cell.y, type: tool });
    }

    if (changed && !isAuthenticated()) {
        updateStatus(`Preview updated with ${toolLabel(tool)} at ${cell.x}, ${cell.y}. Sign in through SourceVibe to sync or publish.`, 'warn');
    }
}

function buildWorldPayload() {
    const spawnObject = draft.objects.find((entry) => entry.type === 'spawn') || { x: 64, y: 64 };
    const spawnPoint = worldPointForCell(spawnObject, draft.cellSize, draft.bounds);
    const resources = draft.objects.map((entry) => buildResourceNode(entry, draft.cellSize, draft.bounds)).filter(Boolean);
    const runtime_entities = draft.objects.map((entry) => buildRuntimeEntityFromObject(entry, draft.cellSize, draft.bounds)).filter(Boolean);
    return {
        slug: dom.slug.value.trim() || `editor-${state.identity.userId || 'draft'}`,
        name: dom.name.value.trim() || 'Untitled OpenVibe World',
        description: 'SourceVibe-authored 2D World workspace draft',
        bounds: clone(draft.bounds),
        chunk_size: draft.cellSize,
        camera: clone(draft.camera),
        ambience: { tint: '#8ed8ff', alpha: 0.035 },
        metadata: {
            editorDraft: {
                tiles: clone(draft.tiles),
                objects: clone(draft.objects),
                cellSize: draft.cellSize,
                camera: clone(draft.camera),
            },
        },
        terrain_patches: draft.tiles.map((tile) => terrainPatchForTile(tile, draft.cellSize, draft.bounds)),
        landmarks: [{ type: 'label', label: 'Editor Spawn', x: spawnPoint.x, y: spawnPoint.y - (draft.cellSize * 1.1), size: 16, color: '#dff7ff' }],
        zones: [{
            zone_id: 'outpost',
            label: 'Edited Outpost',
            kind: 'safe',
            pvp: false,
            spawn: spawnPoint,
            radius: 720,
            description: 'Editor-authored workspace preview.',
        }],
        resources,
        runtime_entities,
    };
}

async function saveDraft() {
    if (!isAuthenticated()) {
        updateStatus('Sign in with OpenVibe from the SourceVibe shell before saving this draft.', 'warn');
        startSignIn();
        return;
    }
    const payload = buildWorldPayload();
    const result = await apiJson(`${TWO_D_WORLD_API}/worlds`, { method: 'POST', body: JSON.stringify(payload) });
    draft.worldId = result.world.id;
    updateStatus(`Saved draft ${result.world.slug}.`, 'ok');
}

async function publishDraft() {
    if (!isAuthenticated()) {
        updateStatus('Sign in with OpenVibe from the SourceVibe shell before publishing this draft.', 'warn');
        startSignIn();
        return;
    }
    if (!draft.worldId) await saveDraft();
    const result = await apiJson(`${TWO_D_WORLD_API}/worlds/${draft.worldId}/publish`, {
        method: 'POST',
        body: JSON.stringify({ published_by: state.identity.userId || null }),
    });
    updateStatus(`Published ${result.world.slug}.`, 'ok');
}

function canvasPoint(event) {
    const rect = dom.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function bindCanvas() {
    dom.canvas.tabIndex = 0;
    dom.canvas.addEventListener('pointerdown', (event) => {
        const point = canvasPoint(event);
        const cell = scene.screenToCell(point.x, point.y);
        if (event.button === 1 || (event.button === 0 && state.panWithSpace)) {
            state.panning = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
            dom.canvas.setPointerCapture?.(event.pointerId);
            updateToolButtons();
            return;
        }
        if (event.button === 2) {
            event.preventDefault();
            applyEditorAction(cell, 'erase').catch((error) => updateStatus(error.message || 'Erase failed.', 'warn'));
            return;
        }
        if (event.button !== 0) return;
        applyEditorAction(cell).catch((error) => updateStatus(error.message || 'Edit failed.', 'warn'));
    });

    dom.canvas.addEventListener('pointermove', (event) => {
        const point = canvasPoint(event);
        const cell = scene.screenToCell(point.x, point.y);
        if (state.panning && state.panning.pointerId === event.pointerId) {
            scene.panBy(event.clientX - state.panning.clientX, event.clientY - state.panning.clientY);
            draft.camera = Object.assign({}, scene.camera);
            state.panning.clientX = event.clientX;
            state.panning.clientY = event.clientY;
            updateWorkspaceStats(cell);
            return;
        }
        scene.setHoverCell(cell);
        scene.setPreview(cell);
        updateWorkspaceStats(cell);
    });

    dom.canvas.addEventListener('pointerup', (event) => {
        if (state.panning && state.panning.pointerId === event.pointerId) {
            state.panning = null;
            draft.camera = Object.assign({}, scene.camera);
            updateToolButtons();
        }
    });

    dom.canvas.addEventListener('pointercancel', (event) => {
        if (state.panning && state.panning.pointerId === event.pointerId) {
            state.panning = null;
            draft.camera = Object.assign({}, scene.camera);
            updateToolButtons();
        }
    });

    dom.canvas.addEventListener('pointerleave', () => {
        if (!state.panning) {
            scene.setHoverCell(null);
            scene.setPreview(null);
            updateWorkspaceStats(null);
        }
    });

    dom.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    dom.canvas.addEventListener('wheel', (event) => {
        event.preventDefault();
        const point = canvasPoint(event);
        scene.zoomBy(event.deltaY, point.x, point.y);
        draft.camera = Object.assign({}, scene.camera);
        updateWorkspaceStats(scene.screenToCell(point.x, point.y));
    }, { passive: false });
}

function bindPalette() {
    dom.toolPalette?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-tool]');
        if (!button) return;
        state.activeTool = button.dataset.tool || 'grass';
        updateToolButtons();
        updateStatus(`${toolLabel(state.activeTool)} brush selected.`, 'neutral');
    });
}

function bindKeyboard() {
    window.addEventListener('keydown', (event) => {
        if (event.code === 'Space' && !['INPUT', 'TEXTAREA'].includes(document.activeElement && document.activeElement.tagName)) {
            state.panWithSpace = true;
            updateToolButtons();
        }
    });
    window.addEventListener('keyup', (event) => {
        if (event.code === 'Space') {
            state.panWithSpace = false;
            updateToolButtons();
        }
    });
}

function bindActions() {
    dom.saveBtn.addEventListener('click', () => saveDraft().catch((error) => updateStatus(error.message || 'Save failed.', 'warn')));
    dom.publishBtn.addEventListener('click', () => publishDraft().catch((error) => updateStatus(error.message || 'Publish failed.', 'warn')));
    dom.openShellBtn?.addEventListener('click', () => {
        const params = new URLSearchParams({ gamemode: state.query.gamemode, view: 'editor' });
        if (state.query.server) params.set('server', state.query.server);
        window.location.assign(`/sourcevibe?${params.toString()}`);
    });
    dom.signInBtn?.addEventListener('click', () => startSignIn());
    dom.signOutBtn?.addEventListener('click', () => startSignOut());
    dom.accountBtn?.addEventListener('click', () => {
        window.location.assign(resolveSurfaceUrl('my'));
    });
}

function bind() {
    dom.slug.value = state.query.server || '2d-world-player-shard';
    dom.name.value = 'Player-built Shard';
    bindCanvas();
    bindPalette();
    bindKeyboard();
    bindActions();
}

async function init() {
    syncAuthState(await initializeAuth());
    renderSession();
    bind();
    applyDraftToScene();
    if (isAuthenticated()) {
        updateStatus('World-space workspace ready. Collaborative sync is standing by.', 'ok');
        await setupRealtime();
    } else {
        updateStatus('Preview mode active. Sign in through SourceVibe to sync, save, or publish.', 'warn');
    }
}

init().catch((error) => updateStatus(error.message || 'Editor bootstrap failed.', 'warn'));
