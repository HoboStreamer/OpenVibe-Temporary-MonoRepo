import { API_BASE, TWO_D_WORLD_API, REALTIME_PATH, apiJson, ensureSocketIoClient, loadIdentity, saveIdentity } from '../src/app/config.js';
import { InputController } from '../src/app/input.js';
import { WorldScene } from '../src/scenes/world-scene.js';
import { RealtimeClient } from '../src/net/realtime-client.js';
import { SnapshotBuffer } from '../src/net/snapshot-buffer.js';
import { applyPredictedInput } from '../src/net/prediction.js';
import { reconcileLocalState } from '../src/net/reconciliation.js';
import { interpolateEntity } from '../src/engine/interpolation.js';
import { HudPanel } from '../src/ui/hud.js';
import { ChatPanel } from '../src/ui/chat-panel.js';
import { InventoryPanel } from '../src/ui/inventory-panel.js';
import { CraftingPanel } from '../src/ui/crafting-panel.js';
import { SkillsPanel } from '../src/ui/skills-panel.js';
import { BuildMenu } from '../src/ui/build-menu.js';
import { MapPanel } from '../src/ui/map-panel.js';
import { DeathPanel } from '../src/ui/death-panel.js';
import { ModBrowser } from '../src/ui/mod-browser.js';
import { LootPanel } from '../src/ui/loot-panel.js';

const state = {
    identity: loadIdentity(),
    connectionText: 'disconnected',
    pingMs: 0,
    fps: 0,
    snapshotRate: 0,
    snapshotCount: 0,
    lastSnapshotCounterAt: performance.now(),
    pendingInputs: [],
    localSelf: null,
    latestSnapshot: null,
    buildSelection: null,
    snapshotBuffer: new SnapshotBuffer(30),
};

const dom = {
    userId: document.getElementById('user-id'),
    displayName: document.getElementById('display-name'),
    connectButton: document.getElementById('connect-btn'),
    joinInfo: document.getElementById('join-info'),
    gameCanvas: document.getElementById('game-canvas'),
    hud: document.getElementById('hud-root'),
    chat: document.getElementById('chat-root'),
    inventory: document.getElementById('inventory-root'),
    crafting: document.getElementById('crafting-root'),
    skills: document.getElementById('skills-root'),
    build: document.getElementById('build-root'),
    map: document.getElementById('map-root'),
    mods: document.getElementById('mods-root'),
    death: document.getElementById('death-root'),
    loot: document.getElementById('loot-root'),
};

const input = new InputController(window);
const scene = await new WorldScene(dom.gameCanvas).init();
const hud = new HudPanel(dom.hud);
const chat = new ChatPanel(dom.chat);
const inventory = new InventoryPanel(dom.inventory);
const skills = new SkillsPanel(dom.skills);
const death = new DeathPanel(dom.death);
const mods = new ModBrowser(dom.mods);
const lootPanel = new LootPanel(dom.loot);
let crafting = null;
let buildMenu = null;
let mapPanel = null;
let client = null;
let inputSeq = 0;
let lastInputAt = performance.now();
let fpsFrames = 0;
let fpsAt = performance.now();

function renderIdentity() {
    dom.userId.value = state.identity.userId;
    dom.displayName.value = state.identity.displayName;
}

async function loadCatalog() {
    const catalog = await apiJson(`${TWO_D_WORLD_API}/catalog`, {}, state.identity);
    crafting = new CraftingPanel(dom.crafting, catalog.recipes || []);
    buildMenu = new BuildMenu(dom.build, ['build_wall', 'build_door', 'build_bed', 'build_chest', 'build_workbench', 'build_campfire']);
    mapPanel = new MapPanel(dom.map, catalog.zones || []);
    buildMenu.render((item) => {
        state.buildSelection = item;
    });
    mapPanel.render('outpost', async (zoneId) => {
        if (client) await client.travel(zoneId);
    });
    mods.render((await apiJson(`${TWO_D_WORLD_API}/mods`, {}, state.identity)).mods || []);
}

