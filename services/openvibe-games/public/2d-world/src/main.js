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
import { InventoryPanel } from './gamemodes/2dworld/ui/inventory-panel.js';
import { CraftingPanel } from './ui/crafting-panel.js';
import { SkillsPanel } from './ui/skills-panel.js';
import { BuildMenu } from './ui/build-menu.js';
import { MapPanel } from './ui/map-panel.js';
import { DeathPanel } from './ui/death-panel.js';
import { ModBrowser } from './ui/mod-browser.js';
import { LootPanel } from './ui/loot-panel.js';
import { ShopPanel } from './ui/shop-panel.js';
import { InteractionPanel } from './ui/interaction-panel.js';
import { ConsolePanel } from './gamemodes/2dworld/ui/console-panel.js';
import { SettingsPanel } from './ui/settings-panel.js';
import { MenuPanel } from './gamemodes/2dworld/ui/menu-panel.js';
import { createSourceVibeGlobal } from './sourcevibe-global.js';

const UTILITY_PANELS = ['inventory', 'crafting', 'skills', 'build', 'map', 'mods', 'console', 'settings'];
const SETTINGS_STORAGE_KEY = 'openvibe.games.2dworld.settings.v1';
const DEFAULT_SETTINGS = Object.freeze({
    hudFade: true,
    showFeed: false,
    showHotkeys: false,
    interpolationDelayMs: 75,
    selfSmoothing: 0.22,
    mouseSensitivity: 1,
});

