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
            <div class="event-feed"></div>`;
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
    }

    update(snapshot, meta) {
        const self = snapshot && snapshot.self || {};
        const hpRatio = self.max_hp ? Math.max(0, Math.min(1, self.hp / self.max_hp)) : 0;
        const staminaRatio = self.max_stamina ? Math.max(0, Math.min(1, self.stamina / self.max_stamina)) : 0;
        this.hpFill.style.width = `${hpRatio * 100}%`;
        this.hpLabel.textContent = `${Math.round(self.hp || 0)}/${Math.round(self.max_hp || 0)}`;
        this.staminaFill.style.width = `${staminaRatio * 100}%`;
        this.staminaLabel.textContent = `${Math.round(self.stamina || 0)}/${Math.round(self.max_stamina || 0)}`;
        this.zoneLabel.textContent = `Zone: ${snapshot && snapshot.world ? snapshot.world.zone_id : '—'}`;
        this.connectionLabel.textContent = meta && meta.connectionText || 'offline';
        this.coinsLabel.textContent = `Coins: ${Math.round(self.coins || 0)}`;
        this.weaponLabel.textContent = `Held: ${self.held_item || self.equipment && self.equipment.weapon || 'hands'}`;
        const prompt = snapshot && snapshot.interaction && snapshot.interaction.prompt;
        this.promptLabel.textContent = prompt ? `${prompt.label}${prompt.description ? ` · ${prompt.description}` : ''}` : '';
        this.promptLabel.classList.toggle('visible', !!prompt);
        this.quickbar.innerHTML = Array.from({ length: 9 }).map((_, index) => `<span class="slot ${meta && meta.quickSlot === index + 1 ? 'active' : ''}">${index + 1}</span>`).join('');
        this.feed.innerHTML = (snapshot && snapshot.feed || []).slice(-6).map((item) => `<div class="feed-item"><strong>${item.type}</strong><span>${item.at}</span></div>`).join('');
    }
}
