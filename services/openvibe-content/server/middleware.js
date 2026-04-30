'use strict';

function serviceActorMiddleware(internalKey) {
    return (req, _res, next) => {
        const provided = req.headers['x-internal-key'];
        if (provided && provided === internalKey) {
            const serviceId = req.headers['x-openvibe-service'];
            if (serviceId && /^[a-z0-9_-]{2,64}$/i.test(String(serviceId))) {
                req.serviceActor = String(serviceId);
            } else {
                req.serviceActor = 'unidentified-service';
            }
        }
        next();
    };
}

module.exports = {
    serviceActorMiddleware,
};