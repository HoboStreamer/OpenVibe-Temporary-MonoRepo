const SOURCEVIBE_API = '/api/games/sourcevibe';
const GAMES_API = '/api/games';
const STORAGE_KEY = 'openvibe.sourcevibe.identity.v1';

function loadIdentity() {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch {}
    const suffix = Math.random().toString(36).slice(2, 8);
    return {
        userId: `sourcevibe-${suffix}`,
        displayName: `Citizen ${suffix}`,
        role: 'user',
    };
}

function saveIdentity(identity) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
}

function buildHeaders(identity) {
    return {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-OpenVibe-User-Id': identity.userId,
        'X-OpenVibe-Display-Name': identity.displayName,
        'X-OpenVibe-User-Role': identity.role || 'user',
    };
}

async function apiJson(path, options = {}, identity = state.identity) {
    const response = await fetch(path, Object.assign({}, options, {
        headers: Object.assign({}, buildHeaders(identity), options.headers || {}),
    }));
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
        const error = new Error(body && body.error ? body.error : `Request failed (${response.status})`);
        error.status = response.status;
        error.body = body;
        throw error;
    }
    return body;
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
    identity: loadIdentity(),
    bootstrap: null,
    inventory: [],
    bank: [],
    player: null,
    activePanel: 'launcher',
    consoleHistory: [],
    sv: null,
};

const dom = {
    identityForm: document.getElementById('identity-form'),
    identityUserId: document.getElementById('identity-user-id'),
    identityDisplayName: document.getElementById('identity-display-name'),
    nav: document.getElementById('sidebar-nav'),
    panels: {
        launcher: document.getElementById('panel-launcher'),
        servers: document.getElementById('panel-servers'),
        gamemodes: document.getElementById('panel-gamemodes'),
        console: document.getElementById('panel-console'),
        options: document.getElementById('panel-options'),
        inventory: document.getElementById('panel-inventory'),
    },
    statusBanner: document.getElementById('status-banner'),
    quickLaunch: document.getElementById('quick-launch'),
    hotbar: document.getElementById('hotbar-grid'),
    engineStats: document.getElementById('engine-stats'),
};

function setStatus(message, tone = 'neutral') {
    dom.statusBanner.textContent = message;
    dom.statusBanner.className = `status-banner${tone === 'neutral' ? '' : ` ${tone}`}`;
}

