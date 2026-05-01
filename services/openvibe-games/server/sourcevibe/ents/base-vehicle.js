'use strict';

const { BaseAnim } = require('./base-anim');

class BaseVehicle extends BaseAnim {
    constructor(options = {}) {
        super(Object.assign({}, options, {
            definition: Object.assign({
                Type: 'vehicle',
                shared: Object.assign({
                    seats: 1,
                    maxHealth: 400,
                }, options.definition && options.definition.shared || {}),
            }, options.definition || {}),
        }));
        this.driver = this.driver || null;
    }
}

module.exports = {
    BaseVehicle,
};
