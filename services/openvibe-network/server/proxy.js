'use strict';

// Legacy hobo-tools proxy — removed. Returns 410 Gone for any calls.
function buildHoboToolsProxy(_config) {
    return (_req, res) => res.status(410).json({ error: 'hobo-tools is no longer available' });
}

module.exports = { buildHoboToolsProxy };
