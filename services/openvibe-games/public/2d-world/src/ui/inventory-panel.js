const EQUIPMENT_SLOTS = [
    { id: 'weapon', label: 'Weapon' },
    { id: 'armor', label: 'Armor' },
    { id: 'axe', label: 'Hatchet' },
    { id: 'pickaxe', label: 'Pickaxe' },
    { id: 'rod', label: 'Fishing Rod' },
];

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

export class InventoryPanel {
    constructor(root, items = []) {
        this.root = root;
        this.lastSignature = '';
        this.dragPayload = null;
        this.setItemCatalog(items);
        this.root.innerHTML = `
            <div class="panel-header">Inventory & Bank</div>
            <div class="inventory-summary"></div>
            <div class="equipment-grid"></div>
            <div class="inventory-grid"></div>
            <div class="bank-grid"></div>`;
        this.summaryEl = this.root.querySelector('.inventory-summary');
        this.equipmentEl = this.root.querySelector('.equipment-grid');
        this.inventoryEl = this.root.querySelector('.inventory-grid');
        this.bankEl = this.root.querySelector('.bank-grid');
    }

    setItemCatalog(items = []) {
        this.itemMap = Object.fromEntries((items || []).map((item) => [item.item_id, item]));
        this.lastSignature = '';
    }

    itemName(itemId) {
        return this.itemMap && this.itemMap[itemId] && this.itemMap[itemId].name || itemId;
    }

    itemEquipSlot(itemId) {
        const item = this.itemMap && this.itemMap[itemId];
        if (!item || !item.category) return null;
        if (item.category === 'weapon') return 'weapon';
        if (item.category === 'armor') return 'armor';
        if (item.category === 'tool') {
            const skill = item.metadata && item.metadata.skill;
            if (skill === 'woodcut') return 'axe';
            if (skill === 'mining') return 'pickaxe';
            if (skill === 'fishing') return 'rod';
        }
        return null;
    }

    slotLabel(slotId) {
        const slot = EQUIPMENT_SLOTS.find((entry) => entry.id === slotId);
        return slot ? slot.label : slotId;
    }

