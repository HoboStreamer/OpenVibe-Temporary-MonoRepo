import { API_BASE, TWO_D_WORLD_API, REALTIME_PATH, apiJson, ensureSocketIoClient, loadIdentity, saveIdentity } from './app/config.js';
import { InputController } from './app/input.js';
import { WorldScene } from './scenes/world-scene.js';
import { RealtimeClient } from './net/realtime-client.js';
import { SnapshotBuffer } from './net/snapshot-buffer.js';
import { applyPredictedInput } from './net/prediction.js';
import { reconcileLocalState } from './net/reconciliation.js';
import { interpolateEntity } from './engine/interpolation.js';
import { HudPanel } from './ui/hud.js';
import { ChatPanel } from './ui/chat-panel.js';
import { InventoryPanel } from './ui/inventory-panel.js';
import { CraftingPanel } from './ui/crafting-panel.js';
import { SkillsPanel } from './ui/skills-panel.js';
import { BuildMenu } from './ui/build-menu.js';
import { MapPanel } from './ui/map-panel.js';
import { DeathPanel } from './ui/death-panel.js';
import { ModBrowser } from './ui/mod-browser.js';
import { LootPanel } from './ui/loot-panel.js';
import { ShopPanel } from './ui/shop-panel.js';

const UTILITY_PANELS = ['inventory', 'crafting', 'skills', 'build', 'map', 'mods'];

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
    catalog: { items: [], itemMap: {}, skills: [] },
    panels: { chat: false, inventory: false, crafting: false, skills: false, build: false, map: false, mods: false, loot: false, shop: false },
    hudActiveUntil: performance.now() + 8000,
    snapshotBuffer: new SnapshotBuffer(45),
};

const dom = {
    gameShell: document.getElementById('game-shell'),
    welcome: document.getElementById('welcome-root'),
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
    shop: document.getElementById('shop-root'),
    hotkeys: document.getElementById('panel-hotkeys'),
};

const input = new InputController(window);
const scene = await new WorldScene(dom.gameCanvas).init();
const hud = new HudPanel(dom.hud);
const chat = new ChatPanel(dom.chat);
const death = new DeathPanel(dom.death);
let inventory = null;
let skills = null;
let mods = null;
let lootPanel = null;
let shopPanel = null;
let crafting = null;
let buildMenu = null;
let mapPanel = null;
let client = null;
let inputSeq = 0;
let lastInputAt = performance.now();
let fpsFrames = 0;
let fpsAt = performance.now();

function buildItemMap(items = []) {
    return Object.fromEntries((items || []).map((item) => [item.item_id, item]));
}

function markHudActivity(durationMs = 4200) {
    state.hudActiveUntil = performance.now() + durationMs;
    document.body.classList.remove('hud-resting');
}

function setPanelOpen(name, open) {
    state.panels[name] = !!open;
    if (dom[name]) dom[name].classList.toggle('hidden', !open);
}

function closeUtilityPanels(except = null) {
    for (const name of UTILITY_PANELS) {
        setPanelOpen(name, name === except && !!except);
    }
}

function closeAllPanels() {
    const hadOpen = Object.values(state.panels).some(Boolean);
    setPanelOpen('chat', false);
    closeUtilityPanels(null);
    setPanelOpen('loot', false);
    setPanelOpen('shop', false);
    chat.blur();
    if (shopPanel) shopPanel.hide();
    return hadOpen;
}

function toggleChatPanel(forceOpen = !state.panels.chat) {
    setPanelOpen('chat', forceOpen);
    if (forceOpen) chat.focus(); else chat.blur();
    markHudActivity(10000);
}

function toggleUtilityPanel(name) {
    const shouldOpen = !state.panels[name];
    closeUtilityPanels(shouldOpen ? name : null);
    markHudActivity(10000);
}

function renderIdentity() {
    dom.userId.value = state.identity.userId;
    dom.displayName.value = state.identity.displayName;
}

