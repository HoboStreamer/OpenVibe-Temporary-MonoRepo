'use strict';

// OpenVibe — well-known kernel + product service ids. These are the canonical
// `service_id` values written into the service registry and used as the
// `source` field on events.

const SERVICES = Object.freeze({
    NETWORK:   'openvibe-network',     // control plane
    EVENTS:    'openvibe-events',      // event backbone
    LIVE:      'openvibe-live',        // streaming (HoboStreamer today)
    CHAT:      'openvibe-chat',
    COMMUNITY: 'openvibe-community',
    MEDIA:     'openvibe-media',
    BILLING:   'openvibe-billing',
    AI:        'openvibe-ai',
    GAMES:     'openvibe-games',
    TOOLS:     'openvibe-tools',
    WIKI:      'openvibe-wiki',
    BLOG:      'openvibe-blog',
});

const SERVICE_LIST = Object.freeze(Object.values(SERVICES));
const KERNEL_SERVICES = Object.freeze([SERVICES.NETWORK, SERVICES.EVENTS]);

module.exports = { SERVICES, SERVICE_LIST, KERNEL_SERVICES };
