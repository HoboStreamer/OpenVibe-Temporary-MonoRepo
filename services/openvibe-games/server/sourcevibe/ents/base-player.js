'use strict';

const { BaseAnim } = require('./base-anim');

class BasePlayer extends BaseAnim {
    constructor(options = {}) {
        super(Object.assign({}, options, {
            definition: Object.assign({
                Type: 'player',
                authority: 'predicted',
                shared: Object.assign({
                    maxHealth: 100,
                    bbox: [-20, -40, 40, 80],
                }, options.definition && options.definition.shared || {}),
            }, options.definition || {}),
        }));
        this.inventory = Array.isArray(this.inventory) ? this.inventory : [];
        this.hotbar = Array.isArray(this.hotbar) ? this.hotbar : Array.from({ length: 9 }, () => null);
        this.selectedSlot = Number(this.selectedSlot) || 1;
    }
}

module.exports = {
    BasePlayer,
};
