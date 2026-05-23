#!/usr/bin/env node
// sync-themes.js — stamps packages/openvibe-themes/themes.json into all 7 openvibe.js files.
// Usage: node scripts/sync-themes.js
// The script finds // <openvibe-themes-generated> ... // </openvibe-themes-generated> markers
// in each openvibe.js file and replaces everything between them with a freshly-generated
// BUILTIN_THEMES constant derived from themes.json.

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const THEMES_JSON = path.join(ROOT, 'packages/openvibe-themes/themes.json');
const TARGETS = [
    'services/openvibe-network/public/assets/openvibe.js',
    'services/openvibe-chat/public/assets/openvibe.js',
    'services/openvibe-community/public/assets/openvibe.js',
    'services/openvibe-games/public/assets/openvibe.js',
    'services/openvibe-live/public/assets/openvibe.js',
    'services/openvibe-media/public/assets/openvibe.js',
    'services/openvibe-tools/public/assets/openvibe.js',
];

const OPEN_MARKER  = '// <openvibe-themes-generated>';
const CLOSE_MARKER = '// </openvibe-themes-generated>';
const INDENT = '    '; // 4 spaces — inside the IIFE

function jsValue(v, depth) {
    const pad = INDENT.repeat(depth);
    if (typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (v === null) return 'null';
    if (Array.isArray(v)) {
        if (v.length === 0) return '[]';
        const items = v.map(item => `${pad}${INDENT}${jsValue(item, depth + 1)}`);
        return `[\n${items.join(',\n')}\n${pad}]`;
    }
    if (typeof v === 'object') {
        const entries = Object.entries(v).map(([k, val]) => {
            const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
            return `${pad}${INDENT}${key}: ${jsValue(val, depth + 1)}`;
        });
        return `{\n${entries.join(',\n')}\n${pad}}`;
    }
    return String(v);
}

function generateBlock(themes) {
    const themeLines = themes.map(t => {
        const entries = Object.entries(t).map(([k, v]) => {
            const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
            return `${INDENT.repeat(3)}${key}: ${jsValue(v, 3)}`;
        });
        return `${INDENT.repeat(2)}{\n${entries.join(',\n')},\n${INDENT.repeat(2)}}`;
    });
    return (
        `${INDENT}const BUILTIN_THEMES = [\n` +
        themeLines.join(',\n') +
        `,\n${INDENT}];`
    );
}

function stamp(filePath, block) {
    const abs = path.join(ROOT, filePath);
    if (!fs.existsSync(abs)) {
        console.warn(`  SKIP (not found): ${filePath}`);
        return;
    }
    const src = fs.readFileSync(abs, 'utf8');
    const openIdx  = src.indexOf(OPEN_MARKER);
    const closeIdx = src.indexOf(CLOSE_MARKER);
    if (openIdx === -1 || closeIdx === -1) {
        console.warn(`  SKIP (markers missing): ${filePath}`);
        return;
    }
    if (closeIdx <= openIdx) {
        console.warn(`  SKIP (markers out of order): ${filePath}`);
        return;
    }
    // Replace from start-of-marker-line to end-of-close-marker-line
    const before = src.slice(0, openIdx);
    const after   = src.slice(closeIdx + CLOSE_MARKER.length);
    const indent  = before.match(/([^\n]*)$/) ? before.match(/([^\n]*)$/)[1] : '';
    const out = `${before}${OPEN_MARKER}\n${block}\n${indent}${CLOSE_MARKER}${after}`;
    fs.writeFileSync(abs, out, 'utf8');
    console.log(`  OK: ${filePath}`);
}

// ── main ──────────────────────────────────────────────────────────────────────

const themes = JSON.parse(fs.readFileSync(THEMES_JSON, 'utf8'));
const block  = generateBlock(themes);

console.log(`sync-themes: stamping ${themes.length} themes into ${TARGETS.length} files\n`);
for (const target of TARGETS) stamp(target, block);
console.log('\nDone.');
