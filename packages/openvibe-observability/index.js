'use strict';

const metrics = require('./metrics');
const logging = require('./logging');
const otel = require('./otel');

module.exports = {
    ...metrics,
    ...logging,
    ...otel,
};
