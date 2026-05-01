import { REALTIME_PATH, TWO_D_WORLD_API, apiJson, ensureSocketIoClient, getAuthState, initializeAuth, loadIdentity, resolveSurfaceUrl, startSignIn, startSignOut } from './app/config.js';
import { EditorScene } from './scenes/editor-scene.js';
import { RealtimeClient } from './net/realtime-client.js';

const state = {
    auth: getAuthState(),
    identity: loadIdentity(),
    realtimeReady: false,
};

const dom = {
    sessionSummary: document.getElementById('editor-session-summary'),
    sessionMeta: document.getElementById('editor-session-meta'),
    name: document.getElementById('world-name'),
    slug: document.getElementById('world-slug'),
    tool: document.getElementById('tool-select'),
    terrain: document.getElementById('terrain-select'),
    saveBtn: document.getElementById('save-world-btn'),
    publishBtn: document.getElementById('publish-world-btn'),
    signInBtn: document.getElementById('editor-sign-in-btn'),
    signOutBtn: document.getElementById('editor-sign-out-btn'),
    accountBtn: document.getElementById('editor-account-btn'),
    status: document.getElementById('editor-status'),
    canvas: document.getElementById('editor-canvas'),
};

const scene = new EditorScene(dom.canvas);
const draft = { tiles: [], objects: [], worldId: null };
let client = null;

function updateStatus(message) {
    dom.status.textContent = message;
}

function isAuthenticated() {
    return !!(state.auth && state.auth.session && state.auth.session.authenticated);
}

function syncAuthState(auth = getAuthState()) {
    state.auth = auth;
    state.identity = loadIdentity();
}

function renderSession() {
    const user = state.auth && state.auth.session && state.auth.session.user || null;
    if (dom.sessionSummary) {
        dom.sessionSummary.textContent = isAuthenticated()
            ? `${user && (user.display_name || user.username || user.id) || 'Signed in'} · ${user && user.role || 'user'}`
            : 'Sign in with OpenVibe to edit and publish shards';
    }
    if (dom.sessionMeta) {
        dom.sessionMeta.textContent = isAuthenticated()
            ? `Draft ownership and publish actions now resolve from ${user && (user.username || user.id) || 'your account'} instead of a browser-local identity.`
            : 'The old local User ID / Display Name inputs are gone. Editor saves now follow the authenticated OpenVibe actor.';
    }
    dom.saveBtn.disabled = !isAuthenticated();
    dom.publishBtn.disabled = !isAuthenticated();
    dom.signInBtn?.classList.toggle('hidden', isAuthenticated());
    dom.signOutBtn?.classList.toggle('hidden', !isAuthenticated());
}

function ensureEditorClient() {
    if (!client) client = new RealtimeClient({ path: REALTIME_PATH, identity: state.identity, token: state.auth.token });
    client.setAuth({ identity: state.identity, token: state.auth.token });
    return client;
}

function pointToCell(event) {
    const rect = dom.canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / 24);
    const y = Math.floor((event.clientY - rect.top) / 24);
    return { x, y };
}

async function saveDraft() {
    if (!isAuthenticated()) {
        updateStatus('Sign in with OpenVibe before saving a draft world.');
        startSignIn();
        return;
    }
    const payload = {
        slug: dom.slug.value.trim() || `editor-${state.identity.userId || 'draft'}`,
        name: dom.name.value.trim() || 'Untitled OpenVibe World',
        description: 'Phase 17 editor draft',
        metadata: { editorDraft: { tiles: draft.tiles, objects: draft.objects } },
        zones: [
            {
                zone_id: 'outpost',
                name: 'Edited Outpost',
                width: 48,
                height: 32,
                spawn_x: 12,
                spawn_y: 12,
                biome: 'temperate',
                description: 'Editor-authored draft',
                metadata: { editorDraft: true },
            },
        ],
        resources: draft.objects.map((object, index) => ({
            node_id: `editor-node-${index + 1}`,
            zone_id: 'outpost',
            kind: object.type,
            x: (object.x * 24) + 12,
            y: (object.y * 24) + 12,
            max_hp: 50,
            loot_table_id: object.type === 'tree' ? 'starter-woodcutting' : 'starter-mining',
            metadata: {},
        })),
    };
    const result = await apiJson(`${TWO_D_WORLD_API}/worlds`, { method: 'POST', body: JSON.stringify(payload) });
    draft.worldId = result.world.id;
    updateStatus(`Saved ${result.world.slug}`);
}

async function publishDraft() {
    if (!isAuthenticated()) {
        updateStatus('Sign in with OpenVibe before publishing a draft world.');
        startSignIn();
        return;
    }
    if (!draft.worldId) {
        await saveDraft();
    }
    const result = await apiJson(`${TWO_D_WORLD_API}/worlds/${draft.worldId}/publish`, { method: 'POST', body: JSON.stringify({ published_by: state.identity.userId || null }) });
    updateStatus(`Published ${result.world.slug}`);
}

async function setupRealtime() {
    if (state.realtimeReady || !isAuthenticated()) return;
    await ensureSocketIoClient(REALTIME_PATH);
    const nextClient = ensureEditorClient();
    nextClient.connect();
    state.realtimeReady = true;
    nextClient.on('connect', async () => {
        await nextClient.joinEditor(dom.slug.value || 'editor-preview');
        updateStatus('Realtime editor connected');
    });
    nextClient.on('editor:snapshot', (snapshot) => {
        draft.tiles.length = 0;
        draft.objects.length = 0;
        draft.tiles.push(...(snapshot.tiles || []));
        draft.objects.push(...(snapshot.objects || []));
        scene.setWorld(draft);
    });
}

function bind() {
    dom.slug.value = '2d-world-player-shard';
    dom.name.value = 'Player-built Shard';
    dom.canvas.addEventListener('click', async (event) => {
        if (!isAuthenticated()) {
            updateStatus('Sign in with OpenVibe before editing this shard.');
            startSignIn();
            return;
        }
        if (!state.realtimeReady) await setupRealtime();
        const cell = pointToCell(event);
        if (dom.tool.value === 'tile') {
            const tile = { ...cell, terrain: dom.terrain.value };
            draft.tiles.push(tile);
            scene.addTile(tile);
            await ensureEditorClient().saveEditorEdit({ kind: 'tile', ...tile });
        } else {
            const object = { ...cell, type: dom.tool.value };
            draft.objects.push(object);
            scene.addObject(object);
            await ensureEditorClient().saveEditorEdit({ kind: 'object', ...object });
        }
    });
    dom.saveBtn.addEventListener('click', () => saveDraft().catch((error) => updateStatus(error.message)));
    dom.publishBtn.addEventListener('click', () => publishDraft().catch((error) => updateStatus(error.message)));
    dom.signInBtn?.addEventListener('click', () => startSignIn());
    dom.signOutBtn?.addEventListener('click', () => startSignOut());
    dom.accountBtn?.addEventListener('click', () => {
        window.location.assign(resolveSurfaceUrl('my'));
    });
}

async function init() {
    syncAuthState(await initializeAuth());
    renderSession();
    bind();
    if (isAuthenticated()) await setupRealtime();
    else updateStatus('Sign in with OpenVibe to enable collaborative editing and publishing.');
}

init().catch((error) => updateStatus(error.message));
scene.render();