function bindUi() {
    chat.bindSend(async (message) => {
        if (client) await client.sendChat(message);
    });
    death.bindRespawn(async () => {
        if (client) await client.respawn();
    });
}

function refreshPanels(snapshot) {
    if (!snapshot || !crafting || !buildMenu || !mapPanel) return;
    dom.joinInfo.textContent = `Connected to ${snapshot.world.name} · zone ${snapshot.world.zone_id}`;
    dom.joinInfo.classList.remove('empty');
    chat.render(snapshot.chat || []);
    inventory.render(snapshot.self, {
        onDeposit: async (itemId) => {
            await apiJson(`${API_BASE}/bank/${state.identity.userId}/deposit`, { method: 'POST', body: JSON.stringify({ item_id: itemId, quantity: 1 }) }, state.identity);
        },
        onWithdraw: async (itemId) => {
            await apiJson(`${API_BASE}/bank/${state.identity.userId}/withdraw`, { method: 'POST', body: JSON.stringify({ item_id: itemId, quantity: 1 }) }, state.identity);
        },
    });
    skills.render(snapshot.self);
    crafting.render(snapshot.self, async (recipeId) => client && client.craft(recipeId));
    buildMenu.render((item) => {
        state.buildSelection = item;
    });
    mapPanel.render(snapshot.world.zone_id, async (zoneId) => client && client.travel(zoneId));
    death.render(snapshot.self);
    lootPanel.render(snapshot.entities.loot || []);
}

function refreshHud(snapshot) {
    if (!snapshot) return;
    hud.update(snapshot, {
        connectionText: state.connectionText,
        pendingInputs: state.pendingInputs.length,
        pingMs: state.pingMs,
        fps: state.fps,
        snapshotRate: state.snapshotRate,
        quickSlot: input.quickSlot,
    });
    death.render(snapshot.self);
}

function buildRenderSnapshot() {
    if (!state.latestSnapshot) return null;
    const renderTime = Date.now() - 100;
    const snapshot = structuredClone(state.latestSnapshot);
    snapshot.self = state.localSelf || snapshot.self;
    snapshot.entities.players = (snapshot.entities.players || []).map((entity) => interpolateEntity(state.snapshotBuffer.get(`player:${entity.id}`), renderTime) || entity);
    snapshot.entities.npcs = (snapshot.entities.npcs || []).map((entity) => interpolateEntity(state.snapshotBuffer.get(`npc:${entity.id}`), renderTime) || entity);
    snapshot.entities.projectiles = (snapshot.entities.projectiles || []).map((entity) => interpolateEntity(state.snapshotBuffer.get(`projectile:${entity.id}`), renderTime) || entity);
    return snapshot;
}

function onSnapshot(snapshot) {
    state.snapshotCount += 1;
    if (!state.latestSnapshot) {
        state.latestSnapshot = snapshot;
        state.localSelf = structuredClone(snapshot.self);
    } else {
        for (const entity of snapshot.entities.players || []) state.snapshotBuffer.push(`player:${entity.id}`, Object.assign({ server_time: snapshot.server_time }, entity));
        for (const entity of snapshot.entities.npcs || []) state.snapshotBuffer.push(`npc:${entity.id}`, Object.assign({ server_time: snapshot.server_time }, entity));
        for (const entity of snapshot.entities.projectiles || []) state.snapshotBuffer.push(`projectile:${entity.id}`, Object.assign({ server_time: snapshot.server_time }, entity));
        state.snapshotBuffer.clearMissing([
            ...(snapshot.entities.players || []).map((entity) => `player:${entity.id}`),
            ...(snapshot.entities.npcs || []).map((entity) => `npc:${entity.id}`),
            ...(snapshot.entities.projectiles || []).map((entity) => `projectile:${entity.id}`),
        ]);
        const reconciled = reconcileLocalState(state.localSelf || structuredClone(snapshot.self), Object.assign({}, snapshot.self, { lastProcessedInputSeq: snapshot.lastProcessedInputSeq }), state.pendingInputs, { x: 0, y: 0, w: 8192, h: 8192 });
        state.pendingInputs = reconciled.pendingInputs;
        state.localSelf = reconciled.state;
        state.latestSnapshot = snapshot;
    }
    refreshPanels(snapshot);
    refreshHud(snapshot);
}

