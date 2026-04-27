'use strict';

// Hobo dependency audit — scans the OpenVibe workspace for legacy Hobo
// references and classifies each occurrence. Used by:
//   * scripts/migrate-hobo/audit-hobo-references.js
//   * scripts/audit-hobo-references.js
//   * staging-cutover-rehearsal and the cutover orchestrator
//
// Classifications:
//   migration-source           — files under HoboReposToMigrateFrom/
//   legacy-compatibility       — compat/, federation, opt-in bridge code
//   runtime-default-dependency — non-compat code that requires Hobo at runtime
//   documentation              — markdown / docs references
//   test-fixture               — files under test/ or *.test.js
//   archive                    — JSON migration outputs / data/ snapshots
//   needs-remediation          — anything else that mentions Hobo from runtime

const fs = require('fs');
const path = require('path');

const DEFAULT_TERMS = [
    'hobo.tools',
    'hobostreamer.com',
    'HoboStreamer',
    'HoboApp',
    'hobostreamer',
    'hobotools',
    'HOBO_TOOLS',
    'HOBO_TOOLS_PUBLIC_KEY',
    'HOBO_TOOLS_INTERNAL_URL',
    'HOBOSTREAMER',
    'HoboQuest',
    'hobo-quest',
];

const DEFAULT_INCLUDE_EXT = new Set([
    '.js', '.mjs', '.cjs', '.json', '.md', '.html', '.css', '.sql',
    '.yml', '.yaml', '.env', '.example', '.sh', '.ts', '.tsx',
]);

const DEFAULT_SKIP_DIRS = new Set([
    'node_modules', '.git', '.cache', '.vscode',
]);

function* walk(dir, opts) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const ent of entries) {
        if (opts.skipDirs.has(ent.name)) continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
            yield* walk(full, opts);
            continue;
        }
        if (!ent.isFile()) continue;
        const ext = path.extname(ent.name).toLowerCase();
        if (opts.includeExt.size && !opts.includeExt.has(ext) && !ent.name.startsWith('.env')) {
            continue;
        }
        yield full;
    }
}

function classify(relPath) {
    const lower = relPath.replace(/\\/g, '/').toLowerCase();
    if (lower.startsWith('hoboreposfromigratefrom/') || lower.startsWith('hoboreposToMigrateFrom/'.toLowerCase())) {
        return 'migration-source';
    }
    if (lower.startsWith('hoboreposfromigratefrom') || lower.includes('hoboreposfromigratefrom/')) {
        return 'migration-source';
    }
    // Note: top-level legacy mirror dir is 'HoboReposToMigrateFrom'
    if (lower.startsWith('hoborepostomigratefrom/')) return 'migration-source';
    if (lower.startsWith('compat/')) return 'legacy-compatibility';
    if (lower.startsWith('data/migrations/')) return 'archive';
    if (lower.startsWith('data/')) return 'archive';
    if (lower.startsWith('docs/')) return 'documentation';
    if (lower.endsWith('.md') || lower === 'readme.md' || lower === 'phases.md') return 'documentation';
    if (lower.includes('/test/') || lower.endsWith('.test.js')) return 'test-fixture';
    if (lower.startsWith('context/')) return 'documentation';
    if (lower.startsWith('scripts/migrate-hobo/')) return 'migration-source';
    if (lower.startsWith('scripts/audit-hobo-references') || lower.startsWith('scripts/cutover/')) {
        return 'migration-source';
    }
    if (lower.includes('hobo-bridge') || lower.includes('hobo-tools-proxy') || lower.includes('proxy.js')) {
        return 'legacy-compatibility';
    }
    if (lower.includes('federation') || lower.includes('hobo-tools')) return 'legacy-compatibility';
    if (lower.startsWith('services/') && (lower.endsWith('.js') || lower.endsWith('.html'))) {
        return 'legacy-compatibility';
    }
    return 'needs-remediation';
}

function buildMatcher(terms) {
    const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(`(${escaped.join('|')})`, 'gi');
}

