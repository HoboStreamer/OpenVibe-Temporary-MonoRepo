'use strict';

const { clonePlain, uniqueEntityId } = require('./entity-instance');

class BaseEntity {
    constructor({ className, registry, definition = {}, data = {} } = {}) {
        this.id = data.id || uniqueEntityId(className || 'entity');
        this.className = className || definition.ClassName || 'base_entity';
        this.registry = registry || null;
        this.definition = definition;
        this.Base = definition.Base || null;
        this.Type = definition.Type || 'entity';
        this.PrintName = definition.PrintName || this.className;
        this.Category = definition.Category || 'SourceVibe';
        this.Spawnable = definition.Spawnable !== false;
        this.authority = definition.authority || 'server';
        this.bbox = clonePlain((definition.shared && definition.shared.bbox) || data.bbox || [0, 0, 0, 0]);
        this.parts = clonePlain((definition.shared && definition.shared.parts) || data.parts || []);
        this.networkVarsMeta = clonePlain((definition.shared && definition.shared.networkVars) || definition.networkVars || {});
        this.networkVars = {};
        this.removed = false;
        this.x = Number(data.x) || 0;
        this.y = Number(data.y) || 0;
        this.health = Number(data.health != null ? data.health : definition.shared && definition.shared.maxHealth) || 0;
        this.maxHealth = Number(data.maxHealth != null ? data.maxHealth : definition.shared && definition.shared.maxHealth) || this.health;
        Object.assign(this, clonePlain(definition.shared || {}), clonePlain(data || {}));
        for (const [name, meta] of Object.entries(this.networkVarsMeta)) {
            const defaultValue = meta && Object.prototype.hasOwnProperty.call(meta, 'defaultValue') ? meta.defaultValue : null;
            this.networkVars[name] = data[name] != null ? data[name] : clonePlain(defaultValue);
        }
        if (typeof definition.Initialize === 'function') definition.Initialize.call(this);
    }

    SetNetworkVar(name, value) {
        this.networkVars[String(name)] = value;
        return value;
    }

    GetNetworkVar(name) {
        return this.networkVars[String(name)];
    }

    GetNetworkVarMeta(name) {
        return this.networkVarsMeta[String(name)] || null;
    }

    Use(player, context) {
        if (typeof this.definition.Use === 'function') return this.definition.Use.call(this, player, context);
        return undefined;
    }

    TakeDamage(damageInfo = {}) {
        const amount = Math.max(0, Number(damageInfo.amount) || 0);
        this.health = Math.max(0, Number(this.health) - amount);
        if (typeof this.definition.OnDamage === 'function') this.definition.OnDamage.call(this, damageInfo);
        if (this.health <= 0 && typeof this.definition.OnDestroyed === 'function') {
            this.definition.OnDestroyed.call(this, damageInfo.attacker || null);
        }
        return this.health;
    }

    EmitSound(nameOrPath, options = {}) {
        return {
            entityId: this.id,
            sound: String(nameOrPath || ''),
            options: clonePlain(options),
        };
    }

    ShowNotify(message, ttlMs = 2000) {
        return {
            entityId: this.id,
            message: String(message || ''),
            ttlMs: Number(ttlMs) || 2000,
        };
    }

    Remove() {
        this.removed = true;
        if (this.registry && typeof this.registry.Remove === 'function') this.registry.Remove(this.id);
        if (typeof this.definition.OnRemove === 'function') this.definition.OnRemove.call(this);
    }

    Serialize() {
        return {
            id: this.id,
            className: this.className,
            type: this.Type,
            printName: this.PrintName,
            category: this.Category,
            x: Number(this.x) || 0,
            y: Number(this.y) || 0,
            health: Number(this.health) || 0,
            maxHealth: Number(this.maxHealth) || 0,
            bbox: clonePlain(this.bbox),
            parts: clonePlain(this.parts),
            networkVars: clonePlain(this.networkVars),
            removed: this.removed === true,
        };
    }
}

module.exports = {
    BaseEntity,
};
