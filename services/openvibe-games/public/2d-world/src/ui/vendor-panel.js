export class VendorPanel {
    constructor(root) {
        this.root = root;
    }

    render(self, { onBuy, onSell, onClose } = {}) {
        const vendor = self && self.vendor;
        if (!vendor) {
            this.root.innerHTML = '';
            return;
        }
        const stock = vendor.stock || [];
        const sellable = vendor.sellable_inventory || [];
        this.root.innerHTML = `
            <div class="panel-header">${vendor.title || vendor.name}</div>
            ${vendor.greeting ? `<p class="panel-copy">${vendor.greeting}</p>` : ''}
            <div class="vendor-balance"><span>Coins</span><strong>${Math.round(self && self.coins || 0)}</strong></div>
            <div class="vendor-section">
                <h4>Buy</h4>
                <div class="vendor-grid">${stock.map((item) => `
                    <button class="vendor-row" data-action="buy" data-id="${item.item_id}">
                        <span><strong>${item.name || item.item_id}</strong><small>${item.quantity == null ? '∞ stock' : `${item.quantity} in stock`}</small></span>
                        <strong>${item.price}c</strong>
                    </button>`).join('') || '<div class="empty">This vendor has nothing for sale.</div>'}
                </div>
            </div>
            <div class="vendor-section">
                <h4>Sell</h4>
                <div class="vendor-grid">${sellable.map((item) => `
                    <button class="vendor-row" data-action="sell" data-id="${item.item_id}">
                        <span><strong>${item.name || item.item_id}</strong><small>x${item.quantity}</small></span>
                        <strong>${item.price}c</strong>
                    </button>`).join('') || '<div class="empty">Nothing in your pack interests this vendor.</div>'}
                </div>
            </div>
            <div class="button-row">
                <button type="button" class="secondary vendor-close-btn">Close</button>
            </div>`;
        this.root.querySelectorAll('[data-action="buy"]').forEach((button) => {
            button.onclick = () => onBuy && onBuy(button.dataset.id);
        });
        this.root.querySelectorAll('[data-action="sell"]').forEach((button) => {
            button.onclick = () => onSell && onSell(button.dataset.id);
        });
        const closeButton = this.root.querySelector('.vendor-close-btn');
        if (closeButton) closeButton.onclick = () => onClose && onClose();
    }
}
