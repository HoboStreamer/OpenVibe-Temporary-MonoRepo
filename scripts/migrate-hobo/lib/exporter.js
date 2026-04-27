'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const {
    createNdjsonWriter,
    ensureDir,
    findExistingPath,
    writeJson,
} = require('./common');
const {
    getSourceExclusions,
    getSourcePlan,
} = require('./datasets');

function tableExists(db, tableName) {
    return !!db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(tableName);
}

function getTableCount(db, tableName) {
    const row = db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get();
    return row ? row.count : 0;
}

function exportTable(db, sourceRoot, entry, batchSize, dryRun, logger) {
    const tableName = entry.table;
    const outputPath = path.join(sourceRoot, 'tables', `${tableName}.ndjson`);
    const summary = {
        table: tableName,
        orderBy: entry.orderBy,
        exportedRows: 0,
        skippedRows: 0,
        file: dryRun ? null : path.relative(sourceRoot, outputPath),
    };

    if (!tableExists(db, tableName)) {
        summary.missing = true;
        return summary;
    }

    const totalRows = getTableCount(db, tableName);
    summary.sourceRows = totalRows;

    const writer = dryRun ? null : createNdjsonWriter(outputPath);
    const statement = db.prepare(`SELECT * FROM ${tableName} ORDER BY ${entry.orderBy} LIMIT ? OFFSET ?`);

    for (let offset = 0; offset < totalRows; offset += batchSize) {
        const rows = statement.all(batchSize, offset);
        for (const row of rows) {
            const nextRow = entry.transformRow ? entry.transformRow({ ...row }) : row;
            if (!nextRow) {
                summary.skippedRows += 1;
                continue;
            }
            if (writer) writer.write(nextRow);
            summary.exportedRows += 1;
        }
    }

    if (writer) {
        return writer.end().then(() => summary);
    }

    logger.info(`Dry run: ${tableName} would export ${summary.exportedRows} rows`);
    return Promise.resolve(summary);
}

function pushMissingReference(records, tableName, row, columnName, legacyRoot) {
    const value = row[columnName];
    if (!value) return;

    const { resolvedPath, exists } = findExistingPath(legacyRoot, value);
    if (!resolvedPath || exists) return;

    records.push({
        table: tableName,
        legacy_id: String(row.id != null ? row.id : row.slug != null ? row.slug : `${columnName}:${value}`),
        column: columnName,
        value,
        resolved_path: resolvedPath,
    });
}

function collectHoboStreamerDiagnostics(db, sourceRoot, legacyRoot, logger, dryRun) {
    const missingMedia = [];

    const checks = [
        { table: 'vods', columns: ['file_path', 'thumbnail_url'] },
        { table: 'clips', columns: ['file_path', 'thumbnail_url'] },
        { table: 'users', columns: ['avatar_url'] },
        { table: 'channels', columns: ['offline_banner_url'] },
        { table: 'emotes', columns: ['url'] },
        { table: 'pastes', columns: ['screenshot_path'] },
    ];

    for (const check of checks) {
        if (!tableExists(db, check.table)) continue;

        const rows = db.prepare(`SELECT * FROM ${check.table}`).all();
        for (const row of rows) {
            for (const columnName of check.columns) {
                pushMissingReference(missingMedia, check.table, row, columnName, legacyRoot);
            }
        }
    }

    const diagnostics = {
        missing_media_references: missingMedia.length,
        files: {},
    };

    if (missingMedia.length && !dryRun) {
        const outputPath = path.join(sourceRoot, 'diagnostics', 'missing-media.ndjson');
        const writer = createNdjsonWriter(outputPath);
        for (const record of missingMedia) {
            writer.write(record);
        }
        diagnostics.files.missing_media_references = path.relative(sourceRoot, outputPath);
        return writer.end().then(() => diagnostics);
    }

    if (missingMedia.length) {
        logger.warn(`Dry run: found ${missingMedia.length} missing media references`);
    }
    return Promise.resolve(diagnostics);
}

async function exportSource(options) {
    const {
        sourceName,
        dbPath,
        outDir,
        batchSize,
        legacyRoot,
        dryRun,
        logger,
    } = options;

    if (!fs.existsSync(dbPath)) {
        throw new Error(`Database not found: ${dbPath}`);
    }

    const sourceRoot = path.join(outDir, sourceName);
    ensureDir(sourceRoot);
    ensureDir(path.join(sourceRoot, 'tables'));
    ensureDir(path.join(sourceRoot, 'diagnostics'));

    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');

    try {
        const tables = {};
        const missingTables = [];
        const exportPlan = getSourcePlan(sourceName);

        logger.info(`Exporting ${sourceName} from ${dbPath}`);

        for (const entry of exportPlan) {
            const result = await exportTable(db, sourceRoot, entry, batchSize, dryRun, logger);
            tables[entry.table] = result;
            if (result.missing) {
                missingTables.push(entry.table);
                logger.warn(`Table missing: ${entry.table}`);
            } else {
                logger.info(`Exported ${entry.table}: ${result.exportedRows} rows`);
            }
        }

        const diagnostics = sourceName === 'hobostreamer'
            ? await collectHoboStreamerDiagnostics(db, sourceRoot, legacyRoot, logger, dryRun)
            : { missing_media_references: 0, files: {} };

        const manifest = {
            source: sourceName,
            generated_at: new Date().toISOString(),
            db_path: dbPath,
            legacy_root: legacyRoot,
            batch_size: batchSize,
            tables,
            missing_tables: missingTables,
            exclusions: getSourceExclusions(sourceName),
            diagnostics,
        };

        if (!dryRun) {
            writeJson(path.join(sourceRoot, 'manifest.json'), manifest);
        }

        return manifest;
    } finally {
        db.close();
    }
}

module.exports = { exportSource };
