'use strict';

const { BaseEntity } = require('./base-entity');

class BaseWeapon extends BaseEntity {
    constructor(options = {}) {
        super(Object.assign({}, options, {
            definition: Object.assign({
                Type: 'weapon',
                shared: Object.assign({
                    maxHealth: 1,
                    networkVars: {
                        nextPrimaryAttack: { type: 'float', predicted: true, defaultValue: 0 },
                    },
                }, options.definition && options.definition.shared || {}),
            }, options.definition || {}),
        }));
        this.cooldownMs = Number(this.cooldownMs || 500);
    }
}

module.exports = {
    BaseWeapon,
};
