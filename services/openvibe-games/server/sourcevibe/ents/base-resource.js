'use strict';

const { BaseAnim } = require('./base-anim');

class BaseResource extends BaseAnim {
    constructor(options = {}) {
        super(Object.assign({}, options, {
            definition: Object.assign({
                Type: 'resource',
                shared: Object.assign({
                    maxHealth: 100,
                    networkVars: {
                        Health: { type: 'int', predicted: false, defaultValue: 100 },
                    },
                }, options.definition && options.definition.shared || {}),
            }, options.definition || {}),
        }));
        this.gatherable = true;
    }
}

module.exports = {
    BaseResource,
};
