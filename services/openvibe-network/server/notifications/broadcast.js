'use strict';

function broadcastInternalNotification(deps, body, serviceActor) {
    const {
        recordAudit,
    } = deps;
    const payload = Object.assign({
        title: body && body.title || '',
        audience: body && body.audience || 'all',
        body: body && body.body || '',
    }, body || {});

    recordAudit({
        actor: serviceActor,
        action: 'internal.notifications.broadcast',
        target: null,
        detail: payload,
    });

    return {
        ok: true,
        queued: true,
        delivered: false,
        delivery_mode: 'audit-recorded',
        requested_by_service: serviceActor.id,
        broadcast: payload,
    };
}

module.exports = {
    broadcastInternalNotification,
};
