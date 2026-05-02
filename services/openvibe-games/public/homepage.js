import {
    currentIdentity,
    gamesApiJson,
    getAuthState,
    initializeOpenVibeAuth,
    networkApiJson,
    refreshOpenVibeAuth,
    resolveSurfaceUrl,
    startSignIn,
    startSignOut,
} from '/sourcevibe-shared/auth-client.js';
import { escapeHtml } from '/sourcevibe-shared/ui/dom.js';

const SOURCEVIBE_API = '/api/games/sourcevibe';
const LOCAL_THEME_KEY = 'openvibe.theme';

const BUILTIN_THEMES = [
    {
        id: 'openvibe-dark',
        text: '#ecf4ff',
        textDim: 'rgba(219, 232, 255, 0.72)',
        link: '#9bc5ff',
        linkHover: '#dcecff',
        pageGlow: 'rgba(124, 180, 255, 0.2)',
        bgTop: '#0b1320',
        bgMid: '#08101b',
        bgBottom: '#070b13',
        panelBorder: 'rgba(137, 178, 255, 0.18)',
        panelBg: 'linear-gradient(180deg, rgba(9, 17, 28, 0.92), rgba(7, 12, 20, 0.9))',
        panelShadow: '0 24px 60px rgba(0, 0, 0, 0.28)',
        quietBg: 'rgba(8, 16, 27, 0.72)',
        featuredBg: 'rgba(6, 13, 23, 0.74)',
        cardBg: 'rgba(7, 13, 23, 0.78)',
        cardBgSoft: 'rgba(7, 13, 23, 0.48)',
        chipBg: 'rgba(16, 28, 46, 0.72)',
        chipBorder: 'rgba(137, 178, 255, 0.2)',
        chipText: 'rgba(228, 239, 255, 0.88)',
        chipAccentBg: 'rgba(11, 42, 31, 0.72)',
        chipAccentBorder: 'rgba(118, 224, 171, 0.3)',
        chipAccentText: '#c9ffe4',
        primaryText: '#06111e',
        primaryStart: '#9dd1ff',
        primaryEnd: '#5ea7ff',
        primaryBorder: 'rgba(157, 209, 255, 0.45)',
        secondaryText: '#eff6ff',
        secondaryStart: 'rgba(48, 88, 142, 0.88)',
        secondaryEnd: 'rgba(23, 47, 86, 0.88)',
        secondaryBorder: 'rgba(137, 178, 255, 0.26)',
        ghostText: '#d9e8ff',
        ghostBg: 'rgba(11, 19, 31, 0.75)',
        ghostBorder: 'rgba(137, 178, 255, 0.2)',
    },
    {
        id: 'openvibe-dim',
        text: '#edf6ff',
        textDim: 'rgba(198, 219, 245, 0.74)',
        link: '#7dd3fc',
        linkHover: '#d8f3ff',
        pageGlow: 'rgba(45, 212, 191, 0.18)',
        bgTop: '#0b1323',
        bgMid: '#0e1a2f',
        bgBottom: '#09111e',
        panelBorder: 'rgba(96, 165, 250, 0.18)',
        panelBg: 'linear-gradient(180deg, rgba(16, 28, 48, 0.92), rgba(10, 18, 33, 0.9))',
        panelShadow: '0 24px 60px rgba(2, 8, 23, 0.3)',
        quietBg: 'rgba(13, 24, 42, 0.72)',
        featuredBg: 'rgba(11, 20, 36, 0.76)',
        cardBg: 'rgba(12, 22, 38, 0.8)',
        cardBgSoft: 'rgba(12, 22, 38, 0.52)',
        chipBg: 'rgba(24, 45, 69, 0.72)',
        chipBorder: 'rgba(96, 165, 250, 0.22)',
        chipText: 'rgba(224, 240, 255, 0.9)',
        chipAccentBg: 'rgba(11, 55, 51, 0.72)',
        chipAccentBorder: 'rgba(45, 212, 191, 0.28)',
        chipAccentText: '#ccfbf1',
        primaryText: '#06111e',
        primaryStart: '#7dd3fc',
        primaryEnd: '#38bdf8',
        primaryBorder: 'rgba(125, 211, 252, 0.45)',
        secondaryText: '#eff6ff',
        secondaryStart: 'rgba(45, 84, 132, 0.9)',
        secondaryEnd: 'rgba(20, 45, 79, 0.9)',
        secondaryBorder: 'rgba(96, 165, 250, 0.26)',
        ghostText: '#dbeafe',
        ghostBg: 'rgba(12, 20, 34, 0.78)',
        ghostBorder: 'rgba(96, 165, 250, 0.2)',
    },
    {
        id: 'openvibe-light',
        text: '#0f172a',
        textDim: 'rgba(71, 85, 105, 0.82)',
        link: '#2563eb',
        linkHover: '#1d4ed8',
        pageGlow: 'rgba(91, 61, 240, 0.16)',
        bgTop: '#f8fbff',
        bgMid: '#eef4ff',
        bgBottom: '#e2e8f0',
        panelBorder: 'rgba(71, 85, 105, 0.18)',
        panelBg: 'linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(237, 244, 255, 0.9))',
        panelShadow: '0 24px 60px rgba(15, 23, 42, 0.12)',
        quietBg: 'rgba(226, 232, 240, 0.82)',
        featuredBg: 'rgba(248, 250, 252, 0.92)',
        cardBg: 'rgba(255, 255, 255, 0.92)',
        cardBgSoft: 'rgba(226, 232, 240, 0.7)',
        chipBg: 'rgba(226, 232, 240, 0.92)',
        chipBorder: 'rgba(71, 85, 105, 0.18)',
        chipText: 'rgba(30, 41, 59, 0.88)',
        chipAccentBg: 'rgba(220, 252, 231, 0.92)',
        chipAccentBorder: 'rgba(34, 197, 94, 0.24)',
        chipAccentText: '#166534',
        primaryText: '#ffffff',
        primaryStart: '#5b3df0',
        primaryEnd: '#0ea5e9',
        primaryBorder: 'rgba(91, 61, 240, 0.28)',
        secondaryText: '#0f172a',
        secondaryStart: 'rgba(226, 232, 240, 0.96)',
        secondaryEnd: 'rgba(203, 213, 225, 0.94)',
        secondaryBorder: 'rgba(71, 85, 105, 0.24)',
        ghostText: '#334155',
        ghostBg: 'rgba(255, 255, 255, 0.8)',
        ghostBorder: 'rgba(71, 85, 105, 0.16)',
    },
    {
        id: 'sunset',
        text: '#fff1f2',
        textDim: 'rgba(254, 205, 211, 0.76)',
        link: '#fb7185',
        linkHover: '#fecdd3',
        pageGlow: 'rgba(249, 115, 22, 0.2)',
        bgTop: '#1a1118',
        bgMid: '#24131b',
        bgBottom: '#160d13',
        panelBorder: 'rgba(251, 113, 133, 0.18)',
        panelBg: 'linear-gradient(180deg, rgba(56, 26, 36, 0.92), rgba(36, 18, 28, 0.9))',
        panelShadow: '0 24px 60px rgba(42, 16, 24, 0.32)',
        quietBg: 'rgba(49, 25, 33, 0.72)',
        featuredBg: 'rgba(34, 16, 23, 0.76)',
        cardBg: 'rgba(39, 19, 29, 0.8)',
        cardBgSoft: 'rgba(39, 19, 29, 0.52)',
        chipBg: 'rgba(79, 33, 49, 0.72)',
        chipBorder: 'rgba(251, 113, 133, 0.22)',
        chipText: 'rgba(255, 228, 230, 0.9)',
        chipAccentBg: 'rgba(85, 41, 25, 0.76)',
        chipAccentBorder: 'rgba(249, 115, 22, 0.28)',
        chipAccentText: '#ffedd5',
        primaryText: '#ffffff',
        primaryStart: '#fb7185',
        primaryEnd: '#f97316',
        primaryBorder: 'rgba(251, 113, 133, 0.34)',
        secondaryText: '#fff1f2',
        secondaryStart: 'rgba(127, 29, 29, 0.88)',
        secondaryEnd: 'rgba(76, 29, 45, 0.88)',
        secondaryBorder: 'rgba(251, 113, 133, 0.24)',
        ghostText: '#ffe4e6',
        ghostBg: 'rgba(47, 21, 30, 0.78)',
        ghostBorder: 'rgba(251, 113, 133, 0.18)',
    },
    {
        id: 'forest',
        text: '#ecfdf5',
        textDim: 'rgba(167, 243, 208, 0.76)',
        link: '#34d399',
        linkHover: '#d1fae5',
        pageGlow: 'rgba(34, 197, 94, 0.2)',
        bgTop: '#0d1410',
        bgMid: '#101a15',
        bgBottom: '#09100c',
        panelBorder: 'rgba(45, 212, 191, 0.18)',
        panelBg: 'linear-gradient(180deg, rgba(18, 36, 29, 0.92), rgba(12, 24, 19, 0.9))',
        panelShadow: '0 24px 60px rgba(8, 24, 18, 0.32)',
        quietBg: 'rgba(18, 36, 29, 0.72)',
        featuredBg: 'rgba(13, 25, 20, 0.76)',
        cardBg: 'rgba(16, 31, 24, 0.8)',
        cardBgSoft: 'rgba(16, 31, 24, 0.52)',
        chipBg: 'rgba(24, 51, 40, 0.72)',
        chipBorder: 'rgba(45, 212, 191, 0.22)',
        chipText: 'rgba(220, 252, 231, 0.9)',
        chipAccentBg: 'rgba(20, 58, 41, 0.76)',
        chipAccentBorder: 'rgba(34, 197, 94, 0.28)',
        chipAccentText: '#d1fae5',
        primaryText: '#052e1b',
        primaryStart: '#34d399',
        primaryEnd: '#22c55e',
        primaryBorder: 'rgba(34, 197, 94, 0.34)',
        secondaryText: '#ecfdf5',
        secondaryStart: 'rgba(16, 75, 57, 0.88)',
        secondaryEnd: 'rgba(6, 47, 28, 0.88)',
        secondaryBorder: 'rgba(45, 212, 191, 0.24)',
        ghostText: '#d1fae5',
        ghostBg: 'rgba(13, 29, 22, 0.78)',
        ghostBorder: 'rgba(45, 212, 191, 0.18)',
    },
    {
        id: 'cyberpunk',
        text: '#faf5ff',
        textDim: 'rgba(216, 180, 254, 0.78)',
        link: '#22d3ee',
        linkHover: '#f0abfc',
        pageGlow: 'rgba(236, 72, 153, 0.2)',
        bgTop: '#0c0a18',
        bgMid: '#140f26',
        bgBottom: '#090714',
        panelBorder: 'rgba(236, 72, 153, 0.18)',
        panelBg: 'linear-gradient(180deg, rgba(30, 18, 48, 0.92), rgba(18, 12, 31, 0.9))',
        panelShadow: '0 24px 60px rgba(15, 6, 32, 0.34)',
        quietBg: 'rgba(30, 18, 48, 0.72)',
        featuredBg: 'rgba(21, 13, 35, 0.78)',
        cardBg: 'rgba(25, 15, 41, 0.82)',
        cardBgSoft: 'rgba(25, 15, 41, 0.54)',
        chipBg: 'rgba(43, 23, 69, 0.72)',
        chipBorder: 'rgba(236, 72, 153, 0.22)',
        chipText: 'rgba(250, 245, 255, 0.9)',
        chipAccentBg: 'rgba(13, 74, 144, 0.76)',
        chipAccentBorder: 'rgba(34, 211, 238, 0.28)',
        chipAccentText: '#cffafe',
        primaryText: '#ffffff',
        primaryStart: '#ec4899',
        primaryEnd: '#22d3ee',
        primaryBorder: 'rgba(236, 72, 153, 0.34)',
        secondaryText: '#faf5ff',
        secondaryStart: 'rgba(88, 28, 135, 0.88)',
        secondaryEnd: 'rgba(49, 18, 86, 0.88)',
        secondaryBorder: 'rgba(192, 132, 252, 0.24)',
        ghostText: '#f5d0fe',
        ghostBg: 'rgba(24, 14, 39, 0.78)',
        ghostBorder: 'rgba(236, 72, 153, 0.18)',
    },
];

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

