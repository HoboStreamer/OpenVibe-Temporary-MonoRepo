export class BuildMenu {
    constructor(root, items = [], catalog = []) {
        this.root = root;
        this.items = items;
        this.itemMap = Object.fromEntries((catalog || []).map((item) => [item.item_id, item]));
        this.selected = null;
    }

    itemName(itemId) {
        return this.itemMap && this.itemMap[itemId] && this.itemMap[itemId].name || itemId;
    }

    render(onSelect) {
        this.root.innerHTML = `<div class="panel-header">Build</div>${this.items.map((item) => `<button class="build-row ${this.selected === item ? 'active' : ''}" data-id="${item}">${this.itemName(item)}</button>`).join('')}`;
        this.root.querySelectorAll('.build-row').forEach((button) => button.onclick = () => {
            this.selected = button.dataset.id;
            this.render(onSelect);
            if (onSelect) onSelect(this.selected);
        });
    }
}
