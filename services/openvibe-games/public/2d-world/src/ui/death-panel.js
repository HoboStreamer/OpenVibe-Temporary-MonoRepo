export class DeathPanel {
    constructor(root) {
        this.root = root;
        this.root.innerHTML = `<div class="death-card hidden"><h2>You were defeated</h2><p>Click respawn to return to the outpost.</p><button class="respawn-btn">Respawn</button></div>`;
        this.card = this.root.querySelector('.death-card');
        this.button = this.root.querySelector('.respawn-btn');
    }

    bindRespawn(handler) {
        this.button.addEventListener('click', () => handler && handler());
    }

    render(self) {
        this.card.classList.toggle('hidden', !(self && self.dead));
    }
}
