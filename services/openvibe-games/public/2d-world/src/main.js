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
import { ConsolePanel } from './ui/console-panel.js';
import { SettingsPanel } from './ui/settings-panel.js';

const UTILITY_PANELS = ['inventory', 'crafting', 'skills', 'build', 'map', 'mods', 'console', 'settings'];
const SETTINGS_STORAGE_KEY = 'openvibe.games.2dworld.settings.v1';
const DEFAULT_SETTINGS = Object.freeze({
    hudFade: true,
    showFeed: true,
    showHotkeys: true,
    interpolationDelayMs: 75,
    selfSmoothing: 0.22,
});

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function sanitizeSettings(value = {}) {
    return {
        hudFade: value.hudFade !== false,
        showFeed: value.showFeed !== false,
        showHotkeys: value.showHotkeys !== false,
        interpolationDelayMs: clamp(Math.round(Number(value.interpolationDelayMs) || DEFAULT_SETTINGS.interpolationDelayMs), 40, 160),
        selfSmoothing: clamp(Number(value.selfSmoothing) || DEFAULT_SETTINGS.selfSmoothing, 0.08, 0.55),
    };
}

function loadClientSettings() {
    try {
        return sanitizeSettings(JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}'));
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

function saveClientSettings(settings) {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(sanitizeSettings(settings)));
}

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
    renderSelf: null,
    latestSnapshot: null,
    buildSelection: null,
    catalog: { items: [], itemMap: {}, skills: [], definitions: {}, mods: [], worldDefinition: { bounds: { x: 0, y: 0, w: 8192, h: 8192 } } },
    panels: { chat: false, inventory: false, crafting: false, skills: false, build: false, map: false, mods: false, console: false, settings: false, loot: false, shop: false },
    hudActiveUntil: performance.now() + 8000,
    snapshotBuffer: new SnapshotBuffer(45),
    settings: loadClientSettings(),
    consoleLogs: [],
    correctionErrorPx: 0,
    lastRenderSelfAt: 0,
    lastOverlayRefreshAt: 0,
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
    console: document.getElementById('console-root'),
    settings: document.getElementById('settings-root'),
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
const consolePanel = new ConsolePanel(dom.console);
const settingsPanel = new SettingsPanel(dom.settings);
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

function addConsoleLog(message, level = 'info') {
    state.consoleLogs = [...state.consoleLogs, {
        level,
        message,
        time: new Date().toLocaleTimeString([], { hour12: false }),
    }].slice(-80);
}

function applyClientSettings() {
    document.body.classList.toggle('hide-hud-feed', !state.settings.showFeed);
    document.body.classList.toggle('hide-panel-hotkeys', !state.settings.showHotkeys);
    if (!state.settings.hudFade) document.body.classList.remove('hud-resting');
}

function overlayMeta() {
    return {
        connectionText: state.connectionText,
        pendingInputs: state.pendingInputs.length,
        pingMs: state.pingMs,
        fps: state.fps,
        snapshotRate: state.snapshotRate,
        interpolationDelayMs: state.settings.interpolationDelayMs,
        selfSmoothing: state.settings.selfSmoothing,
        correctionErrorPx: state.correctionErrorPx,
    };
}

function refreshOverlayPanels(snapshot = state.latestSnapshot) {
    if (state.panels.console) {
        consolePanel.render({
            snapshot,
            meta: overlayMeta(),
            logs: state.consoleLogs,
            onClear: () => {
                state.consoleLogs = [];
                refreshOverlayPanels(snapshot);
            },
        });
    } else {
        consolePanel.hide();
    }

    if (state.panels.settings) {
        settingsPanel.render(state.settings, {
            onChange: (nextSettings) => {
                state.settings = sanitizeSettings(nextSettings);
                saveClientSettings(state.settings);
                applyClientSettings();
                refreshOverlayPanels(snapshot);
            },
            onReset: () => {
                state.settings = { ...DEFAULT_SETTINGS };
                saveClientSettings(state.settings);
                applyClientSettings();
                addConsoleLog('Client settings reset to defaults.');
                refreshOverlayPanels(snapshot);
            },
        });
    } else {
        settingsPanel.hide();
    }
}

function getRenderedSelf(now = performance.now()) {
    if (!state.localSelf) return null;
    if (!state.renderSelf || state.renderSelf.user_id !== state.localSelf.user_id) {
        state.renderSelf = structuredClone(state.localSelf);
        state.lastRenderSelfAt = now;
        state.correctionErrorPx = 0;
        return state.renderSelf;
    }
    const dtMs = Math.max(1, now - (state.lastRenderSelfAt || now));
    state.lastRenderSelfAt = now;
    const targetX = Number(state.localSelf.x) || 0;
    const targetY = Number(state.localSelf.y) || 0;
    const currentX = Number(state.renderSelf.x) || 0;
    const currentY = Number(state.renderSelf.y) || 0;
    const dx = targetX - currentX;
    const dy = targetY - currentY;
    const error = Math.hypot(dx, dy);
    state.correctionErrorPx = error;
    if (!Number.isFinite(error) || error > 280) {
        state.renderSelf = structuredClone(state.localSelf);
        state.correctionErrorPx = 0;
        return state.renderSelf;
    }
    const smoothing = clamp(Number(state.settings.selfSmoothing) || DEFAULT_SETTINGS.selfSmoothing, 0.08, 0.55);
    const blend = 1 - Math.pow(1 - smoothing, Math.min(4, dtMs / 16.667));
    state.renderSelf = Object.assign({}, state.localSelf, {
        x: currentX + dx * blend,
        y: currentY + dy * blend,
    });
    return state.renderSelf;
}

function buildItemMap(items = []) {
    return Object.fromEntries((items || []).map((item) => [item.item_id, item]));
}

function worldBounds() {
    const bounds = state.catalog && state.catalog.worldDefinition && state.catalog.worldDefinition.bounds || state.latestSnapshot && state.latestSnapshot.world && state.latestSnapshot.world.bounds;
    return {
        x: Number(bounds && bounds.x) || 0,
        y: Number(bounds && bounds.y) || 0,
        w: Number(bounds && bounds.w) || 8192,
        h: Number(bounds && bounds.h) || 8192,
    };
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
    refreshOverlayPanels();
    return hadOpen;
}

function toggleChatPanel(forceOpen = !state.panels.chat) {
    setPanelOpen('chat', forceOpen);
    if (forceOpen) chat.focus(); else chat.blur();
    markHudActivity(10000);
    refreshOverlayPanels();
}

function toggleUtilityPanel(name) {
    const shouldOpen = !state.panels[name];
    closeUtilityPanels(shouldOpen ? name : null);
    markHudActivity(10000);
    refreshOverlayPanels();
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
        definitions: catalog.definitions || {},
        mods: catalog.mods || [],
        worldDefinition: catalog.world_definition || {},
    };
    scene.setCatalog(state.catalog);
    inventory = new InventoryPanel(dom.inventory, state.catalog.items);
    skills = new SkillsPanel(dom.skills, state.catalog.skills);
    crafting = new CraftingPanel(dom.crafting, catalog.recipes || [], state.catalog.items);
    buildMenu = new BuildMenu(dom.build, (catalog.items || []).filter((item) => item.category === 'build').map((item) => item.item_id), state.catalog.items);
    mapPanel = new MapPanel(dom.map, catalog.zones || [], catalog.world_definition && catalog.world_definition.travel || []);
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

        if (event.repeat && ['enter', 'escape', 'i', 'c', 'k', 'm', 'g', 'o', '`', 'f1'].includes(key)) return;

        if (isTyping && !['escape', 'f1'].includes(key)) return;

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
        case '`':
            event.preventDefault();
            if (shopWasOpen && client) await client.closeInteraction();
            toggleUtilityPanel('console');
            break;
        case 'f1':
            event.preventDefault();
            if (shopWasOpen && client) await client.closeInteraction();
            toggleUtilityPanel('settings');
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
    dom.welcome.classList.add('playing');
    chat.render(snapshot.chat || []);
    inventory.render(snapshot.self, {
        onDeposit: async (itemId) => {
            await apiJson(`${API_BASE}/bank/${state.identity.userId}/deposit`, { method: 'POST', body: JSON.stringify({ item_id: itemId, quantity: 1 }) }, state.identity);
            addConsoleLog(`Deposited ${state.catalog.itemMap[itemId] && state.catalog.itemMap[itemId].name || itemId} into the bank.`);
            markHudActivity(9000);
        },
        onWithdraw: async (itemId) => {
            await apiJson(`${API_BASE}/bank/${state.identity.userId}/withdraw`, { method: 'POST', body: JSON.stringify({ item_id: itemId, quantity: 1 }) }, state.identity);
            addConsoleLog(`Withdrew ${state.catalog.itemMap[itemId] && state.catalog.itemMap[itemId].name || itemId} from the bank.`);
            markHudActivity(9000);
        },
        onEquip: async ({ itemId, slot }) => {
            if (!client) return;
            const result = await client.equipInventoryItem(itemId, slot);
            if (result && result.ok === false) {
                dom.joinInfo.textContent = result.reason || 'Equip failed';
                dom.joinInfo.classList.remove('empty');
                addConsoleLog(result.reason || `Could not equip ${itemId}.`, 'warn');
                return;
            }
            addConsoleLog(`Equipped ${state.catalog.itemMap[itemId] && state.catalog.itemMap[itemId].name || itemId} to ${slot}.`);
            markHudActivity(9000);
        },
        onClearSlot: async (slot) => {
            if (!client) return;
            const result = await client.clearEquipmentSlot(slot);
            if (result && result.ok === false) {
                dom.joinInfo.textContent = result.reason || 'Clear failed';
                dom.joinInfo.classList.remove('empty');
                addConsoleLog(result.reason || `Could not clear ${slot}.`, 'warn');
                return;
            }
            addConsoleLog(`Cleared ${slot} loadout slot.`);
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
    refreshOverlayPanels(snapshot);
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
    document.body.classList.toggle('hud-resting', !!state.settings.hudFade && !overlayBusy && performance.now() > state.hudActiveUntil);
    if ((state.panels.console || state.panels.settings) && (performance.now() - state.lastOverlayRefreshAt) > 150) {
        state.lastOverlayRefreshAt = performance.now();
        refreshOverlayPanels(snapshot);
    }
}

function buildRenderSnapshot() {
    if (!state.latestSnapshot) return null;
    const renderTime = Date.now() - state.settings.interpolationDelayMs;
    const snapshot = structuredClone(state.latestSnapshot);
    snapshot.self = getRenderedSelf() || snapshot.self;
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
        state.renderSelf = structuredClone(snapshot.self);
    } else {
        const reconciled = reconcileLocalState(state.localSelf || structuredClone(snapshot.self), Object.assign({}, snapshot.self, { lastProcessedInputSeq: snapshot.lastProcessedInputSeq }), state.pendingInputs, worldBounds());
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
    dom.welcome.classList.remove('playing');
    addConsoleLog(`Connecting as ${state.identity.displayName} (${state.identity.userId})…`);
    await ensureSocketIoClient(REALTIME_PATH);
    client = new RealtimeClient({ path: REALTIME_PATH, identity: state.identity });
    client.connect();
    state.connectionText = 'connecting';
    client.on('connect', async () => {
        state.connectionText = 'connected';
        addConsoleLog('Realtime link established. Joining 2D World…');
        await client.joinWorld({ worldSlug: '2d-world', userId: state.identity.userId, displayName: state.identity.displayName, zone_id: 'outpost' });
    });
    client.on('disconnect', () => {
        state.connectionText = 'disconnected';
        dom.joinInfo.textContent = 'Disconnected. Press Enter world to reconnect.';
        dom.welcome.classList.remove('playing');
        addConsoleLog('Realtime link dropped. Waiting to reconnect…', 'warn');
    });
    client.on('world:joined', (snapshot) => {
        dom.joinInfo.textContent = `Joined ${snapshot.world.name}`;
        addConsoleLog(`Joined ${snapshot.world.name} in zone ${snapshot.world.zone_id}.`);
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
    applyPredictedInput(state.localSelf, payload, payload.dt, worldBounds());
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
applyClientSettings();
refreshOverlayPanels();

dom.connectButton.addEventListener('click', () => {
    connect().catch((error) => {
        dom.joinInfo.textContent = error.message;
        dom.joinInfo.classList.remove('empty');
        addConsoleLog(error.message || 'Connection failed.', 'error');
    });
});
requestAnimationFrame(animate);
