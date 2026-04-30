'use strict';

function reconcileLifecycle(deps, body) {
    const {
        database,
        quotas,
        processing,
        storageModel,
    } = deps;
    const input = body || {};
    const filters = ['deleted_at IS NULL'];
    const args = [];
    if (input.namespace) {
        filters.push('namespace = ?');
        args.push(String(input.namespace));
    }
    if (input.owner_type) {
        filters.push('owner_type = ?');
        args.push(String(input.owner_type));
    }
    if (input.owner_id) {
        filters.push('owner_id = ?');
        args.push(String(input.owner_id));
    }
    const limit = Math.min(Math.max(Number(input.limit) || 100, 1), 500);
    const mediaRows = database.prepare(`
        SELECT id, owner_type, owner_id, namespace, storage_key, status, visibility, size_bytes
        FROM media_objects
        WHERE ${filters.join(' AND ')}
        ORDER BY updated_at DESC
        LIMIT ?
    `).all(...args, limit);

    const groups = new Map();
    let missingLocationCount = 0;
    for (const media of mediaRows) {
        const groupKey = `${media.owner_type}:${media.owner_id}:${media.namespace}`;
        if (!groups.has(groupKey)) {
            groups.set(groupKey, {
                owner_type: media.owner_type,
                owner_id: media.owner_id,
                namespace: media.namespace,
            });
        }
        const hasLocation = !media.storage_key
            || storageModel.listLocations(media.id).some((location) => location.status === 'active');
        if (!hasLocation) missingLocationCount += 1;
    }

    const usageRows = Array.from(groups.values()).map((group) => {
        const recomputed = quotas.recomputeUsage(group.owner_type, group.owner_id, group.namespace);
        return Object.assign({}, group, recomputed);
    });

    const orphanedLocationCount = database.prepare(`
        SELECT COUNT(*) AS count
        FROM media_object_locations AS locations
        LEFT JOIN media_objects AS media ON media.id = locations.media_id
        WHERE media.id IS NULL OR media.deleted_at IS NOT NULL
    `).get().count;
    const sizeViolationCount = database.prepare('SELECT COUNT(*) AS count FROM media_size_violations').get().count;

    return {
        ok: true,
        media_count: mediaRows.length,
        reconciled_group_count: usageRows.length,
        missing_location_count: missingLocationCount,
        orphaned_location_count: orphanedLocationCount,
        size_violation_count: sizeViolationCount,
        usage_rows: usageRows,
        filters: {
            namespace: input.namespace || null,
            owner_type: input.owner_type || null,
            owner_id: input.owner_id || null,
            limit,
        },
        processing: processing.describeProcessingMode(),
    };
}

module.exports = {
    reconcileLifecycle,
};
