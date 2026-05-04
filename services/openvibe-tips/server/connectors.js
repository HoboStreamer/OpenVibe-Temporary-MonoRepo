'use strict';

// openvibe-tips — connector registry.
// All connector modules are registered here. Routes call CONNECTORS[type] to
// get a normaliser. New connectors just need to be added to this map.

const streamlabs     = require('./connectors/streamlabs');
const streamelements = require('./connectors/streamelements');
const powerchat      = require('./connectors/powerchat');
const generic        = require('./connectors/generic');

const CONNECTORS = {
    streamlabs,
    streamelements,
    powerchat,
    generic,
    // Aliases / variants
    se:          streamelements,
    sl:          streamlabs,
};

function getConnector(type) {
    return CONNECTORS[String(type || 'generic').toLowerCase()] || null;
}

function listConnectorTypes() {
    // Deduplicate by module name
    const seen = new Set();
    return Object.values(CONNECTORS)
        .filter(c => { if (seen.has(c.name())) return false; seen.add(c.name()); return true; })
        .map(c => ({
            type:         c.name(),
            label:        c.label(),
            description:  c.description(),
            capabilities: c.capabilities(),
        }));
}

module.exports = { getConnector, listConnectorTypes, CONNECTORS };
