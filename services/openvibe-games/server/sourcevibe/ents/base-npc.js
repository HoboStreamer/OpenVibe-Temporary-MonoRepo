'use strict';

const { BaseAnim } = require('./base-anim');

class BaseNpc extends BaseAnim {
    constructor(options = {}) {
        super(Object.assign({}, options, {
            definition: Object.assign({
                Type: 'npc',
                shared: Object.assign({
                    disposition: 'neutral',
                    maxHealth: 100,
                }, options.definition && options.definition.shared || {}),
            }, options.definition || {}),
        }));
        this.disposition = this.disposition || 'neutral';
    }
}

module.exports = {
    BaseNpc,
};
