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

const SOURCEVIBE_API = '/api/games/sourcevibe';

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

function sortGamemodes(gamemodes = []) {
    return [...gamemodes].sort((left, right) => {
        if (left.id === '2dworld' && right.id !== '2dworld') return -1;
        if (right.id === '2dworld' && left.id !== '2dworld') return 1;
        return String(left.title || left.id).localeCompare(String(right.title || right.id));
    });
}

function sortServers(servers = []) {
    return [...servers].sort((left, right) => {
        if (left.gamemode === '2dworld' && right.gamemode !== '2dworld') return -1;
        if (right.gamemode === '2dworld' && left.gamemode !== '2dworld') return 1;
        return String(left.name || left.id).localeCompare(String(right.name || right.id));
    });
}

const state = {
    auth: getAuthState(),
    identity: currentIdentity(),
    bootstrap: null,
    player: null,
    activePanel: 'launcher',
    consoleHistory: [],
    sv: null,
};

const dom = {
    sessionCard: document.getElementById('session-card'),
    nav: document.getElementById('sidebar-nav'),
    panels: {
        launcher: document.getElementById('panel-launcher'),
        servers: document.getElementById('panel-servers'),
        gamemodes: document.getElementById('panel-gamemodes'),
        console: document.getElementById('panel-console'),
        options: document.getElementById('panel-options'),
    },
    statusBanner: document.getElementById('status-banner'),
    quickLaunch: document.getElementById('quick-launch'),
    accountDock: document.getElementById('account-dock'),
    engineStats: document.getElementById('engine-stats'),
};

function setStatus(message, tone = 'neutral') {
    dom.statusBanner.textContent = message;
    dom.statusBanner.className = `status-banner${tone === 'neutral' ? '' : ` ${tone}`}`;
}

function setPanel(name) {
    state.activePanel = dom.panels[name] ? name : 'launcher';
    for (const [panelName, panel] of Object.entries(dom.panels)) {
        panel.classList.toggle('hidden', panelName !== state.activePanel);
    }
    for (const button of dom.nav.querySelectorAll('[data-panel]')) {
        button.classList.toggle('active', button.dataset.panel === state.activePanel);
    }
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

async function refreshAuth({ reloadBootstrap = true } = {}) {
    state.auth = await refreshOpenVibeAuth();
    state.identity = currentIdentity();
    if (reloadBootstrap) await loadBootstrap();
    return state.auth;
}

function requireSignIn(message) {
    if (isAuthenticated()) return true;
    const nextMessage = message || 'Sign in with OpenVibe to continue.';
    setStatus(nextMessage, 'warn');
    pushConsole('system', nextMessage, 'warn');
    return false;
}

async function loadBootstrap() {
    state.bootstrap = await apiJson(queryBootstrapUrl());
    state.player = state.bootstrap.player || null;
    state.auth = getAuthState();
    state.identity = currentIdentity();
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
}

async function runConsole(command) {
    if (commandMutatesState(command) && !isAuthenticated()) {
        const message = 'Sign in with OpenVibe before running launcher commands that change engine state.';
        setStatus(message, 'warn');
        pushConsole('system', message, 'warn');
        startSignIn();
        return { ok: false, error: message };
    }
    pushConsole('cmd', command, 'info');
    const result = await apiJson(`${SOURCEVIBE_API}/console/run`, {
        method: 'POST',
        body: JSON.stringify({ command }),
    });
    pushConsole('out', result.output || JSON.stringify(result, null, 2), result.ok === false ? 'error' : 'info');
    if (commandMutatesState(command)) {
        await loadBootstrap();
        renderAll();
    }
    return result;
}

async function connectServer(id) {
    if (!requireSignIn('Sign in with OpenVibe to launch a SourceVibe shard.')) {
        startSignIn();
        return { ok: false, error: 'authentication required' };
    }
    const result = await apiJson(`${SOURCEVIBE_API}/connect`, {
        method: 'POST',
        body: JSON.stringify({ id }),
    });
    setStatus(`Launching ${result.server.name}…`, 'success');
    window.location.href = result.launch.url;
}

async function createServer(formData) {
    if (!requireSignIn('Sign in with OpenVibe to create a launcher-managed test shard.')) {
        startSignIn();
        return { ok: false, error: 'authentication required' };
    }
    const payload = Object.fromEntries(formData.entries());
    payload.maxPlayers = Number(payload.maxPlayers) || 32;
    const result = await apiJson(`${SOURCEVIBE_API}/servers`, {
        method: 'POST',
        body: JSON.stringify(payload),
    });
    setStatus(`Created server ${result.server.name}.`, 'success');
    await loadBootstrap();
    renderAll();
    return result;
}

function hydrateSV() {
    const hook = createHookLibrary();
    const cvarMap = new Map((state.bootstrap.console.cvars || []).map((entry) => [entry.name, { ...entry }]));
    const bindMap = new Map((state.bootstrap.console.binds || []).map((entry) => [entry.key, entry.command]));
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
            list() { return state.bootstrap.gamemodes || []; },
            get(id) { return (state.bootstrap.gamemodes || []).find((entry) => entry.id === id) || null; },
            async activate(id) { return runConsole(`gamemode_run ${id}`); },
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
                await loadBootstrap();
                renderAll();
                return result;
            },
        },
        bind: {
            get(key) { return bindMap.get(key) || null; },
            async set(key, command) {
                const result = await runConsole(`bind ${key} ${command}`);
                await loadBootstrap();
                renderAll();
                return result;
            },
        },
        launcher: {
            async connect(id) { return connectServer(id); },
            openPanel(name) { setPanel(name); },
        },
    };
    window.SV = state.sv;
}