function themeById(themeId) {
    return BUILTIN_THEMES.find((theme) => theme.id === themeId) || BUILTIN_THEMES[0];
}

function applyTheme(themeId, options = {}) {
    const theme = themeById(themeId);
    const root = document.documentElement;
    root.dataset.openvibeTheme = theme.id;
    root.style.setProperty('color-scheme', theme.id === 'openvibe-light' ? 'light' : 'dark');
    root.style.setProperty('--games-text', theme.text);
    root.style.setProperty('--games-text-dim', theme.textDim);
    root.style.setProperty('--games-link', theme.link);
    root.style.setProperty('--games-link-hover', theme.linkHover);
    root.style.setProperty('--games-page-glow', theme.pageGlow);
    root.style.setProperty('--games-bg-top', theme.bgTop);
    root.style.setProperty('--games-bg-mid', theme.bgMid);
    root.style.setProperty('--games-bg-bottom', theme.bgBottom);
    root.style.setProperty('--games-panel-border', theme.panelBorder);
    root.style.setProperty('--games-panel-bg', theme.panelBg);
    root.style.setProperty('--games-panel-shadow', theme.panelShadow);
    root.style.setProperty('--games-quiet-bg', theme.quietBg);
    root.style.setProperty('--games-featured-bg', theme.featuredBg);
    root.style.setProperty('--games-card-bg', theme.cardBg);
    root.style.setProperty('--games-card-bg-soft', theme.cardBgSoft);
    root.style.setProperty('--games-chip-bg', theme.chipBg);
    root.style.setProperty('--games-chip-border', theme.chipBorder);
    root.style.setProperty('--games-chip-text', theme.chipText);
    root.style.setProperty('--games-chip-accent-bg', theme.chipAccentBg);
    root.style.setProperty('--games-chip-accent-border', theme.chipAccentBorder);
    root.style.setProperty('--games-chip-accent-text', theme.chipAccentText);
    root.style.setProperty('--games-primary-text', theme.primaryText);
    root.style.setProperty('--games-primary-start', theme.primaryStart);
    root.style.setProperty('--games-primary-end', theme.primaryEnd);
    root.style.setProperty('--games-primary-border', theme.primaryBorder);
    root.style.setProperty('--games-secondary-text', theme.secondaryText);
    root.style.setProperty('--games-secondary-start', theme.secondaryStart);
    root.style.setProperty('--games-secondary-end', theme.secondaryEnd);
    root.style.setProperty('--games-secondary-border', theme.secondaryBorder);
    root.style.setProperty('--games-ghost-text', theme.ghostText);
    root.style.setProperty('--games-ghost-bg', theme.ghostBg);
    root.style.setProperty('--games-ghost-border', theme.ghostBorder);
    if (options.persistLocal !== false) {
        try {
            window.localStorage.setItem(LOCAL_THEME_KEY, theme.id);
        } catch {
            // ignore storage failures
        }
    }
    return theme;
}

