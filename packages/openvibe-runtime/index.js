'use strict';

const health = require('./health');
const readiness = require('./readiness');
const middleware = require('./middleware');
const runtime = require('./runtime');

module.exports = {
    ...health,
    ...readiness,
    ...middleware,
    ...runtime,
};
