'use strict';

const NPC_TEMPLATES = Object.freeze([
    {
        id: 'npc.boar',
        name: 'Boar',
        kind: 'mob',
        hp: 18, damage: 3, speed: 70, aggro_radius: 80,
        loot_table_id: 'loot.npc.boar',
    },
    {
        id: 'npc.bandit',
        name: 'Bandit',
        kind: 'mob',
        hp: 30, damage: 5, speed: 90, aggro_radius: 180,
        loot_table_id: 'loot.npc.bandit',
        held_item_id: 'iron_sword',
    },
    {
        id: 'npc.hoarder',
        name: 'Hoarder Raider',
        kind: 'mob',
        hp: 45, damage: 7, speed: 80, aggro_radius: 220,
        loot_table_id: 'loot.npc.bandit',
        held_item_id: 'stone_spear',
    },
    {
        id: 'npc.farmer',
        name: 'Outpost Farmer',
        kind: 'npc',
        hp: 20, damage: 0, speed: 40, aggro_radius: 0,
        loot_table_id: null,
        held_item_id: 'hoe',
        interaction: {
            type: 'shop',
            shop_id: 'shop.outpost.farmer',
            title: 'Farmer\'s Stall',
            prompt: 'Browse seeds and field supplies',
            description: 'Seeds, soup, and starter gathering gear for the long grind.',
            inventory: [
                { item_id: 'seeds', price: 6, quantity: 4, note: 'Starter planting bundle' },
                { item_id: 'fiber', price: 8, quantity: 5, note: 'Twine and cloth basics' },
                { item_id: 'hoe', price: 32, quantity: 1, note: 'Tend your farm plots' },
                { item_id: 'soup', price: 18, quantity: 1, note: 'Patch up after a rough trip' },
            ],
        },
    },
    {
        id: 'npc.fisherman',
        name: 'Fisherman',
        kind: 'npc',
        hp: 20, damage: 0, speed: 40, aggro_radius: 0,
        loot_table_id: null,
        held_item_id: 'fishing_rod',
        interaction: {
            type: 'shop',
            shop_id: 'shop.outpost.fisherman',
            title: 'Dockside Tackle',
            prompt: 'Browse rods and rations',
            description: 'Fishing kits, cooked meals, and a bit of stamina in a bottle.',
            inventory: [
                { item_id: 'fishing_rod', price: 42, quantity: 1, note: 'For calm water and patience' },
                { item_id: 'cooked_fish', price: 10, quantity: 2, note: 'A hot meal for the road' },
                { item_id: 'stamina_drink', price: 20, quantity: 1, note: 'Keeps the run going' },
                { item_id: 'fish', price: 8, quantity: 2, note: 'Raw catch for campfire cooking' },
            ],
        },
    },
    {
        id: 'npc.quartermaster',
        name: 'Quartermaster',
        kind: 'npc',
        hp: 28, damage: 0, speed: 36, aggro_radius: 0,
        loot_table_id: null,
        held_item_id: 'stone_spear',
        interaction: {
            type: 'shop',
            shop_id: 'shop.outpost.quartermaster',
            title: 'Quartermaster Supply Crate',
            prompt: 'Browse tools and starter weapons',
            description: 'Fresh off the boat: enough kit to get you back into the fight.',
            inventory: [
                { item_id: 'wooden_club', price: 16, quantity: 1, note: 'Reliable bonk technology' },
                { item_id: 'stone_spear', price: 28, quantity: 1, note: 'Longer reach for safer scraps' },
                { item_id: 'stone_hatchet', price: 24, quantity: 1, note: 'Basic woodcutting tool' },
                { item_id: 'stone_pickaxe', price: 24, quantity: 1, note: 'Basic mining tool' },
                { item_id: 'build_campfire', price: 18, quantity: 1, note: 'Cook and recover anywhere' },
                { item_id: 'build_wall', price: 22, quantity: 1, note: 'Quick shelter starter' },
            ],
        },
    },
    {
        id: 'npc.boss.hoarder_king',
        name: 'Hoarder King',
        kind: 'boss',
        hp: 320, damage: 14, speed: 60, aggro_radius: 320,
        loot_table_id: 'loot.boss.hoarder_king',
        held_item_id: 'iron_sword',
    },
]);

const NPC_TEMPLATES_BY_ID = Object.freeze(NPC_TEMPLATES.reduce((acc, t) => {
    acc[t.id] = t;
    return acc;
}, {}));

module.exports = { NPC_TEMPLATES, NPC_TEMPLATES_BY_ID };