function renderEngineStats() {
    const user = sessionUser();
    const stats = [
        ['Engine', state.bootstrap.engine.name],
        ['Version', state.bootstrap.engine.version],
        ['Gamemode', state.bootstrap.gamemode && state.bootstrap.gamemode.title || 'Unknown'],
        ['Servers', String((state.bootstrap.servers || []).length)],
        ['Addons', String((state.bootstrap.addons || []).length)],
        ['Session', isAuthenticated() ? (user && (user.username || user.id) || 'signed in') : 'guest'],
        ['Interp', `${state.bootstrap.prediction.interpolation.toFixed(3)}s`],
    ];
    dom.engineStats.innerHTML = stats.map(([label, value]) => `
        <div class="stat-row">
            <span class="stat-label">${label}</span>
            <strong>${value}</strong>
        </div>
    `).join('');
}

function renderSessionCard() {
    const user = sessionUser();
    const player = state.bootstrap && state.bootstrap.player || state.player || null;
    if (!dom.sessionCard) return;
    dom.sessionCard.innerHTML = isAuthenticated()
        ? `
            <div class="identity-card__summary">
                <span class="eyebrow">OpenVibe session</span>
                <strong>${user && (user.display_name || user.username || user.id) || 'Signed in'}</strong>
                <span class="identity-card__meta">${user && (user.username || user.id) || 'user'} · role ${user && user.role || 'user'}</span>
                <span class="identity-card__hint">SourceVibe now launches with your real OpenVibe session instead of a browser-made local identity.</span>
            </div>
            <div class="identity-card__actions">
                <button class="cta-button" data-action="refresh-auth">Refresh session</button>
                <button class="table-button" data-action="open-account">Account</button>
                <button class="table-button" data-action="sign-out">Sign out</button>
            </div>
            ${player ? `<div class="identity-card__meta">Coins ${Number(player.coins || 0)} · total level ${Number(player.total_level || 1)}</div>` : ''}
        `
        : `
            <div class="identity-card__summary">
                <span class="eyebrow">OpenVibe session</span>
                <strong>Not signed in</strong>
                <span class="identity-card__hint">The old editable User ID form is gone. Sign in with OpenVibe to launch shards, create local test servers, and sync your SourceVibe profile correctly.</span>
            </div>
            <div class="identity-card__actions">
                <button class="cta-button" data-action="sign-in">Sign in with OpenVibe</button>
                <button class="table-button" data-action="open-account">Account hub</button>
            </div>
        `;
}

