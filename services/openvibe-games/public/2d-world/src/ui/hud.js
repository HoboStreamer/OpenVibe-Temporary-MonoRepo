function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function isImageIcon(icon) {
    return typeof icon === 'string' && (icon.includes('/') || /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(icon));
}

function slotIconMarkup(slot) {
    const icon = slot && slot.icon;
    if (isImageIcon(icon)) return `<img class="hud-slot__image" src="${escapeHtml(icon)}" alt="" />`;
    if (icon) return escapeHtml(icon);
    if (slot && slot.item_id === 'coins') return '🪙';
    if (slot && slot.item_id) return '⬢';
    return '';
}

export class HudPanel {
    constructor(root) {
        this.root = root;
        this.root.innerHTML = `
            <div class="ov-hud-bars">
                <div><span>HP</span><div class="bar"><div class="fill hp-fill"></div></div><strong class="hp-label">0/0</strong></div>
                <div><span>Stamina</span><div class="bar"><div class="fill stamina-fill"></div></div><strong class="stamina-label">0/0</strong></div>
            </div>
            <div class="ov-hud-row">
                <div class="zone-label"></div>
                <div class="connection-label"></div>
                <div class="coins-label"></div>
                <div class="weapon-label"></div>
            </div>
            <div class="interaction-prompt"></div>
            <div class="quickbar"></div>
            <div class="event-feed"></div>
            <div class="hud-help"></div>`;
        this.hpFill = this.root.querySelector('.hp-fill');
        this.hpLabel = this.root.querySelector('.hp-label');
        this.staminaFill = this.root.querySelector('.stamina-fill');
        this.staminaLabel = this.root.querySelector('.stamina-label');
        this.zoneLabel = this.root.querySelector('.zone-label');
        this.connectionLabel = this.root.querySelector('.connection-label');
        this.coinsLabel = this.root.querySelector('.coins-label');
        this.weaponLabel = this.root.querySelector('.weapon-label');
        this.promptLabel = this.root.querySelector('.interaction-prompt');
        this.quickbar = this.root.querySelector('.quickbar');
        this.feed = this.root.querySelector('.event-feed');
        this.help = this.root.querySelector('.hud-help');
    }

    update(snapshot, meta, settings = {}) {
        const self = snapshot && snapshot.self || {};
        const hpRatio = self.max_hp ? Math.max(0, Math.min(1, self.hp / self.max_hp)) : 0;
        const staminaRatio = self.max_stamina ? Math.max(0, Math.min(1, self.stamina / self.max_stamina)) : 0;
        this.hpFill.style.width = `${hpRatio * 100}%`;
        this.hpLabel.textContent = `${Math.round(self.hp || 0)}/${Math.round(self.max_hp || 0)}`;
        this.staminaFill.style.width = `${staminaRatio * 100}%`;
        this.staminaLabel.textContent = `${Math.round(self.stamina || 0)}/${Math.round(self.max_stamina || 0)}`;
        this.zoneLabel.textContent = snapshot && snapshot.world ? snapshot.world.zone_id : '—';
        this.connectionLabel.textContent = meta && meta.connectionText || 'offline';
        this.coinsLabel.textContent = `${Math.round(self.coins || 0)} coins`;
        this.weaponLabel.textContent = self.held_item || self.equipment && self.equipment.weapon || 'hands';
        const prompt = snapshot && snapshot.interaction && snapshot.interaction.prompt;
        this.promptLabel.textContent = prompt ? `${prompt.label}${prompt.description ? ` · ${prompt.description}` : ''}` : '';
        this.promptLabel.classList.toggle('visible', !!prompt);
        const hotbar = Array.isArray(self.hotbar) ? self.hotbar : [];
        this.quickbar.innerHTML = Array.from({ length: 9 }).map((_, index) => {
            const slot = hotbar[index];
            return `
                <div class="slot ${slot && slot.active ? 'active' : ''}">
                    <span class="slot-index">${index + 1}</span>
                    <span class="slot-icon">${slotIconMarkup(slot)}</span>
                    <span class="slot-name">${slot && slot.name ? slot.name : ''}</span>
                    <span class="slot-qty">${slot && slot.quantity ? slot.quantity : ''}</span>
                </div>`;
        }).join('');
        this.feed.innerHTML = settings.showFeed
            ? (snapshot && snapshot.feed || []).slice(-6).map((item) => `<div class="feed-item"><strong>${item.type}</strong><span>${item.at}</span></div>`).join('')
            : '';
        this.feed.classList.toggle('hidden', !settings.showFeed);
        this.help.textContent = settings.showHotkeys ? 'I Inventory · C Craft · K Skills · B Build · M Map · ` Console · Esc Menu' : '';
        this.help.classList.toggle('hidden', !settings.showHotkeys);
    }
}
