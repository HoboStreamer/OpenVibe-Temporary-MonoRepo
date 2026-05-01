'use strict';

module.exports = {
    ui: {
        inventory: {
            rows: 5,
            cols: 8,
            hotbar: 9,
            coinSlot: true,
        },
        panels: ['inventory', 'crafting', 'skills', 'build', 'map', 'mods', 'shop'],
        hud: {
            showEventFeedByDefault: false,
            layout: '2dworld',
        },
    },
    hooks: {
        SVPopulateLauncher(entry) {
            entry.tags = ['survival', 'sandbox', 'crafting', 'flagship'];
            return entry;
        },
    },
    entities: {
        sv_2dworld_player: {
            Base: 'sv_player',
            PrintName: '2D World Player',
            Spawnable: false,
            shared: {
                bbox: [-18, -36, 36, 72],
                networkVars: {
                    Zone: { type: 'string', predicted: false, defaultValue: 'outpost' },
                    Stamina: { type: 'float', predicted: true, defaultValue: 100 }
                }
            }
        },
        sv_tree_resource: {
            Base: 'base_resource',
            PrintName: 'Tree',
            shared: {
                maxHealth: 120,
                gatherSkill: 'woodcut',
                lootTable: 'woodcut-tree'
            }
        },
        sv_rock_resource: {
            Base: 'base_resource',
            PrintName: 'Ore Vein',
            shared: {
                maxHealth: 140,
                gatherSkill: 'mining',
                lootTable: 'mining-rock'
            }
        },
        sv_storage_crate: {
            Base: 'base_container',
            PrintName: 'Storage Crate',
            shared: {
                slots: 48,
                bbox: [-22, -16, 44, 32]
            }
        },
        sv_shopkeep: {
            Base: 'base_npc',
            PrintName: 'Shopkeeper',
            shared: {
                disposition: 'friendly'
            }
        }
    }
};