function setPanel(name) {
    state.activePanel = name;
    for (const [panelName, panel] of Object.entries(dom.panels)) {
        panel.classList.toggle('hidden', panelName !== name);
    }
    for (const button of dom.nav.querySelectorAll('[data-panel]')) {
        button.classList.toggle('active', button.dataset.panel === name);
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

async function loadBootstrap() {
    state.bootstrap = await apiJson(queryBootstrapUrl());
    state.player = state.bootstrap.player || null;
    hydrateSV();
}

async function loadPlayerData() {
    if (!state.identity.userId) return;
    try {
        const [playerRes, inventoryRes, bankRes] = await Promise.all([
            apiJson(`${GAMES_API}/player/${encodeURIComponent(state.identity.userId)}`),
            apiJson(`${GAMES_API}/inventory/${encodeURIComponent(state.identity.userId)}`),
            apiJson(`${GAMES_API}/bank/${encodeURIComponent(state.identity.userId)}`),
        ]);
        state.player = playerRes.player;
        state.inventory = inventoryRes.items || [];
        state.bank = bankRes.items || [];
    } catch (error) {
        pushConsole('system', error.message, 'error');
    }
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
    pushConsole('cmd', command, 'info');
    const result = await apiJson(`${SOURCEVIBE_API}/console/run`, {
        method: 'POST',
        body: JSON.stringify({ command }),
    });
    pushConsole('out', result.output || JSON.stringify(result, null, 2), result.ok === false ? 'error' : 'info');
    if (commandMutatesState(command)) {
        await loadBootstrap();
        await loadPlayerData();
        renderAll();
    }
    return result;
}

async function connectServer(id) {
    const result = await apiJson(`${SOURCEVIBE_API}/connect`, {
        method: 'POST',
        body: JSON.stringify({ id }),
    });
    setStatus(`Launching ${result.server.name}…`, 'success');
    window.location.href = result.launch.url;
}

async function createServer(formData) {
    const payload = Object.fromEntries(formData.entries());
    payload.maxPlayers = Number(payload.maxPlayers) || 32;
    const result = await apiJson(`${SOURCEVIBE_API}/servers`, {
        method: 'POST',
        body: JSON.stringify(payload),
    });
    setStatus(`Created server ${result.server.name}.`, 'success');
    await loadBootstrap();
    renderAll();
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
    const stats = [
        ['Engine', state.bootstrap.engine.name],
        ['Version', state.bootstrap.engine.version],
        ['Gamemode', state.bootstrap.gamemode && state.bootstrap.gamemode.title || 'Unknown'],
        ['Servers', String((state.bootstrap.servers || []).length)],
        ['Addons', String((state.bootstrap.addons || []).length)],
        ['Interp', `${state.bootstrap.prediction.interpolation.toFixed(3)}s`],
    ];
    dom.engineStats.innerHTML = stats.map(([label, value]) => `
        <div class="stat-row">
            <span class="stat-label">${label}</span>
            <strong>${value}</strong>
        </div>
    `).join('');
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
                <button class="cta-button" data-action="launch-server" data-server-id="${activeServer.id}">Launch</button>
                <button class="table-button" data-panel-target="servers">Browse all</button>
            </div>
        </div>
    `;
}

function renderHotbar() {
    const layout = state.bootstrap.inventory && state.bootstrap.inventory.layout || { hotbar: 9 };
    const hotbar = Array.isArray(state.bootstrap.inventory && state.bootstrap.inventory.hotbar) ? state.bootstrap.inventory.hotbar : [];
    dom.hotbar.innerHTML = Array.from({ length: Number(layout.hotbar) || 9 }, (_, index) => {
        const item = hotbar[index];
        return `
            <div class="hotbar-slot">
                <strong>${index + 1}</strong>
                <span>${item && item.name || item && item.item_id || 'Empty'}</span>
                <small>${item && item.quantity ? `x${item.quantity}` : 'unbound'}</small>
            </div>
        `;
    }).join('');
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
                ${activeServer ? `<button class="cta-button" data-action="launch-server" data-server-id="${activeServer.id}">Play ${activeServer.name}</button>` : ''}
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
                <h3>Create a server</h3>
                <form id="create-server-form" class="server-form">
                    <label>
                        <span class="muted">Server name</span>
                        <input name="name" placeholder="My SourceVibe shard" required />
                    </label>
                    <label>
                        <span class="muted">Gamemode</span>
                        <select name="gamemode">
                            ${sortGamemodes(state.bootstrap.gamemodes || []).map((entry) => `<option value="${entry.id}" ${(featuredGamemode && featuredGamemode.id === entry.id) || (gm && gm.id === entry.id) ? 'selected' : ''}>${entry.title}</option>`).join('')}
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
                        <button type="submit">Create server</button>
                    </div>
                </form>
            </article>

            <article class="server-card">
                <h3>Engine API namespaces</h3>
                <div class="chip-row">
                    ${(state.bootstrap.engine.api || []).map((entry) => `<span class="chip">SV.${entry}</span>`).join('')}
                </div>
                <p class="muted">Open devtools and poke <code>window.SV</code>. The engine shell now exposes hooks, console, cvars, binds, gamemodes, addons, and launch helpers.</p>
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
    const layout = state.bootstrap.inventory && state.bootstrap.inventory.layout || { rows: 4, cols: 6, hotbar: 9 };
    const slots = Number(layout.rows) * Number(layout.cols);
    const items = state.inventory.slice(0, slots);
    const cells = Array.from({ length: slots }, (_, index) => {
        const item = items[index];
        return `
            <div class="slot">
                <strong>${item ? item.item_id : `Slot ${index + 1}`}</strong>
                <span>${item ? item.metadata && item.metadata.name || item.item_id : 'Empty'}</span>
                <small>${item ? `x${item.quantity}` : 'available'}</small>
            </div>
        `;
    }).join('');
    const bank = state.bank.slice(0, 8).map((item) => `
        <div class="bank-slot">
            <strong>${item.item_id}</strong>
            <span>${item.metadata && item.metadata.name || item.item_id}</span>
            <small>x${item.quantity}</small>
        </div>
    `).join('') || '<div class="muted">Bank is empty.</div>';
    dom.panels.inventory.innerHTML = `
        <div class="inventory-layout">
            <section class="inventory-column">
                <h3>Grid inventory</h3>
                <p class="muted">${layout.rows}×${layout.cols} backpack with a ${layout.hotbar}-slot hotbar dock.</p>
                <div class="slot-grid">${cells}</div>
            </section>
            <section class="inventory-column">
                <div class="coin-slot">
                    <strong>Coins</strong>
                    <span>${state.player && state.player.coins || 0}</span>
                    <small>Dedicated currency stack</small>
                </div>
                <h3 style="margin-top:1rem;">Bank snapshot</h3>
                <div class="bank-grid">${bank}</div>
            </section>
        </div>
    `;
}

function renderAll() {
    renderEngineStats();
    renderQuickLaunch();
    renderHotbar();
    renderLauncherPanel();
    renderServersPanel();
    renderGamemodesPanel();
    renderConsolePanel();
    renderOptionsPanel();
    renderInventoryPanel();
    setPanel(state.activePanel);
}

function bindEvents() {
    dom.identityUserId.value = state.identity.userId;
    dom.identityDisplayName.value = state.identity.displayName;

    dom.identityForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        state.identity = {
            userId: dom.identityUserId.value.trim() || state.identity.userId,
            displayName: dom.identityDisplayName.value.trim() || state.identity.displayName,
            role: 'user',
        };
        saveIdentity(state.identity);
        setStatus(`Identity updated to ${state.identity.displayName}.`, 'success');
        await loadBootstrap();
        await loadPlayerData();
        renderAll();
    });

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
    await loadBootstrap();
    await loadPlayerData();
    pushConsole('system', 'SourceVibe Engine ready. `window.SV` is available for scripts.', 'info');
    bindEvents();
    renderAll();
    setStatus('SourceVibe engine shell online.', 'success');
}

init().catch((error) => {
    setStatus(error.message, 'error');
    console.error(error);
});
