'use strict';

// Seed catalog of items for the 2D World vertical slice. Categories follow
// the runtime expectations: resource / tool / weapon / armor / build /
// consumable / cosmetic. `stackable=0` items get one slot per unit.

const ITEMS = Object.freeze([
    // resources
    { item_id: 'wood', name: 'Wood', category: 'resource', max_stack: 9999 },
    { item_id: 'oak_log', name: 'Oak Log', category: 'resource', max_stack: 9999 },
    { item_id: 'stone', name: 'Stone', category: 'resource', max_stack: 9999 },
    { item_id: 'copper_ore', name: 'Copper Ore', category: 'resource', max_stack: 9999 },
    { item_id: 'iron_ore', name: 'Iron Ore', category: 'resource', max_stack: 9999 },
    { item_id: 'gold_ore', name: 'Gold Ore', category: 'resource', max_stack: 9999 },
    { item_id: 'coal', name: 'Coal', category: 'resource', max_stack: 9999 },
    { item_id: 'fiber', name: 'Fiber', category: 'resource', max_stack: 9999 },
    { item_id: 'herbs', name: 'Herbs', category: 'resource', max_stack: 9999 },
    { item_id: 'seeds', name: 'Seeds', category: 'resource', max_stack: 9999 },
    { item_id: 'fish', name: 'Fish', category: 'resource', max_stack: 9999 },
    { item_id: 'meat', name: 'Raw Meat', category: 'resource', max_stack: 9999 },
    { item_id: 'hide', name: 'Hide', category: 'resource', max_stack: 9999 },
    { item_id: 'scrap', name: 'Scrap', category: 'resource', max_stack: 9999 },

    // tools (non-stackable)
    { item_id: 'stone_hatchet', name: 'Stone Hatchet', category: 'tool', stackable: 0, metadata: { tier: 1, skill: 'woodcut' } },
    { item_id: 'iron_hatchet', name: 'Iron Hatchet', category: 'tool', stackable: 0, metadata: { tier: 2, skill: 'woodcut' } },
    { item_id: 'stone_pickaxe', name: 'Stone Pickaxe', category: 'tool', stackable: 0, metadata: { tier: 1, skill: 'mining' } },
    { item_id: 'iron_pickaxe', name: 'Iron Pickaxe', category: 'tool', stackable: 0, metadata: { tier: 2, skill: 'mining' } },
    { item_id: 'fishing_rod', name: 'Fishing Rod', category: 'tool', stackable: 0, metadata: { skill: 'fishing' } },
    { item_id: 'hoe', name: 'Hoe', category: 'tool', stackable: 0, metadata: { skill: 'farming' } },
    { item_id: 'hammer', name: 'Hammer', category: 'tool', stackable: 0, metadata: { skill: 'construction' } },

    // weapons
    { item_id: 'wooden_club', name: 'Wooden Club', category: 'weapon', stackable: 0, metadata: { damage: 4, range: 32 } },
    { item_id: 'stone_spear', name: 'Stone Spear', category: 'weapon', stackable: 0, metadata: { damage: 6, range: 48 } },
    { item_id: 'iron_sword', name: 'Iron Sword', category: 'weapon', stackable: 0, metadata: { damage: 10, range: 36 } },
    { item_id: 'short_bow', name: 'Short Bow', category: 'weapon', stackable: 0, metadata: { damage: 7, range: 220, projectile: 'arrow' } },
    { item_id: 'arrow', name: 'Arrow', category: 'weapon', max_stack: 999 },

    // armor
    { item_id: 'cloth_chest', name: 'Cloth Tunic', category: 'armor', stackable: 0, metadata: { armor: 1 } },
    { item_id: 'leather_chest', name: 'Leather Vest', category: 'armor', stackable: 0, metadata: { armor: 3 } },
    { item_id: 'iron_chest', name: 'Iron Plate', category: 'armor', stackable: 0, metadata: { armor: 6 } },

    // buildables
    { item_id: 'build_wall', name: 'Wall Kit', category: 'build', max_stack: 99 },
    { item_id: 'build_door', name: 'Door Kit', category: 'build', max_stack: 99 },
    { item_id: 'build_bed', name: 'Bed Kit', category: 'build', max_stack: 4 },
    { item_id: 'build_chest', name: 'Chest Kit', category: 'build', max_stack: 99 },
    { item_id: 'build_workbench', name: 'Workbench Kit', category: 'build', max_stack: 8 },
    { item_id: 'build_furnace', name: 'Furnace Kit', category: 'build', max_stack: 8 },
    { item_id: 'build_farm_plot', name: 'Farm Plot', category: 'build', max_stack: 16 },
    { item_id: 'build_campfire', name: 'Campfire Kit', category: 'build', max_stack: 16 },

    // consumables
    { item_id: 'cooked_fish', name: 'Cooked Fish', category: 'consumable', max_stack: 99, metadata: { heal: 12 } },
    { item_id: 'soup', name: 'Hearty Soup', category: 'consumable', max_stack: 99, metadata: { heal: 25, stamina: 25 } },
    { item_id: 'medkit', name: 'Medkit', category: 'consumable', max_stack: 5, metadata: { heal: 50 } },
    { item_id: 'stamina_drink', name: 'Stamina Drink', category: 'consumable', max_stack: 10, metadata: { stamina: 60 } },
]);

const ITEMS_BY_ID = Object.freeze(ITEMS.reduce((acc, item) => {
    acc[item.item_id] = item;
    return acc;
}, {}));

function getItem(id) { return ITEMS_BY_ID[id] || null; }

module.exports = { ITEMS, ITEMS_BY_ID, getItem };
