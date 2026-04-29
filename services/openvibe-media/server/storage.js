'use strict';

const { createStorageManager } = require('@openvibe/storage');

function buildStorage(cfg) {
    return createStorageManager(cfg || {});
}

module.exports = {
    buildStorage,
    ...require('@openvibe/storage'),
};
