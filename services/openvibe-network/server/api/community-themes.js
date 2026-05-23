'use strict';

const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');

const HEX_RE = /^#[0-9a-f]{6}$/i;
const PALETTE_KEYS = ['bg', 'accent', 'accent2', 'text', 'textDim'];

function hexToRgb(hex) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}

function buildVars(palette) {
    const { bg, accent, accent2, text, textDim } = palette;
    const bgRgb = hexToRgb(bg);
    const accentRgb = hexToRgb(accent);
    const vars = {
        '--ov-accent':     accent,
        '--ov-accent-2':   accent2,
        '--ov-bg':         bg,
        '--ov-nav-bg':     bg,
        '--ov-text':       text,
        '--ov-text-dim':   textDim,
        '--ov-text-faint': textDim,
        '--accent':        accent,
        '--accent-2':      accent2,
        '--bg':            bg,
        '--text':          text,
        '--muted':         textDim,
        '--muted-strong':  textDim,
    };
    if (bgRgb) {
        const [r, g, b] = bgRgb;
        vars['--ov-bg-soft']   = `rgba(${r},${g},${b},0.85)`;
        vars['--ov-bg-elev']   = `rgba(${r},${g},${b},0.88)`;
        vars['--ov-bg-elev-2'] = `rgba(${Math.min(r+8,255)},${Math.min(g+8,255)},${Math.min(b+8,255)},0.94)`;
        vars['--panel']        = `rgba(${r},${g},${b},0.88)`;
        vars['--panel-strong'] = `rgba(${Math.min(r+8,255)},${Math.min(g+8,255)},${Math.min(b+8,255)},0.94)`;
    }
    if (accentRgb) {
        const [r, g, b] = accentRgb;
        vars['--ov-border'] = `rgba(${r},${g},${b},0.18)`;
        vars['--border']    = `rgba(${r},${g},${b},0.18)`;
    }
    return vars;
}

function buildPreview(palette) {
    return `linear-gradient(135deg, ${palette.bg} 0%, ${palette.accent} 55%, ${palette.accent2} 100%)`;
}

function serializeRow(row) {
    return {
        id:          row.id,
        name:        row.name,
        description: row.description || '',
        accent:      row.accent,
        accent2:     row.accent2,
        preview:     row.preview,
        author_name: row.author_name,
        created_at:  row.created_at,
        vars:        JSON.parse(row.vars_json),
    };
}

function buildRouter({ requireAuth }) {
    const r = express.Router();

    r.get('/themes/community', (req, res) => {
        const limit  = Math.min(parseInt(req.query.limit)  || 50, 100);
        const offset = Math.max(parseInt(req.query.offset) || 0,  0);
        const rows = db.get().prepare(
            `SELECT * FROM community_themes ORDER BY created_at DESC LIMIT ? OFFSET ?`
        ).all(limit, offset);
        res.json({ items: rows.map(serializeRow) });
    });

    r.post('/themes/community', requireAuth, express.json(), (req, res) => {
        const user = req.user;
        const b    = req.body || {};
        const name        = String(b.name        || '').trim();
        const description = String(b.description || '').trim();
        const palette     = b.palette || {};

        if (!name || name.length > 80) {
            return res.status(400).json({ error: 'name is required (max 80 characters)' });
        }
        for (const key of PALETTE_KEYS) {
            if (!palette[key] || !HEX_RE.test(palette[key])) {
                return res.status(400).json({ error: `palette.${key} must be a 6-digit hex color` });
            }
        }

        const id          = randomUUID();
        const vars        = buildVars(palette);
        const preview     = buildPreview(palette);
        const author_name = user.display_name || user.username || 'OpenVibe User';

        db.get().prepare(`
            INSERT INTO community_themes
                (id, user_id, author_name, name, description, accent, accent2, preview, vars_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, user.id, author_name, name, description || null, palette.accent, palette.accent2, preview, JSON.stringify(vars));

        res.status(201).json({ id, name, accent: palette.accent, accent2: palette.accent2, preview, vars, author_name });
    });

    return r;
}

module.exports = { buildRouter };