const query = new URLSearchParams(window.location.search);
const queryState = Object.freeze({
    serverId: query.get('server') || query.get('world') || '2d-world',
    gamemodeId: query.get('gamemode') || '2dworld',
    zoneId: query.get('zone') || 'outpost',
});

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function sanitizeSettings(value = {}) {
    return {
        hudFade: value.hudFade !== false,
        showFeed: value.showFeed === true,
        showHotkeys: value.showHotkeys === true,
        interpolationDelayMs: clamp(Math.round(Number(value.interpolationDelayMs) || DEFAULT_SETTINGS.interpolationDelayMs), 40, 160),
        selfSmoothing: clamp(Number(value.selfSmoothing) || DEFAULT_SETTINGS.selfSmoothing, 0.08, 0.55),
        mouseSensitivity: clamp(Number(value.mouseSensitivity) || DEFAULT_SETTINGS.mouseSensitivity, 0.4, 2.5),
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
    query: queryState,
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
    panels: { menu: false, chat: false, inventory: false, crafting: false, skills: false, build: false, map: false, mods: false, console: false, settings: false, loot: false, shop: false, interaction: false },
    hudActiveUntil: performance.now() + 8000,
    snapshotBuffer: new SnapshotBuffer(45),
    settings: loadClientSettings(),
    settingsDraft: null,
    settingsUi: { activeTab: 'keyboard', bindEdits: {}, cvarEdits: {} },
    sourcevibeBootstrap: null,
    consoleLogs: [],
    consoleCommand: '',
    consoleFilter: '',
    consoleSuggestions: [],
    consoleHistory: [],
    consoleHistoryIndex: -1,
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
    menu: document.getElementById('menu-root'),
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
    interaction: document.getElementById('interaction-root'),
    hotkeys: document.getElementById('panel-hotkeys'),
};

const input = new InputController(window);
const scene = await new WorldScene(dom.gameCanvas).init();
const hud = new HudPanel(dom.hud);
const chat = new ChatPanel(dom.chat);
const death = new DeathPanel(dom.death);
const consolePanel = new ConsolePanel(dom.console);
const settingsPanel = new SettingsPanel(dom.settings);
const menuPanel = new MenuPanel(dom.menu);
let inventory = null;
let skills = null;
let mods = null;
let lootPanel = null;
let shopPanel = null;
let interactionPanel = null;
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

function sourcevibeConsole() {
    return state.sourcevibeBootstrap && state.sourcevibeBootstrap.console || { commands: [], cvars: [], binds: [], suggestions: [] };
}

function sourcevibeInventoryLayout() {
    const layout = state.sourcevibeBootstrap && state.sourcevibeBootstrap.inventory && state.sourcevibeBootstrap.inventory.layout
        || state.sourcevibeBootstrap && state.sourcevibeBootstrap.gamemodeUi && state.sourcevibeBootstrap.gamemodeUi.inventory
        || {};
    return {
        rows: Number(layout.rows) || 5,
        cols: Number(layout.cols) || 8,
        hotbarSlots: Number(layout.hotbar || layout.hotbarSlots) || 9,
        owner: layout.owner || null,
        showBankOnInteractionOnly: layout.showBankOnInteractionOnly === true || layout.bank_interaction_only === true,
    };
}

function normalizeKeyToken(value) {
    const token = String(value == null ? '' : value).trim().toLowerCase();
    if (!token) return '';
    if (token === ' ') return 'space';
    if (token === 'spacebar') return 'space';
    return token;
}

function eventKeyToken(event) {
    return normalizeKeyToken(event && event.key === ' ' ? 'space' : event && event.key);
}

function isSourceVibeBound(event, command) {
    const key = eventKeyToken(event);
    return sourcevibeConsole().binds.some((entry) => normalizeKeyToken(entry.key) === key && String(entry.command || '').toLowerCase() === String(command || '').toLowerCase());
}

function buildHotkeyLegend() {
    const bindMap = new Map(sourcevibeConsole().binds.map((entry) => [String(entry.command || '').toLowerCase(), entry.key]));
    return [
        `${bindMap.get('toggleinventory') || 'I'} inventory`,
        `${bindMap.get('togglecrafting') || 'C'} craft`,
        'K skills',
        'G build',
        `${bindMap.get('togglemap') || 'M'} map`,
        `${bindMap.get('toggleconsole') || '`'} console`,
        `${bindMap.get('showmenu') || 'Esc'} menu`,
        'F1 options',
    ].join(' · ');
}

function refreshConsoleSuggestions() {
    const needle = String(state.consoleCommand || '').trim().toLowerCase();
    const suggestions = [];
    for (const entry of sourcevibeConsole().commands || []) {
        suggestions.push({ name: entry.name, description: entry.description || entry.help || 'command', source: 'command' });
    }
    for (const entry of sourcevibeConsole().cvars || []) {
        suggestions.push({ name: entry.name, description: entry.description || entry.help || 'cvar', source: 'cvar' });
    }
    for (const entry of state.sourcevibeBootstrap && state.sourcevibeBootstrap.console && state.sourcevibeBootstrap.console.suggestions || []) {
        suggestions.push(typeof entry === 'string' ? { name: entry, description: 'suggestion', source: 'suggestion' } : entry);
    }
    const deduped = [];
    const seen = new Set();
    for (const entry of suggestions) {
        const key = String(entry && entry.name || '').toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        deduped.push(entry);
    }
    state.consoleSuggestions = deduped.filter((entry) => !needle || String(entry.name || '').toLowerCase().includes(needle)).slice(0, 12);
}

function syncSettingsDraft(force = false) {
    if (force || !state.settingsDraft) state.settingsDraft = sanitizeSettings(state.settings);
    if (force || !Object.keys(state.settingsUi.bindEdits || {}).length) {
        state.settingsUi.bindEdits = Object.fromEntries((sourcevibeConsole().binds || []).map((entry) => [entry.command, entry.key || '']));
    }
    if (force || !Object.keys(state.settingsUi.cvarEdits || {}).length) {
        state.settingsUi.cvarEdits = Object.fromEntries((sourcevibeConsole().cvars || []).map((entry) => [entry.name, entry.value]));
    }
}

function installSourceVibeGlobal() {
    window.SV = createSourceVibeGlobal({
        getBootstrap: () => state.sourcevibeBootstrap,
        getSnapshot: () => state.latestSnapshot,
        runCommand: (command) => runSourceVibeCommand(command),
        openPanel: (name) => openSourceVibePanel(name),
        closePanel: (name) => closeSourceVibePanel(name),
        togglePanel: (name) => toggleSourceVibePanel(name),
        sendNetPacket: (packet) => {
            addConsoleLog(`net packet queued locally: ${packet && packet.name || 'unnamed'}`);
            return { ok: true, packet };
        },
    });
    window._G = window.SV.compat.createLegacyGlobalForGamemode(state.query.gamemodeId);
}

async function loadSourceVibeBootstrap() {
    const params = new URLSearchParams({
        gamemode: state.query.gamemodeId,
        server: state.query.serverId,
        userId: state.identity.userId,
        displayName: state.identity.displayName,
    });
    state.sourcevibeBootstrap = await apiJson(`${API_BASE}/sourcevibe/bootstrap?${params.toString()}`, {}, state.identity);
    syncSettingsDraft(true);
    refreshConsoleSuggestions();
    installSourceVibeGlobal();
    document.title = `${state.sourcevibeBootstrap && state.sourcevibeBootstrap.engine && state.sourcevibeBootstrap.engine.name || 'SourceVibe Engine'} · ${state.sourcevibeBootstrap && state.sourcevibeBootstrap.gamemode && state.sourcevibeBootstrap.gamemode.title || '2D World'}`;
    if (dom.hotkeys) dom.hotkeys.textContent = buildHotkeyLegend();
    const welcomeTitle = dom.welcome && dom.welcome.querySelector('h1');
    const welcomeBody = dom.welcome && dom.welcome.querySelector('p');
    if (welcomeTitle) welcomeTitle.textContent = state.sourcevibeBootstrap && state.sourcevibeBootstrap.gamemode && state.sourcevibeBootstrap.gamemode.title || '2D World';
    if (welcomeBody) welcomeBody.innerHTML = `The flagship <strong>${state.sourcevibeBootstrap && state.sourcevibeBootstrap.engine && state.sourcevibeBootstrap.engine.name || 'SourceVibe Engine'}</strong> gamemode for survival, crafting, travel, mods, and fullscreen play.`;
    return state.sourcevibeBootstrap;
}

function currentMenuButtons() {
    const menu = state.sourcevibeBootstrap && state.sourcevibeBootstrap.menu || {};
    const labels = client ? (menu.connected || []) : (menu.disconnected || []);
    return labels.map((label) => ({
        id: String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        label,
        description: label === 'Resume Game'
            ? 'Return to live play.'
            : label === 'Find Servers'
                ? 'Browse SourceVibe servers in the launcher.'
                : label === 'Create Server'
                    ? 'Jump to the launcher and spin up a shard.'
                    : label === 'Console'
                        ? 'Open the SourceVibe command console.'
                        : label === 'Options'
                            ? 'Tune binds, cvars, and client presentation.'
                            : '',
    }));
}

function applyClientSettings() {
    document.body.classList.toggle('hide-hud-feed', !state.settings.showFeed);
    document.body.classList.toggle('hide-panel-hotkeys', !state.settings.showHotkeys);
    if (dom.hotkeys) dom.hotkeys.textContent = buildHotkeyLegend();
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
        showPos: Number(state.settingsUi.cvarEdits.cl_showpos || 0) > 0,
    };
}

