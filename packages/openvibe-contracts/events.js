'use strict';

// OpenVibe — well-known event types. The full catalog is open-ended; the
// constants here are the high-traffic ones the kernel itself emits or
// consumes. Service-specific events should follow the same naming pattern:
//   <topic>.<resource>.<verb>
// For example: chat.events -> chat.message.sent

const EVENT_TYPES = Object.freeze({
    // auth.events
    AUTH_TOKEN_ISSUED:     'auth.token.issued',
    AUTH_TOKEN_REVOKED:    'auth.token.revoked',
    AUTH_SESSION_INVALIDATED: 'auth.session.invalidated',

    // user.events
    USER_MODULE_UPDATED:   'user.module.updated',
    USER_PROFILE_UPDATED:  'user.profile.updated',

    // service.events
    SERVICE_REGISTERED:    'service.registered',
    SERVICE_HEARTBEAT:     'service.heartbeat',
    SERVICE_DEREGISTERED:  'service.deregistered',
    CAPABILITY_REGISTERED: 'service.capability.registered',
    CONTRACT_REGISTERED:   'service.contract.registered',

    // system.events
    POLICY_DENIED:         'system.policy.denied',
    AUDIT_RECORDED:        'system.audit.recorded',
});

const EVENT_TYPE_LIST = Object.freeze(Object.values(EVENT_TYPES));

function isKnownEventType(t) {
    return typeof t === 'string' && EVENT_TYPE_LIST.includes(t);
}

module.exports = { EVENT_TYPES, EVENT_TYPE_LIST, isKnownEventType };
