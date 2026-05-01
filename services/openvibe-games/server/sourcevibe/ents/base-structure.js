'use strict';

const { BaseAnim } = require('./base-anim');

class BaseStructure extends BaseAnim {
    constructor(options = {}) {
        super(Object.assign({}, options, {
            definition: Object.assign({
                Type: 'structure',
                shared: Object.assign({
                    maxHealth: 250,
                }, options.definition && options.definition.shared || {}),
            }, options.definition || {}),
        }));
        this.placeable = true;
    }
}

module.exports = {
    BaseStructure,
};
