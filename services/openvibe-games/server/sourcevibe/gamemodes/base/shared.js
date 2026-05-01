'use strict';

module.exports = {
    ui: {
        inventory: {
            rows: 4,
            cols: 6,
            hotbar: 9,
            coinSlot: true,
        },
        menus: ['launcher', 'console', 'options', 'server-browser'],
    },
    hooks: {
        PlayerInitialSpawn(player) {
            player.SetNetworkVar('Name', player.displayName || player.name || 'Player');
            player.SetNetworkVar('Coins', Number(player.coins) || 0);
        },
        PlayerSpawn(player) {
            player.health = Number(player.maxHealth) || 100;
        },
    },
    entities: {
        sv_player: {
            Base: 'base_player',
            PrintName: 'SourceVibe Player',
            Spawnable: false,
            shared: {
                networkVars: {
                    Name: { type: 'string', predicted: false, defaultValue: '' },
                    Coins: { type: 'int', predicted: false, defaultValue: 0 },
                    ActiveWeapon: { type: 'string', predicted: true, defaultValue: '' }
                }
            }
        },
        sv_info_target: {
            Base: 'base_map_object',
            PrintName: 'Info Target',
            Spawnable: false,
            shared: {
                solid: false,
                bbox: [0, 0, 0, 0]
            }
        }
    }
};
