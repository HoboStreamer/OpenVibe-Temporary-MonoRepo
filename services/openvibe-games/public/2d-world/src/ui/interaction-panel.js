function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function itemEntries(self) {
    const inventory = Array.isArray(self && self.inventory) ? self.inventory.map((entry) => ({ ...entry })) : [];
    if (Number(self && self.coins || 0) > 0) inventory.unshift({ item_id: 'coins', quantity: Number(self.coins || 0), synthetic: true });
    return inventory;
}

function isImageIcon(icon) {
    return typeof icon === 'string' && (icon.includes('/') || /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(icon));
}

function itemIconMarkup(itemId, item) {
    const icon = item && (item.icon || item.render && item.render.icon || item.metadata && item.metadata.icon);
    if (isImageIcon(icon)) return `<img class="interaction-entry__icon-image" src="${escapeHtml(icon)}" alt="" />`;
    if (icon && String(icon).length <= 2) return `<span class="interaction-entry__icon-emoji">${escapeHtml(icon)}</span>`;
    if (itemId === 'coins') return '<span class="interaction-entry__icon-emoji">🪙</span>';
    if (item && item.category === 'weapon') return '<span class="interaction-entry__icon-emoji">⚔</span>';
    if (item && item.category === 'tool') return '<span class="interaction-entry__icon-emoji">🛠</span>';
    if (item && item.category === 'build') return '<span class="interaction-entry__icon-emoji">🧱</span>';
    return '<span class="interaction-entry__icon-emoji">⬢</span>';
}

export class InteractionPanel {
    constructor(root, items = []) {
        this.root = root;
        this.lastSignature = '';
        this.setItemCatalog(items);
    }

    setItemCatalog(items = []) {
        this.itemMap = Object.fromEntries((items || []).map((item) => [item.item_id, item]));
    }

    itemName(itemId) {
        return this.itemMap && this.itemMap[itemId] && this.itemMap[itemId].name || itemId;
    }

    itemDefinition(itemId) {
        return this.itemMap && this.itemMap[itemId] || { item_id: itemId, name: itemId, category: 'misc', metadata: {} };
    }

    hide() {
        this.root.classList.add('hidden');
        this.root.innerHTML = '';
        this.lastSignature = '';
    }

    _renderContainer(interaction, self) {
        const stored = Array.isArray(interaction.items) ? interaction.items : [];
        const backpack = itemEntries(self);
        return `
            <div class="window-panel__titlebar interaction-panel__titlebar">
                <div>
                    <strong>${escapeHtml(interaction.title || 'Container')}</strong>
                    <small>${escapeHtml(interaction.description || 'Server-authoritative storage.')}</small>
                </div>
                <button type="button" class="mini-button interaction-action" data-action="close">Close</button>
            </div>
            <div class="interaction-panel__section">
                <div class="panel-header">Stored items</div>
                <div class="interaction-list">
                    ${stored.length ? stored.map((entry) => `
                        <div class="interaction-entry">
                            <div class="interaction-entry__icon">${itemIconMarkup(entry.item_id, this.itemDefinition(entry.item_id))}</div>
                            <div class="interaction-entry__body">
                                <strong>${escapeHtml(entry.item_name || this.itemName(entry.item_id))}</strong>
                                <small>${escapeHtml(entry.note || 'Recovered from the legacy world.')} · Qty ${Math.round(entry.quantity || 0)}</small>
                            </div>
                            <div class="interaction-entry__actions">
                                <button type="button" class="mini-button interaction-action" data-action="take" data-item-id="${escapeHtml(entry.item_id)}" data-quantity="1">Take 1</button>
                                <button type="button" class="mini-button interaction-action" data-action="take" data-item-id="${escapeHtml(entry.item_id)}" data-quantity="${Math.max(1, Math.round(entry.quantity || 0))}">Take all</button>
                            </div>
                        </div>`).join('') : '<div class="empty">Nothing stored here yet.</div>'}
                </div>
            </div>
            ${interaction.can_store === false ? '' : `
            <div class="interaction-panel__section">
                <div class="panel-header">Backpack</div>
                <div class="interaction-list interaction-list--compact">
                    ${backpack.length ? backpack.map((entry) => `
                        <div class="interaction-entry interaction-entry--compact">
                            <div class="interaction-entry__icon">${itemIconMarkup(entry.item_id, this.itemDefinition(entry.item_id))}</div>
                            <div class="interaction-entry__body">
                                <strong>${escapeHtml(this.itemName(entry.item_id))}</strong>
                                <small>Qty ${Math.round(entry.quantity || 0)}</small>
                            </div>
                            <div class="interaction-entry__actions">
                                <button type="button" class="mini-button interaction-action" data-action="store" data-item-id="${escapeHtml(entry.item_id)}" data-quantity="1">Store 1</button>
                                <button type="button" class="mini-button interaction-action" data-action="store" data-item-id="${escapeHtml(entry.item_id)}" data-quantity="${Math.max(1, Math.round(entry.quantity || 0))}">Store all</button>
                            </div>
                        </div>`).join('') : '<div class="empty">Your backpack is empty.</div>'}
                </div>
            </div>`}
        `;
    }

