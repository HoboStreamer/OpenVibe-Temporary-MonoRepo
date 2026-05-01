function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function itemIcon(itemId, item) {
    const icon = item && (item.icon || item.metadata && item.metadata.icon || item.render && item.render.icon);
    if (icon && icon.length <= 2) return icon;
    if (icon === 'coins' || itemId === 'coins') return '🪙';
    if (item && item.category === 'weapon') return '⚔';
    if (item && item.category === 'tool') {
        const skill = item.metadata && item.metadata.skill;
        if (skill === 'woodcut') return '🪓';
        if (skill === 'mining') return '⛏';
        if (skill === 'fishing') return '🎣';
    }
    if (item && item.category === 'resource') return '📦';
    if (item && item.category === 'build') return '🧱';
    if (item && item.category === 'consumable') return '🧪';
    return icon || '⬢';
}

function quantityLabel(quantity) {
    return Number(quantity || 0) > 9999 ? `${Math.round(Number(quantity || 0) / 1000)}k` : `${Math.round(quantity || 0)}`;
}

export class InventoryPanel {
    constructor(root, items = []) {
        this.root = root;
        this.lastSignature = '';
        this.dragPayload = null;
        this.setItemCatalog(items);
        this.root.innerHTML = `
            <div class="panel-header">Inventory</div>
            <div class="inventory-summary"></div>
            <div class="inventory-hotbar"></div>
            <div class="inventory-grid"></div>
            <div class="bank-grid"></div>`;
        this.summaryEl = this.root.querySelector('.inventory-summary');
        this.hotbarEl = this.root.querySelector('.inventory-hotbar');
        this.inventoryEl = this.root.querySelector('.inventory-grid');
        this.bankEl = this.root.querySelector('.bank-grid');
        this.contextMenu = document.createElement('div');
        this.contextMenu.className = 'inventory-context-menu hidden';
        this.root.appendChild(this.contextMenu);
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'inventory-tooltip hidden';
        this.root.appendChild(this.tooltip);
        document.addEventListener('click', () => this.hideContextMenu());
    }

    hide() {
        this.root.classList.add('hidden');
        this.hideContextMenu();
        this.hideTooltip();
    }

    setItemCatalog(items = []) {
        this.itemMap = Object.fromEntries((items || []).map((item) => [item.item_id, item]));
        this.lastSignature = '';
    }

    itemName(itemId) {
        return this.itemMap && this.itemMap[itemId] && this.itemMap[itemId].name || itemId;
    }

    itemMetaLabel(itemId) {
        const item = this.itemMap && this.itemMap[itemId];
        if (itemId === 'coins') return 'Currency';
        return item && item.category ? `Type: ${item.category}` : 'Stored item';
    }

    readDragPayload(event) {
        if (event && event.dataTransfer) {
            const raw = event.dataTransfer.getData('application/json');
            if (raw) {
                try { return JSON.parse(raw); } catch {}
            }
        }
        return this.dragPayload;
    }

    showTooltip(text, x, y) {
        if (!text) return this.hideTooltip();
        this.tooltip.classList.remove('hidden');
        this.tooltip.textContent = text;
        this.tooltip.style.left = `${x + 16}px`;
        this.tooltip.style.top = `${y + 16}px`;
    }

    hideTooltip() {
        this.tooltip.classList.add('hidden');
    }

    showContextMenu(x, y, actions = []) {
        this.contextMenu.classList.remove('hidden');
        this.contextMenu.style.left = `${x}px`;
        this.contextMenu.style.top = `${y}px`;
        this.contextMenu.innerHTML = actions.map((action) => {
            if (action.type === 'slots') {
                return `<div class="inventory-context-menu__slots">${action.slots.map((slot) => `<button type="button" data-menu-action="${escapeHtml(action.id)}" data-menu-slot="${slot}">${slot}</button>`).join('')}</div>`;
            }
            return `<button type="button" data-menu-action="${escapeHtml(action.id)}">${escapeHtml(action.label)}</button>`;
        }).join('');
    }

    hideContextMenu() {
        this.contextMenu.classList.add('hidden');
    }

    inventoryEntries(self) {
        const backpack = Array.isArray(self && self.inventory) ? self.inventory.map((entry) => ({ ...entry })) : [];
        if (Number(self && self.coins || 0) > 0) backpack.unshift({ item_id: 'coins', quantity: Number(self.coins || 0), synthetic: true });
        return backpack;
    }

