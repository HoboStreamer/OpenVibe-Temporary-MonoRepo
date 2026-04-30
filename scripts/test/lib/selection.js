'use strict';

const { splitList } = require('./args');
const { classifyRelativePath, toRepoPath } = require('./discovery');

function buildMatcher(rawValue) {
    if (!rawValue) return () => true;
    try {
        const regex = new RegExp(String(rawValue), 'i');
        return (value) => regex.test(value);
    } catch {
        const needle = String(rawValue).toLowerCase();
        return (value) => String(value).toLowerCase().includes(needle);
    }
}

function toLowerSet(values) {
    return new Set(splitList(values).map((value) => String(value).toLowerCase()));
}

function matchesScope(test, scopes) {
    return scopes.some((scope) => {
        const normalizedScope = toRepoPath(scope).toLowerCase();
        const relative = test.relativePath.toLowerCase();
        const componentKey = test.componentKey.toLowerCase();
        return relative === normalizedScope
            || relative.startsWith(`${normalizedScope}/`)
            || componentKey === normalizedScope;
    });
}

function matchesComponent(test, components) {
    const componentName = test.componentName.toLowerCase();
    const componentKey = test.componentKey.toLowerCase();
    const qualifiedName = `${test.componentType}:${componentName}`;
    return Array.from(components).some((candidate) => {
        return candidate === componentName
            || candidate === componentKey
            || candidate === qualifiedName;
    });
}

function resolvePathSelection(allTests, rawPaths) {
    const byRelativePath = new Map(allTests.map((test) => [test.relativePath, test]));
    const explicit = new Set();
    const components = new Set();
    const unmatched = [];

    for (const rawPath of splitList(rawPaths)) {
        const normalized = toRepoPath(rawPath);
        if (!normalized) continue;
        if (byRelativePath.has(normalized)) {
            explicit.add(normalized);
            continue;
        }

        const classification = classifyRelativePath(normalized);
        if (classification.componentKey !== '.') {
            components.add(classification.componentKey);
            continue;
        }

        unmatched.push(normalized);
    }

    return {
        explicit,
        components,
        unmatched,
    };
}

function dedupeTests(tests) {
    return Array.from(new Map(tests.map((test) => [test.relativePath, test])).values())
        .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function selectTests(allTests, options = {}) {
    const matcher = options.matcher || (() => true);
    const scopes = splitList(options.scopes);
    const fileFilters = new Set(splitList(options.files).map((value) => toRepoPath(value)));
    const typeFilters = toLowerSet(options.types);
    const componentFilters = toLowerSet(options.components);
    const relatedResolution = resolvePathSelection(allTests, options.relatedPaths);
    const changedResolution = resolvePathSelection(allTests, options.changedPaths);

    let selected = allTests.filter((test) => matcher(test.relativePath));

    if (scopes.length) {
        selected = selected.filter((test) => matchesScope(test, scopes));
    }

    if (typeFilters.size) {
        selected = selected.filter((test) => typeFilters.has(test.componentType));
    }

    if (componentFilters.size) {
        selected = selected.filter((test) => matchesComponent(test, componentFilters));
    }

    if (fileFilters.size) {
        selected = selected.filter((test) => fileFilters.has(test.relativePath));
    }

    if (relatedResolution.explicit.size || relatedResolution.components.size) {
        selected = selected.filter((test) => {
            return relatedResolution.explicit.has(test.relativePath)
                || relatedResolution.components.has(test.componentKey);
        });
    }

    if (changedResolution.explicit.size || changedResolution.components.size) {
        selected = selected.filter((test) => {
            return changedResolution.explicit.has(test.relativePath)
                || changedResolution.components.has(test.componentKey);
        });
    }

    return {
        tests: dedupeTests(selected),
        changedSelection: changedResolution,
        relatedSelection: relatedResolution,
        scopes,
        files: Array.from(fileFilters),
        types: Array.from(typeFilters),
        components: Array.from(componentFilters),
    };
}

module.exports = {
    buildMatcher,
    matchesComponent,
    matchesScope,
    resolvePathSelection,
    selectTests,
};
