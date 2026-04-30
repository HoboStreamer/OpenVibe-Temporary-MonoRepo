'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_ROOTS = Object.freeze([
    'packages',
    'services',
    path.join('scripts', 'dev'),
    path.join('scripts', 'migrate-hobo'),
    path.join('scripts', 'cutover'),
    path.join('scripts', 'staging'),
    path.join('scripts', 'test'),
]);

function toRepoPath(value) {
    return String(value || '')
        .replace(/\\/g, '/')
        .replace(/^\.\//, '')
        .replace(/\/+/g, '/')
        .replace(/\/$/, '');
}

function classifyRelativePath(relativePath) {
    const normalized = toRepoPath(relativePath);
    const parts = normalized.split('/').filter(Boolean);

    const fallback = {
        relativePath: normalized,
        componentType: 'repo',
        componentName: 'root',
        componentKey: '.',
    };

    if (!parts.length) return fallback;

    if (parts[0] === 'services' && parts[1]) {
        return {
            relativePath: normalized,
            componentType: 'service',
            componentName: parts[1],
            componentKey: `services/${parts[1]}`,
        };
    }

    if (parts[0] === 'packages' && parts[1]) {
        return {
            relativePath: normalized,
            componentType: 'package',
            componentName: parts[1],
            componentKey: `packages/${parts[1]}`,
        };
    }

    if (parts[0] === 'scripts' && parts[1]) {
        return {
            relativePath: normalized,
            componentType: 'script',
            componentName: parts[1],
            componentKey: `scripts/${parts[1]}`,
        };
    }

    return fallback;
}

function* walk(dir) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return;
    }

    for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            yield* walk(fullPath);
            continue;
        }
        if (entry.isFile() && entry.name.endsWith('.test.js')) {
            yield fullPath;
        }
    }
}

function collectTests(root, roots = DEFAULT_ROOTS) {
    const tests = [];
    for (const scopedRoot of roots) {
        for (const absolutePath of walk(path.join(root, scopedRoot))) {
            if (!absolutePath.includes(`${path.sep}test${path.sep}`) && !absolutePath.endsWith('.test.js')) continue;
            const relativePath = toRepoPath(path.relative(root, absolutePath));
            tests.push({
                absolutePath,
                ...classifyRelativePath(relativePath),
            });
        }
    }

    tests.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    return tests;
}

function buildComponentSummary(tests) {
    const byComponent = new Map();
    for (const test of tests) {
        const current = byComponent.get(test.componentKey) || {
            componentType: test.componentType,
            componentName: test.componentName,
            componentKey: test.componentKey,
            count: 0,
        };
        current.count += 1;
        byComponent.set(test.componentKey, current);
    }

    return Array.from(byComponent.values()).sort((left, right) => {
        const typeOrder = left.componentType.localeCompare(right.componentType);
        if (typeOrder !== 0) return typeOrder;
        return left.componentKey.localeCompare(right.componentKey);
    });
}

module.exports = {
    DEFAULT_ROOTS,
    buildComponentSummary,
    classifyRelativePath,
    collectTests,
    toRepoPath,
};
