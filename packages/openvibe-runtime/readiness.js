'use strict';

function normalizeStatus(status) {
    const value = String(status || '').trim().toLowerCase();
    if (value === 'red' || value === 'yellow' || value === 'green') return value;
    return 'green';
}

function normalizeCheck(check) {
    const source = check || {};
    const critical = source.critical !== false;
    const status = source.status
        ? normalizeStatus(source.status)
        : source.ok === false
            ? (critical ? 'red' : 'yellow')
            : 'green';

    return {
        name: String(source.name || 'unnamed_check'),
        status,
        ok: status === 'green',
        critical,
        message: source.message || null,
        details: source.details || null,
    };
}

function buildPersistenceCheck(persistence) {
    if (!persistence) return null;
    const readiness = normalizeStatus(persistence.readiness || 'green');
    return normalizeCheck({
        name: 'persistence',
        status: readiness,
        critical: true,
        details: {
            requested_mode: persistence.requested_mode || persistence.mode || 'sqlite',
            effective_mode: persistence.effective_mode || persistence.mode || 'sqlite',
            adapter_status: persistence.adapter_status || 'unknown',
            database_url_configured: !!persistence.database_url_configured,
        },
        message: persistence.warning || null,
    });
}

function buildReadinessReport(options) {
    const opts = options || {};
    const checks = [];
    const persistenceCheck = buildPersistenceCheck(opts.persistence);
    if (persistenceCheck) checks.push(persistenceCheck);
    for (const check of opts.checks || []) checks.push(normalizeCheck(check));

    const summary = { green: 0, yellow: 0, red: 0 };
    for (const check of checks) summary[check.status] += 1;

    const status = summary.red > 0
        ? 'red'
        : summary.yellow > 0
            ? 'yellow'
            : 'green';

    return Object.assign({
        ok: status !== 'red',
        ready: status === 'green',
        status,
        service: String(opts.serviceName || 'openvibe-service'),
        checked_at: new Date().toISOString(),
        summary,
        checks,
    }, opts.extra || {});
}

module.exports = {
    buildReadinessReport,
    buildPersistenceCheck,
    normalizeCheck,
    normalizeStatus,
};