function renderAccountDock() {
    const user = sessionUser();
    const player = state.bootstrap && state.bootstrap.player || state.player || null;
    if (!dom.accountDock) return;
    dom.accountDock.innerHTML = isAuthenticated()
        ? `
            <div class="account-dock">
                <div class="account-dock__header">
                    <strong>${user && (user.display_name || user.username || user.id) || 'Signed in'}</strong>
                    <span class="account-dock__meta">${user && user.username || user && user.id || 'user'} · ${user && user.role || 'user'}</span>
                </div>
                <div class="account-dock__chips">
                    <span class="chip">coins ${Number(player && player.coins || 0)}</span>
                    <span class="chip">level ${Number(player && player.total_level || 1)}</span>
                </div>
                <div class="card-actions">
                    <button class="table-button" data-action="open-account">Account</button>
                    <button class="table-button" data-action="refresh-auth">Refresh</button>
                </div>
            </div>
        `
        : `
            <div class="account-dock">
                <div class="account-dock__header">
                    <strong>Session-aware launcher</strong>
                    <span class="account-dock__meta">Inventory and hotbar stay inside 2D World now. The engine shell just owns launch, directory, console, and options.</span>
                </div>
                <div class="card-actions">
                    <button class="cta-button" data-action="sign-in">Sign in</button>
                </div>
            </div>
        `;
}

function renderQuickLaunch() {
    const activeServer = state.bootstrap.activeServer || sortServers(state.bootstrap.servers || []).find((server) => server.gamemode === '2dworld') || sortServers(state.bootstrap.servers || [])[0] || null;
    if (!activeServer) {
        dom.quickLaunch.innerHTML = '<p class="muted">No SourceVibe servers are registered yet.</p>';
        return;
    }
    dom.quickLaunch.innerHTML = `
        <div class="quick-launch-card">
            <strong>${activeServer.name}</strong>
            <span class="muted">${activeServer.gamemode} · ${activeServer.map} · ${activeServer.players}/${activeServer.maxPlayers}</span>
            <div class="card-actions">
                <button class="cta-button" data-action="launch-server" data-server-id="${activeServer.id}">${isAuthenticated() ? 'Launch' : 'Sign in to launch'}</button>
                <button class="table-button" data-panel-target="servers">Browse all</button>
            </div>
        </div>
    `;
}

function renderLauncherPanel() {
    const gm = state.bootstrap.gamemode;
    const featuredGamemode = sortGamemodes(state.bootstrap.gamemodes || []).find((entry) => entry.id === '2dworld') || gm;
    const activeServer = state.bootstrap.activeServer || sortServers(state.bootstrap.servers || []).find((server) => server.gamemode === '2dworld') || sortServers(state.bootstrap.servers || [])[0] || null;
    const launcherRoute = gm && gm.routes && gm.routes.launcher ? gm.routes.launcher : '/sourcevibe';
    dom.panels.launcher.innerHTML = `
        <div class="hero-card">
            <div>
                <p class="eyebrow">Featured SourceVibe experience</p>
                <h2>${featuredGamemode ? featuredGamemode.title : gm ? gm.title : 'Unknown gamemode'}</h2>
                <p class="muted">${featuredGamemode ? featuredGamemode.description : gm ? gm.description : 'No active gamemode is loaded.'}</p>
            </div>
            <div class="chip-row">
                ${sortGamemodes(state.bootstrap.gamemodes || []).map((entry) => `<span class="chip">${entry.title}</span>`).join('')}
            </div>
            <div class="hero-actions">
                ${activeServer ? `<button class="cta-button" data-action="launch-server" data-server-id="${activeServer.id}">${isAuthenticated() ? `Play ${activeServer.name}` : 'Sign in to play'}</button>` : ''}
                ${featuredGamemode && featuredGamemode.routes && featuredGamemode.routes.play ? `<a class="cta-button" href="${featuredGamemode.routes.play}">Open play route</a>` : gm && gm.routes && gm.routes.play ? `<a class="cta-button" href="${gm.routes.play}">Open play route</a>` : ''}
                ${featuredGamemode && featuredGamemode.routes && featuredGamemode.routes.status ? `<a class="table-button" href="${featuredGamemode.routes.status}">Status</a>` : gm && gm.routes && gm.routes.status ? `<a class="table-button" href="${gm.routes.status}">Status</a>` : ''}
                ${featuredGamemode && featuredGamemode.routes && featuredGamemode.routes.editor ? `<a class="table-button" href="${featuredGamemode.routes.editor}">Editor</a>` : gm && gm.routes && gm.routes.editor ? `<a class="table-button" href="${gm.routes.editor}">Editor</a>` : ''}
                <a class="table-button" href="${launcherRoute}">Refresh launcher</a>
            </div>
        </div>

        <div class="grid-three">
            <article class="feature-card">
                <p class="stat-label">Current server</p>
                <div class="feature-value">${activeServer ? activeServer.name : 'None'}</div>
                <p class="muted">${activeServer ? `${activeServer.gamemode} on ${activeServer.map}` : 'Create one below or use the official route.'}</p>
            </article>
            <article class="feature-card">
                <p class="stat-label">Registered gamemodes</p>
                <div class="feature-value">${(state.bootstrap.gamemodes || []).length}</div>
                <p class="muted">2D World is pinned first, with other SourceVibe gamemodes listed below it.</p>
            </article>
            <article class="feature-card">
                <p class="stat-label">Installed addons</p>
                <div class="feature-value">${(state.bootstrap.addons || []).length}</div>
                <p class="muted">SourceVibe wraps persisted game mods as engine addons.</p>
            </article>
        </div>

        <div class="grid-two">
            <article class="server-card">
                <h3>Engine API namespaces</h3>
                <div class="chip-row">
                    ${(state.bootstrap.engine.api || []).map((entry) => `<span class="chip">SV.${entry}</span>`).join('')}
                </div>
                <p class="muted">Open devtools and poke <code>window.SV</code>. The engine shell now exposes hooks, console, cvars, binds, gamemodes, addons, and launch helpers—while inventory and hotbar stay owned by the active gamemode.</p>
            </article>
            <article class="server-card">
                <h3>Session-aware launch flow</h3>
                <p class="muted">SourceVibe now reads your OpenVibe session instead of a local identity form. Use the server browser for launcher-managed test shards and use the gamemode routes for the real in-world UI.</p>
                <div class="chip-row">
                    <span class="chip">session ${isAuthenticated() ? 'authenticated' : 'guest'}</span>
                    <span class="chip">account ${sessionUser() && (sessionUser().username || sessionUser().id) || 'not linked'}</span>
                </div>
            </article>
        </div>
    `;
}

