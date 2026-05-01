'use strict';

const { BaseEntity } = require('./base-entity');

class BaseAnim extends BaseEntity {
    constructor(options = {}) {
        super(Object.assign({}, options, {
            definition: Object.assign({ Type: 'anim' }, options.definition || {}),
        }));
        this.animated = true;
    }
}

module.exports = {
    BaseAnim,
};
