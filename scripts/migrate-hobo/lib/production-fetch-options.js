'use strict';

const path = require('path');

const { loadJson } = require('./common');

const FALSEY_STRINGS = new Set(['0', 'false', 'no', 'off', '']);

function readFlag(value, fallbackValue = false) {
    if (value == null) return fallbackValue;
    if (typeof value === 'boolean') return value;
    return !FALSEY_STRINGS.has(String(value).trim().toLowerCase());
}

function loadProductionPathsConfig(filePath) {
    if (!filePath) return {};
    const resolvedPath = path.resolve(filePath);
    const config = loadJson(resolvedPath, null);
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
        throw new Error(`--production-paths must point at a JSON object file: ${resolvedPath}`);
    }
    return config;
}

function resolveFetchCliOptions({ args, defaultOut }) {
    const config = loadProductionPathsConfig(args.productionPaths);
    const merged = Object.assign({}, config, args);
    const confirmUsed = readFlag(merged.confirm, false);
    const dryRun = merged.dryRun == null ? !confirmUsed : readFlag(merged.dryRun, false);

    return {
        host: merged.host || 'hobo.tools',
        user: merged.user || null,
        remoteHobostreamerRoot: merged.remoteHobostreamerRoot || null,
        remoteHobotoolsRoot: merged.remoteHobotoolsRoot || null,
        remoteHoboquestRoot: merged.remoteHoboquestRoot || null,
        remoteHobostreamerDb: merged.remoteHobostreamerDb || null,
        remoteHobostreamerAnalyticsDb: merged.remoteHobostreamerAnalyticsDb || merged.remoteAnalyticsDb || null,
        remoteRsCompanionDb: merged.remoteRsCompanionDb || null,
        remoteHobotoolsDb: merged.remoteHobotoolsDb || null,
        remoteHoboquestDb: merged.remoteHoboquestDb || null,
        remoteHoboImgAnalyticsDb: merged.remoteHoboImgAnalyticsDb || null,
        remoteHoboDocsAnalyticsDb: merged.remoteHoboDocsAnalyticsDb || null,
        remoteHoboTextAnalyticsDb: merged.remoteHoboTextAnalyticsDb || null,
        remoteHoboAudioAnalyticsDb: merged.remoteHoboAudioAnalyticsDb || null,
        remoteHoboMapsAnalyticsDb: merged.remoteHoboMapsAnalyticsDb || null,
        remoteHoboFoodAnalyticsDb: merged.remoteHoboFoodAnalyticsDb || null,
        remoteHoboYtAnalyticsDb: merged.remoteHoboYtAnalyticsDb || null,
        outDir: path.resolve(merged.out || defaultOut),
        confirm: confirmUsed,
        dryRun,
        skipMedia: readFlag(merged.skipMedia, false),
        mediaMode: merged.mediaMode || 'metadata-only',
        sshOptions: merged.sshOptions || '',
        sshKey: merged.sshKey || null,
        cleanupRemoteTemp: readFlag(merged.cleanupRemoteTemp, false),
        strict: readFlag(merged.strict, false),
        summary: readFlag(merged.summary, false),
        productionPathsPath: args.productionPaths ? path.resolve(args.productionPaths) : null,
    };
}

module.exports = {
    loadProductionPathsConfig,
    readFlag,
    resolveFetchCliOptions,
};