function renderServersPanel() {
    const rows = sortServers(state.bootstrap.servers || []).map((server) => `
        <tr>
            <td>
                <strong>${server.name}</strong><br />
                <span class="muted">${server.slug}</span>
            </td>
            <td>${server.gamemode}</td>
            <td>${server.map}</td>
            <td>${server.players}/${server.maxPlayers}</td>
            <td>${(server.tags || []).map((tag) => `<span class="chip">${tag}</span>`).join(' ')}</td>
            <td>
                <div class="inline-actions">
                    <button class="table-button" data-action="launch-server" data-server-id="${server.id}">Launch</button>
                    ${server.statusRoute ? `<a class="table-button" href="${server.statusRoute}">Status</a>` : ''}
                    ${server.editorRoute ? `<a class="table-button" href="${server.editorRoute}">Editor</a>` : ''}
                </div>
            </td>
        </tr>
    `).join('');
    dom.panels.servers.innerHTML = `
        <div class="table-wrap">
            <table class="server-table">
                <thead>
                    <tr>
                        <th>Server</th>
                        <th>Gamemode</th>
                        <th>Map</th>
                        <th>Players</th>
                        <th>Tags</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>${rows || '<tr><td colspan="6">No servers yet.</td></tr>'}</tbody>
            </table>
        </div>
        <div class="grid-two" style="margin-top: 1rem;">
            <article class="server-card">
                <h3>Local test shard</h3>
                ${isAuthenticated() ? `
                    <form id="create-server-form" class="server-form">
                        <label>
                            <span class="muted">Server name</span>
                            <input name="name" placeholder="My SourceVibe shard" required />
                        </label>
                        <label>
                            <span class="muted">Gamemode</span>
                            <select name="gamemode">
                                ${sortGamemodes(state.bootstrap.gamemodes || []).map((entry) => `<option value="${entry.id}">${entry.title}</option>`).join('')}
                            </select>
                        </label>
                        <label>
                            <span class="muted">Map</span>
                            <select name="map">
                                ${(state.bootstrap.maps || []).map((entry) => `<option value="${entry.id}">${entry.title || entry.name || entry.id}</option>`).join('')}
                            </select>
                        </label>
                        <label>
                            <span class="muted">Max players</span>
                            <input name="maxPlayers" type="number" min="1" max="128" value="32" />
                        </label>
                        <label class="full">
                            <span class="muted">Description</span>
                            <input name="description" placeholder="Small sandbox with tasteful chaos." />
                        </label>
                        <div class="full inline-actions">
                            <button type="submit">Create test shard</button>
                        </div>
                    </form>
                ` : `
                    <p class="muted">Creating launcher-managed test shards now follows your OpenVibe session. Sign in first so the server is attached to a real account instead of a browser-made ID.</p>
                    <div class="inline-actions">
                        <button class="cta-button" data-action="sign-in">Sign in with OpenVibe</button>
                    </div>
                `}
            </article>
            <article class="server-card">
                <h3>Official route</h3>
                <p class="muted">The flagship 2D World shard still lives behind the gamemode play route. Use launcher-managed shards here for deliberate testing, not as a replacement for in-world UI.</p>
                <div class="inline-actions">
                    <a class="table-button" href="/2d-world">Open 2D World</a>
                    <a class="table-button" href="/2d-world/status">Runtime status</a>
                </div>
            </article>
        </div>
    `;
}

