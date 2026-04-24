'use strict';

// openvibe-network — service-actor middleware. Distinct from user auth: this
// recognises trusted internal callers via X-Internal-Key and tags them with a
// `service_id` (X-OpenVibe-Service header). Routes that need this lookup
// invoke `serviceActorMiddleware` AFTER the JWT auth so a single request can
// be both user-authenticated AND service-attested.

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