function openSourceVibePanel(name) {
    const id = String(name || '').toLowerCase();
    if (id === 'menu' || id === 'mainmenu') return toggleMenuPanel(true);
    if (id === 'console') return toggleUtilityPanel('console', true);
    if (id === 'settings' || id === 'options') return toggleUtilityPanel('settings', true);
    if (id === 'inventory') return toggleUtilityPanel('inventory', true);
    if (id === 'crafting') return toggleUtilityPanel('crafting', true);
    if (id === 'map') return toggleUtilityPanel('map', true);
    if (id === 'mods' || id === 'addons') return toggleUtilityPanel('mods', true);
    return null;
}

function closeSourceVibePanel(name) {
    const id = String(name || '').toLowerCase();
    if (id === 'menu' || id === 'mainmenu') return toggleMenuPanel(false);
    if (id === 'console') return toggleUtilityPanel('console', false);
    if (id === 'settings' || id === 'options') return toggleUtilityPanel('settings', false);
    if (UTILITY_PANELS.includes(id)) return toggleUtilityPanel(id, false);
    return null;
}

function toggleSourceVibePanel(name) {
    const id = String(name || '').toLowerCase();
    if (id === 'menu' || id === 'mainmenu') return toggleMenuPanel(!state.panels.menu);
    if (UTILITY_PANELS.includes(id)) return toggleUtilityPanel(id, !state.panels[id]);
    return openSourceVibePanel(id);
}

async function disconnectClient() {
    if (client && client.socket) client.socket.disconnect();
    client = null;
    state.connectionText = 'disconnected';
    state.pendingInputs = [];
    state.localSelf = null;
    state.renderSelf = null;
    state.latestSnapshot = null;
    state.buildSelection = null;
    closeAllPanels();
    dom.joinInfo.textContent = 'Disconnected. Choose a server from the launcher or reconnect here.';
    dom.joinInfo.classList.remove('empty');
    dom.welcome.classList.remove('playing');
    dom.welcome.classList.add('connected');
    addConsoleLog('Disconnected from the active server.', 'warn');
}