function renderGamemodesPanel() {
    dom.panels.gamemodes.innerHTML = `
        <div class="grid-two">
            ${sortGamemodes(state.bootstrap.gamemodes || []).map((entry) => `
                <article class="gamemode-card">
                    <p class="eyebrow">${entry.id === '2dworld' ? 'Featured gamemode' : entry.active ? 'Active gamemode' : 'Available gamemode'}</p>
                    <h3>${entry.title}</h3>
                    <p class="muted">${entry.description}</p>
                    <div class="chip-row">
                        <span class="chip">id: ${entry.id}</span>
                        <span class="chip">base: ${entry.base || 'none'}</span>
                        ${(entry.maps || []).map((map) => `<span class="chip">map: ${map}</span>`).join('')}
                    </div>
                    <div class="card-actions">
                        <button class="cta-button" data-action="activate-gamemode" data-gamemode-id="${entry.id}">${entry.active ? 'Active' : 'Make active'}</button>
                        ${entry.routes && entry.routes.play ? `<a class="table-button" href="${entry.routes.play}">Open route</a>` : ''}
                        ${entry.routes && entry.routes.launcher ? `<a class="table-button" href="${entry.routes.launcher}">Launcher route</a>` : ''}
                    </div>
                </article>
            `).join('')}
        </div>
    `;
}

function renderConsolePanel() {
    dom.panels.console.innerHTML = `
        <div class="console-card">
            <div class="console-output">${state.consoleHistory.map((entry) => `
                <div class="console-entry ${entry.level}">
                    <div class="meta">${entry.at} · ${entry.origin}</div>
                    <div>${String(entry.output).replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]))}</div>
                </div>
            `).join('') || '<div class="muted">Console is ready. Try <strong>help</strong>, <strong>status</strong>, or <strong>gamemode_list</strong>.</div>'}</div>
            <form id="console-form" class="console-row">
                <input class="console-input" id="console-command" placeholder="Enter command, e.g. connect world_xxxxx or net_graph 1" />
                <button class="console-submit" type="submit">Run</button>
            </form>
            <div class="chip-row">
                ${(state.bootstrap.console.commands || []).slice(0, 10).map((entry) => `<button class="table-button" data-action="console-fill" data-command="${entry.name}">${entry.name}</button>`).join('')}
            </div>
        </div>
    `;
}

function renderOptionsPanel() {
    const optionNames = ['net_graph', 'cl_showfps', 'cl_showerror', 'cl_interp', 'cl_interp_ratio', 'cl_updaterate', 'cl_cmdrate', 'rate', 'sv_tickrate', 'sv_snapshotrate', 'sv_maxunlag'];
    const options = (state.bootstrap.console.cvars || []).filter((entry) => optionNames.includes(entry.name));
    dom.panels.options.innerHTML = `
        <form id="options-form" class="options-grid">
            ${options.map((entry) => `
                <div class="option-card">
                    <label class="option-control">
                        <strong>${entry.name}</strong>
                        <span class="muted">${entry.description || 'Engine cvar'}</span>
                        <input name="${entry.name}" value="${entry.value}" />
                    </label>
                </div>
            `).join('')}
            <div class="option-actions">
                <button class="option-button" type="submit">Apply options</button>
            </div>
        </form>
    `;
}

function renderInventoryPanel() {
    if (!dom.panels.inventory) return;
    dom.panels.inventory.innerHTML = `
        <div class="hero-card">
            <h2>Inventory moved into the gamemode</h2>
            <p class="muted">SourceVibe no longer renders a shell-owned backpack or hotbar. Open the active gamemode route to use the real in-world inventory UI.</p>
            <div class="hero-actions">
                <a class="cta-button" href="/2d-world">Open 2D World</a>
            </div>
        </div>
    `;
}

