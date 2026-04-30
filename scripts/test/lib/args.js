'use strict';

const os = require('os');

const FALSEY = new Set(['0', 'false', 'no', 'off', '']);

function assignArg(args, key, value) {
    if (!(key in args)) {
        args[key] = value;
        return;
    }
    if (Array.isArray(args[key])) {
        args[key].push(value);
        return;
    }
    args[key] = [args[key], value];
}

function parseArgs(argv) {
    const args = { _: [] };
    for (let i = 0; i < argv.length; i += 1) {
        const token = argv[i];
        if (!token.startsWith('--')) {
            args._.push(token);
            continue;
        }

        if (token.startsWith('--no-')) {
            const key = token
                .slice(5)
                .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
            assignArg(args, key, false);
            continue;
        }

        const [flag, inlineValue] = token.split('=', 2);
        const key = flag
            .slice(2)
            .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

        if (inlineValue !== undefined) {
            assignArg(args, key, inlineValue);
            continue;
        }

        const next = argv[i + 1];
        if (next && !next.startsWith('--')) {
            assignArg(args, key, next);
            i += 1;
        } else {
            assignArg(args, key, true);
        }
    }
    return args;
}

function splitList(value) {
    if (value == null || value === false) return [];
    if (Array.isArray(value)) {
        return value.flatMap((entry) => splitList(entry));
    }
    return String(value)
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function toInt(value, fallbackValue) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallbackValue;
}

function readFlag(value, fallbackValue) {
    if (value == null) return fallbackValue;
    if (typeof value === 'boolean') return value;
    return !FALSEY.has(String(value).trim().toLowerCase());
}

function getAvailableParallelism() {
    if (typeof os.availableParallelism === 'function') {
        return Math.max(1, os.availableParallelism());
    }
    if (typeof os.cpus === 'function') {
        return Math.max(1, os.cpus().length || 1);
    }
    return 1;
}

function resolveJobCount(rawValue, options = {}) {
    const {
        defaultJobs = 1,
        maxTests = Infinity,
    } = options;

    const available = getAvailableParallelism();
    let requested = defaultJobs;

    if (rawValue != null && rawValue !== '') {
        const normalized = String(rawValue).trim().toLowerCase();
        if (normalized === 'auto') {
            requested = Math.min(available, 8);
        } else if (normalized === 'half') {
            requested = Math.ceil(available / 2);
        } else if (normalized === 'max' || normalized === 'all') {
            requested = available;
        } else {
            const percentMatch = normalized.match(/^(\d+)%$/);
            if (percentMatch) {
                requested = Math.ceil((available * Number.parseInt(percentMatch[1], 10)) / 100);
            } else {
                requested = toInt(normalized, defaultJobs);
            }
        }
    }

    const boundedMax = Number.isFinite(maxTests) ? Math.max(1, maxTests) : Math.max(1, requested);
    return Math.max(1, Math.min(requested, boundedMax));
}

module.exports = {
    FALSEY,
    getAvailableParallelism,
    parseArgs,
    readFlag,
    resolveJobCount,
    splitList,
    toInt,
};
