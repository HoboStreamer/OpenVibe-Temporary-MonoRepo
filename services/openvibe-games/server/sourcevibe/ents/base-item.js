'use strict';

const { BaseEntity } = require('./base-entity');

class BaseItem extends BaseEntity {
    constructor(options = {}) {
        super(Object.assign({}, options, {
            definition: Object.assign({
                Type: 'item',
                shared: Object.assign({
                    stackSize: 1,
                }, options.definition && options.definition.shared || {}),
            }, options.definition || {}),
        }));
        this.stackSize = Number(this.stackSize) || 1;
    }
}

module.exports = {
    BaseItem,
};