function auditReferences(opts) {
    const root = path.resolve(opts.root);
    const terms = opts.terms || DEFAULT_TERMS;
    const matcher = buildMatcher(terms);
    const includeExt = new Set(opts.includeExt || DEFAULT_INCLUDE_EXT);
    const skipDirs = new Set(opts.skipDirs || DEFAULT_SKIP_DIRS);

    const occurrences = [];
    const fileTotals = new Map();
    const classificationTotals = new Map();
    const termTotals = new Map();

    for (const filePath of walk(root, { includeExt, skipDirs })) {
        let text;
        try {
            text = fs.readFileSync(filePath, 'utf8');
        } catch {
            continue;
        }
        if (!text || !matcher.test(text)) continue;
        matcher.lastIndex = 0;

        const rel = path.relative(root, filePath);
        const classification = classify(rel);
        const lines = text.split(/\r?\n/);
        let fileCount = 0;
        const seenTerms = new Set();
        for (let i = 0; i < lines.length; i += 1) {
            const line = lines[i];
            let m;
            const lineMatcher = new RegExp(matcher.source, 'gi');
            while ((m = lineMatcher.exec(line)) !== null) {
                const term = m[1];
                fileCount += 1;
                seenTerms.add(term.toLowerCase());
                termTotals.set(term.toLowerCase(), (termTotals.get(term.toLowerCase()) || 0) + 1);
                occurrences.push({
                    file: rel,
                    line: i + 1,
                    term,
                    classification,
                    snippet: line.trim().slice(0, 280),
                });
            }
        }
        fileTotals.set(rel, { count: fileCount, classification, terms: [...seenTerms] });
        classificationTotals.set(
            classification,
            (classificationTotals.get(classification) || 0) + 1,
        );
    }

    const summary = {
        generated_at: new Date().toISOString(),
        root,
        terms,
        total_occurrences: occurrences.length,
        total_files: fileTotals.size,
        by_classification: Object.fromEntries(classificationTotals),
        by_term: Object.fromEntries(termTotals),
        files: [...fileTotals.entries()]
            .map(([file, info]) => ({ file, ...info }))
            .sort((a, b) => b.count - a.count),
    };

    return { summary, occurrences };
}

function summaryMarkdown(summary) {
    const lines = [];
    lines.push('# Hobo reference audit');
    lines.push('');
    lines.push(`Generated: \`${summary.generated_at}\``);
    lines.push('');
    lines.push(`Total occurrences: **${summary.total_occurrences}** across **${summary.total_files}** files.`);
    lines.push('');
    lines.push('## By classification');
    lines.push('');
    lines.push('| Classification | Files |');
    lines.push('| --- | --- |');
    for (const [k, v] of Object.entries(summary.by_classification).sort((a, b) => b[1] - a[1])) {
        lines.push(`| ${k} | ${v} |`);
    }
    lines.push('');
    lines.push('## By term');
    lines.push('');
    lines.push('| Term | Occurrences |');
    lines.push('| --- | --- |');
    for (const [k, v] of Object.entries(summary.by_term).sort((a, b) => b[1] - a[1])) {
        lines.push(`| \`${k}\` | ${v} |`);
    }
    lines.push('');
    lines.push('## Top files');
    lines.push('');
    lines.push('| File | Count | Classification |');
    lines.push('| --- | --- | --- |');
    for (const file of summary.files.slice(0, 50)) {
        lines.push(`| \`${file.file}\` | ${file.count} | ${file.classification} |`);
    }
    lines.push('');
    lines.push('## Notes');
    lines.push('');
    lines.push('- `migration-source` and `archive` are expected — they are the legacy mirror or migration outputs.');
    lines.push('- `legacy-compatibility` is the opt-in Hobo federation bridge gated by `OPENVIBE_LEGACY_COMPAT_MODE`.');
    lines.push('- `documentation` references are informational only.');
    lines.push('- `runtime-default-dependency` and `needs-remediation` rows should be reviewed and remediated.');
    return `${lines.join('\n')}\n`;
}

module.exports = {
    DEFAULT_TERMS,
    auditReferences,
    classify,
    summaryMarkdown,
};
