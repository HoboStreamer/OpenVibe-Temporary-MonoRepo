import { TWO_D_WORLD_API, apiJson, getAuthState, initializeAuth } from './app/config.js';

const root = document.getElementById('status-root');
const state = {
    auth: getAuthState(),
};

function section(title, body) {
    return `<section class="panel"><div class="panel-header">${title}</div>${body}</section>`;
}

async function boot() {
    try {
        state.auth = await initializeAuth();
    } catch {
        state.auth = getAuthState();
    }
    const [status, catalog, mods] = await Promise.all([
        apiJson(`${TWO_D_WORLD_API}/status`),
        apiJson(`${TWO_D_WORLD_API}/catalog`),
        apiJson(`${TWO_D_WORLD_API}/mods`),
    ]);
    const rooms = [
        ...(status.realtime.world_rooms || []).map((room) => ({ slug: room.world_slug, type: 'world', connected_players: room.player_count })),
        ...(status.realtime.dungeon_rooms || []).map((room) => ({ slug: room.world_slug, type: 'dungeon', connected_players: room.player_count })),
    ];
    const session = state.auth && state.auth.session || { authenticated: false, user: null };
    const user = session.user || null;
    root.innerHTML = `
        ${section('Session', `
            <div class="skill-row"><span>Mode</span><strong>${session.authenticated ? 'authenticated' : 'guest'}</strong></div>
            <div class="skill-row"><span>Actor</span><strong>${user && (user.display_name || user.username || user.id) || 'not signed in'}</strong></div>
            <div class="skill-row"><span>Role</span><strong>${user && user.role || 'guest'}</strong></div>`)}
        ${section('Runtime', `
            <div class="skill-row"><span>World</span><strong>${catalog.world.slug}</strong></div>
            <div class="skill-row"><span>Realtime Rooms</span><strong>${rooms.length}</strong></div>
            <div class="skill-row"><span>Seeded Items</span><strong>${catalog.items.length}</strong></div>
            <div class="skill-row"><span>Recipes</span><strong>${catalog.recipes.length}</strong></div>
            <div class="skill-row"><span>Zones</span><strong>${catalog.zones.length}</strong></div>`)}
        ${section('Live Rooms', rooms.map((room) => `<div class="mod-row"><strong>${room.slug}</strong><small>${room.type}</small><span>${room.connected_players} players</span></div>`).join('') || '<div class="empty">No active rooms.</div>')}
        ${section('Mods', (mods.mods || []).map((mod) => `<div class="mod-row"><strong>${mod.name}</strong><small>${mod.slug} · ${mod.version}</small><span>${mod.status}</span></div>`).join('') || '<div class="empty">No mods registered.</div>')}
        ${section('Integrations', `<div class="skill-row"><span>Chat</span><strong>${status.seams.chat_url || 'n/a'}</strong></div><div class="skill-row"><span>Billing</span><strong>${status.seams.billing_url || 'n/a'}</strong></div><div class="skill-row"><span>Community</span><strong>${status.seams.community_url || 'n/a'}</strong></div><div class="skill-row"><span>AI</span><strong>${status.seams.ai_url || 'n/a'}</strong></div>`)}
    `;
}

boot().catch((error) => {
    root.innerHTML = `<section class="panel"><div class="panel-header">Status</div><div class="empty">${error.message}</div></section>`;
});
