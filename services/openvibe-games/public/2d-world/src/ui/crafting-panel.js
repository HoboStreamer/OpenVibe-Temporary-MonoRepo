export class CraftingPanel {
    constructor(root, recipes = [], items = []) {
        this.root = root;
        this.recipes = recipes;
        this.itemMap = Object.fromEntries((items || []).map((item) => [item.item_id, item]));
        this.root.innerHTML = '<div class="panel-header">Crafting</div><div class="recipes"></div>';
        this.recipesEl = this.root.querySelector('.recipes');
    }

    itemName(itemId) {
        return this.itemMap && this.itemMap[itemId] && this.itemMap[itemId].name || itemId;
    }

    render(self, onCraft) {
        const levels = self && self.levels || {};
        const inventory = new Map(((self && self.inventory) || []).map((item) => [item.item_id, Number(item.quantity || 0)]));
        this.recipesEl.innerHTML = this.recipes.map((recipe) => {
            const level = Number(levels[recipe.skill] || 1);
            const hasLevel = level >= Number(recipe.level || 1);
            const hasInputs = (recipe.inputs || []).every((input) => (inventory.get(input.item_id) || 0) >= Number(input.quantity || 0));
            const craftable = hasLevel && hasInputs;
            return `
            <button class="recipe-row ${craftable ? 'craftable' : 'locked'}" data-id="${recipe.id}" ${craftable ? '' : 'disabled'}>
                <div><strong>${this.itemName(recipe.result.item_id)}</strong> x${recipe.result.quantity}</div>
                <small>${recipe.skill} ${recipe.level}+${recipe.station ? ` · ${recipe.station}` : ''}</small>
                <span>${(recipe.inputs || []).map((input) => {
                    const owned = inventory.get(input.item_id) || 0;
                    return `${this.itemName(input.item_id)} ${owned}/${input.quantity}`;
                }).join(' · ')}</span>
            </button>`;
        }).join('');
        this.recipesEl.querySelectorAll('.recipe-row').forEach((button) => button.onclick = () => onCraft && onCraft(button.dataset.id));
    }
}