async function handleMenuAction(actionId) {
    switch (actionId) {
    case 'resume-game':
        toggleMenuPanel(false);
        break;
    case 'disconnect':
        await disconnectClient();
        break;
    case 'player-list':
        addConsoleLog('Player list is available in-world via snapshots; richer scoreboard pass still pending.', 'info');
        toggleMenuPanel(false);
        break;
    case 'find-servers':
    case 'create-server':
    case 'gamemodes':
    case 'addons':
    case 'quit':
        window.location.assign('/sourcevibe');
        break;
    case 'options':
        toggleMenuPanel(false);
        toggleUtilityPanel('settings', true);
        break;
    case 'console':
        toggleMenuPanel(false);
        toggleUtilityPanel('console', true);
        break;
    default:
        break;
    }
}

async function runSourceVibeCommand(command) {
    const raw = String(command || '').trim();
    if (!raw) return { ok: false, reason: 'empty command' };
    state.consoleHistory = [...state.consoleHistory.filter((entry) => entry !== raw), raw].slice(-40);
    state.consoleHistoryIndex = state.consoleHistory.length;
    addConsoleLog(`] ${raw}`);
    state.consoleCommand = '';
    refreshConsoleSuggestions();
    const result = await apiJson(`${API_BASE}/sourcevibe/console/run`, {
        method: 'POST',
        body: JSON.stringify({
            command: raw,
            lastServerId: state.query.serverId,
        }),
    }, state.identity);
    const output = result && result.output;
    if (output === '__CLEAR__') {
        state.consoleLogs = [];
    } else if (Array.isArray(output)) {
        output.forEach((line) => addConsoleLog(String(line), result.ok === false ? 'warn' : 'info'));
    } else if (typeof output === 'string' && output.trim()) {
        if (output === 'toggleconsole') {
            toggleUtilityPanel('console', !state.panels.console);
        } else if (output === 'showmenu') {
            toggleMenuPanel(true);
        } else if (output.startsWith('hidepanel ')) {
            closeSourceVibePanel(output.slice('hidepanel '.length));
        } else if (output === 'disconnect acknowledged') {
            await disconnectClient();
        } else if (/^(\/|https?:)/.test(output)) {
            addConsoleLog(output);
            window.location.assign(output);
        } else {
            output.split('\n').forEach((line) => addConsoleLog(line, result.ok === false ? 'warn' : 'info'));
        }
    } else if (result && result.ok === false && result.code) {
        addConsoleLog(result.code, 'warn');
    }
    await loadSourceVibeBootstrap();
    refreshOverlayPanels(state.latestSnapshot);
    return result;
}

