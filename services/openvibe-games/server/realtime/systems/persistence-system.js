'use strict';

function worldSnapshotPayload(room) {
    return {
        version: 1,
        world_id: room.world.id,
        generated_at: new Date().toISOString(),
        players: Array.from(room.players.values()).map((player) => ({
            id: player.id,
            user_id: player.user_id,
            display_name: player.display_name,
            x: player.x,
            y: player.y,
            zone_id: player.zone_id,
            hp: player.hp,
            max_hp: player.max_hp,
            stamina: player.stamina,
            max_stamina: player.max_stamina,
            equip_weapon: player.equip_weapon || '',
            equip_armor: player.equip_armor || '',
            levels: player.levels,
        })),
        resources: Array.from(room.resources.values()).map((resource) => ({
            id: resource.id,
            zone_id: resource.zone_id,
            kind: resource.kind,
            x: resource.x,
            y: resource.y,
            hp: resource.hp,
            max_hp: resource.max_hp,
            respawn_at: resource.respawn_at,
            loot_table_id: resource.loot_table_id,
        })),
        npcs: Array.from(room.npcs.values()).map((npc) => ({
            id: npc.id,
            template_id: npc.template_id,
            zone_id: npc.zone_id,
            x: npc.x,
            y: npc.y,
            hp: npc.hp,
            max_hp: npc.max_hp,
            respawn_at: npc.respawn_at,
        })),
        loot: Array.from(room.loot.values()).map((drop) => Object.assign({}, drop)),
        structures: Array.from(room.structures.values()).map((structure) => ({
            id: structure.id,
            type: structure.type,
            zone_id: structure.zone_id,
            owner_id: structure.owner_id,
            x: structure.x,
            y: structure.y,
            size: structure.size || 48,
            data: structure.data || {},
        })),
    };
}

module.exports = { worldSnapshotPayload };
