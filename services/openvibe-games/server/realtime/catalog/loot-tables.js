'use strict';

const LOOT_TABLES = Object.freeze([
    {
        id: 'loot.tree.oak',
        name: 'Oak Tree Drops',
        entries: [
            { item_id: 'wood', weight: 6, min: 2, max: 4 },
            { item_id: 'oak_log', weight: 3, min: 1, max: 2 },
            { item_id: 'fiber', weight: 1, min: 1, max: 2, chance: 0.4 },
        ],
    },
    {
        id: 'loot.rock.basic',
        name: 'Basic Rock Drops',
        entries: [
            { item_id: 'stone', weight: 6, min: 2, max: 4 },
            { item_id: 'copper_ore', weight: 2, min: 1, max: 2, chance: 0.5 },
            { item_id: 'coal', weight: 1, min: 1, max: 1, chance: 0.25 },
        ],
    },
    {
        id: 'loot.rock.iron',
        name: 'Iron Vein Drops',
        entries: [
            { item_id: 'stone', weight: 4, min: 1, max: 2 },
            { item_id: 'iron_ore', weight: 5, min: 1, max: 3 },
            { item_id: 'coal', weight: 2, min: 1, max: 2, chance: 0.5 },
            { item_id: 'gold_ore', weight: 1, min: 1, max: 1, chance: 0.05 },
        ],
    },
    {
        id: 'loot.bush.herbs',
        name: 'Herb Bush Drops',
        entries: [
            { item_id: 'herbs', weight: 6, min: 1, max: 3 },
            { item_id: 'seeds', weight: 2, min: 1, max: 2, chance: 0.6 },
        ],
    },
    {
        id: 'loot.npc.bandit',
        name: 'Bandit Drops',
        entries: [
            { item_id: 'scrap', weight: 5, min: 1, max: 3 },
            { item_id: 'wooden_club', weight: 1, min: 1, max: 1, chance: 0.1 },
            { item_id: 'arrow', weight: 2, min: 2, max: 6, chance: 0.5 },
        ],
    },
    {
        id: 'loot.npc.boar',
        name: 'Boar Drops',
        entries: [
            { item_id: 'meat', weight: 6, min: 1, max: 3 },
            { item_id: 'hide', weight: 4, min: 1, max: 2 },
        ],
    },
    {
        id: 'loot.boss.hoarder_king',
        name: 'Hoarder King Drops',
        entries: [
            { item_id: 'iron_ore', weight: 4, min: 4, max: 8 },
            { item_id: 'gold_ore', weight: 2, min: 1, max: 3, chance: 0.7 },
            { item_id: 'iron_sword', weight: 1, min: 1, max: 1, chance: 0.3 },
            { item_id: 'medkit', weight: 1, min: 1, max: 2, chance: 0.5 },
        ],
    },
]);

const LOOT_TABLES_BY_ID = Object.freeze(LOOT_TABLES.reduce((acc, t) => {
    acc[t.id] = t;
    return acc;
}, {}));

module.exports = { LOOT_TABLES, LOOT_TABLES_BY_ID };