    renderSlot(item, { source, slot = null, active = false } = {}) {
        if (!item || !item.item_id) {
            return `<button type="button" class="inventory-slot inventory-slot--empty" ${slot ? `data-hotbar-slot="${slot}"` : ''}>${slot ? `<span class="inventory-slot__index">${slot}</span>` : ''}</button>`;
        }
        const definition = this.itemMap[item.item_id] || { item_id: item.item_id, name: item.item_id, category: item.category || 'misc', metadata: {} };
        const tooltip = `${this.itemName(item.item_id)} · ${this.itemMetaLabel(item.item_id)} · Qty ${Math.round(item.quantity || 0)}`;
        return `
            <button
                type="button"
                class="inventory-slot ${active ? 'active' : ''}"
                data-source="${escapeHtml(source)}"
                data-item-id="${escapeHtml(item.item_id)}"
                data-quantity="${escapeHtml(item.quantity || 0)}"
                ${slot ? `data-hotbar-slot="${slot}"` : ''}
                title="${escapeHtml(tooltip)}"
                draggable="true">
                ${slot ? `<span class="inventory-slot__index">${slot}</span>` : ''}
                <span class="inventory-slot__icon">${escapeHtml(itemIcon(item.item_id, definition))}</span>
                <span class="inventory-slot__name">${escapeHtml(this.itemName(item.item_id))}</span>
                <span class="inventory-slot__qty">${escapeHtml(quantityLabel(item.quantity || 0))}</span>
            </button>`;
    }