function applySavedTheme() {
    try {
        const saved = window.localStorage.getItem(LOCAL_THEME_KEY);
        if (saved) return applyTheme(saved, { persistLocal: false });
    } catch {
        // ignore storage failures
    }
    return applyTheme(BUILTIN_THEMES[0].id, { persistLocal: false });
}

async function syncThemePreference() {
    if (!isAuthenticated()) return null;
    try {
        const moduleState = await networkApiJson('/api/v1/user-modules/me/openvibe.theme');
        const themeId = moduleState && moduleState.data && moduleState.data.theme_id
            ? String(moduleState.data.theme_id)
            : '';
        if (themeId) {
            applyTheme(themeId);
            return themeId;
        }
    } catch (error) {
        if (!error || error.status !== 404) {
            console.warn('[openvibe-games] failed to load synced theme:', error && error.message ? error.message : error);
        }
    }
    return null;
}

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
                <a class="homepage-button--secondary" href="/sourcevibe?gamemode=2dworld&view=directory">Open SourceVibe directory</a>
                <a class="homepage-button--ghost" href="/sourcevibe?gamemode=2dworld&view=diagnostics&panel=status">2D World status</a>
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
                <a class="homepage-button--secondary" href="/sourcevibe?gamemode=2dworld&view=home">Engine shell</a>
                <a class="homepage-button--ghost" href="/sourcevibe?gamemode=2dworld&view=directory">2D World package</a>
                <a class="homepage-button--ghost" href="/sourcevibe?gamemode=2dworld&view=editor">2D World editor</a>
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
    applySavedTheme();
    await initializeOpenVibeAuth();
    state.auth = await refreshOpenVibeAuth();
    state.identity = currentIdentity();
    await syncThemePreference();
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
