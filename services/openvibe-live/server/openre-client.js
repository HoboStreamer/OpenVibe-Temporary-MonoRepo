'use strict';

const { jsonRequest } = require('@openvibe/sdk');

function toQuery(params) {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value == null || value === '') return;
        query.set(key, String(value));
    });
    const suffix = query.toString();
    return suffix ? `?${suffix}` : '';
}

function createOpenReClient({ config }) {
    const baseUrl = String(config && config.stream && config.stream.url || '').replace(/\/$/, '');
    if (!baseUrl) throw new Error('createOpenReClient: config.stream.url required');
    const caller = config && config.serviceId ? String(config.serviceId) : 'openvibe-live';

    function request(pathname, options) {
        const opts = options || {};
        return jsonRequest(`${baseUrl}${pathname}`, {
            method: opts.method || 'GET',
            token: opts.token || null,
            body: opts.body,
            headers: Object.assign({ 'X-OpenVibe-Service': caller }, opts.headers || {}),
        });
    }

    return {
        listChannels({ ownerUserId, token, limit }) {
            return request(`/api/v1/channels${toQuery({ owner_user_id: ownerUserId, limit })}`, { token });
        },
        createChannel(body, token) {
            return request('/api/v1/channels', { method: 'POST', body, token });
        },
        listDestinations({ ownerUserId, token }) {
            return request(`/api/v1/destinations${toQuery({ owner_user_id: ownerUserId })}`, { token });
        },
        createDestination(body, token) {
            return request('/api/v1/destinations', { method: 'POST', body, token });
        },
        listStreams({ channelId, status, token, limit }) {
            return request(`/api/v1/streams${toQuery({ channel_id: channelId, status, limit })}`, { token });
        },
        createStream(body, token) {
            return request('/api/v1/streams', { method: 'POST', body, token });
        },
        startStream(streamId, token) {
            return request(`/api/v1/streams/${encodeURIComponent(String(streamId))}/start`, {
                method: 'POST',
                body: {},
                token,
            });
        },
        endStream(streamId, token, body) {
            return request(`/api/v1/streams/${encodeURIComponent(String(streamId))}/end`, {
                method: 'POST',
                body: body || {},
                token,
            });
        },
    };
}

module.exports = { createOpenReClient };
