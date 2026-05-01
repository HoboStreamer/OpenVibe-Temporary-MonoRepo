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

function isImageIcon(icon) {
    return typeof icon === 'string' && (icon.includes('/') || /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(icon));
}

function itemIconMarkup(itemId, item) {
    const icon = item && (item.icon || item.metadata && item.metadata.icon || item.render && item.render.icon);
    if (isImageIcon(icon)) {
        return `<img class="legacy-slot__image" src="${escapeHtml(icon)}" alt="" />`;
    }
    if (icon && icon.length <= 2) return `<span class="legacy-slot__emoji">${escapeHtml(icon)}</span>`;
    if (itemId === 'coins' || icon === 'coins') return '<span class="legacy-slot__emoji">🪙</span>';
    if (item && item.category === 'weapon') return '<span class="legacy-slot__emoji">⚔</span>';
    if (item && item.category === 'tool') return '<span class="legacy-slot__emoji">🛠</span>';
    if (item && item.category === 'build') return '<span class="legacy-slot__emoji">🧱</span>';
    if (item && item.category === 'resource') return '<span class="legacy-slot__emoji">⬢</span>';
    return '<span class="legacy-slot__emoji">⬢</span>';
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
        this.root.innerHTML = '';
        this.contextMenu = document.createElement('div');
        this.contextMenu.className = 'inventory-context-menu hidden';
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'inventory-tooltip hidden';
        this.root.append(this.contextMenu, this.tooltip);
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

    itemDefinition(itemId) {
        return this.itemMap && this.itemMap[itemId] || { item_id: itemId, name: itemId, category: 'misc', metadata: {} };
    }

    itemName(itemId) {
        return this.itemDefinition(itemId).name || itemId;
    }

    itemMetaLabel(itemId) {
        const item = this.itemDefinition(itemId);
        if (itemId === 'coins') return 'Currency';
        return item && item.category ? `Type: ${item.category}` : 'Stored item';
    }

    inventoryEntries(self) {
        const backpack = Array.isArray(self && self.inventory) ? self.inventory.map((entry) => ({ ...entry })) : [];
        if (Number(self && self.coins || 0) > 0) backpack.unshift({ item_id: 'coins', quantity: Number(self.coins || 0), synthetic: true });
        return backpack;
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

    renderSlot(item, { source, slot = null, active = false } = {}) {
        if (!item || !item.item_id) {
            return `<button type="button" class="legacy-slot legacy-slot--empty" ${slot ? `data-hotbar-slot="${slot}"` : ''}>${slot ? `<span class="legacy-slot__index">${slot}</span>` : ''}</button>`;
        }
        const definition = this.itemDefinition(item.item_id);
        const tooltip = `${this.itemName(item.item_id)} · ${this.itemMetaLabel(item.item_id)} · Qty ${Math.round(item.quantity || 0)}`;
        return `
            <button
                type="button"
                class="legacy-slot ${active ? 'active' : ''}"
                data-source="${escapeHtml(source)}"
                data-item-id="${escapeHtml(item.item_id)}"
                data-quantity="${escapeHtml(item.quantity || 0)}"
                ${slot ? `data-hotbar-slot="${slot}"` : ''}
                title="${escapeHtml(tooltip)}"
                draggable="true">
                ${slot ? `<span class="legacy-slot__index">${slot}</span>` : ''}
                <span class="legacy-slot__visual">${itemIconMarkup(item.item_id, definition)}</span>
                <span class="legacy-slot__name">${escapeHtml(this.itemName(item.item_id))}</span>
                <span class="legacy-slot__qty">${escapeHtml(quantityLabel(item.quantity || 0))}</span>
            </button>`;
    }

    render(self, { layout, showBank = false, onDeposit, onWithdraw, onHotbarAssign, onHotbarClear, onDropItem, onSelectHotbar } = {}) {
        const inventory = this.inventoryEntries(self);
        const bank = showBank && Array.isArray(self && self.bank) ? self.bank : [];
        const hotbar = Array.isArray(self && self.hotbar) ? self.hotbar : [];
        const inventoryLayout = Object.assign({ rows: 5, cols: 8, hotbarSlots: 9 }, layout || {});
        const signature = JSON.stringify({
            hotbar,
            inventory,
            bank,
            showBank,
        });
        if (signature === this.lastSignature) return;
        this.lastSignature = signature;

        this.root.classList.remove('hidden');
        this.root.classList.add('window-panel', 'window-panel--inventory', 'legacy-inventory-panel');
        this.root.innerHTML = `
            <div class="window-panel__titlebar legacy-inventory-panel__titlebar">
                <div>
                    <strong>2D World Backpack</strong>
                    <small>Classic slot grid, quickbar wiring, and no suspicious KPI cards in sight.</small>
                </div>
                <div class="legacy-inventory-panel__meta">${Math.round(self && self.coins || 0)} coins</div>
            </div>
            <div class="legacy-inventory-panel__section legacy-inventory-panel__section--hotbar">
                <div class="legacy-inventory-panel__heading">Quickbar</div>
                <div class="legacy-hotbar-grid">${Array.from({ length: clamp(inventoryLayout.hotbarSlots || 9, 1, 12) }).map((_, index) => this.renderSlot(hotbar[index], { source: 'hotbar', slot: index + 1, active: hotbar[index] && hotbar[index].active })).join('')}</div>
            </div>
            <div class="legacy-inventory-panel__section">
                <div class="legacy-inventory-panel__heading">Backpack</div>
                <div class="legacy-backpack-grid">${(() => {
                    const slots = inventory.map((entry) => this.renderSlot(entry, { source: 'inventory' }));
                    while (slots.length < (inventoryLayout.rows * inventoryLayout.cols)) slots.push(this.renderSlot(null, { source: 'inventory' }));
                    return slots.join('');
                })()}</div>
            </div>
            ${showBank ? `
            <div class="legacy-inventory-panel__section legacy-inventory-panel__section--bank">
                <div class="legacy-inventory-panel__heading">Bank</div>
                <div class="legacy-backpack-grid legacy-backpack-grid--bank">${(bank.length ? bank : Array.from({ length: inventoryLayout.cols })).map((entry) => this.renderSlot(entry || null, { source: 'bank' })).join('')}</div>
            </div>` : ''}`;
        this.root.append(this.contextMenu, this.tooltip);

        this.root.querySelectorAll('.legacy-slot[data-item-id]').forEach((slotEl) => {
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
                    actions.push({ id: 'assign-slot', type: 'slots', slots: Array.from({ length: clamp(inventoryLayout.hotbarSlots || 9, 1, 12) }, (_, index) => index + 1) });
                    if (showBank && itemId !== 'coins') actions.push({ id: 'deposit-stack', label: 'Send stack to bank' });
                    actions.push({ id: 'drop-one', label: 'Drop 1' });
                    if (itemQuantity > 1) actions.push({ id: 'drop-stack', label: 'Drop stack' });
                } else if (source === 'bank' && showBank) {
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

        this.root.querySelectorAll('.legacy-slot[data-hotbar-slot]').forEach((slotEl) => {
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
