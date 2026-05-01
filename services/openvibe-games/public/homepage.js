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
import { escapeHtml } from '/sourcevibe-shared/ui/dom.js';

const SOURCEVIBE_API = '/api/games/sourcevibe';

const dom = {
    session: document.getElementById('homepage-session'),
    statusStrip: document.getElementById('homepage-status-strip'),
    hero: document.getElementById('homepage-hero'),
    directory: document.getElementById('homepage-directory'),
    notes: document.getElementById('homepage-notes'),
};

const state = {
    auth: getAuthState(),
    identity: currentIdentity(),
    bootstrap: null,
    directory: [],
};

function isAuthenticated() {
    return !!(state.auth && state.auth.session && state.auth.session.authenticated);
}

function sessionUser() {
    return state.auth && state.auth.session && state.auth.session.user || null;
}

function featuredEntry() {
    const items = [...(state.directory || [])].sort((left, right) => {
        if (left.featured && !right.featured) return -1;
        if (right.featured && !left.featured) return 1;
        if (left.id === '2dworld' && right.id !== '2dworld') return -1;
        if (right.id === '2dworld' && left.id !== '2dworld') return 1;
        return String(left.title || left.id).localeCompare(String(right.title || right.id));
    });
    return items[0] || null;
}

async function apiJson(path, options = {}) {
    return gamesApiJson(path, options);
}

async function loadData() {
    const [bootstrap, directory] = await Promise.all([
        apiJson(`${SOURCEVIBE_API}/bootstrap`),
        apiJson(`${SOURCEVIBE_API}/directory`),
    ]);
    state.bootstrap = bootstrap;
    state.directory = bootstrap.directory || directory.items || [];
    state.auth = getAuthState();
    state.identity = currentIdentity();
}

async function launchGamemode(id, mode = 'play') {
    if (!isAuthenticated()) {
        startSignIn();
        return;
    }
    const result = await apiJson(`${SOURCEVIBE_API}/gamemodes/${encodeURIComponent(id)}/${mode === 'local-test' ? 'local-test' : 'play'}`, {
        method: 'POST',
        body: JSON.stringify({}),
    });
    window.location.assign(result.launch.url);
}

function renderSession() {
    const user = sessionUser();
    dom.session.innerHTML = isAuthenticated()
        ? `
            <div class="homepage-session__summary">
                <span class="eyebrow">OpenVibe session</span>
                <strong>${escapeHtml(user && (user.display_name || user.username || user.id) || 'Signed in')}</strong>
                <span class="homepage-meta">${escapeHtml(user && (user.username || user.id) || 'user')} · role ${escapeHtml(user && user.role || 'user')}</span>
                <span class="homepage-copy">Launches, local tests, and directory permissions resolve from your real session actor.</span>
            </div>
            <div class="homepage-button-row">
                <button class="homepage-button" data-action="play-featured">Play 2D World</button>
                <a class="homepage-button--secondary" href="${resolveSurfaceUrl('my')}">Account</a>
                <button class="homepage-button--ghost" data-action="sign-out">Sign out</button>
            </div>
        `
        : `
            <div class="homepage-session__summary">
                <span class="eyebrow">OpenVibe session</span>
                <strong>Browse mode</strong>
                <span class="homepage-copy">The fake operator dashboard is gone. Browse the directory, then sign in when you want to play or spin up a local test shard.</span>
            </div>
            <div class="homepage-button-row">
                <button class="homepage-button" data-action="sign-in">Sign in with OpenVibe</button>
                <a class="homepage-button--secondary" href="/sourcevibe">Open engine shell</a>
            </div>
        `;
}