async function loadCatalog() {
    const catalog = await apiJson(`${TWO_D_WORLD_API}/catalog`, {}, state.identity);
    state.catalog = {
        items: catalog.items || [],
        itemMap: buildItemMap(catalog.items || []),
        skills: catalog.skills || [],
    };
    inventory = new InventoryPanel(dom.inventory, state.catalog.items);
    skills = new SkillsPanel(dom.skills, state.catalog.skills);
    crafting = new CraftingPanel(dom.crafting, catalog.recipes || [], state.catalog.items);
    buildMenu = new BuildMenu(dom.build, (catalog.items || []).filter((item) => item.category === 'build').map((item) => item.item_id), state.catalog.items);
    mapPanel = new MapPanel(dom.map, catalog.zones || []);
    mods = new ModBrowser(dom.mods);
    lootPanel = new LootPanel(dom.loot, state.catalog.items);
    shopPanel = new ShopPanel(dom.shop, state.catalog.items);
    buildMenu.render((item) => {
        state.buildSelection = item;
    });
    mapPanel.render('outpost', async (zoneId) => {
        if (!client) return;
        await client.travel(zoneId);
    });
    mods.render((await apiJson(`${TWO_D_WORLD_API}/mods`, {}, state.identity)).mods || []);
}

function bindUi() {
    chat.bindSend(async (message) => {
        if (!client) return;
        await client.sendChat(message);
        markHudActivity(9000);
    });
    death.bindRespawn(async () => {
        if (!client) return;
        await client.respawn();
        markHudActivity(9000);
    });

    window.addEventListener('keydown', async (event) => {
        const key = event.key.toLowerCase();
        const isTyping = !!(event.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName));
        const shopWasOpen = !!(state.latestSnapshot && state.latestSnapshot.interaction && state.latestSnapshot.interaction.active);

        if (event.repeat && ['enter', 'escape', 'i', 'c', 'k', 'm', 'g', 'o'].includes(key)) return;

        if (isTyping && key !== 'escape') return;

        switch (key) {
        case 'enter':
            if (!isTyping) {
                event.preventDefault();
                toggleChatPanel(true);
            }
            break;
        case 'i':
            event.preventDefault();
            if (shopWasOpen && client) await client.closeInteraction();
            toggleUtilityPanel('inventory');
            break;
        case 'c':
            event.preventDefault();
            if (shopWasOpen && client) await client.closeInteraction();
            toggleUtilityPanel('crafting');
            break;
        case 'k':
            event.preventDefault();
            if (shopWasOpen && client) await client.closeInteraction();
            toggleUtilityPanel('skills');
            break;
        case 'm':
            event.preventDefault();
            if (shopWasOpen && client) await client.closeInteraction();
            toggleUtilityPanel('map');
            break;
        case 'g':
            event.preventDefault();
            if (shopWasOpen && client) await client.closeInteraction();
            toggleUtilityPanel('build');
            break;
        case 'o':
            event.preventDefault();
            if (shopWasOpen && client) await client.closeInteraction();
            toggleUtilityPanel('mods');
            break;
        case 'escape': {
            if (isTyping && event.target && typeof event.target.blur === 'function') event.target.blur();
            const closed = closeAllPanels();
            if ((shopWasOpen || !closed) && client) await client.closeInteraction();
            break;
        }
        default:
            return;
        }

        markHudActivity(9000);
    });

    ['pointermove', 'pointerdown', 'wheel'].forEach((eventName) => {
        window.addEventListener(eventName, () => markHudActivity(3500), { passive: true });
    });
}