    render(self, { layout, onDeposit, onWithdraw, onHotbarAssign, onHotbarClear, onDropItem, onSelectHotbar } = {}) {
        const inventory = this.inventoryEntries(self);
        const bank = self && self.bank || [];
        const hotbar = Array.isArray(self && self.hotbar) ? self.hotbar : [];
        const inventoryLayout = Object.assign({ rows: 5, cols: 8, hotbarSlots: 9 }, layout || {});
        const signature = JSON.stringify({
            coins: Math.round(self && self.coins || 0),
            hotbar,
            inventory,
            bank,
        });
        if (signature === this.lastSignature) return;
        this.lastSignature = signature;

        this.summaryEl.innerHTML = `
            <div class="inventory-chip"><span>Coins</span><strong>${Math.round(self && self.coins || 0)}</strong></div>
            <div class="inventory-chip"><span>Backpack</span><strong>${inventory.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0)}</strong></div>
            <div class="inventory-chip"><span>Bank</span><strong>${bank.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0)}</strong></div>`;

        this.hotbarEl.innerHTML = `<h4>Hotbar</h4>
            <div class="inventory-hotbar-grid">${Array.from({ length: clamp(inventoryLayout.hotbarSlots || 9, 1, 12) }).map((_, index) => this.renderSlot(hotbar[index], { source: 'hotbar', slot: index + 1, active: hotbar[index] && hotbar[index].active })).join('')}</div>
            <div class="inventory-help">Drag backpack slots onto the hotbar, right-click for slot actions, and use the mouse wheel or number keys to select slots.</div>`;

        const inventorySlots = inventory.map((entry) => this.renderSlot(entry, { source: 'inventory' }));
        while (inventorySlots.length < (inventoryLayout.rows * inventoryLayout.cols)) {
            inventorySlots.push(this.renderSlot(null, { source: 'inventory' }));
        }
        this.inventoryEl.innerHTML = `<h4>Backpack</h4><div class="inventory-slot-grid">${inventorySlots.join('')}</div>`;
        this.bankEl.innerHTML = `<h4>Bank</h4><div class="inventory-slot-grid inventory-slot-grid--bank">${(bank.length ? bank : Array.from({ length: inventoryLayout.cols })).map((entry) => this.renderSlot(entry || null, { source: 'bank' })).join('')}</div>`;

        this.root.querySelectorAll('.inventory-slot[data-item-id]').forEach((slotEl) => {
            slotEl.addEventListener('dragstart', (event) => {
                const payload = {
                    source: slotEl.dataset.source,
                    itemId: slotEl.dataset.itemId,
                    slot: slotEl.dataset.hotbarSlot ? Number(slotEl.dataset.hotbarSlot) : null,
                };
                this.dragPayload = payload;
                if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('application/json', JSON.stringify(payload));
                }
            });
            slotEl.addEventListener('mouseenter', (event) => this.showTooltip(slotEl.title, event.clientX, event.clientY));
            slotEl.addEventListener('mousemove', (event) => this.showTooltip(slotEl.title, event.clientX, event.clientY));
            slotEl.addEventListener('mouseleave', () => this.hideTooltip());
            slotEl.addEventListener('click', () => {
                if (slotEl.dataset.source === 'hotbar' && slotEl.dataset.hotbarSlot) {
                    onSelectHotbar && onSelectHotbar(Number(slotEl.dataset.hotbarSlot));
                }
            });
            slotEl.addEventListener('contextmenu', (event) => {
                event.preventDefault();
                const source = slotEl.dataset.source;
                const itemId = slotEl.dataset.itemId;
                const itemQuantity = Number(slotEl.dataset.quantity || 0);
                const actions = [];
                if (source === 'inventory') {
                    actions.push({ id: 'assign-slot', type: 'slots', slots: Array.from({ length: 9 }, (_, index) => index + 1) });
                    if (itemId !== 'coins') actions.push({ id: 'deposit-stack', label: 'Send stack to bank' });
                    actions.push({ id: 'drop-one', label: 'Drop 1' });
                    if (itemQuantity > 1) actions.push({ id: 'drop-stack', label: 'Drop stack' });
                } else if (source === 'bank') {
                    actions.push({ id: 'withdraw-stack', label: 'Withdraw stack' });
                } else if (source === 'hotbar') {
                    actions.push({ id: 'select-slot', label: 'Select slot' });
                    actions.push({ id: 'clear-slot', label: 'Clear slot' });
                    if (itemId) {
                        actions.push({ id: 'drop-one', label: 'Drop 1' });
                        if (itemQuantity > 1) actions.push({ id: 'drop-stack', label: 'Drop stack' });
                    }
                }
                this.showContextMenu(event.clientX - this.root.getBoundingClientRect().left, event.clientY - this.root.getBoundingClientRect().top, actions);
                this.contextMenu.querySelectorAll('[data-menu-action]').forEach((button) => {
                    button.addEventListener('click', () => {
                        const action = button.dataset.menuAction;
                        const slotNumber = Number(button.dataset.menuSlot || slotEl.dataset.hotbarSlot || 0) || null;
                        this.hideContextMenu();
                        if (action === 'assign-slot' && slotNumber) onHotbarAssign && onHotbarAssign(slotNumber, itemId);
                        if (action === 'deposit-stack') onDeposit && onDeposit(itemId, itemQuantity);
                        if (action === 'withdraw-stack') onWithdraw && onWithdraw(itemId, itemQuantity);
                        if (action === 'clear-slot' && slotNumber) onHotbarClear && onHotbarClear(slotNumber);
                        if (action === 'select-slot' && slotNumber) onSelectHotbar && onSelectHotbar(slotNumber);
                        if (action === 'drop-one') onDropItem && onDropItem(itemId, 1);
                        if (action === 'drop-stack') onDropItem && onDropItem(itemId, itemQuantity);
                    });
                });
            });
        });

        this.root.querySelectorAll('.inventory-slot[data-hotbar-slot]').forEach((slotEl) => {
            slotEl.addEventListener('dragover', (event) => {
                const payload = this.readDragPayload(event);
                if (!payload || !payload.itemId) return;
                event.preventDefault();
                slotEl.classList.add('drag-over');
            });
            slotEl.addEventListener('dragleave', () => slotEl.classList.remove('drag-over'));
            slotEl.addEventListener('drop', (event) => {
                slotEl.classList.remove('drag-over');
                const payload = this.readDragPayload(event);
                if (!payload || !payload.itemId) return;
                event.preventDefault();
                const targetSlot = Number(slotEl.dataset.hotbarSlot);
                if (payload.source === 'hotbar' && payload.slot && payload.slot !== targetSlot) {
                    onHotbarAssign && onHotbarAssign(targetSlot, payload.itemId);
                    onHotbarClear && onHotbarClear(payload.slot);
                    return;
                }
                onHotbarAssign && onHotbarAssign(targetSlot, payload.itemId);
            });
        });
    }
}
