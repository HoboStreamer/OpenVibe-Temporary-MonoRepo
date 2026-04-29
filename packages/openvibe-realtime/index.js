'use strict';

module.exports = {
    ...require('./auth'),
    ...require('./events'),
    ...require('./presence'),
    ...require('./rooms'),
};