'use strict';

// Crafting recipes. `station` references an in-world structure or null for
// hand-crafted recipes. `skill` + `level` gate access via the skill engine.

const RECIPES = Object.freeze([
    {
        id: 'recipe.stone_hatchet',
        result: { item_id: 'stone_hatchet', quantity: 1 },
        inputs: [{ item_id: 'wood', quantity: 2 }, { item_id: 'stone', quantity: 3 }],
        station: null,
        skill: 'crafting',
        level: 1,
        xp: 10,
    },
    {
        id: 'recipe.stone_pickaxe',
        result: { item_id: 'stone_pickaxe', quantity: 1 },
        inputs: [{ item_id: 'wood', quantity: 2 }, { item_id: 'stone', quantity: 3 }],
        station: null,
        skill: 'crafting',
        level: 1,
        xp: 10,
    },
    {
        id: 'recipe.iron_sword',
        result: { item_id: 'iron_sword', quantity: 1 },
        inputs: [{ item_id: 'iron_ore', quantity: 4 }, { item_id: 'coal', quantity: 2 }, { item_id: 'wood', quantity: 1 }],
        station: 'build_furnace',
        skill: 'smithing',
        level: 10,
        xp: 60,
    },
    {
        id: 'recipe.short_bow',
        result: { item_id: 'short_bow', quantity: 1 },
        inputs: [{ item_id: 'wood', quantity: 4 }, { item_id: 'fiber', quantity: 2 }],
        station: 'build_workbench',
        skill: 'crafting',
        level: 5,
        xp: 30,
    },
    {
        id: 'recipe.arrow',
        result: { item_id: 'arrow', quantity: 8 },
        inputs: [{ item_id: 'wood', quantity: 1 }, { item_id: 'stone', quantity: 1 }],
        station: 'build_workbench',
        skill: 'crafting',
        level: 3,
        xp: 8,
    },
    {
        id: 'recipe.cooked_fish',
        result: { item_id: 'cooked_fish', quantity: 1 },
        inputs: [{ item_id: 'fish', quantity: 1 }],
        station: 'build_campfire',
        skill: 'cooking',
        level: 1,
        xp: 5,
    },
    {
        id: 'recipe.soup',
        result: { item_id: 'soup', quantity: 1 },
        inputs: [{ item_id: 'meat', quantity: 1 }, { item_id: 'herbs', quantity: 2 }, { item_id: 'fish', quantity: 1 }],
        station: 'build_campfire',
        skill: 'cooking',
        level: 5,
        xp: 18,
    },
    {
        id: 'recipe.build_wall',
        result: { item_id: 'build_wall', quantity: 1 },
        inputs: [{ item_id: 'wood', quantity: 4 }, { item_id: 'stone', quantity: 2 }],
        station: 'build_workbench',
        skill: 'construction',
        level: 1,
        xp: 12,
    },
    {
        id: 'recipe.build_door',
        result: { item_id: 'build_door', quantity: 1 },
        inputs: [{ item_id: 'wood', quantity: 6 }],
        station: 'build_workbench',
        skill: 'construction',
        level: 2,
        xp: 14,
    },
    {
        id: 'recipe.build_bed',
        result: { item_id: 'build_bed', quantity: 1 },
        inputs: [{ item_id: 'wood', quantity: 4 }, { item_id: 'fiber', quantity: 6 }],
        station: 'build_workbench',
        skill: 'construction',
        level: 3,
        xp: 18,
    },
]);

const RECIPES_BY_ID = Object.freeze(RECIPES.reduce((acc, r) => {
    acc[r.id] = r;
    return acc;
}, {}));

module.exports = { RECIPES, RECIPES_BY_ID };
