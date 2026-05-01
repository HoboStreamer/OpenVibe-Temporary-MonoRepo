export class ModBrowser {
    constructor(root) {
        this.root = root;
    }

    render(mods = []) {
        this.root.innerHTML = `<div class="panel-header">Mods</div>${mods.map((mod) => `<div class="mod-row"><strong>${mod.name}</strong><small>${mod.slug} · ${mod.version}</small><span>${mod.status}</span></div>`).join('') || '<div class="empty">No mods registered yet.</div>'}`;
    }
}