function refreshPanels(snapshot) {
    if (!snapshot || !inventory || !crafting || !buildMenu || !mapPanel || !skills || !mods || !lootPanel || !shopPanel) return;
    dom.joinInfo.textContent = `Connected to ${snapshot.world.name} · zone ${snapshot.world.zone_id}`;
    dom.joinInfo.classList.remove('empty');
    dom.welcome.classList.add('connected');
    chat.render(snapshot.chat || []);
    inventory.render(snapshot.self, {
        onDeposit: async (itemId) => {
            await apiJson(`${API_BASE}/bank/${state.identity.userId}/deposit`, { method: 'POST', body: JSON.stringify({ item_id: itemId, quantity: 1 }) }, state.identity);
            markHudActivity(9000);
        },
        onWithdraw: async (itemId) => {
            await apiJson(`${API_BASE}/bank/${state.identity.userId}/withdraw`, { method: 'POST', body: JSON.stringify({ item_id: itemId, quantity: 1 }) }, state.identity);
            markHudActivity(9000);
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

    const activeInteraction = snapshot.interaction && snapshot.interaction.active;
    if (activeInteraction && activeInteraction.type === 'shop') {
        closeUtilityPanels(null);
        setPanelOpen('shop', true);
        shopPanel.render(activeInteraction, snapshot.self, async ({ npcId, itemId, quantity }) => {
            if (!client) return;
            const result = await client.buyFromShop(npcId, itemId, quantity);
            if (result && result.ok === false) {
                dom.joinInfo.textContent = result.reason || 'Purchase failed';
                dom.joinInfo.classList.remove('empty');
            }
            markHudActivity(10000);
        });
    } else {
        setPanelOpen('shop', false);
        shopPanel.hide();
    }

    const hasLoot = (snapshot.entities.loot || []).length > 0;
    setPanelOpen('loot', hasLoot && !activeInteraction);
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
    const overlayBusy = state.panels.chat || UTILITY_PANELS.some((name) => state.panels[name]) || !!(snapshot.interaction && snapshot.interaction.active) || !!(document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName));
    document.body.classList.toggle('hud-resting', !overlayBusy && performance.now() > state.hudActiveUntil);
}

function buildRenderSnapshot() {
    if (!state.latestSnapshot) return null;
    const renderTime = Date.now() - 75;
    const snapshot = structuredClone(state.latestSnapshot);
    snapshot.self = state.localSelf || snapshot.self;
    snapshot.entities.players = (snapshot.entities.players || []).map((entity) => interpolateEntity(state.snapshotBuffer.get(`player:${entity.id}`), renderTime) || entity);
    snapshot.entities.npcs = (snapshot.entities.npcs || []).map((entity) => interpolateEntity(state.snapshotBuffer.get(`npc:${entity.id}`), renderTime) || entity);
    snapshot.entities.projectiles = (snapshot.entities.projectiles || []).map((entity) => interpolateEntity(state.snapshotBuffer.get(`projectile:${entity.id}`), renderTime) || entity);
    return snapshot;
}

function bufferSnapshotEntities(snapshot) {
    for (const entity of snapshot.entities.players || []) state.snapshotBuffer.push(`player:${entity.id}`, Object.assign({ server_time: snapshot.server_time }, entity));
    for (const entity of snapshot.entities.npcs || []) state.snapshotBuffer.push(`npc:${entity.id}`, Object.assign({ server_time: snapshot.server_time }, entity));
    for (const entity of snapshot.entities.projectiles || []) state.snapshotBuffer.push(`projectile:${entity.id}`, Object.assign({ server_time: snapshot.server_time }, entity));
    state.snapshotBuffer.clearMissing([
        ...(snapshot.entities.players || []).map((entity) => `player:${entity.id}`),
        ...(snapshot.entities.npcs || []).map((entity) => `npc:${entity.id}`),
        ...(snapshot.entities.projectiles || []).map((entity) => `projectile:${entity.id}`),
    ]);
}

function onSnapshot(snapshot) {
    state.snapshotCount += 1;
    bufferSnapshotEntities(snapshot);
    if (!state.latestSnapshot) {
        state.latestSnapshot = snapshot;
        state.localSelf = structuredClone(snapshot.self);
    } else {
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
    dom.welcome.classList.add('connected');
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
    if ((now - lastInputAt) < 33) return;
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
    markHudActivity(2600);
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
