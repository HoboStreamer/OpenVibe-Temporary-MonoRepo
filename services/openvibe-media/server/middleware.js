'use strict';

// Local middleware shim — mirrors openvibe-network/middleware/service-actor.js.
// Keeps openvibe-media self-contained (does not import private files from
// other services). When we extract this repo into its own GitHub repo the
// import surface stays clean.

function serviceActorMiddleware(internalKey) {
    return (req, _res, next) => {
        const provided = req.headers['x-internal-key'];
        if (provided && provided === internalKey) {
            const sid = req.headers['x-openvibe-service'];
            if (sid && /^[a-z0-9_-]{2,64}$/i.test(String(sid))) {
                req.serviceActor = String(sid);
            } else {
                req.serviceActor = 'unidentified-service';
            }
        }
        next();
    };
}

module.exports = { serviceActorMiddleware };