function renderStatusStrip() {
    const officialCount = (state.directory || []).filter((entry) => entry.officialServer).length;
    const featured = featuredEntry();
    const pills = [
        {
            label: 'Engine',
            value: escapeHtml(state.bootstrap && state.bootstrap.engine && state.bootstrap.engine.name || 'SourceVibe Engine'),
            meta: escapeHtml(state.bootstrap && state.bootstrap.engine && state.bootstrap.engine.version || 'runtime'),
        },
        {
            label: 'Featured',
            value: escapeHtml(featured && featured.title || '2D World'),
            meta: escapeHtml(featured && featured.officialServer && featured.officialServer.name || 'flagship surface'),
        },
        {
            label: 'Gamemode packages',
            value: String((state.directory || []).length),
            meta: 'Directory entries',
        },
        {
            label: 'Official play routes',
            value: String(officialCount),
            meta: isAuthenticated() ? 'Session linked' : 'Guest browse mode',
        },
    ];
    dom.statusStrip.innerHTML = pills.map((pill) => `
        <article class="homepage-status-pill">
            <span class="eyebrow">${pill.label}</span>
            <strong>${pill.value}</strong>
            <span class="homepage-muted">${pill.meta}</span>
        </article>
    `).join('');
}

function renderHero() {
    const featured = featuredEntry();
    const official = featured && featured.officialServer || null;
    dom.hero.innerHTML = `
        <div class="homepage-hero__copy">
            <span class="eyebrow">OpenVibe Games front door</span>
            <h1>SourceVibe is the engine.<br />2D World is a gamemode package.</h1>
            <p class="homepage-copy">This homepage now points you at the engine shell, the gamemode directory, and the real 2D World surfaces—without the old spoofable user fields or operator dashboard detours.</p>
            <div class="homepage-button-row">
                ${featured ? `<button class="homepage-button" data-action="play-gamemode" data-gamemode-id="${escapeHtml(featured.id)}">${isAuthenticated() ? `Play ${escapeHtml(featured.title)}` : 'Sign in to play'}</button>` : ''}
                <a class="homepage-button--secondary" href="/sourcevibe">Open SourceVibe directory</a>
                <a class="homepage-button--ghost" href="/2d-world/status">2D World status</a>
            </div>
        </div>
        <aside class="homepage-hero__featured">
            <span class="eyebrow">Featured surface</span>
            <h2>${escapeHtml(featured && featured.title || '2D World')}</h2>
            <p class="homepage-copy">${escapeHtml(featured && featured.description || 'The flagship sandbox package running on the SourceVibe engine.')}</p>
            <div class="homepage-kv">
                <div>
                    <strong>Official shard</strong>
                    <span class="homepage-muted">${escapeHtml(official && official.name || 'No official server descriptor')}</span>
                </div>
                <div>
                    <strong>Players</strong>
                    <span class="homepage-muted">${official && official.maxPlayers ? `${Number(official.players || 0)}/${Number(official.maxPlayers || 0)}` : 'n/a'}</span>
                </div>
                <div>
                    <strong>Map</strong>
                    <span class="homepage-muted">${escapeHtml(official && official.map || featured && featured.maps && featured.maps[0] || 'n/a')}</span>
                </div>
            </div>
            <div class="homepage-chip-row">
                ${(featured && featured.maps || []).map((map) => `<span class="homepage-chip">map ${escapeHtml(map)}</span>`).join('')}
                ${featured && featured.featured ? '<span class="homepage-chip homepage-chip--accent">featured</span>' : ''}
            </div>
        </aside>
    `;
}

