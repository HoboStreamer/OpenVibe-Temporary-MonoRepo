'use strict';

const SKILL_KEYS = Object.freeze([
    'attack', 'strength', 'defense', 'ranged', 'magic',
    'mining', 'woodcut', 'fishing', 'farming', 'cooking',
    'crafting', 'smithing', 'construction', 'agility', 'hoarding',
]);

const SKILL_TO_XP_FIELD = Object.freeze({
    mining: 'mining_xp',
    fishing: 'fishing_xp',
    woodcut: 'woodcut_xp',
    farming: 'farming_xp',
    cooking: 'crafting_xp',
    crafting: 'crafting_xp',
    smithing: 'smithing_xp',
    agility: 'agility_xp',
    construction: 'crafting_xp',
    attack: 'combat_xp',
    strength: 'combat_xp',
    defense: 'combat_xp',
    ranged: 'combat_xp',
    magic: 'combat_xp',
    hoarding: 'combat_xp',
});

module.exports = { SKILL_KEYS, SKILL_TO_XP_FIELD };
