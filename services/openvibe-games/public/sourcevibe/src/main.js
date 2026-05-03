import {
    currentIdentity,
    gamesApiJson,
    getAuthState,
    initializeOpenVibeAuth,
    refreshOpenVibeAuth,
    resolveSurfaceUrl,
    startSignIn,
    startSignOut,
} from '/sourcevibe-shared/auth-client.js';
import { SourceWindowManager } from '/sourcevibe-shared/ui/window-manager.js';
import { SourceConsoleWindow } from '/sourcevibe-shared/ui/source-console-window.js';
import { SourceOptionsWindow } from '/sourcevibe-shared/ui/source-options-window.js';
import { escapeHtml, clamp, normalizeToken } from '/sourcevibe-shared/ui/dom.js';

const SOURCEVIBE_API = '/api/games/sourcevibe';
const OPTIONS_STORAGE_KEY = 'openvibe.games.sourcevibe.launcher-options.v1';
const DEFAULT_OPTIONS = Object.freeze({
    hudFade: false,
    showFeed: true,
    showHotkeys: true,
    interpolationDelayMs: 75,
    selfSmoothing: 0.22,
    mouseSensitivity: 1,
});

async function apiJson(path, options = {}) {
    return gamesApiJson(path, options);
}

function createHookLibrary() {
    const buckets = new Map();
    function list(name) {
        return buckets.get(String(name || '')) || new Map();
    }
    return {
        Add(name, id, fn) {
            const key = String(name || '');
            const hookId = String(id || `hook_${Date.now()}`);
            if (!buckets.has(key)) buckets.set(key, new Map());
            buckets.get(key).set(hookId, fn);
        },
        Remove(name, id) {
            list(name).delete(String(id || ''));
        },
        Run(name, ...args) {
            let last;
            for (const fn of list(name).values()) {
                const result = fn(...args);
                if (result !== undefined) last = result;
            }
            return last;
        },
        Call(name, gm, ...args) {
            const result = this.Run(name, ...args);
            if (result !== undefined) return result;
            if (gm && typeof gm[name] === 'function') return gm[name](...args);
            return undefined;
        },
    };
}

function sanitizeOptions(value = {}) {
    return {
        hudFade: value.hudFade === true,
        showFeed: value.showFeed !== false,
        showHotkeys: value.showHotkeys !== false,
        interpolationDelayMs: clamp(Math.round(Number(value.interpolationDelayMs) || DEFAULT_OPTIONS.interpolationDelayMs), 40, 160),
        selfSmoothing: clamp(Number(value.selfSmoothing) || DEFAULT_OPTIONS.selfSmoothing, 0.08, 0.55),
        mouseSensitivity: clamp(Number(value.mouseSensitivity) || DEFAULT_OPTIONS.mouseSensitivity, 0.4, 2.5),
    };
}

function loadOptions() {
    try {
        return sanitizeOptions(JSON.parse(window.localStorage.getItem(OPTIONS_STORAGE_KEY) || '{}'));
    } catch {
        return { ...DEFAULT_OPTIONS };
    }
}

function saveOptions(value) {
    const next = sanitizeOptions(value);
    window.localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(next));
    return next;
}

function sortDirectory(items = []) {
    return [...items].sort((left, right) => {
        const leftFeatured = left && left.featured ? 1 : 0;
        const rightFeatured = right && right.featured ? 1 : 0;
        if (leftFeatured !== rightFeatured) return rightFeatured - leftFeatured;
        if (left.id === '2dworld' && right.id !== '2dworld') return -1;
        if (right.id === '2dworld' && left.id !== '2dworld') return 1;
        return String(left.title || left.id).localeCompare(String(right.title || right.id));
    });
}

function sortServers(servers = []) {
    return [...servers].sort((left, right) => {
        if (left.official && !right.official) return -1;
        if (right.official && !left.official) return 1;
        if (left.gamemode === '2dworld' && right.gamemode !== '2dworld') return -1;
        if (right.gamemode === '2dworld' && left.gamemode !== '2dworld') return 1;
        return String(left.name || left.id).localeCompare(String(right.name || right.id));
    });
}

function viewFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const requested = normalizeToken(params.get('view') || params.get('panel') || '');
    if (requested === 'status') return 'diagnostics';
    if (['home', 'directory', 'editor', 'addons', 'diagnostics'].includes(requested)) return requested;
    return 'home';
}

