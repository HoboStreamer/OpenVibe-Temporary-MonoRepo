'use strict';

const { BaseEntity } = require('./base-entity');

class BaseMapObject extends BaseEntity {
    constructor(options = {}) {
        super(Object.assign({}, options, {
            definition: Object.assign({
                Type: 'map_object',
                Spawnable: false,
                shared: Object.assign({
                    solid: true,
                }, options.definition && options.definition.shared || {}),
            }, options.definition || {}),
        }));
        this.static = true;
    }
}

module.exports = {
    BaseMapObject,
};
