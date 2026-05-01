'use strict';

const { BaseStructure } = require('./base-structure');

class BaseContainer extends BaseStructure {
    constructor(options = {}) {
        super(Object.assign({}, options, {
            definition: Object.assign({
                Type: 'container',
                shared: Object.assign({
                    slots: 24,
                }, options.definition && options.definition.shared || {}),
            }, options.definition || {}),
        }));
        this.items = Array.isArray(this.items) ? this.items : [];
    }
}

module.exports = {
    BaseContainer,
};
