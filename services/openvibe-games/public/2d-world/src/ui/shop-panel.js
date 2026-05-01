export class ShopPanel {
    constructor(root, items = []) {
        this.root = root;
        this.itemMap = Object.fromEntries((items || []).map((item) => [item.item_id, item]));
    }

    itemName(itemId) {
        return this.itemMap && this.itemMap[itemId] && this.itemMap[itemId].name || itemId;
    }

    hide() {
        this.root.classList.add('hidden');
        this.root.innerHTML = '';
    }

    render(interaction, self, onBuy) {
        if (!interaction || interaction.type !== 'shop') {
            this.hide();
            return;
        }
        const coins = Math.round(self && self.coins || 0);
        this.root.classList.remove('hidden');
        this.root.innerHTML = `
            <div class="panel-header">${interaction.title}</div>
            <div class="shop-summary">
                <strong>${interaction.npc_name}</strong>
                <span>${interaction.description || 'Server-authoritative vendor inventory.'}</span>
                <div class="inventory-chip"><span>Coins</span><strong>${coins}</strong></div>
            </div>
            <div class="shop-grid">${(interaction.items || []).map((entry) => {
                const affordable = coins >= Number(entry.price || 0);
                return `
                    <button class="shop-row ${affordable ? '' : 'locked'}" data-id="${entry.item_id}" ${affordable ? '' : 'disabled'}>
                        <div>
                            <strong>${this.itemName(entry.item_id)}</strong>
                            <small>${entry.note || 'Supply crate issue'}</small>
                        </div>
                        <span>${entry.quantity > 1 ? `x${entry.quantity}` : ''} · ${entry.price}c</span>
                    </button>`;
            }).join('')}</div>`;
        this.root.querySelectorAll('.shop-row').forEach((button) => {
            button.onclick = () => onBuy && onBuy({ npcId: interaction.npc_id, itemId: button.dataset.id, quantity: 1 });
        });
    }
}