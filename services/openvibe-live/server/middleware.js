'use strict';

function serviceActorMiddleware(internalKey) {
    return (req, _res, next) => {
        const provided = req.headers['x-internal-key'];
        if (provided && provided === internalKey) {
            const sid = req.headers['x-openvibe-service'];
            req.serviceActor = sid && /^[a-z0-9_-]{2,64}$/i.test(String(sid)) ? String(sid) : 'unidentified-service';
        }
        next();
    };
}

module.exports = { serviceActorMiddleware };