async function connect() {
    if (client) return;
    state.identity = {
        userId: dom.userId.value.trim() || state.identity.userId,
        displayName: dom.displayName.value.trim() || state.identity.displayName,
        role: 'user',
    };
    saveIdentity(state.identity);
    dom.joinInfo.textContent = 'Connecting to the starter outpost shard…';
    dom.joinInfo.classList.remove('empty');
    await ensureSocketIoClient(REALTIME_PATH);
    client = new RealtimeClient({ path: REALTIME_PATH, identity: state.identity });
    client.connect();
    state.connectionText = 'connecting';
    client.on('connect', async () => {
        state.connectionText = 'connected';
        await client.joinWorld({ worldSlug: '2d-world', userId: state.identity.userId, displayName: state.identity.displayName, zone_id: 'outpost' });
    });
    client.on('disconnect', () => {
        state.connectionText = 'disconnected';
        dom.joinInfo.textContent = 'Disconnected. Press Enter world to reconnect.';
    });
    client.on('world:joined', (snapshot) => {
        dom.joinInfo.textContent = `Joined ${snapshot.world.name}`;
        onSnapshot(snapshot);
    });
    client.on('snapshot', onSnapshot);
    client.on('chat:message', (message) => {
        if (!state.latestSnapshot) return;
        state.latestSnapshot.chat = [...(state.latestSnapshot.chat || []), message].slice(-20);
        chat.render(state.latestSnapshot.chat);
    });
}

function maybeSendInput(now) {
    if (!client || !state.localSelf) return;
    if ((now - lastInputAt) < 50) return;
    const worldPoint = scene.screenToWorld(input.mouse.x, input.mouse.y);
    let action = input.nextAction();
    if (action && action.action === 'attack' && state.buildSelection) {
        action = { action: 'build', item_id: state.buildSelection, x: worldPoint.x, y: worldPoint.y };
        state.buildSelection = null;
    }
    const payload = {
        seq: ++inputSeq,
        dt: now - lastInputAt,
        sent_at: Date.now(),
        keys: input.keys,
        aim: worldPoint,
        quickSlot: input.quickSlot,
    };
    if (action) Object.assign(payload, action);
    lastInputAt = now;
    state.pendingInputs.push(payload);
    applyPredictedInput(state.localSelf, payload, payload.dt, { x: 0, y: 0, w: 8192, h: 8192 });
    const sentAt = performance.now();
    client.sendInput(payload).then(() => {
        state.pingMs = Math.round(performance.now() - sentAt);
    });
}

function animate(now) {
    fpsFrames += 1;
    if (now - fpsAt >= 1000) {
        state.fps = fpsFrames;
        fpsFrames = 0;
        fpsAt = now;
    }
    if (now - state.lastSnapshotCounterAt >= 1000) {
        state.snapshotRate = state.snapshotCount;
        state.snapshotCount = 0;
        state.lastSnapshotCounterAt = now;
    }
    maybeSendInput(now);
    if (state.latestSnapshot) {
        const renderSnapshot = buildRenderSnapshot();
        if (state.buildSelection) {
            const worldPoint = scene.screenToWorld(input.mouse.x, input.mouse.y);
            scene.setBuildPreview({ x: worldPoint.x, y: worldPoint.y, item_id: state.buildSelection });
        } else {
            scene.setBuildPreview(null);
        }
        scene.render(renderSnapshot);
        refreshHud(renderSnapshot);
    }
    requestAnimationFrame(animate);
}

renderIdentity();
await loadCatalog();
bindUi();

dom.connectButton.addEventListener('click', () => {
    connect().catch((error) => {
        dom.joinInfo.textContent = error.message;
        dom.joinInfo.classList.remove('empty');
    });
});
requestAnimationFrame(animate);