    itemMetaLabel(itemId) {
        const item = this.itemMap && this.itemMap[itemId];
        const slot = this.itemEquipSlot(itemId);
        if (slot) return `Equip: ${this.slotLabel(slot)}`;
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

    render(self, { onDeposit, onWithdraw, onEquip, onClearSlot } = {}) {
        const inventory = self && self.inventory || [];
        const bank = self && self.bank || [];
        const equipment = self && self.equipment || {};
        const signature = JSON.stringify({
            coins: Math.round(self && self.coins || 0),
            equipment,
            inventory,
            bank,
        });
        if (signature === this.lastSignature) return;
        this.lastSignature = signature;

        this.summaryEl.innerHTML = `
            <div class="inventory-chip"><span>Coins</span><strong>${Math.round(self && self.coins || 0)}</strong></div>
            <div class="inventory-chip"><span>Weapon</span><strong>${escapeHtml(this.itemName(equipment.weapon || 'fists'))}</strong></div>
            <div class="inventory-chip"><span>Tooling</span><strong>${escapeHtml(this.itemName(equipment.axe || equipment.pickaxe || equipment.rod || 'hands'))}</strong></div>`;

        this.equipmentEl.innerHTML = `<h4>Loadout</h4>
            <div class="equipment-slot-grid">${EQUIPMENT_SLOTS.map((slot) => {
                const equippedId = equipment[slot.id] || '';
                const equippedName = equippedId ? this.itemName(equippedId) : 'Drop a matching item here';
                return `
                    <div class="equipment-slot ${equippedId ? 'filled' : ''}" data-slot="${slot.id}" ${equippedId ? `draggable="true" data-id="${equippedId}" data-drag-kind="equipment"` : ''}>
                        <div class="equipment-slot__label">${escapeHtml(slot.label)}</div>
                        <div class="equipment-slot__name">${escapeHtml(equippedName)}</div>
                        <div class="equipment-slot__meta">
                            <span>${equippedId ? escapeHtml(this.itemMetaLabel(equippedId)) : 'Drag from backpack'}</span>
                            ${equippedId ? `<button type="button" class="mini-button" data-action="clear-slot" data-slot="${slot.id}">Clear</button>` : ''}
                        </div>
                    </div>`;
            }).join('')}</div>
            <div class="inventory-help">Drag backpack items into loadout slots, or double-click an equippable item to snap it into place.</div>`;

        this.inventoryEl.innerHTML = `<h4>Backpack</h4>
            <div class="inventory-dropzone" data-dropzone="backpack">Drop an equipped slot here to clear it.</div>
            ${inventory.map((item) => `
                <div class="item-row item-row--inventory" draggable="true" data-kind="inventory" data-id="${item.item_id}">
                    <div class="item-row-body">
                        <strong>${escapeHtml(this.itemName(item.item_id))}</strong>
                        <small>${escapeHtml(this.itemMetaLabel(item.item_id))}</small>
                    </div>
                    <div class="item-actions">
                        <strong>x${item.quantity}</strong>
                        <button type="button" class="mini-button" data-action="deposit" data-id="${item.item_id}">Bank</button>
                    </div>
                </div>`).join('') || '<div class="empty">No items</div>'}`;

        this.bankEl.innerHTML = `<h4>Bank</h4>${bank.map((item) => `
            <div class="item-row">
                <div class="item-row-body">
                    <strong>${escapeHtml(this.itemName(item.item_id))}</strong>
                    <small>Withdraw back to backpack</small>
                </div>
                <div class="item-actions">
                    <strong>x${item.quantity}</strong>
                    <button type="button" class="mini-button" data-action="withdraw" data-id="${item.item_id}">Withdraw</button>
                </div>
            </div>`).join('') || '<div class="empty">No bank items</div>'}`;

        this.root.querySelectorAll('[data-action="deposit"]').forEach((button) => {
            button.onclick = () => onDeposit && onDeposit(button.dataset.id);
        });
        this.root.querySelectorAll('[data-action="withdraw"]').forEach((button) => {
            button.onclick = () => onWithdraw && onWithdraw(button.dataset.id);
        });
        this.root.querySelectorAll('[data-action="clear-slot"]').forEach((button) => {
            button.onclick = () => onClearSlot && onClearSlot(button.dataset.slot);
        });

        this.root.querySelectorAll('[data-kind="inventory"]').forEach((row) => {
            row.addEventListener('dragstart', (event) => {
                this.dragPayload = { source: 'inventory', itemId: row.dataset.id };
                if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('application/json', JSON.stringify(this.dragPayload));
                }
            });
            row.addEventListener('dblclick', () => {
                const slot = this.itemEquipSlot(row.dataset.id);
                if (slot && onEquip) onEquip({ itemId: row.dataset.id, slot });
            });
        });

        this.root.querySelectorAll('[data-drag-kind="equipment"]').forEach((slotEl) => {
            slotEl.addEventListener('dragstart', (event) => {
                this.dragPayload = { source: 'equipment', slot: slotEl.dataset.slot, itemId: slotEl.dataset.id };
                if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('application/json', JSON.stringify(this.dragPayload));
                }
            });
        });

        this.root.querySelectorAll('.equipment-slot').forEach((slotEl) => {
            const slotId = slotEl.dataset.slot;
            slotEl.addEventListener('dragover', (event) => {
                const payload = this.readDragPayload(event);
                if (!payload || payload.source !== 'inventory') return;
                if (this.itemEquipSlot(payload.itemId) !== slotId) return;
                event.preventDefault();
                slotEl.classList.add('drag-over');
            });
            slotEl.addEventListener('dragleave', () => slotEl.classList.remove('drag-over'));
            slotEl.addEventListener('drop', (event) => {
                slotEl.classList.remove('drag-over');
                const payload = this.readDragPayload(event);
                if (!payload || payload.source !== 'inventory') return;
                if (this.itemEquipSlot(payload.itemId) !== slotId) return;
                event.preventDefault();
                if (onEquip) onEquip({ itemId: payload.itemId, slot: slotId });
            });
        });

        this.root.querySelectorAll('[data-dropzone="backpack"]').forEach((dropzone) => {
            dropzone.addEventListener('dragover', (event) => {
                const payload = this.readDragPayload(event);
                if (!payload || payload.source !== 'equipment' || !payload.slot) return;
                event.preventDefault();
                dropzone.classList.add('drag-over');
            });
            dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
            dropzone.addEventListener('drop', (event) => {
                dropzone.classList.remove('drag-over');
                const payload = this.readDragPayload(event);
                if (!payload || payload.source !== 'equipment' || !payload.slot) return;
                event.preventDefault();
                if (onClearSlot) onClearSlot(payload.slot);
            });
        });
    }
}