function syncViewUrl(view) {
    const url = new URL(window.location.href);
    url.searchParams.set('view', view || 'home');
    if ((view || 'home') === 'diagnostics') {
        if (!url.searchParams.get('panel')) url.searchParams.set('panel', 'status');
    } else {
        url.searchParams.delete('panel');
    }
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function focusGamemodeView(gamemodeId, view) {
    const url = new URL(window.location.href);
    if (gamemodeId) url.searchParams.set('gamemode', gamemodeId);
    state.activeView = dom.views[view] ? view : 'home';
    syncViewUrl(state.activeView);
    window.history.replaceState({}, '', `${url.pathname}${url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''}${url.hash}`);
    renderAll();
}

const state = {
    auth: getAuthState(),
    identity: currentIdentity(),
    bootstrap: null,
    directory: [],
    activeView: viewFromQuery(),
    consoleHistory: [],
    consoleCommand: '',
    consoleFilter: '',
    consoleSuggestions: [],
    consoleHistoryIndex: 0,
    options: {
        activeTab: 'keyboard',
        settings: loadOptions(),
        bindEdits: {},
        cvarEdits: {},
    },
    sv: null,
};

const dom = {
    sessionCard: document.getElementById('session-card'),
    nav: document.getElementById('sidebar-nav'),
    views: {
        home: document.getElementById('view-home'),
        directory: document.getElementById('view-directory'),
        editor: document.getElementById('view-editor'),
        addons: document.getElementById('view-addons'),
        diagnostics: document.getElementById('view-diagnostics'),
    },
    statusBanner: document.getElementById('status-banner'),
    statusStrip: document.getElementById('status-strip'),
};

const windowManager = new SourceWindowManager({ container: document.body });
const consoleWindow = new SourceConsoleWindow(windowManager, {
    onSetFilter(value) {
        state.consoleFilter = value;
        updateWindows();
    },
    onChangeCommand(value) {
        state.consoleCommand = value;
        refreshConsoleSuggestions();
        updateWindows();
    },
    onUseSuggestion(value) {
        state.consoleCommand = value;
        refreshConsoleSuggestions();
        updateWindows();
    },
    onHistoryUp() {
        if (!state.consoleHistory.length) return;
        state.consoleHistoryIndex = Math.max(0, state.consoleHistoryIndex - 1);
        state.consoleCommand = state.consoleHistory[state.consoleHistoryIndex] || '';
        refreshConsoleSuggestions();
        updateWindows();
    },
    onHistoryDown() {
        if (!state.consoleHistory.length) return;
        state.consoleHistoryIndex = Math.min(state.consoleHistory.length, state.consoleHistoryIndex + 1);
        state.consoleCommand = state.consoleHistory[state.consoleHistoryIndex] || '';
        refreshConsoleSuggestions();
        updateWindows();
    },
    onRun(command) {
        runConsole(command).catch((error) => {
            setStatus(error.message || 'Console command failed.', 'error');
            pushConsole('system', error.message || 'Console command failed.', 'error');
            updateWindows();
        });
    },
    onClear() {
        state.consoleHistory = [];
        updateWindows();
    },
});
const optionsWindow = new SourceOptionsWindow(windowManager, {
    onTabChange(tabId) {
        state.options.activeTab = tabId;
        updateWindows();
    },
    onSettingChange(key, value) {
        state.options.settings = sanitizeOptions({ ...state.options.settings, [key]: value });
    },
    onBindChange(command, key) {
        state.options.bindEdits = { ...state.options.bindEdits, [command]: key.trim().toLowerCase() };
    },
    onCvarChange(name, value) {
        state.options.cvarEdits = { ...state.options.cvarEdits, [name]: value };
    },
    onApply() {
        applyOptions().catch((error) => {
            setStatus(error.message || 'Could not apply options.', 'error');
        });
    },
    onReset() {
        state.options.settings = { ...DEFAULT_OPTIONS };
        syncOptionDrafts(true);
        updateWindows();
    },
    onCancel() {
        syncOptionDrafts(true);
        optionsWindow.close();
    },
});

function setStatus(message, tone = 'neutral') {
    dom.statusBanner.textContent = message;
    dom.statusBanner.className = `status-banner${tone === 'neutral' ? '' : ` ${tone}`}`;
}

function setView(name, { updateUrl = true } = {}) {
    state.activeView = dom.views[name] ? name : 'home';
    for (const [viewName, panel] of Object.entries(dom.views)) {
        panel.classList.toggle('hidden', viewName !== state.activeView);
    }
    for (const button of dom.nav.querySelectorAll('[data-view]')) {
        button.classList.toggle('active', button.dataset.view === state.activeView);
    }
    if (updateUrl) syncViewUrl(state.activeView);
}

function queryBootstrapUrl() {
    const params = new URLSearchParams(window.location.search);
    const next = new URLSearchParams();
    if (params.get('gamemode')) next.set('gamemode', params.get('gamemode'));
    if (params.get('server')) next.set('server', params.get('server'));
    return `${SOURCEVIBE_API}/bootstrap${next.toString() ? `?${next}` : ''}`;
}

function commandMutatesState(command) {
    return /^(bind|unbind|gamemode_run|gm_reload|addons_reload|cl_|sv_|rate\b|net_graph\b|connect\b)/.test(String(command || '').trim());
}

function sessionUser() {
    return state.auth && state.auth.session && state.auth.session.user || null;
}

function isAuthenticated() {
    return !!(state.auth && state.auth.session && state.auth.session.authenticated);
}

function sourcevibeConsole() {
    return state.bootstrap && state.bootstrap.console || { commands: [], cvars: [], binds: [], suggestions: [] };
}

function featuredEntry() {
    const requested = normalizeToken(new URLSearchParams(window.location.search).get('gamemode') || '');
    const items = sortDirectory(state.directory || []);
    return items.find((entry) => normalizeToken(entry.id) === requested)
        || items.find((entry) => entry.id === '2dworld')
        || items[0]
        || null;
}

function syncOptionDrafts(force = false) {
    if (force || !Object.keys(state.options.bindEdits || {}).length) {
        state.options.bindEdits = Object.fromEntries((sourcevibeConsole().binds || []).map((entry) => [entry.command, entry.key || '']));
    }
    if (force || !Object.keys(state.options.cvarEdits || {}).length) {
        state.options.cvarEdits = Object.fromEntries((sourcevibeConsole().cvars || []).map((entry) => [entry.name, entry.value]));
    }
}

function refreshConsoleSuggestions() {
    const needle = normalizeToken(state.consoleCommand || '');
    const suggestions = [];
    for (const entry of sourcevibeConsole().commands || []) suggestions.push({ name: entry.name, description: entry.description || 'command' });
    for (const entry of sourcevibeConsole().cvars || []) suggestions.push({ name: entry.name, description: entry.description || 'cvar' });
    for (const entry of sourcevibeConsole().suggestions || []) {
        suggestions.push(typeof entry === 'string' ? { name: entry, description: 'suggestion' } : entry);
    }
    const seen = new Set();
    state.consoleSuggestions = suggestions.filter((entry) => {
        const key = normalizeToken(entry && entry.name || '');
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return !needle || key.includes(needle);
    }).slice(0, 10);
}

async function refreshAuth({ reloadBootstrap = true } = {}) {
    state.auth = await refreshOpenVibeAuth();
    state.identity = currentIdentity();
    if (reloadBootstrap) await loadData();
    return state.auth;
}

function requireSignIn(message) {
    if (isAuthenticated()) return true;
    const nextMessage = message || 'Sign in with OpenVibe to continue.';
    setStatus(nextMessage, 'warn');
    pushConsole('system', nextMessage, 'warn');
    return false;
}

async function loadData() {
    const [bootstrap, directory] = await Promise.all([
        apiJson(queryBootstrapUrl()),
        apiJson(`${SOURCEVIBE_API}/directory`),
    ]);
    state.bootstrap = bootstrap;
    state.directory = bootstrap.directory || directory.items || [];
    state.auth = getAuthState();
    state.identity = currentIdentity();
    syncOptionDrafts(true);
    refreshConsoleSuggestions();
    hydrateSV();
}

function pushConsole(origin, output, level = 'info') {
    state.consoleHistory.push({
        origin,
        output,
        level,
        at: new Date().toLocaleTimeString([], { hour12: false }),
    });
    state.consoleHistory = state.consoleHistory.slice(-60);
    state.consoleHistoryIndex = state.consoleHistory.length;
}

async function runConsole(command, { reload = commandMutatesState(command) } = {}) {
    const raw = String(command || '').trim();
    if (!raw) return { ok: false, error: 'empty command' };
    if (commandMutatesState(command) && !isAuthenticated()) {
        const message = 'Sign in with OpenVibe before running launcher commands that change engine state.';
        setStatus(message, 'warn');
        pushConsole('system', message, 'warn');
        return { ok: false, error: message };
    }
    pushConsole('cmd', raw, 'info');
    const result = await apiJson(`${SOURCEVIBE_API}/console/run`, {
        method: 'POST',
        body: JSON.stringify({ command: raw, lastServerId: state.bootstrap && state.bootstrap.activeServer && state.bootstrap.activeServer.id || null }),
    });
    if (result.output === '__CLEAR__') {
        state.consoleHistory = [];
    } else {
        pushConsole('out', result.output || JSON.stringify(result, null, 2), result.ok === false ? 'error' : 'info');
    }
    if (reload) {
        await loadData();
        renderAll();
    } else {
        refreshConsoleSuggestions();
        updateWindows();
    }
    return result;
}

async function launchGamemode(id, mode = 'play') {
    if (!requireSignIn('Sign in with OpenVibe to launch gameplay surfaces.')) {
        startSignIn();
        return { ok: false, error: 'authentication required' };
    }
    const result = await apiJson(`${SOURCEVIBE_API}/gamemodes/${encodeURIComponent(id)}/${mode === 'local-test' ? 'local-test' : 'play'}`, {
        method: 'POST',
        body: JSON.stringify({}),
    });
    setStatus(`${mode === 'local-test' ? 'Creating local test' : 'Launching'} ${result.server && result.server.name || id}…`, 'success');
    window.location.href = result.launch.url;
    return result;
}

function hydrateSV() {
    const hook = createHookLibrary();
    const cvarMap = new Map((sourcevibeConsole().cvars || []).map((entry) => [entry.name, { ...entry }]));
    const bindMap = new Map((sourcevibeConsole().binds || []).map((entry) => [entry.key, entry.command]));
    state.sv = {
        version: state.bootstrap.engine.version,
        bootstrap: state.bootstrap,
        hook,
        net: {
            Receive(name, fn) { hook.Add(`net:${name}`, name, fn); },
            Send(name, payload) { return hook.Run(`net:${name}`, payload); },
        },
        ents: {
            list() { return []; },
        },
        gamemode: {
            list() { return state.directory || []; },
            get(id) { return (state.directory || []).find((entry) => entry.id === id) || null; },
            async activate(id) { return runConsole(`gamemode_run ${id}`); },
            async play(id) { return launchGamemode(id, 'play'); },
        },
        addon: {
            list() { return state.bootstrap.addons || []; },
        },
        console: {
            async run(command) { return runConsole(command); },
            history() { return state.consoleHistory.slice(); },
        },
        cvar: {
            get(name) { return cvarMap.get(name) || null; },
            async set(name, value) {
                const result = await runConsole(`${name} ${value}`);
                await loadData();
                renderAll();
                return result;
            },
        },
        bind: {
            get(key) { return bindMap.get(key) || null; },
            async set(key, command) {
                const result = await runConsole(`bind ${key} ${command}`);
                await loadData();
                renderAll();
                return result;
            },
        },
        launcher: {
            async play(id) { return launchGamemode(id, 'play'); },
            async localTest(id) { return launchGamemode(id, 'local-test'); },
            openPanel(name) {
                const key = normalizeToken(name || '');
                if (key === 'console') return consoleWindow.open(buildConsoleModel());
                if (key === 'options') return optionsWindow.open(buildOptionsModel());
                return setView(key || 'home');
            },
        },
    };
    window.SV = state.sv;
}

function buildConsoleModel() {
    return {
        title: 'Developer Console',
        subtitle: `${state.bootstrap && state.bootstrap.engine && state.bootstrap.engine.name || 'SourceVibe Engine'} · shared launcher console`,
        logs: state.consoleHistory,
        filter: state.consoleFilter,
        command: state.consoleCommand,
        suggestions: state.consoleSuggestions,
    };
}

function buildOptionsModel() {
    return {
        title: 'Options',
        subtitle: 'Shared Source-style options dialog',
        activeTab: state.options.activeTab,
        tabs: state.bootstrap && state.bootstrap.options && state.bootstrap.options.tabs || undefined,
        settings: state.options.settings,
        binds: (sourcevibeConsole().binds || []).map((entry) => ({
            command: entry.command,
            key: state.options.bindEdits[entry.command] != null ? state.options.bindEdits[entry.command] : entry.key,
            description: entry.description || entry.help || 'Key binding',
        })),
        cvars: (sourcevibeConsole().cvars || []).map((entry) => ({
            ...entry,
            value: state.options.cvarEdits[entry.name] != null ? state.options.cvarEdits[entry.name] : entry.value,
        })),
    };
}

function updateWindows() {
    consoleWindow.update(buildConsoleModel());
    optionsWindow.update(buildOptionsModel());
}

function renderSessionCard() {
    const user = sessionUser();
    if (!dom.sessionCard) return;
    dom.sessionCard.innerHTML = isAuthenticated()
        ? `
            <div class="identity-card__summary">
                <span class="eyebrow">OpenVibe session</span>
                <strong>${user && (user.display_name || user.username || user.id) || 'Signed in'}</strong>
                <span class="identity-card__meta">${user && (user.username || user.id) || 'user'} · role ${user && user.role || 'user'}</span>
                <span class="identity-card__hint">The launcher now stays compact while console and options float as shared windows across surfaces.</span>
            </div>
            <div class="identity-card__actions">
                <button class="cta-button" data-action="play-featured">Play 2D World</button>
                <button class="table-button" data-action="open-account">Account</button>
                <button class="table-button" data-action="sign-out">Sign out</button>
            </div>
            <div class="identity-card__meta">Active gamemode ${escapeHtml(state.bootstrap && state.bootstrap.gamemode && state.bootstrap.gamemode.title || 'unknown')} · ${Number(state.bootstrap && state.bootstrap.servers && state.bootstrap.servers.length || 0)} registered servers</div>
        `
        : `
            <div class="identity-card__summary">
                <span class="eyebrow">OpenVibe session</span>
                <strong>Not signed in</strong>
                <span class="identity-card__hint">Guests can browse the engine directory, but Play and Local Test actions stay locked to real OpenVibe sessions.</span>
            </div>
            <div class="identity-card__actions">
                <button class="cta-button" data-action="sign-in">Sign in with OpenVibe</button>
                <a class="table-button" href="/sourcevibe?gamemode=2dworld&view=directory">Browse 2D World package</a>
            </div>
        `;
}

function renderStatusStrip() {
    const officialCount = (state.directory || []).filter((entry) => entry.officialServer).length;
    const pills = [
        {
            label: 'Featured',
            value: escapeHtml(featuredEntry() && featuredEntry().title || '2D World'),
            meta: escapeHtml(featuredEntry() && featuredEntry().officialServer && featuredEntry().officialServer.name || 'flagship route'),
        },
        {
            label: 'Gamemodes',
            value: String((state.directory || []).length),
            meta: 'Directory entries',
        },
        {
            label: 'Official surfaces',
            value: String(officialCount),
            meta: 'Public play targets',
        },
        {
            label: 'Session',
            value: isAuthenticated() ? 'Linked' : 'Guest',
            meta: isAuthenticated() ? escapeHtml(sessionUser() && (sessionUser().username || sessionUser().id) || 'user') : 'browse only',
        },
    ];
    dom.statusStrip.innerHTML = pills.map((pill) => `
        <article class="status-pill">
            <span class="eyebrow">${pill.label}</span>
            <strong>${pill.value}</strong>
            <span class="muted">${pill.meta}</span>
        </article>
    `).join('');
}

function renderHomeView() {
    const featured = featuredEntry();
    const officialServer = featured && featured.officialServer || null;
    const diagnostics = state.bootstrap && state.bootstrap.prediction || {};
    dom.views.home.innerHTML = `
        <div class="hero-card">
            <div>
                <p class="eyebrow">Engine / gamemode boundary</p>
                <h2>${featured ? escapeHtml(featured.title) : 'SourceVibe directory'}</h2>
                <p class="muted">${featured ? escapeHtml(featured.description) : 'No gamemodes are registered yet.'}</p>
            </div>
            <div class="chip-row">
                ${(sortDirectory(state.directory || []).map((entry) => `<span class="chip ${entry.featured ? 'ok' : ''}">${escapeHtml(entry.title)}</span>`).join(''))}
            </div>
            <div class="hero-actions">
                ${featured ? `<button class="cta-button" data-action="play-gamemode" data-gamemode-id="${escapeHtml(featured.id)}">${isAuthenticated() ? `Play ${escapeHtml(featured.title)}` : 'Sign in to play'}</button>` : ''}
                ${featured && featured.permissions && featured.permissions.canLocalTest ? `<button class="table-button" data-action="local-test-gamemode" data-gamemode-id="${escapeHtml(featured.id)}">Local Test</button>` : ''}
                ${featured && featured.surfaces && featured.surfaces.editor ? `<button class="table-button" data-view-target="editor">Editor</button>` : ''}
                ${featured && featured.surfaces && featured.surfaces.status ? `<button class="table-button" data-view-target="diagnostics">Status</button>` : ''}
                <button class="table-button" data-view-target="directory">Open directory</button>
            </div>
        </div>

        <div class="feature-grid">
            <article class="feature-card">
                <p class="eyebrow">Official surface</p>
                <div class="feature-value">${escapeHtml(officialServer && officialServer.name || 'None')}</div>
                <p class="muted">${escapeHtml(officialServer ? `${officialServer.players}/${officialServer.maxPlayers} players · ${officialServer.map}` : 'No official server descriptor registered.')}</p>
            </article>
            <article class="feature-card">
                <p class="eyebrow">Directory count</p>
                <div class="feature-value">${(state.directory || []).length}</div>
                <p class="muted">One card per gamemode, with Play and Local Test availability determined by your actor state.</p>
            </article>
            <article class="feature-card">
                <p class="eyebrow">Interpolation</p>
                <div class="feature-value">${Number(diagnostics.interpolation || 0).toFixed(3)}s</div>
                <p class="muted">Current launcher bootstrap prediction snapshot for the connected engine configuration.</p>
            </article>
        </div>

        <div class="detail-grid">
            <article class="detail-card">
                <h3>Shared windows</h3>
                <div class="chip-row">
                    ${(state.bootstrap.engine.api || []).map((entry) => `<span class="chip">SV.${escapeHtml(entry)}</span>`).join('')}
                </div>
                <p class="muted">Console and options are no longer full launcher pages. They float as shared windows so the engine shell stays compact and the same controls can be reused in-world.</p>
                <div class="card-actions">
                    <button class="table-button" data-action="open-console">Open console</button>
                    <button class="table-button" data-action="open-options">Open options</button>
                </div>
            </article>
            <article class="detail-card">
                <h3>Session-aware launch</h3>
                <p class="muted">Guests can inspect the directory, but Play and Local Test resolve against your real OpenVibe actor. That keeps the engine honest and removes the old fake local identity workflow.</p>
                <div class="kv-grid">
                    <div>
                        <strong>Session</strong>
                        <span class="muted">${isAuthenticated() ? escapeHtml(sessionUser() && (sessionUser().username || sessionUser().id) || 'linked') : 'guest browse mode'}</span>
                    </div>
                    <div>
                        <strong>Realtime path</strong>
                        <span class="mono">${escapeHtml(state.bootstrap.engine.realtimePath || '/games/realtime')}</span>
                    </div>
                </div>
            </article>
        </div>
    `;
}

function renderDirectoryView() {
    const items = sortDirectory(state.directory || []);
    dom.views.directory.innerHTML = items.length ? `
        <div class="directory-grid">
            ${items.map((entry) => {
                const official = entry.officialServer || {};
                const permissions = entry.permissions || {};
                return `
                    <article class="directory-card">
                        <div class="directory-card__header">
                            <div>
                                <p class="eyebrow">${entry.featured ? 'Featured gamemode' : 'Gamemode package'}</p>
                                <h3>${escapeHtml(entry.title)}</h3>
                                <p class="muted">${escapeHtml(entry.description || 'No description provided.')}</p>
                            </div>
                            <div class="chip-row">
                                <span class="chip ${entry.active ? 'ok' : ''}">${entry.active ? 'active' : 'available'}</span>
                                <span class="chip">base ${escapeHtml(entry.base || 'none')}</span>
                            </div>
                        </div>
                        <div class="server-meta">
                            ${(entry.maps || []).map((map) => `<span class="chip">map ${escapeHtml(map)}</span>`).join('')}
                            ${(official.tags || []).map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join('')}
                        </div>
                        <div class="kv-grid">
                            <div>
                                <strong>Official surface</strong>
                                <span class="muted">${escapeHtml(official.name || entry.surfaces && entry.surfaces.play || 'No official server descriptor')}</span>
                            </div>
                            <div>
                                <strong>Players</strong>
                                <span class="muted">${official.maxPlayers ? `${Number(official.players || 0)}/${Number(official.maxPlayers || 0)}` : 'n/a'}</span>
                            </div>
                        </div>
                        <div class="card-actions">
                            <button class="cta-button" data-action="play-gamemode" data-gamemode-id="${escapeHtml(entry.id)}">${permissions.canPlay ? 'Play' : 'Sign in to play'}</button>
                            ${permissions.canLocalTest ? `<button class="table-button" data-action="local-test-gamemode" data-gamemode-id="${escapeHtml(entry.id)}">Local Test</button>` : ''}
                            ${entry.surfaces && entry.surfaces.status ? `<button class="table-button" data-action="open-gamemode-view" data-gamemode-id="${escapeHtml(entry.id)}" data-target-view="diagnostics">Status</button>` : ''}
                            ${entry.surfaces && entry.surfaces.editor ? `<button class="table-button" data-action="open-gamemode-view" data-gamemode-id="${escapeHtml(entry.id)}" data-target-view="editor">Editor</button>` : ''}
                        </div>
                        <div class="route-list">
                            <small>${escapeHtml(permissions.playReason || '')}</small>
                            ${permissions.canLocalTest ? `<small>${escapeHtml(permissions.localTestReason || '')}</small>` : ''}
                        </div>
                    </article>
                `;
            }).join('')}
        </div>
    ` : '<div class="empty-card"><h3>No gamemodes registered</h3><p class="muted">The engine directory will populate once gamemode manifests are loaded.</p></div>';
}

function renderEditorView() {
    const featured = featuredEntry();
    if (!featured) {
        dom.views.editor.innerHTML = '<div class="empty-card"><h3>No editor surface available</h3><p class="muted">Load a gamemode package with editor support to populate this workspace.</p></div>';
        return;
    }
    const activeServer = featured.officialServer && (featured.officialServer.id || featured.officialServer.slug)
        || state.bootstrap && state.bootstrap.activeServer && (state.bootstrap.activeServer.id || state.bootstrap.activeServer.slug)
        || null;
    const editorParams = new URLSearchParams({
        embedded: '1',
        gamemode: featured.id,
    });
    if (activeServer) editorParams.set('server', activeServer);
    const editorUrl = `/2d-world/editor/?${editorParams.toString()}`;
    dom.views.editor.innerHTML = `
        <div class="detail-grid detail-grid--editor">
            <article class="detail-card">
                <h3>${escapeHtml(featured.title)} editor</h3>
                <p class="muted">The control plane stays in <code>/sourcevibe/</code>; the world tool surface docks below so the same launcher, console, and options stay in charge.</p>
                <div class="chip-row">
                    <span class="chip">canonical shell</span>
                    <span class="chip">shared console</span>
                    <span class="chip">shared options</span>
                </div>
                <div class="card-actions">
                    <button class="cta-button" data-action="play-gamemode" data-gamemode-id="${escapeHtml(featured.id)}">${isAuthenticated() ? 'Launch play surface' : 'Sign in to launch'}</button>
                    ${featured.permissions && featured.permissions.canLocalTest ? `<button class="table-button" data-action="local-test-gamemode" data-gamemode-id="${escapeHtml(featured.id)}">Local test</button>` : ''}
                    <a class="table-button" href="/2d-world/editor/?direct=1&gamemode=${escapeHtml(featured.id)}${activeServer ? `&server=${escapeHtml(activeServer)}` : ''}">Open editor directly</a>
                </div>
            </article>
            <article class="detail-card">
                <h3>Linked surfaces</h3>
                <div class="kv-grid">
                    <div>
                        <strong>Play</strong>
                        <span class="muted">${escapeHtml(featured.surfaces && featured.surfaces.play || 'n/a')}</span>
                    </div>
                    <div>
                        <strong>Status</strong>
                        <span class="muted">${escapeHtml(featured.surfaces && featured.surfaces.status || 'n/a')}</span>
                    </div>
                    <div>
                        <strong>Editor shell</strong>
                        <span class="muted">${escapeHtml(featured.surfaces && featured.surfaces.editor || '/sourcevibe?view=editor')}</span>
                    </div>
                </div>
            </article>
        </div>
        <div class="editor-embed">
            ${isAuthenticated()
        ? `<iframe class="editor-embed__frame" src="${editorUrl}" title="${escapeHtml(featured.title)} editor"></iframe>`
        : `<div class="empty-card"><h3>Sign in to edit</h3><p class="muted">The unified SourceVibe shell is already in place. Sign in to load the collaborative editor workspace here.</p></div>`}
        </div>
    `;
}

function renderAddonsView() {
    const addons = state.bootstrap && state.bootstrap.addons || [];
    dom.views.addons.innerHTML = `
        <div class="detail-grid">
            <article class="detail-card">
                <h3>Addon registry</h3>
                <p class="muted">SourceVibe treats addons as engine-owned packages layered under the active gamemode. This view stays informational so the launcher directory doesn’t get buried under an old panel maze.</p>
                <div class="chip-row">
                    <span class="chip">count ${addons.length}</span>
                    <span class="chip">owner engine</span>
                </div>
            </article>
            <article class="detail-card">
                <h3>Shared boundaries</h3>
                <p class="muted">Inventory, HUD, building, travel, and world content stay inside the gamemode. SourceVibe owns launch orchestration, console, options, and package discovery.</p>
            </article>
        </div>
        <div class="addon-list" style="margin-top: 1rem;">
            ${addons.length ? addons.map((entry) => `
                <article class="addon-item">
                    <strong>${escapeHtml(entry.title || entry.name || entry.id)}</strong>
                    <div class="muted">${escapeHtml(entry.description || 'Addon package')}</div>
                </article>
            `).join('') : '<div class="empty-card"><h3>No addons reported</h3><p class="muted">Addon packages will appear here once they are registered with the engine.</p></div>'}
        </div>
    `;
}

function renderDiagnosticsView() {
    const rows = sortServers(state.bootstrap && state.bootstrap.servers || []).map((server) => `
        <tr>
            <td><strong>${escapeHtml(server.name)}</strong><br /><span class="muted mono">${escapeHtml(server.slug || server.id)}</span></td>
            <td>${escapeHtml(server.gamemode)}</td>
            <td>${escapeHtml(server.map)}</td>
            <td>${Number(server.players || 0)}/${Number(server.maxPlayers || 0)}</td>
            <td>${(server.tags || []).map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join(' ')}</td>
        </tr>
    `).join('');
    dom.views.diagnostics.innerHTML = `
        <div class="diagnostics-grid">
            <article class="stat-card">
                <h3>Prediction</h3>
                <div class="diagnostic-list">
                    <div class="diagnostic-row"><strong>Interpolation</strong><div class="muted">${Number(state.bootstrap && state.bootstrap.prediction && state.bootstrap.prediction.interpolation || 0).toFixed(3)}s</div></div>
                    <div class="diagnostic-row"><strong>Tickrate</strong><div class="muted">${escapeHtml(state.bootstrap && state.bootstrap.prediction && state.bootstrap.prediction.rates && state.bootstrap.prediction.rates.sv_tickrate || 'n/a')}</div></div>
                    <div class="diagnostic-row"><strong>Cmdrate</strong><div class="muted">${escapeHtml(state.bootstrap && state.bootstrap.prediction && state.bootstrap.prediction.rates && state.bootstrap.prediction.rates.cl_cmdrate || 'n/a')}</div></div>
                </div>
            </article>
            <article class="stat-card">
                <h3>Console quick start</h3>
                <div class="chip-row">
                    ${(sourcevibeConsole().commands || []).slice(0, 12).map((entry) => `<button class="pill" data-action="seed-console" data-command="${escapeHtml(entry.name)}">${escapeHtml(entry.name)}</button>`).join('')}
                </div>
                <p class="muted">Tap a command to prefill the shared console window, then tweak from there.</p>
            </article>
        </div>
        <div class="table-wrap" style="margin-top: 1rem;">
            <table class="server-table">
                <thead>
                    <tr>
                        <th>Server</th>
                        <th>Gamemode</th>
                        <th>Map</th>
                        <th>Players</th>
                        <th>Tags</th>
                    </tr>
                </thead>
                <tbody>${rows || '<tr><td colspan="5">No registered servers.</td></tr>'}</tbody>
            </table>
        </div>
    `;
}

function renderAll() {
    renderSessionCard();
    renderStatusStrip();
    renderHomeView();
    renderDirectoryView();
    renderEditorView();
    renderAddonsView();
    renderDiagnosticsView();
    setView(state.activeView, { updateUrl: false });
    updateWindows();
}

function bindEvents() {
    dom.nav.addEventListener('click', (event) => {
        const button = event.target.closest('[data-view]');
        if (!button) return;
        setView(button.dataset.view, { updateUrl: true });
    });

    document.body.addEventListener('click', async (event) => {
        const signInButton = event.target.closest('[data-action="sign-in"]');
        if (signInButton) {
            startSignIn();
            return;
        }
        const signOutButton = event.target.closest('[data-action="sign-out"]');
        if (signOutButton) {
            startSignOut();
            return;
        }
        const openAccountButton = event.target.closest('[data-action="open-account"]');
        if (openAccountButton) {
            window.location.assign(resolveSurfaceUrl('my'));
            return;
        }
        const openConsoleButton = event.target.closest('[data-action="open-console"]');
        if (openConsoleButton) {
            consoleWindow.open(buildConsoleModel());
            return;
        }
        const openOptionsButton = event.target.closest('[data-action="open-options"]');
        if (openOptionsButton) {
            optionsWindow.open(buildOptionsModel());
            return;
        }
        const playFeaturedButton = event.target.closest('[data-action="play-featured"]');
        if (playFeaturedButton && featuredEntry()) {
            await launchGamemode(featuredEntry().id, 'play');
            return;
        }
        const playButton = event.target.closest('[data-action="play-gamemode"]');
        if (playButton) {
            await launchGamemode(playButton.dataset.gamemodeId, 'play');
            return;
        }
        const localTestButton = event.target.closest('[data-action="local-test-gamemode"]');
        if (localTestButton) {
            await launchGamemode(localTestButton.dataset.gamemodeId, 'local-test');
            return;
        }
        const openGamemodeViewButton = event.target.closest('[data-action="open-gamemode-view"]');
        if (openGamemodeViewButton) {
            focusGamemodeView(openGamemodeViewButton.dataset.gamemodeId, openGamemodeViewButton.dataset.targetView || 'home');
            return;
        }
        const seedConsole = event.target.closest('[data-action="seed-console"]');
        if (seedConsole) {
            state.consoleCommand = seedConsole.dataset.command || '';
            refreshConsoleSuggestions();
            consoleWindow.open(buildConsoleModel());
            return;
        }
        const viewButton = event.target.closest('[data-view-target]');
        if (viewButton) {
            setView(viewButton.dataset.viewTarget || 'home', { updateUrl: true });
        }
    });

    window.addEventListener('keydown', (event) => {
        if (event.key === '`') {
            event.preventDefault();
            consoleWindow.toggle(undefined, buildConsoleModel());
            return;
        }
        if (event.key === 'F1') {
            event.preventDefault();
            optionsWindow.toggle(undefined, buildOptionsModel());
            return;
        }
        if (event.key === 'Escape' && windowManager.hasOpenWindows()) {
            event.preventDefault();
            windowManager.closeAll();
        }
    });
}

async function applyOptions() {
    state.options.settings = saveOptions(state.options.settings);
    for (const entry of sourcevibeConsole().binds || []) {
        const nextKey = normalizeToken(state.options.bindEdits[entry.command]);
        const currentKey = normalizeToken(entry.key);
        if (nextKey === currentKey) continue;
        if (currentKey) await runConsole(`unbind ${currentKey}`, { reload: false });
        if (nextKey) await runConsole(`bind ${nextKey} ${entry.command}`, { reload: false });
    }
    for (const entry of sourcevibeConsole().cvars || []) {
        const nextValue = state.options.cvarEdits[entry.name];
        if (nextValue == null || String(nextValue) === String(entry.value)) continue;
        await runConsole(`${entry.name} ${nextValue}`, { reload: false });
    }
    await loadData();
    setStatus('Shared SourceVibe options applied.', 'success');
    renderAll();
}

async function init() {
    setStatus('Booting SourceVibe engine shell…');
    await initializeOpenVibeAuth();
    state.auth = getAuthState();
    state.identity = currentIdentity();
    await loadData();
    pushConsole('system', isAuthenticated()
        ? 'SourceVibe Engine ready. The launcher is compact, and console/options now live in shared windows.'
        : 'SourceVibe Engine ready. Guests can browse the directory; sign in to unlock Play and Local Test actions.', 'info');
    bindEvents();
    renderAll();
    setStatus('SourceVibe engine shell online.', 'success');
}

init().catch((error) => {
    setStatus(error.message, 'error');
    console.error(error);
});
