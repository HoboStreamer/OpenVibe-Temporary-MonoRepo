'use strict';

async function reconcileLifecycle(deps, body) {
    const {
        database,
        lifecyclePolicy,
        quotas,
        storage,
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

    let storageReconcile = null;
    if (lifecyclePolicy && storage && input.reconcile_storage !== false) {
        const results = [];
        for (const media of mediaRows) {
            results.push(await lifecyclePolicy.reconcileMediaStorage(storage, media, {
                dryRun: input.dry_run === true,
                adminForce: input.admin_force === true ? true : input.admin_force === 'demote' ? 'demote' : false,
            }));
        }
        storageReconcile = {
            ok: true,
            result_count: results.length,
            promoted_count: results.filter((result) => result && result.action === 'promoted').length,
            demoted_count: results.filter((result) => result && result.action === 'demoted').length,
            kept_count: results.filter((result) => result && (result.action === 'kept-hot' || result.action === 'kept-canonical' || result.action === 'dry-run')).length,
            results,
        };
    }

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
        storage_reconcile: storageReconcile,
        processing: processing.describeProcessingMode(),
    };
}

module.exports = {
    reconcileLifecycle,
};