function refreshOverlayPanels(snapshot = state.latestSnapshot) {
    if (state.panels.menu) {
        menuPanel.render({
            title: state.sourcevibeBootstrap && state.sourcevibeBootstrap.gamemode && state.sourcevibeBootstrap.gamemode.title || 'SourceVibe',
            subtitle: state.sourcevibeBootstrap && state.sourcevibeBootstrap.engine && state.sourcevibeBootstrap.engine.name || 'SourceVibe Engine',
            connected: !!client,
            buttons: currentMenuButtons(),
            server: state.query.serverId,
        }, {
            onAction: (actionId) => {
                handleMenuAction(actionId).catch((error) => addConsoleLog(error.message || 'Menu action failed.', 'error'));
            },
            onClose: () => toggleMenuPanel(false),
        });
    } else {
        menuPanel.hide();
    }

    if (state.panels.console) {
        consolePanel.render({
            snapshot,
            meta: overlayMeta(),
            logs: state.consoleLogs,
            filter: state.consoleFilter,
            command: state.consoleCommand,
            suggestions: state.consoleSuggestions,
        }, {
            onSetFilter: (value) => {
                state.consoleFilter = value;
                refreshOverlayPanels(snapshot);
            },
            onChangeCommand: (value) => {
                state.consoleCommand = value;
                refreshConsoleSuggestions();
                refreshOverlayPanels(snapshot);
            },
            onUseSuggestion: (value) => {
                state.consoleCommand = value;
                refreshConsoleSuggestions();
                refreshOverlayPanels(snapshot);
            },
            onHistoryUp: () => {
                if (!state.consoleHistory.length) return;
                state.consoleHistoryIndex = Math.max(0, state.consoleHistoryIndex - 1);
                state.consoleCommand = state.consoleHistory[state.consoleHistoryIndex] || '';
                refreshConsoleSuggestions();
                refreshOverlayPanels(snapshot);
            },
            onHistoryDown: () => {
                if (!state.consoleHistory.length) return;
                state.consoleHistoryIndex = Math.min(state.consoleHistory.length, state.consoleHistoryIndex + 1);
                state.consoleCommand = state.consoleHistory[state.consoleHistoryIndex] || '';
                refreshConsoleSuggestions();
                refreshOverlayPanels(snapshot);
            },
            onRun: (value) => {
                runSourceVibeCommand(value).catch((error) => addConsoleLog(error.message || 'Command failed.', 'error'));
            },
            onClose: () => toggleUtilityPanel('console', false),
            onClear: () => {
                state.consoleLogs = [];
                refreshOverlayPanels(snapshot);
            },
        });
    } else {
        consolePanel.hide();
    }

    if (state.panels.settings) {
        syncSettingsDraft();
        settingsPanel.render({
            activeTab: state.settingsUi.activeTab,
            settings: state.settingsDraft,
            binds: (sourcevibeConsole().binds || []).map((entry) => ({
                command: entry.command,
                key: state.settingsUi.bindEdits[entry.command] != null ? state.settingsUi.bindEdits[entry.command] : entry.key,
                description: entry.description || entry.help || 'Key binding',
            })),
            cvars: (sourcevibeConsole().cvars || []).map((entry) => ({
                ...entry,
                value: state.settingsUi.cvarEdits[entry.name] != null ? state.settingsUi.cvarEdits[entry.name] : entry.value,
            })),
        }, {
            onTabChange: (tabId) => {
                state.settingsUi.activeTab = tabId;
                refreshOverlayPanels(snapshot);
            },
            onSettingChange: (key, value) => {
                state.settingsDraft = sanitizeSettings({ ...state.settingsDraft, [key]: value });
                refreshOverlayPanels(snapshot);
            },
            onBindChange: (command, key) => {
                state.settingsUi.bindEdits = { ...state.settingsUi.bindEdits, [command]: key.trim().toLowerCase() };
            },
            onCvarChange: (name, value) => {
                state.settingsUi.cvarEdits = { ...state.settingsUi.cvarEdits, [name]: value };
            },
            onApply: async () => {
                state.settings = sanitizeSettings(state.settingsDraft);
                saveClientSettings(state.settings);
                applyClientSettings();
                for (const entry of sourcevibeConsole().binds || []) {
                    const nextKey = normalizeKeyToken(state.settingsUi.bindEdits[entry.command]);
                    const currentKey = normalizeKeyToken(entry.key);
                    if (nextKey === currentKey) continue;
                    if (currentKey) await runSourceVibeCommand(`unbind ${currentKey}`);
                    if (nextKey) await runSourceVibeCommand(`bind ${nextKey} ${entry.command}`);
                }
                for (const entry of sourcevibeConsole().cvars || []) {
                    const nextValue = state.settingsUi.cvarEdits[entry.name];
                    if (String(nextValue) === String(entry.value)) continue;
                    await runSourceVibeCommand(`${entry.name} ${nextValue}`);
                }
                addConsoleLog('Applied SourceVibe options.');
                syncSettingsDraft(true);
                refreshOverlayPanels(snapshot);
            },
            onCancel: () => {
                syncSettingsDraft(true);
                toggleUtilityPanel('settings', false);
            },
            onReset: () => {
                state.settingsDraft = { ...DEFAULT_SETTINGS };
                state.settingsUi.bindEdits = Object.fromEntries((sourcevibeConsole().binds || []).map((entry) => [entry.command, entry.key || '']));
                state.settingsUi.cvarEdits = Object.fromEntries((sourcevibeConsole().cvars || []).map((entry) => [entry.name, entry.default_value != null ? entry.default_value : entry.defaultValue != null ? entry.defaultValue : entry.value]));
                refreshOverlayPanels(snapshot);
            },
            onClose: () => toggleUtilityPanel('settings', false),
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
    if (open && ['menu', 'inventory', 'crafting', 'skills', 'build', 'map', 'mods', 'console', 'settings', 'chat', 'shop'].includes(name)) {
        input.reset();
    }
}

function closeUtilityPanels(except = null) {
    for (const name of UTILITY_PANELS) {
        setPanelOpen(name, name === except && !!except);
    }
}

function closeAllPanels() {
    const hadOpen = Object.values(state.panels).some(Boolean);
    setPanelOpen('menu', false);
    setPanelOpen('chat', false);
    closeUtilityPanels(null);
    setPanelOpen('interaction', false);
    setPanelOpen('loot', false);
    setPanelOpen('shop', false);
    chat.blur();
    if (interactionPanel) interactionPanel.hide();
    if (shopPanel) shopPanel.hide();
    refreshOverlayPanels();
    return hadOpen;
}

function applyInteractionResult(result) {
    if (!state.latestSnapshot || !state.latestSnapshot.interaction) return;
    if (Object.prototype.hasOwnProperty.call(result || {}, 'interaction')) {
        state.latestSnapshot.interaction.active = result && result.interaction || null;
        refreshPanels(state.latestSnapshot);
        refreshHud(state.latestSnapshot);
    }
}

function toggleChatPanel(forceOpen = !state.panels.chat) {
    setPanelOpen('menu', false);
    setPanelOpen('chat', forceOpen);
    if (forceOpen) chat.focus(); else chat.blur();
    markHudActivity(10000);
    refreshOverlayPanels();
}

function toggleUtilityPanel(name, forceOpen = !state.panels[name]) {
    const shouldOpen = !!forceOpen;
    setPanelOpen('menu', false);
    closeUtilityPanels(shouldOpen ? name : null);
    markHudActivity(10000);
    refreshOverlayPanels();
}

function toggleMenuPanel(forceOpen = !state.panels.menu) {
    const shouldOpen = !!forceOpen;
    setPanelOpen('chat', false);
    closeUtilityPanels(null);
    setPanelOpen('menu', shouldOpen);
    if (!shouldOpen) chat.blur();
    markHudActivity(10000);
    refreshOverlayPanels();
}

function gameplayInputBlocked(snapshot = state.latestSnapshot) {
    return !!(
        state.panels.menu
        || state.panels.chat
        || UTILITY_PANELS.some((name) => state.panels[name])
        || !!(snapshot && snapshot.interaction && snapshot.interaction.active)
        || !!(document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName))
    );
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
    interactionPanel = new InteractionPanel(dom.interaction, state.catalog.items);
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

        if (key === 'enter') {
            if (!isTyping) {
                event.preventDefault();
                toggleChatPanel(true);
            }
            return;
        }

        if (isSourceVibeBound(event, 'showmenu')) {
            event.preventDefault();
            if (isTyping && event.target && typeof event.target.blur === 'function') event.target.blur();
            if (state.panels.menu) {
                toggleMenuPanel(false);
            } else if (state.panels.chat || UTILITY_PANELS.some((name) => state.panels[name])) {
                closeAllPanels();
            } else {
                if (shopWasOpen && client) await client.closeInteraction();
                toggleMenuPanel(true);
            }
            return;
        }

        if (isSourceVibeBound(event, 'toggleinventory')) {
            event.preventDefault();
            if (shopWasOpen && client) await client.closeInteraction();
            toggleUtilityPanel('inventory');
            return;
        }

        if (isSourceVibeBound(event, 'togglecrafting')) {
            event.preventDefault();
            if (shopWasOpen && client) await client.closeInteraction();
            toggleUtilityPanel('crafting');
            return;
        }

        if (isSourceVibeBound(event, 'togglemap')) {
            event.preventDefault();
            if (shopWasOpen && client) await client.closeInteraction();
            toggleUtilityPanel('map');
            return;
        }

        if (isSourceVibeBound(event, 'toggleconsole')) {
            event.preventDefault();
            if (shopWasOpen && client) await client.closeInteraction();
            toggleUtilityPanel('console');
            return;
        }

        switch (key) {
        case 'k':
            event.preventDefault();
            if (shopWasOpen && client) await client.closeInteraction();
            toggleUtilityPanel('skills');
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
        case 'f1':
            event.preventDefault();
            if (shopWasOpen && client) await client.closeInteraction();
            toggleUtilityPanel('settings');
            break;
        case 'escape': {
            if (isTyping && event.target && typeof event.target.blur === 'function') event.target.blur();
            if (!isSourceVibeBound(event, 'showmenu')) {
                const closed = closeAllPanels();
                if ((shopWasOpen || !closed) && client) await client.closeInteraction();
            }
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
    if (!snapshot || !inventory || !crafting || !buildMenu || !mapPanel || !skills || !mods || !lootPanel || !shopPanel || !interactionPanel) return;
    const activeInteraction = snapshot.interaction && snapshot.interaction.active;
    input.setHotbar(snapshot.self && snapshot.self.hotbar || [], snapshot.self && snapshot.self.quick_slot || input.quickSlot);
    const inventoryLayout = sourcevibeInventoryLayout();
    const showBank = !!(activeInteraction && activeInteraction.type === 'bank')
        || (!inventoryLayout.showBankOnInteractionOnly && Array.isArray(snapshot.self && snapshot.self.bank) && snapshot.self.bank.length > 0);
    dom.joinInfo.textContent = `Connected to ${snapshot.world.name} · zone ${snapshot.world.zone_id}`;
    dom.joinInfo.classList.remove('empty');
    dom.welcome.classList.add('connected');
    dom.welcome.classList.add('playing');
    chat.render(snapshot.chat || []);
    if (state.panels.inventory) {
        inventory.render(snapshot.self, {
            layout: inventoryLayout,
            showBank,
            onDeposit: async (itemId, quantity = 1) => {
                await apiJson(`${API_BASE}/bank/${state.identity.userId}/deposit`, { method: 'POST', body: JSON.stringify({ item_id: itemId, quantity }) }, state.identity);
                addConsoleLog(`Deposited ${quantity} × ${state.catalog.itemMap[itemId] && state.catalog.itemMap[itemId].name || itemId} into the bank.`);
                markHudActivity(9000);
            },
            onWithdraw: async (itemId, quantity = 1) => {
                await apiJson(`${API_BASE}/bank/${state.identity.userId}/withdraw`, { method: 'POST', body: JSON.stringify({ item_id: itemId, quantity }) }, state.identity);
                addConsoleLog(`Withdrew ${quantity} × ${state.catalog.itemMap[itemId] && state.catalog.itemMap[itemId].name || itemId} from the bank.`);
                markHudActivity(9000);
            },
            onHotbarAssign: async (slot, itemId) => {
                if (!client) return;
                const result = await client.updateHotbar(slot, itemId, { select: false });
                if (result && result.ok === false) {
                    dom.joinInfo.textContent = result.reason || 'Hotbar update failed';
                    dom.joinInfo.classList.remove('empty');
                    addConsoleLog(result.reason || `Could not assign ${itemId} to slot ${slot}.`, 'warn');
                    return;
                }
                addConsoleLog(`Assigned ${state.catalog.itemMap[itemId] && state.catalog.itemMap[itemId].name || itemId} to hotbar slot ${slot}.`);
                markHudActivity(9000);
            },
            onHotbarClear: async (slot) => {
                if (!client) return;
                const result = await client.clearHotbar(slot);
                if (result && result.ok === false) {
                    dom.joinInfo.textContent = result.reason || 'Clear failed';
                    dom.joinInfo.classList.remove('empty');
                    addConsoleLog(result.reason || `Could not clear ${slot}.`, 'warn');
                    return;
                }
                addConsoleLog(`Cleared hotbar slot ${slot}.`);
                markHudActivity(9000);
            },
            onDropItem: async (itemId, quantity) => {
                if (!client) return;
                const result = await client.dropInventory(itemId, quantity);
                if (result && result.ok === false) {
                    dom.joinInfo.textContent = result.reason || 'Drop failed';
                    dom.joinInfo.classList.remove('empty');
                    addConsoleLog(result.reason || `Could not drop ${itemId}.`, 'warn');
                    return;
                }
                addConsoleLog(`Dropped ${quantity} × ${state.catalog.itemMap[itemId] && state.catalog.itemMap[itemId].name || itemId}.`);
                markHudActivity(9000);
            },
            onSelectHotbar: (slot) => {
                input.quickSlot = slot;
                input.setHotbar(snapshot.self && snapshot.self.hotbar || [], slot);
                if (state.localSelf) state.localSelf.quick_slot = slot;
                if (state.renderSelf) state.renderSelf.quick_slot = slot;
                markHudActivity(9000);
            },
        });
    } else {
        inventory.hide();
    }
    if (state.panels.skills) skills.render(snapshot.self); else if (skills && typeof skills.hide === 'function') skills.hide();
    if (state.panels.crafting) crafting.render(snapshot.self, async (recipeId) => client && client.craft(recipeId)); else if (crafting && typeof crafting.hide === 'function') crafting.hide();
    if (state.panels.build) {
        buildMenu.render((item) => {
            state.buildSelection = item;
        });
    } else if (buildMenu && typeof buildMenu.hide === 'function') {
        buildMenu.hide();
    }
    if (state.panels.map) mapPanel.render(snapshot.world.zone_id, async (zoneId) => client && client.travel(zoneId)); else if (mapPanel && typeof mapPanel.hide === 'function') mapPanel.hide();
    death.render(snapshot.self);
    lootPanel.render(snapshot.entities.loot || []);

    if (activeInteraction && activeInteraction.type !== 'shop') {
        closeUtilityPanels(null);
        setPanelOpen('menu', false);
        setPanelOpen('shop', false);
        shopPanel.hide();
        setPanelOpen('interaction', true);
        interactionPanel.render(activeInteraction, snapshot.self, {
            onClose: async () => {
                if (!client) return;
                const result = await client.closeInteraction();
                if (result && result.ok === false) {
                    dom.joinInfo.textContent = result.reason || 'Close failed';
                    dom.joinInfo.classList.remove('empty');
                    addConsoleLog(result.reason || 'Could not close interaction.', 'warn');
                    return;
                }
                applyInteractionResult({ interaction: null });
                markHudActivity(9000);
            },
            onTake: async ({ interaction, itemId, quantity }) => {
                if (!client) return;
                const result = await client.performInteraction({ action: 'take', entity_id: interaction.entity_id, item_id: itemId, quantity });
                if (result && result.ok === false) {
                    dom.joinInfo.textContent = result.reason || 'Take failed';
                    dom.joinInfo.classList.remove('empty');
                    addConsoleLog(result.reason || `Could not take ${itemId}.`, 'warn');
                    return;
                }
                addConsoleLog(`Took ${quantity} × ${state.catalog.itemMap[itemId] && state.catalog.itemMap[itemId].name || itemId}.`);
                applyInteractionResult(result || {});
                markHudActivity(9000);
            },
            onStore: async ({ interaction, itemId, quantity }) => {
                if (!client) return;
                const result = await client.performInteraction({ action: 'store', entity_id: interaction.entity_id, item_id: itemId, quantity });
                if (result && result.ok === false) {
                    dom.joinInfo.textContent = result.reason || 'Store failed';
                    dom.joinInfo.classList.remove('empty');
                    addConsoleLog(result.reason || `Could not store ${itemId}.`, 'warn');
                    return;
                }
                addConsoleLog(`Stored ${quantity} × ${state.catalog.itemMap[itemId] && state.catalog.itemMap[itemId].name || itemId}.`);
                applyInteractionResult(result || {});
                markHudActivity(9000);
            },
            onSaveText: async ({ interaction, text }) => {
                if (!client) return;
                const result = await client.performInteraction({ action: 'set_text', entity_id: interaction.entity_id, text });
                if (result && result.ok === false) {
                    dom.joinInfo.textContent = result.reason || 'Sign save failed';
                    dom.joinInfo.classList.remove('empty');
                    addConsoleLog(result.reason || 'Could not save sign text.', 'warn');
                    return;
                }
                addConsoleLog('Saved sign text.');
                applyInteractionResult(result || {});
                markHudActivity(9000);
            },
        });
    } else {
        setPanelOpen('interaction', false);
        interactionPanel.hide();
    }

    if (activeInteraction && activeInteraction.type === 'shop') {
        closeUtilityPanels(null);
        setPanelOpen('menu', false);
        setPanelOpen('interaction', false);
        interactionPanel.hide();
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
    }, state.settings);
    death.render(snapshot.self);
    const overlayBusy = gameplayInputBlocked(snapshot);
    document.body.classList.toggle('hud-resting', !!state.settings.hudFade && !overlayBusy && performance.now() > state.hudActiveUntil);
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
    if (snapshot && snapshot.self && snapshot.self.quick_slot) input.quickSlot = Number(snapshot.self.quick_slot) || input.quickSlot;
    if (snapshot && snapshot.self) input.setHotbar(snapshot.self.hotbar || [], snapshot.self.quick_slot || input.quickSlot);
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
    await loadSourceVibeBootstrap();
    dom.joinInfo.textContent = `Connecting to ${state.query.serverId}…`;
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
        addConsoleLog(`Realtime link established. Joining ${state.query.serverId}…`);
        await client.joinWorld({
            worldSlug: state.query.serverId,
            gamemode: state.query.gamemodeId,
            userId: state.identity.userId,
            displayName: state.identity.displayName,
            zone_id: state.query.zoneId,
        });
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
        toggleMenuPanel(false);
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
await loadSourceVibeBootstrap();
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
