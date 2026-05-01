'use strict';

class NetgraphMetrics {
    constructor() {
        this.state = {
            pingMs: 0,
            snapshotSize: 0,
            cmdRate: 0,
            updateRate: 0,
            predictionError: 0,
        };
    }

    recordPing(value) {
        this.state.pingMs = Math.max(0, Number(value) || 0);
    }

    recordSnapshotSize(value) {
        this.state.snapshotSize = Math.max(0, Number(value) || 0);
    }

    recordRates({ cmdRate, updateRate }) {
        if (cmdRate != null) this.state.cmdRate = Math.max(0, Number(cmdRate) || 0);
        if (updateRate != null) this.state.updateRate = Math.max(0, Number(updateRate) || 0);
    }

    recordPredictionError(value) {
        this.state.predictionError = Math.max(0, Number(value) || 0);
    }

    summary() {
        return Object.assign({}, this.state);
    }
}

module.exports = {
    NetgraphMetrics,
};
