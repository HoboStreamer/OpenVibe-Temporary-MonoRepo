export class LootPanel {
    constructor(root, items = []) {
        this.root = root;
        this.itemMap = Object.fromEntries((items || []).map((item) => [item.item_id, item]));
    }

    itemName(itemId) {
        return this.itemMap && this.itemMap[itemId] && this.itemMap[itemId].name || itemId;
    }

    render(loot = []) {
        this.root.innerHTML = `<div class="panel-header">Nearby Loot</div>${loot.map((drop) => `<div class="loot-row"><span>${this.itemName(drop.item_id)}</span><strong>x${drop.quantity}</strong></div>`).join('') || '<div class="empty">Nothing nearby.</div>'}`;
    }
}
