'use strict';

const { BaseEntity } = require('./base-entity');
const { BaseAnim } = require('./base-anim');
const { BasePlayer } = require('./base-player');
const { BaseWeapon } = require('./base-weapon');
const { BaseResource } = require('./base-resource');
const { BaseStructure } = require('./base-structure');
const { BaseDoor } = require('./base-door');
const { BaseContainer } = require('./base-container');
const { BaseNpc } = require('./base-npc');
const { BaseItem } = require('./base-item');
const { BaseVehicle } = require('./base-vehicle');
const { BaseMapObject } = require('./base-map-object');
const { composeDefinition } = require('./entity-instance');

const DEFAULT_BUILTINS = {
    base_entity: BaseEntity,
    base_anim: BaseAnim,
    base_player: BasePlayer,
    base_weapon: BaseWeapon,
    base_resource: BaseResource,
    base_structure: BaseStructure,
    base_door: BaseDoor,
    base_container: BaseContainer,
    base_npc: BaseNpc,
    base_item: BaseItem,
    base_vehicle: BaseVehicle,
    base_map_object: BaseMapObject,
};

class EntityRegistry {
    constructor() {
        this.definitions = new Map();
        this.instances = new Map();
        this.builtins = new Map(Object.entries(DEFAULT_BUILTINS));
    }

    RegisterBuiltin(name, ctor) {
        const key = String(name || '').trim().toLowerCase();
        if (!key) throw new Error('builtin entity name required');
        this.builtins.set(key, ctor);
    }

    Register(className, definition = {}) {
        const key = String(className || '').trim().toLowerCase();
        if (!key) throw new Error('entity class name required');
        const entry = Object.assign({}, definition, { ClassName: key });
        this.definitions.set(key, entry);
        return this.Resolve(key);
    }

    Resolve(className, stack = []) {
        const key = String(className || '').trim().toLowerCase();
        if (!key) throw new Error('entity class name required');
        if (stack.includes(key)) throw new Error(`circular entity inheritance detected: ${stack.join(' -> ')} -> ${key}`);
        const definition = this.definitions.get(key) || { ClassName: key };
        const baseName = String(definition.Base || '').trim().toLowerCase();
        let merged = composeDefinition({}, definition);
        let ctor = this.builtins.get('base_entity') || BaseEntity;

        if (baseName) {
            if (this.definitions.has(baseName)) {
                const resolvedBase = this.Resolve(baseName, stack.concat(key));
                merged = composeDefinition(resolvedBase, definition);
                ctor = resolvedBase.__ctor || ctor;
            } else if (this.builtins.has(baseName)) {
                ctor = this.builtins.get(baseName);
                merged = composeDefinition({ Base: null }, definition);
            }
        }

        if (this.builtins.has(key)) ctor = this.builtins.get(key);
        merged.ClassName = key;
        merged.__ctor = ctor;
        return merged;
    }

    Create(className, data = {}) {
        const definition = this.Resolve(className);
        const Ctor = definition.__ctor || BaseEntity;
        const instance = new Ctor({
            className: definition.ClassName,
            registry: this,
            definition,
            data,
        });
        this.instances.set(instance.id, instance);
        return instance;
    }

    Spawn(className, data = {}) {
        return this.Create(className, data);
    }

    Get(id) {
        return this.instances.get(String(id || '').trim()) || null;
    }

    Remove(id) {
        const entityId = typeof id === 'string' ? id : id && id.id;
        if (!entityId || !this.instances.has(entityId)) return false;
        this.instances.delete(entityId);
        return true;
    }

    All() {
        return Array.from(this.instances.values());
    }

    FindByClass(className) {
        const key = String(className || '').trim().toLowerCase();
        return this.All().filter((entity) => entity.className === key);
    }

    ListDefinitions() {
        const builtins = Array.from(this.builtins.keys()).map((name) => ({ className: name, builtin: true }));
        const custom = Array.from(this.definitions.keys()).map((name) => ({ className: name, builtin: false, definition: this.Resolve(name) }));
        return [...builtins, ...custom].sort((a, b) => a.className.localeCompare(b.className));
    }
}

module.exports = {
    EntityRegistry,
    DEFAULT_BUILTINS,
};