    _renderSign(interaction) {
        return `
            <div class="window-panel__titlebar interaction-panel__titlebar">
                <div>
                    <strong>${escapeHtml(interaction.title || 'Sign')}</strong>
                    <small>${escapeHtml(interaction.description || 'Write a message for the next wanderer.')}</small>
                </div>
                <button type="button" class="mini-button interaction-action" data-action="close">Close</button>
            </div>
            <div class="interaction-panel__section">
                <div class="panel-header">Message</div>
                <textarea class="interaction-sign__textarea" rows="7" maxlength="180" ${interaction.editable ? '' : 'disabled'}>${escapeHtml(interaction.text || '')}</textarea>
                <div class="interaction-sign__footer">
                    <small>${interaction.editable ? 'Editable sign text is saved on the authoritative room.' : 'This sign is read-only.'}</small>
                    ${interaction.editable ? '<button type="button" class="mini-button mini-button--primary interaction-action" data-action="save-sign">Save sign</button>' : ''}
                </div>
            </div>
        `;
    }

    _renderVehicle(interaction) {
        const details = interaction.details && typeof interaction.details === 'object' ? Object.entries(interaction.details) : [];
        return `
            <div class="window-panel__titlebar interaction-panel__titlebar">
                <div>
                    <strong>${escapeHtml(interaction.title || 'Vehicle')}</strong>
                    <small>${escapeHtml(interaction.description || 'A future driving pass lives here.')}</small>
                </div>
                <button type="button" class="mini-button interaction-action" data-action="close">Close</button>
            </div>
            <div class="interaction-panel__section">
                <div class="panel-header">Status</div>
                <div class="interaction-list">
                    ${details.length ? details.map(([key, value]) => `
                        <div class="interaction-entry interaction-entry--detail">
                            <div class="interaction-entry__body">
                                <strong>${escapeHtml(String(key).replaceAll('_', ' '))}</strong>
                                <small>${escapeHtml(String(value))}</small>
                            </div>
                        </div>`).join('') : '<div class="empty">No telemetry available yet.</div>'}
                </div>
            </div>
        `;
    }

    _renderInspect(interaction) {
        return `
            <div class="window-panel__titlebar interaction-panel__titlebar">
                <div>
                    <strong>${escapeHtml(interaction.title || 'Inspect')}</strong>
                    <small>${escapeHtml(interaction.description || 'Nothing more to do here just yet.')}</small>
                </div>
                <button type="button" class="mini-button interaction-action" data-action="close">Close</button>
            </div>
        `;
    }

    render(interaction, self, handlers = {}) {
        if (!interaction || interaction.type === 'shop') {
            this.hide();
            return;
        }
        const signature = JSON.stringify({
            interaction,
            inventory: interaction.type === 'container' ? itemEntries(self) : null,
        });
        if (signature === this.lastSignature) {
            this.root.classList.remove('hidden');
            return;
        }
        this.lastSignature = signature;
        this.root.classList.remove('hidden');
        this.root.classList.add('window-panel', 'interaction-panel');
        if (interaction.type === 'container') this.root.innerHTML = this._renderContainer(interaction, self);
        else if (interaction.type === 'sign') this.root.innerHTML = this._renderSign(interaction);
        else if (interaction.type === 'vehicle') this.root.innerHTML = this._renderVehicle(interaction);
        else this.root.innerHTML = this._renderInspect(interaction);

        this.root.querySelectorAll('.interaction-action[data-action="close"]').forEach((button) => {
            button.onclick = () => handlers.onClose && handlers.onClose(interaction);
        });
        this.root.querySelectorAll('.interaction-action[data-action="take"]').forEach((button) => {
            button.onclick = () => handlers.onTake && handlers.onTake({
                interaction,
                itemId: button.dataset.itemId,
                quantity: Math.max(1, Number(button.dataset.quantity || 1)),
            });
        });
        this.root.querySelectorAll('.interaction-action[data-action="store"]').forEach((button) => {
            button.onclick = () => handlers.onStore && handlers.onStore({
                interaction,
                itemId: button.dataset.itemId,
                quantity: Math.max(1, Number(button.dataset.quantity || 1)),
            });
        });
        const saveButton = this.root.querySelector('.interaction-action[data-action="save-sign"]');
        const textArea = this.root.querySelector('.interaction-sign__textarea');
        if (saveButton && textArea) {
            saveButton.onclick = () => handlers.onSaveText && handlers.onSaveText({
                interaction,
                text: textArea.value,
            });
        }
    }
}