function renderAll() {
    renderSessionCard();
    renderAccountDock();
    renderEngineStats();
    renderQuickLaunch();
    renderLauncherPanel();
    renderServersPanel();
    renderGamemodesPanel();
    renderConsolePanel();
    renderOptionsPanel();
    setPanel(state.activePanel);
}

function bindEvents() {
    dom.nav.addEventListener('click', (event) => {
        const button = event.target.closest('[data-panel]');
        if (!button) return;
        setPanel(button.dataset.panel);
    });

    document.body.addEventListener('click', async (event) => {
        const launchButton = event.target.closest('[data-action="launch-server"]');
        if (launchButton) {
            try {
                await connectServer(launchButton.dataset.serverId);
            } catch (error) {
                setStatus(error.message, 'error');
                pushConsole('system', error.message, 'error');
                renderAll();
            }
            return;
        }
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
        const refreshAuthButton = event.target.closest('[data-action="refresh-auth"]');
        if (refreshAuthButton) {
            try {
                await refreshAuth();
                renderAll();
                setStatus(isAuthenticated() ? 'OpenVibe session refreshed.' : 'No active OpenVibe session found.', isAuthenticated() ? 'success' : 'warn');
            } catch (error) {
                setStatus(error.message, 'error');
                pushConsole('system', error.message, 'error');
            }
            return;
        }
        const openAccountButton = event.target.closest('[data-action="open-account"]');
        if (openAccountButton) {
            window.location.assign(resolveSurfaceUrl('my'));
            return;
        }
        const activateGamemodeButton = event.target.closest('[data-action="activate-gamemode"]');
        if (activateGamemodeButton) {
            try {
                await runConsole(`gamemode_run ${activateGamemodeButton.dataset.gamemodeId}`);
                setStatus(`Activated ${activateGamemodeButton.dataset.gamemodeId}.`, 'success');
                renderAll();
            } catch (error) {
                setStatus(error.message, 'error');
            }
            return;
        }
        const consoleFill = event.target.closest('[data-action="console-fill"]');
        if (consoleFill) {
            const input = document.getElementById('console-command');
            if (input) input.value = consoleFill.dataset.command;
            setPanel('console');
            return;
        }
        const panelButton = event.target.closest('[data-panel-target]');
        if (panelButton) {
            setPanel(panelButton.dataset.panelTarget);
        }
    });

    document.body.addEventListener('submit', async (event) => {
        const createServerForm = event.target.closest('#create-server-form');
        if (createServerForm) {
            event.preventDefault();
            try {
                await createServer(new FormData(createServerForm));
                setPanel('servers');
            } catch (error) {
                setStatus(error.message, 'error');
                pushConsole('system', error.message, 'error');
                renderAll();
            }
            return;
        }
        const consoleForm = event.target.closest('#console-form');
        if (consoleForm) {
            event.preventDefault();
            const input = document.getElementById('console-command');
            if (!input || !input.value.trim()) return;
            try {
                await runConsole(input.value.trim());
                input.value = '';
                renderAll();
            } catch (error) {
                setStatus(error.message, 'error');
                pushConsole('system', error.message, 'error');
                renderAll();
            }
            return;
        }
        const optionsForm = event.target.closest('#options-form');
        if (optionsForm) {
            event.preventDefault();
            const data = new FormData(optionsForm);
            try {
                for (const [name, value] of data.entries()) {
                    await runConsole(`${name} ${value}`);
                }
                setStatus('Options applied.', 'success');
                renderAll();
            } catch (error) {
                setStatus(error.message, 'error');
                renderAll();
            }
        }
    });
}

async function init() {
    setStatus('Booting SourceVibe engine shell…');
    await initializeOpenVibeAuth();
    state.auth = getAuthState();
    state.identity = currentIdentity();
    await loadBootstrap();
    pushConsole('system', isAuthenticated()
        ? 'SourceVibe Engine ready. `window.SV` is available and your OpenVibe session is attached.'
        : 'SourceVibe Engine ready. Sign in with OpenVibe to launch shards and create session-backed test servers.', 'info');
    bindEvents();
    renderAll();
    setStatus('SourceVibe engine shell online.', 'success');
}

init().catch((error) => {
    setStatus(error.message, 'error');
    console.error(error);
});
