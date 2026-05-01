export class InventoryPanel {
    constructor(root, items = []) {
        this.root = root;
        this.setItemCatalog(items);
        this.root.innerHTML = `
            <div class="panel-header">Inventory & Bank</div>
            <div class="inventory-summary"></div>
            <div class="inventory-grid"></div>
            <div class="bank-grid"></div>`;
        this.summaryEl = this.root.querySelector('.inventory-summary');
        this.inventoryEl = this.root.querySelector('.inventory-grid');
        this.bankEl = this.root.querySelector('.bank-grid');
    }

    setItemCatalog(items = []) {
        this.itemMap = Object.fromEntries((items || []).map((item) => [item.item_id, item]));
    }

    itemName(itemId) {
        return this.itemMap && this.itemMap[itemId] && this.itemMap[itemId].name || itemId;
    }

    render(self, { onDeposit, onWithdraw } = {}) {
        const inventory = self && self.inventory || [];
        const bank = self && self.bank || [];
        const equipment = self && self.equipment || {};
        this.summaryEl.innerHTML = `
            <div class="inventory-chip"><span>Coins</span><strong>${Math.round(self && self.coins || 0)}</strong></div>
            <div class="inventory-chip"><span>Weapon</span><strong>${this.itemName(equipment.weapon || 'fists')}</strong></div>
            <div class="inventory-chip"><span>Tooling</span><strong>${this.itemName(equipment.axe || equipment.pickaxe || equipment.rod || 'hands')}</strong></div>`;
        this.inventoryEl.innerHTML = `<h4>Backpack</h4>${inventory.map((item) => `
            <button class="item-row" data-kind="inventory" data-id="${item.item_id}">
                <span>${this.itemName(item.item_id)}</span><strong>x${item.quantity}</strong>
            </button>`).join('') || '<div class="empty">No items</div>'}`;
        this.bankEl.innerHTML = `<h4>Bank</h4>${bank.map((item) => `
            <button class="item-row" data-kind="bank" data-id="${item.item_id}">
                <span>${this.itemName(item.item_id)}</span><strong>x${item.quantity}</strong>
            </button>`).join('') || '<div class="empty">No bank items</div>'}`;
        this.root.querySelectorAll('[data-kind="inventory"]').forEach((button) => button.onclick = () => onDeposit && onDeposit(button.dataset.id));
        this.root.querySelectorAll('[data-kind="bank"]').forEach((button) => button.onclick = () => onWithdraw && onWithdraw(button.dataset.id));
    }
}
