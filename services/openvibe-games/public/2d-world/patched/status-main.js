import { TWO_D_WORLD_API, apiJson, loadIdentity } from '../src/app/config.js';

const root = document.getElementById('status-root');
const identity = loadIdentity();

function section(title, body) {
    return `<section class="panel"><div class="panel-header">${title}</div>${body}</section>`;
}

async function boot() {
    const [status, catalog, mods] = await Promise.all([
        apiJson(`${TWO_D_WORLD_API}/status`, {}, identity),
        apiJson(`${TWO_D_WORLD_API}/catalog`, {}, identity),
        apiJson(`${TWO_D_WORLD_API}/mods`, {}, identity),
    ]);
    const rooms = status.realtime.rooms || [];
    const integrations = status.integrations || {};
    root.innerHTML = `
        ${section('Runtime', `
            <div class="skill-row"><span>World</span><strong>${status.world.slug}</strong></div>
            <div class="skill-row"><span>Realtime Rooms</span><strong>${rooms.length}</strong></div>
            <div class="skill-row"><span>Seeded Items</span><strong>${catalog.items.length}</strong></div>
            <div class="skill-row"><span>Recipes</span><strong>${catalog.recipes.length}</strong></div>
            <div class="skill-row"><span>Zones</span><strong>${catalog.zones.length}</strong></div>`)}
        ${section('Live Rooms', rooms.map((room) => `<div class="mod-row"><strong>${room.slug || room.id}</strong><small>${room.type}</small><span>${room.connected_players} players</span></div>`).join('') || '<div class="empty">No active rooms.</div>')}
        ${section('Mods', (mods.mods || []).map((mod) => `<div class="mod-row"><strong>${mod.name}</strong><small>${mod.slug} · ${mod.version}</small><span>${mod.status}</span></div>`).join('') || '<div class="empty">No mods registered.</div>')}
        ${section('Integrations', `<div class="skill-row"><span>Chat</span><strong>${integrations.chat && integrations.chat.url || 'n/a'}</strong></div><div class="skill-row"><span>Billing</span><strong>${integrations.billing && integrations.billing.url || 'n/a'}</strong></div><div class="skill-row"><span>Community</span><strong>${integrations.community && integrations.community.url || 'n/a'}</strong></div><div class="skill-row"><span>AI</span><strong>${integrations.ai && integrations.ai.url || 'n/a'}</strong></div>`)}
    `;
}

boot().catch((error) => {
    root.innerHTML = `<section class="panel"><div class="panel-header">Status</div><div class="empty">${error.message}</div></section>`;
});
