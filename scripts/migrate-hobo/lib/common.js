'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function writeJson(filePath, value) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function loadJson(filePath, fallbackValue) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return fallbackValue;
    }
}

function parseArgs(argv) {
    const args = { _: [] };

    for (let i = 0; i < argv.length; i += 1) {
        const token = argv[i];
        if (!token.startsWith('--')) {
            args._.push(token);
            continue;
        }

        const [flag, inlineValue] = token.split('=', 2);
        const key = flag
            .slice(2)
            .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

        if (inlineValue !== undefined) {
            args[key] = inlineValue;
            continue;
        }

        const next = argv[i + 1];
        if (next && !next.startsWith('--')) {
            args[key] = next;
            i += 1;
        } else {
            args[key] = true;
        }
    }

    return args;
}

function toInt(value, fallbackValue) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallbackValue;
}

function sanitizeIdPart(value) {
    const normalized = String(value == null ? 'null' : value)
        .trim()
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 96);
    return normalized || 'empty';
}

function buildEntityId(kind, source, legacyId) {
    return [sanitizeIdPart(kind), sanitizeIdPart(source), sanitizeIdPart(legacyId)].join(':');
}

function safeJsonParse(value, fallbackValue) {
    if (value == null || value === '') return fallbackValue;
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch {
        return fallbackValue;
    }
}

function createNdjsonWriter(filePath) {
    ensureDir(path.dirname(filePath));
    const stream = fs.createWriteStream(filePath, { flags: 'w', encoding: 'utf8' });
    let count = 0;

    return {
        filePath,
        write(value) {
            stream.write(`${JSON.stringify(value)}\n`);
            count += 1;
        },
        count() {
            return count;
        },
        end() {
            return new Promise((resolve, reject) => {
                stream.end((error) => {
                    if (error) reject(error);
                    else resolve(count);
                });
            });
        },
    };
}

async function forEachNdjson(filePath, visitor) {
    if (!fs.existsSync(filePath)) return 0;

    let count = 0;
    const input = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input, crlfDelay: Infinity });

    for await (const line of rl) {
        if (!line.trim()) continue;
        count += 1;
        await visitor(JSON.parse(line), count);
    }

    return count;
}

function createLogger(prefix) {
    return {
        info(message) {
            console.log(`[${prefix}] ${message}`);
        },
        warn(message) {
            console.warn(`[${prefix}] ⚠️ ${message}`);
        },
        error(message) {
            console.error(`[${prefix}] ❌ ${message}`);
        },
    };
}

function normalizeServiceName(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';

    if (['hobo.tools', 'hobotools', 'hobo-tools', 'hobo_tools'].includes(raw)) {
        return 'hobotools';
    }
    if (['hobostreamer', 'hobostreamer.com', 'hobo-streamer'].includes(raw)) {
        return 'hobostreamer';
    }
    if (['hoboquest', 'hobo-quest', 'hobo.quest'].includes(raw)) {
        return 'hoboquest';
    }

    return raw
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function roleRank(role) {
    switch (role) {
        case 'admin':
            return 3;
        case 'global_mod':
            return 2;
        case 'streamer':
            return 1;
        default:
            return 0;
    }
}

function maxRole(left, right) {
    return roleRank(right) > roleRank(left) ? right : left;
}

function resolveLegacyPath(legacyRoot, rawValue) {
    if (!rawValue) return null;
    const value = String(rawValue).trim();
    if (!value) return null;
    if (/^https?:\/\//i.test(value) || /^data:/i.test(value)) return null;
    if (value.startsWith('file://')) return value.slice('file://'.length);
    if (path.isAbsolute(value)) {
        if (value.startsWith('/data/')) {
            return path.join(legacyRoot, value.slice(1));
        }
        return value;
    }
    if (value.startsWith('./') || value.startsWith('../')) {
        return path.resolve(legacyRoot, value);
    }
    if (value.startsWith('data/')) {
        return path.join(legacyRoot, value);
    }
    return null;
}

function legacyPathFallbacks(legacyRoot, rawValue) {
    const value = String(rawValue || '').trim();
    if (!value || !path.isAbsolute(value)) return [];

    const candidates = [];
    const normalizedLegacyRoot = path.resolve(legacyRoot);
    const markers = ['/data/', '/public/', '/uploads/'];

    for (const marker of markers) {
        const index = value.indexOf(marker);
        if (index !== -1) {
            candidates.push(path.join(normalizedLegacyRoot, value.slice(index + 1)));
        }
    }

    const legacyRootName = path.basename(normalizedLegacyRoot);
    const rootMarker = `/${legacyRootName}/`;
    const rootIndex = value.toLowerCase().lastIndexOf(rootMarker.toLowerCase());
    if (rootIndex !== -1) {
        candidates.push(path.join(normalizedLegacyRoot, value.slice(rootIndex + rootMarker.length)));
    }

    return [...new Set(candidates.map((candidate) => path.normalize(candidate)))];
}

function findExistingPath(legacyRoot, rawValue) {
    const resolved = resolveLegacyPath(legacyRoot, rawValue);
    if (resolved && fs.existsSync(resolved)) {
        return { resolvedPath: resolved, exists: true };
    }

    for (const fallback of legacyPathFallbacks(legacyRoot, rawValue)) {
        if (fs.existsSync(fallback)) {
            return { resolvedPath: fallback, exists: true };
        }
    }

    return {
        resolvedPath: resolved || legacyPathFallbacks(legacyRoot, rawValue)[0] || null,
        exists: false,
    };
}

function readManifest(sourceRoot) {
    return loadJson(path.join(sourceRoot, 'manifest.json'), null);
}

module.exports = {
    buildEntityId,
    createLogger,
    createNdjsonWriter,
    ensureDir,
    findExistingPath,
    forEachNdjson,
    loadJson,
    maxRole,
    normalizeServiceName,
    parseArgs,
    readManifest,
    safeJsonParse,
    sanitizeIdPart,
    toInt,
    writeJson,
};
