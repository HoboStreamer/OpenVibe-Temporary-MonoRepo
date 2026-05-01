import { REALTIME_PATH, TWO_D_WORLD_API, apiJson, ensureSocketIoClient, loadIdentity, saveIdentity } from '../src/app/config.js';
import { EditorScene } from '../src/scenes/editor-scene.js';
import { RealtimeClient } from '../src/net/realtime-client.js';

const identity = loadIdentity();
const dom = {
    userId: document.getElementById('user-id'),
    displayName: document.getElementById('display-name'),
    name: document.getElementById('world-name'),
    slug: document.getElementById('world-slug'),
    tool: document.getElementById('tool-select'),
    terrain: document.getElementById('terrain-select'),
    saveBtn: document.getElementById('save-world-btn'),
    publishBtn: document.getElementById('publish-world-btn'),
    status: document.getElementById('editor-status'),
    canvas: document.getElementById('editor-canvas'),
};

const scene = new EditorScene(dom.canvas);
const client = new RealtimeClient({ path: REALTIME_PATH, identity });
const draft = { tiles: [], objects: [], worldId: null };

function updateStatus(message) {
    dom.status.textContent = message;
}

function pointToCell(event) {
    const rect = dom.canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / 24);
    const y = Math.floor((event.clientY - rect.top) / 24);
    return { x, y };
}

async function saveDraft() {
    const payload = {
        slug: dom.slug.value.trim() || `editor-${identity.userId}`,
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
    const result = await apiJson(`${TWO_D_WORLD_API}/worlds`, { method: 'POST', body: JSON.stringify(payload) }, identity);
    draft.worldId = result.world.id;
    updateStatus(`Saved ${result.world.slug}`);
}

async function publishDraft() {
    if (!draft.worldId) {
        await saveDraft();
    }
    const result = await apiJson(`${TWO_D_WORLD_API}/worlds/${draft.worldId}/publish`, { method: 'POST', body: JSON.stringify({ published_by: identity.userId }) }, identity);
    updateStatus(`Published ${result.world.slug}`);
}

async function setupRealtime() {
    await ensureSocketIoClient(REALTIME_PATH);
    client.connect();
    client.on('connect', async () => {
        await client.joinEditor(dom.slug.value || 'editor-preview');
        updateStatus('Realtime editor connected');
    });
    client.on('editor:snapshot', (snapshot) => {
        draft.tiles.length = 0;
        draft.objects.length = 0;
        draft.tiles.push(...(snapshot.tiles || []));
        draft.objects.push(...(snapshot.objects || []));
        scene.setWorld(draft);
    });
}

function bind() {
    dom.userId.value = identity.userId;
    dom.displayName.value = identity.displayName;
    dom.slug.value = '2d-world-player-shard';
    dom.name.value = 'Player-built Shard';
    dom.canvas.addEventListener('click', async (event) => {
        identity.userId = dom.userId.value.trim() || identity.userId;
        identity.displayName = dom.displayName.value.trim() || identity.displayName;
        saveIdentity(identity);
        const cell = pointToCell(event);
        if (dom.tool.value === 'tile') {
            const tile = { ...cell, terrain: dom.terrain.value };
            draft.tiles.push(tile);
            scene.addTile(tile);
            await client.saveEditorEdit({ kind: 'tile', ...tile });
        } else {
            const object = { ...cell, type: dom.tool.value };
            draft.objects.push(object);
            scene.addObject(object);
            await client.saveEditorEdit({ kind: 'object', ...object });
        }
    });
    dom.saveBtn.addEventListener('click', () => saveDraft().catch((error) => updateStatus(error.message)));
    dom.publishBtn.addEventListener('click', () => publishDraft().catch((error) => updateStatus(error.message)));
}

bind();
setupRealtime().catch((error) => updateStatus(error.message));
scene.render();
