'use strict';

const path = require('path');

const {
    forEachNdjson,
    loadJson,
    writeJson,
} = require('./common');

async function collectIds(filePath) {
    const ids = new Set();
    let duplicates = 0;
    await forEachNdjson(filePath, async (row) => {
        if (!row.id) return;
        if (ids.has(row.id)) duplicates += 1;
        ids.add(row.id);
    });
    return { ids, duplicates };
}

async function validateUserRefs(filePath, userIds, anonIds, fields) {
    const missing = [];
    await forEachNdjson(filePath, async (row) => {
        for (const field of fields) {
            const value = row[field];
            if (!value) continue;
            const isAnon = typeof value === 'string'
                && (value.startsWith('anon-user:') || value.startsWith('anon-chat:'));
            if (isAnon) {
                if (value.startsWith('anon-user:') && !anonIds.has(value)) {
                    missing.push({ file: filePath, field, value, row_id: row.id || null });
                }
                continue;
            }
            if (!userIds.has(value)) {
                missing.push({ file: filePath, field, value, row_id: row.id || null });
            }
        }
    });
    return missing;
}

async function validateBundle(options) {
    const { bundleDir } = options;
    const reportPath = path.join(bundleDir, 'audit', 'import-report.json');
    const report = loadJson(reportPath, null);
    if (!report) {
        throw new Error(`Import report not found: ${reportPath}`);
    }

    const summary = {
        generated_at: new Date().toISOString(),
        bundle_dir: bundleDir,
        checks: [],
        mismatches: [],
        duplicates: [],
        missing_refs: [],
        exclusion_checks: [],
    };

    const usersFile = path.join(bundleDir, 'identity', 'users.ndjson');
    const anonFile = path.join(bundleDir, 'identity', 'anon-users.ndjson');
    const { ids: userIds, duplicates: userDuplicates } = await collectIds(usersFile);
    const { ids: anonIds, duplicates: anonDuplicates } = await collectIds(anonFile);

    if (userDuplicates) {
        summary.duplicates.push({ dataset: 'identity/users', duplicates: userDuplicates });
    }
    if (anonDuplicates) {
        summary.duplicates.push({ dataset: 'identity/anon-users', duplicates: anonDuplicates });
    }

    const userRefChecks = [
        { file: path.join(bundleDir, 'themes', 'preferences.ndjson'), fields: ['user_id'] },
        { file: path.join(bundleDir, 'control-plane', 'notifications.ndjson'), fields: ['user_id', 'sender_user_id'] },
        { file: path.join(bundleDir, 'social', 'follows.ndjson'), fields: ['follower_user_id', 'followed_user_id'] },
        { file: path.join(bundleDir, 'live', 'channels.ndjson'), fields: ['owner_user_id'] },
        { file: path.join(bundleDir, 'live', 'stream-definitions.ndjson'), fields: ['owner_user_id'] },
        { file: path.join(bundleDir, 'live', 'stream-sessions.ndjson'), fields: ['owner_user_id'] },
        { file: path.join(bundleDir, 'chat', 'messages.ndjson'), fields: ['sender_id', 'deleted_by_user_id'] },
        { file: path.join(bundleDir, 'community', 'pastes.ndjson'), fields: ['author_user_id'] },
        { file: path.join(bundleDir, 'community', 'comments.ndjson'), fields: ['author_user_id'] },
        { file: path.join(bundleDir, 'media', 'objects.ndjson'), fields: ['owner_user_id'] },
        { file: path.join(bundleDir, 'billing', 'subscriptions.ndjson'), fields: ['subscriber_user_id', 'creator_user_id'] },
    ];

    for (const check of userRefChecks) {
        const missing = await validateUserRefs(check.file, userIds, anonIds, check.fields);
        if (missing.length) {
            summary.missing_refs.push(...missing);
        }
        summary.checks.push({ file: path.relative(bundleDir, check.file), checked_fields: check.fields.length, missing: missing.length });
    }

    const requiredExclusions = [
        'users.hobo_bucks_balance',
        'transactions',
    ];
    const exclusions = new Set((report.exclusions || []).map((entry) => entry.entity));
    for (const entity of requiredExclusions) {
        summary.exclusion_checks.push({ entity, present: exclusions.has(entity) });
        if (!exclusions.has(entity)) {
            summary.mismatches.push({ type: 'missing-exclusion', entity });
        }
    }

    for (const [datasetName, dataset] of Object.entries(report.datasets || {})) {
        const balance = dataset.source_records - dataset.merged_records - dataset.skipped_records;
        if (dataset.written_records < 0 || balance < 0) {
            summary.mismatches.push({
                type: 'invalid-dataset-counts',
                dataset: datasetName,
                source_records: dataset.source_records,
                merged_records: dataset.merged_records,
                skipped_records: dataset.skipped_records,
                written_records: dataset.written_records,
            });
        }
    }

    summary.ok = summary.mismatches.length === 0 && summary.duplicates.length === 0 && summary.missing_refs.length === 0;
    writeJson(path.join(bundleDir, 'audit', 'validation-summary.json'), summary);
    return summary;
}

module.exports = { validateBundle };