function renderDirectory() {
    const items = state.directory || [];
    dom.directory.innerHTML = items.length ? items.map((entry) => {
        const official = entry.officialServer || {};
        const permissions = entry.permissions || {};
        return `
            <article class="homepage-card">
                <div>
                    <span class="eyebrow">${entry.featured ? 'Featured gamemode' : 'Gamemode package'}</span>
                    <h3>${escapeHtml(entry.title)}</h3>
                </div>
                <p class="homepage-copy">${escapeHtml(entry.description || 'No description provided.')}</p>
                <div class="homepage-chip-row">
                    <span class="homepage-chip ${entry.active ? 'homepage-chip--accent' : ''}">${entry.active ? 'active' : 'available'}</span>
                    <span class="homepage-chip">base ${escapeHtml(entry.base || 'none')}</span>
                    ${(entry.maps || []).map((map) => `<span class="homepage-chip">${escapeHtml(map)}</span>`).join('')}
                </div>
                <div class="homepage-kv">
                    <div>
                        <strong>Play</strong>
                        <span class="homepage-muted">${escapeHtml(permissions.playReason || 'Launch available.')}</span>
                    </div>
                    <div>
                        <strong>Official shard</strong>
                        <span class="homepage-muted">${escapeHtml(official.name || 'none')}</span>
                    </div>
                </div>
                <div class="homepage-button-row">
                    <button class="homepage-button" data-action="play-gamemode" data-gamemode-id="${escapeHtml(entry.id)}">${permissions.canPlay ? 'Play' : 'Sign in to play'}</button>
                    ${permissions.canLocalTest ? `<button class="homepage-button--secondary" data-action="local-test-gamemode" data-gamemode-id="${escapeHtml(entry.id)}">Local test</button>` : ''}
                    ${entry.surfaces && entry.surfaces.editor ? `<a class="homepage-button--ghost" href="${entry.surfaces.editor}">Editor</a>` : ''}
                </div>
                <div class="homepage-surface-list">
                    ${entry.surfaces && entry.surfaces.play ? `<a href="${entry.surfaces.play}">Play route</a>` : ''}
                    ${entry.surfaces && entry.surfaces.status ? `<a href="${entry.surfaces.status}">Status route</a>` : ''}
                    ${entry.surfaces && entry.surfaces.launcher ? `<a href="${entry.surfaces.launcher}">Launcher route</a>` : ''}
                </div>
            </article>
        `;
    }).join('') : '<div class="homepage-empty"><h3>No gamemode packages are registered yet.</h3><p class="homepage-muted">Once the engine manifest loads, this directory becomes the single source of truth for available surfaces.</p></div>';
}

function renderNotes() {
    dom.notes.innerHTML = `
        <article class="homepage-card">
            <h3>What changed</h3>
            <p class="homepage-copy">This front door intentionally does less than the old dashboard. It points to SourceVibe engine surfaces, keeps account state honest, and leaves inventory, world interaction, and HUD ownership inside the active gamemode.</p>
        </article>
        <article class="homepage-card">
            <h3>Where to go next</h3>
            <div class="homepage-button-row">
                <a class="homepage-button--secondary" href="/sourcevibe">Engine shell</a>
                <a class="homepage-button--ghost" href="/2d-world">2D World play route</a>
                <a class="homepage-button--ghost" href="/2d-world/editor">2D World editor</a>
            </div>
        </article>
    `;
}

function bindUi() {
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
        const playButton = event.target.closest('[data-action="play-gamemode"]');
        if (playButton) {
            await launchGamemode(playButton.dataset.gamemodeId, 'play');
            return;
        }
        const playFeaturedButton = event.target.closest('[data-action="play-featured"]');
        if (playFeaturedButton && featuredEntry()) {
            await launchGamemode(featuredEntry().id, 'play');
            return;
        }
        const localTestButton = event.target.closest('[data-action="local-test-gamemode"]');
        if (localTestButton) {
            await launchGamemode(localTestButton.dataset.gamemodeId, 'local-test');
        }
    });
}

function renderAll() {
    renderSession();
    renderStatusStrip();
    renderHero();
    renderDirectory();
    renderNotes();
}

async function init() {
    await initializeOpenVibeAuth();
    state.auth = await refreshOpenVibeAuth();
    state.identity = currentIdentity();
    await loadData();
    bindUi();
    renderAll();
}

init().catch((error) => {
    console.error(error);
    if (dom.hero) {
        dom.hero.innerHTML = `
            <div class="homepage-empty">
                <h2>Could not load the OpenVibe Games front door</h2>
                <p class="homepage-muted">${escapeHtml(error && error.message || 'Unknown error')}</p>
                <div class="homepage-button-row">
                    <a class="homepage-button--secondary" href="/sourcevibe">Open SourceVibe directly</a>
                </div>
            </div>
        `;
    }
});
