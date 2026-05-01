'use strict';

const { BaseStructure } = require('./base-structure');

class BaseDoor extends BaseStructure {
    constructor(options = {}) {
        super(Object.assign({}, options, {
            definition: Object.assign({
                Type: 'door',
                shared: Object.assign({
                    networkVars: {
                        Open: { type: 'bool', predicted: false, defaultValue: false },
                    },
                }, options.definition && options.definition.shared || {}),
            }, options.definition || {}),
        }));
    }

    Use() {
        const nextValue = !this.GetNetworkVar('Open');
        this.SetNetworkVar('Open', nextValue);
        return nextValue;
    }
}

module.exports = {
    BaseDoor,
};
