'use strict';

const { resolvePublicOrigin } = require('@openvibe/sdk/url-defaults');
const { renderIcon } = require('@openvibe/icons');

const LIVE_NETWORK_URLS = Object.freeze({
    restream: resolvePublicOrigin({ surface: 'restream' }),
    chat: resolvePublicOrigin({ surface: 'chat' }),
    community: resolvePublicOrigin({ surface: 'community' }),
    network: resolvePublicOrigin({ surface: 'network' }),
});

const BUILD_UPDATES = [
    {
        id: 'native-live-routes',
        date: '2026-04-27',
        title: 'Dedicated live routes shipped',
        body: 'OpenVibe Live now has native homepage, channels, VODs, clips, go-live, and updates routes instead of a single sparse landing page.',
    },
    {
        id: 'ssr-discovery-redesign',
        date: '2026-04-27',
        title: 'SSR discovery redesign',
        body: 'The live shell now uses a richer animated layout with spotlight cards, quick stats, creator sections, and polished route navigation.',
    },
    {
        id: 'channel-stream-expansion',
        date: '2026-04-27',
        title: 'Channel and stream detail pages expanded',
        body: 'Creator pages now surface recent broadcasts, VOD and clip state, live status, channel metadata, and cross-links for discovery.',
    },
    {
        id: 'live-model-enrichment',
        date: '2026-04-27',
        title: 'Live model enrichment',
        body: 'Featured channels, trending sessions, category counts, viewer totals, and clip/VOD hints are now derived directly from the mirrored live graph.',
    },
];

const GO_LIVE_TRACKS = [
    {
        label: 'Browser broadcast',
        title: 'Quickest route to first pixels',
        body: 'Ideal for creators who want to go live fast without hauling a full desktop studio into the room.',
        meta: 'Good for quick sessions, talks, and lighter-weight streams',
    },
    {
        label: 'OBS / RTMP',
        title: 'Traditional desktop workflow',
        body: 'Bring your scenes, overlays, alerts, and production muscle while keeping the same OpenVibe creator route.',
        meta: 'Best for polished broadcasts and multi-scene production',
    },
    {
        label: 'WHIP / remote tools',
        title: 'Native ingest for modern pipelines',
        body: 'Use WHIP-compatible tooling or remote encoders when you need lower-friction infrastructure handoffs.',
        meta: 'Best for custom tooling, hosted ingest, and experiments',
    },
    {
        label: 'Restream control room',
        title: 'Hand streams off to openre.stream',
        body: 'OpenVibe Live keeps the public route simple while openre.stream handles the fuller destination-and-ingest cockpit.',
        meta: 'Best for multi-destination publishing and reusable endpoints',
    },
];

const MISSION_PILLARS = [
    'Your channel is yours. Stream to Twitch, YouTube, and Kick at the same time without giving up your home base.',
    'One stream key, one VOD library, one clip reel — discoverable at your own @username.',
    'No subscription required to start. Bring your audience with you.',
];

const NUMBER_FORMATTER = new Intl.NumberFormat('en-US');
const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function absoluteUrl(value, baseUrl) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        return new URL(raw, baseUrl || LIVE_NETWORK_URLS.network).toString();
    } catch {
        return raw;
    }
}

function formatNumber(value) {
    return NUMBER_FORMATTER.format(Number(value) || 0);
}

function formatCompactNumber(value) {
    return COMPACT_NUMBER_FORMATTER.format(Number(value) || 0);
}

function formatDurationSeconds(value) {
    const totalSeconds = Math.max(0, Math.round(Number(value) || 0));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

function formatDateTime(value) {
    if (!value) return 'Unknown';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function formatShortDate(value) {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    const now = new Date();
    const year = parsed.getFullYear();
    const sameYear = year === now.getFullYear();
    if (sameYear) {
        return parsed.toLocaleString('en-US', { month: 'short', day: 'numeric' });
    }
    return parsed.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeAgo(value) {
    if (!value) return 'just now';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'just now';
    const deltaSeconds = Math.round((parsed.getTime() - Date.now()) / 1000);
    const ranges = [
        ['year', 31536000],
        ['month', 2592000],
        ['day', 86400],
        ['hour', 3600],
        ['minute', 60],
    ];
    for (const [unit, size] of ranges) {
        if (Math.abs(deltaSeconds) >= size) {
            return RELATIVE_TIME_FORMATTER.format(Math.round(deltaSeconds / size), unit);
        }
    }
    return RELATIVE_TIME_FORMATTER.format(deltaSeconds, 'second');
}

function initialsFrom(value) {
    const words = String(value || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return 'OV';
    return words.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('');
}

function labelizeKey(value) {
    return String(value || '')
        .replace(/[_-]+/g, ' ')
        .trim()
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeCreatorSlug(value) {
    const raw = String(value || '').trim();
    return raw && raw.toLowerCase() !== 'unknown' ? raw : '';
}

function sanitizeStreamTitle(title) {
    if (!title) return null;
    // Filter raw hobostreamer broadcast IDs like "STREAM 1042 1777693187691"
    if (/^stream(\s+\d+)+$/i.test(String(title).trim())) return null;
    // Filter generic default titles like "finditfixit's Stream", "someuser's Stream"
    if (/^.+'s\s+stream$/i.test(String(title).trim())) return null;
    return String(title).trim() || null;
}

function channelPath(slug) {
    const normalized = normalizeCreatorSlug(slug);
    return normalized ? `/@${encodeURIComponent(normalized)}` : '/channels';
}

function streamPath(slug, streamId) {
    const normalized = normalizeCreatorSlug(slug);
    const stream = String(streamId || '').trim();
    if (!normalized || !stream) return channelPath(normalized);
    return `${channelPath(normalized)}/s/${encodeURIComponent(stream)}`;
}

function canRenderImageUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return false;
    return /\.(png|jpe?g|gif|webp|svg|avif)(\?.*)?$/i.test(raw);
}

function _meta({ title, description, canonical, ogType, ogImage }) {
    const pageTitle = escapeHtml(title || 'OpenVibe Live');
    const pageDescription = escapeHtml(description || 'OpenVibe Live');
    const pageCanonical = canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}">` : '';
    const pageOgType = escapeHtml(ogType || 'website');
    const pageOgUrl = canonical ? `<meta property="og:url" content="${escapeHtml(canonical)}">` : '';
    const pageOgImage = ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}">` : '';
    const twitterCard = ogImage ? 'summary_large_image' : 'summary';
    return `
            <title>${pageTitle}</title>
            <meta name="description" content="${pageDescription}">
            ${pageCanonical}
            <meta property="og:title" content="${pageTitle}">
            <meta property="og:description" content="${pageDescription}">
            <meta property="og:type" content="${pageOgType}">
            ${pageOgUrl}
            ${pageOgImage}
            <meta name="twitter:card" content="${twitterCard}">
            <meta name="twitter:title" content="${pageTitle}">
            <meta name="twitter:description" content="${pageDescription}">`;
}

function _shellStyles() {
    return `<style>
        :root {
            --bg: #050916;
            --panel: rgba(15, 23, 42, 0.82);
            --panel-strong: rgba(15, 23, 42, 0.94);
            --border: rgba(255, 255, 255, 0.1);
            --text: #f8fafc;
            --muted: #94a3b8;
            --muted-strong: #cbd5e1;
            --accent: #22d3ee;
            --accent-2: #8b5cf6;
            --radius: 28px;
            color-scheme: dark;
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background:
                radial-gradient(circle at top, rgba(34, 211, 238, 0.14), transparent 30%),
                radial-gradient(circle at 20% 20%, rgba(139, 92, 246, 0.18), transparent 35%),
                linear-gradient(180deg, #020617 0%, #050916 32%, #0f172a 100%);
            color: var(--text);
            line-height: 1.6;
        }
        a { color: inherit; text-decoration: none; }
        code {
            font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
            font-size: 0.92em;
        }
        .page-shell {
            width: min(1180px, calc(100vw - 2rem));
            margin: 0 auto;
        }
        .topbar {
            position: sticky;
            top: 0;
            z-index: 20;
            backdrop-filter: blur(18px);
            background: rgba(5, 9, 22, 0.72);
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .topbar-inner {
            display: flex;
            gap: 1rem;
            align-items: center;
            justify-content: space-between;
            padding: 0.95rem 0;
        }
        .brand {
            display: inline-flex;
            align-items: center;
            gap: 0.9rem;
            min-width: 0;
        }
        .brand-mark,
        .avatar-shell {
            display: inline-grid;
            place-items: center;
            width: 2.7rem;
            height: 2.7rem;
            border-radius: 16px;
            font-weight: 800;
            background: linear-gradient(135deg, var(--accent-2), var(--accent));
            color: white;
        }
        .brand-copy {
            display: grid;
            min-width: 0;
        }
        .brand-name { font-weight: 800; letter-spacing: -0.03em; }
        .brand-sub,
        .subtle-copy,
        .card-kicker,
        .footer-copy,
        .manager-note,
        .input-help,
        .muted-text { color: var(--muted); }
        .nav-links,
        .nav-account,
        .pill-row,
        .footer-links,
        .footer-legal-links,
        .form-actions {
            display: flex;
            gap: 0.75rem;
            flex-wrap: wrap;
            align-items: center;
        }
        .nav-link,
        .nav-cta,
        .button,
        .button-secondary,
        .button-ghost,
        .section-link,
        .utility-link,
        .ov-player-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.45rem;
            min-height: 2.7rem;
            padding: 0.68rem 1rem;
            border-radius: 999px;
            border: 1px solid var(--border);
            background: rgba(255, 255, 255, 0.04);
            color: white;
            font-weight: 700;
            transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
        }
        .nav-link:hover,
        .nav-cta:hover,
        .button:hover,
        .button-secondary:hover,
        .button-ghost:hover,
        .section-link:hover,
        .utility-link:hover,
        .ov-player-button:hover {
            transform: translateY(-1px);
            border-color: rgba(34, 211, 238, 0.35);
            background: rgba(34, 211, 238, 0.1);
        }
        .nav-link.active,
        .button,
        .nav-cta {
            background: linear-gradient(135deg, rgba(139, 92, 246, 0.88), rgba(34, 211, 238, 0.72));
            border-color: transparent;
        }
        .hero-cta-row {
            display: flex;
            gap: 1rem;
            flex-wrap: wrap;
        }
        .btn-golive {
            display: inline-flex;
            align-items: center;
            gap: 0.6rem;
            padding: 0.85rem 1.5rem;
            border-radius: 14px;
            font-weight: 800;
            font-size: 1rem;
            letter-spacing: -0.01em;
            background: linear-gradient(135deg, #dc2626, #f97316);
            border: none;
            color: white;
            box-shadow: 0 0 24px rgba(220, 38, 38, 0.45);
            transition: transform 0.18s ease, box-shadow 0.18s ease;
            position: relative;
        }
        .btn-golive:hover {
            transform: translateY(-2px);
            box-shadow: 0 0 36px rgba(220, 38, 38, 0.65);
        }
        .btn-golive-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: white;
            animation: pulse-dot 1.4s ease-in-out infinite;
        }
        @keyframes pulse-dot {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(0.7); }
        }
        .btn-restream {
            display: inline-flex;
            align-items: center;
            gap: 0.6rem;
            padding: 0.85rem 1.5rem;
            border-radius: 14px;
            font-weight: 700;
            font-size: 0.95rem;
            font-family: ui-monospace, 'Cascadia Code', monospace;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(34, 211, 238, 0.3);
            color: #67e8f9;
            transition: transform 0.18s ease, background 0.18s ease, border-color 0.18s ease;
        }
        .btn-restream:hover {
            transform: translateY(-2px);
            background: rgba(34, 211, 238, 0.08);
            border-color: rgba(34, 211, 238, 0.6);
        }
        .btn-restream-icon {
            font-size: 1rem;
            opacity: 0.8;
        }
        .eye-pill {
            display: inline-flex;
            align-items: center;
            gap: 0.3rem;
        }
        .nav-account {
            justify-content: flex-end;
            min-width: 0;
        }
        .nav-session-status {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            min-height: 2.7rem;
            padding: 0.65rem 0.95rem;
            border-radius: 999px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            background: rgba(255, 255, 255, 0.04);
            color: var(--muted-strong);
            font-size: 0.86rem;
            font-weight: 700;
            white-space: nowrap;
        }
        /* ── nav user dropdown ── */
        .nav-user-menu { position: relative; }
        .nav-user-btn {
            display: inline-flex; align-items: center; gap: 0.45rem;
            min-height: 2.7rem; padding: 0.65rem 0.95rem; border-radius: 999px;
            border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.04);
            color: var(--muted-strong); font-size: 0.86rem; font-weight: 700;
            white-space: nowrap; cursor: pointer;
            transition: border-color 0.18s, background 0.18s;
        }
        .nav-user-btn:hover, .nav-user-btn.open {
            border-color: rgba(34,211,238,0.4); background: rgba(34,211,238,0.08); color: #e2e8f0;
        }
        .nav-user-btn .nav-chevron { transition: transform 0.2s ease; opacity: 0.6; }
        .nav-user-btn.open .nav-chevron { transform: rotate(180deg); }
        .nav-user-dropdown {
            position: absolute; top: calc(100% + 6px); right: 0; z-index: 300;
            min-width: 188px; padding: 0.4rem;
            background: rgba(5,9,22,0.97);
            border: 1px solid rgba(255,255,255,0.12); border-radius: 14px;
            box-shadow: 0 12px 36px rgba(0,0,0,0.55);
            backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
            display: none;
        }
        .nav-user-dropdown.open { display: block; animation: navDropIn 0.13s ease; }
        @keyframes navDropIn { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:none; } }
        .nav-user-item {
            display: flex; align-items: center; gap: 0.6rem;
            padding: 0.58rem 0.8rem; border-radius: 9px;
            color: rgba(255,255,255,0.82); font-size: 0.86rem; font-weight: 600;
            text-decoration: none; transition: background 0.13s;
        }
        .nav-user-item:hover { background: rgba(255,255,255,0.07); color: #fff; }
        .nav-user-item-danger { color: #f87171; }
        .nav-user-item-danger:hover { background: rgba(239,68,68,0.12); color: #fca5a5; }
        .nav-user-divider { height: 1px; background: rgba(255,255,255,0.08); margin: 0.3rem 0.5rem; }
        /* ── sm floating save bar ── */
        .sm-save-bar {
            position: fixed; bottom: 0; left: 0; right: 0; z-index: 250;
            display: flex; align-items: center; justify-content: flex-end; gap: 0.75rem;
            padding: 0.85rem 1.5rem;
            background: rgba(7,11,28,0.97);
            border-top: 1px solid rgba(139,92,246,0.4);
            backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
            transform: translateY(0); opacity: 1;
            transition: transform 0.22s ease, opacity 0.22s ease;
        }
        .sm-save-bar.sm-save-bar-hidden { transform: translateY(100%); opacity: 0; pointer-events: none; }
        #sm-save-status { flex: 1; color: var(--muted); font-size: 0.88rem; font-weight: 600; }
        main.page-shell { padding: 1.35rem 0 3rem; }
        section + section { margin-top: 1.2rem; }
        .glass-card,
        .hero-panel,
        .footer-card,
        .empty-state,
        .stack-item,
        .data-point,
        .media-thumb,
        .ov-media-player {
            border-radius: var(--radius);
            background: linear-gradient(180deg, rgba(15, 23, 42, 0.9), rgba(7, 13, 28, 0.94));
            border: 1px solid var(--border);
            box-shadow: 0 22px 60px rgba(2, 6, 23, 0.34);
        }
        .glass-card,
        .hero-panel,
        .footer-card,
        .empty-state { padding: 1.2rem; }
        .hero-grid,
        .split-grid,
        .story-grid,
        .feature-grid,
        .surface-grid,
        .card-grid,
        .stat-grid,
        .channel-grid,
        .collection-grid,
        .footer-grid,
        .data-points,
        .list-stack,
        .form-grid,
        .hero-aside-stack,
        .ov-media-player,
        .footer-links.is-column {
            display: grid;
            gap: 1rem;
        }
        .hero-grid,
        .split-grid,
        .footer-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .card-grid,
        .channel-grid,
        .collection-grid,
        .feature-grid,
        .surface-grid,
        .story-grid,
        .stat-grid { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
        .paste-grid { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
        .paste-card { display: flex; flex-direction: column; overflow: hidden; padding: 0; }
        .paste-card .paste-thumb-link { display: block; overflow: hidden; }
        .paste-card .paste-thumb { width: 100%; height: 180px; object-fit: cover; display: block; transition: transform 0.2s; }
        .paste-card:hover .paste-thumb { transform: scale(1.03); }
        .paste-card .paste-card-body { padding: 1rem; flex: 1; display: flex; flex-direction: column; gap: 0.4rem; }
        .paste-card .card-title { font-size: 0.98rem; }
        .paste-card .card-kicker { font-size: 0.78rem; color: var(--muted); }
        .paste-card.no-thumb .paste-card-body { padding: 1.2rem; }
        .paste-card.no-thumb .paste-thumb-link { display: none; }
        .data-points { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
        .eyebrow {
            color: var(--accent);
            font-size: 0.78rem;
            text-transform: uppercase;
            letter-spacing: 0.14em;
            font-weight: 800;
            margin-bottom: 0.5rem;
        }
        .hero-heading,
        .section-heading,
        .footer-title {
            margin: 0;
            line-height: 1.05;
            letter-spacing: -0.04em;
        }
        .hero-heading { font-size: clamp(2.4rem, 7vw, 4.5rem); }
        .hero-gradient {
            background: linear-gradient(135deg, #e879f9 0%, #22d3ee 100%);
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
        }
        .section-subtitle,
        .card-body,
        .footer-copy,
        .manager-note,
        .input-help { margin: 0.5rem 0 0; }
        .card-title { margin: 0; font-size: 1.08rem; }
        .pill {
            display: inline-flex;
            align-items: center;
            gap: 0.35rem;
            padding: 0.35rem 0.7rem;
            border-radius: 999px;
            font-size: 0.76rem;
            font-weight: 800;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .pill.primary,
        .pill.live { background: rgba(34, 211, 238, 0.16); border-color: rgba(34, 211, 238, 0.32); }
        .pill.success { background: rgba(74, 222, 128, 0.14); border-color: rgba(74, 222, 128, 0.32); }
        .pill.warn { background: rgba(251, 191, 36, 0.14); border-color: rgba(251, 191, 36, 0.32); }
        .pill.soft,
        .pill.muted { color: var(--muted-strong); }
        .data-point { padding: 0.95rem; }
        .data-point-label { color: var(--muted); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; }
        .data-point-value { margin-top: 0.35rem; font-size: 1.15rem; font-weight: 800; }
        .hero-stat-bar { display: flex; gap: 0.5rem 1rem; align-items: center; flex-wrap: wrap; color: var(--muted); font-size: 0.92rem; margin-top: 1.25rem; }
        .hero-stat strong { color: white; font-weight: 800; font-size: 1rem; }
        .hero-stat-sep { color: rgba(255,255,255,0.18); user-select: none; font-size: 1rem; }
        .link-inline { color: var(--accent); text-decoration: underline; text-underline-offset: 0.2em; }
        .search-bar { display: flex; gap: 0.8rem; flex-wrap: wrap; align-items: center; }
        .filter-input,
        .form-field input,
        .form-field select,
        .form-field textarea {
            width: 100%;
            min-height: 2.9rem;
            padding: 0.85rem 0.95rem;
            border-radius: 16px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            background: rgba(255, 255, 255, 0.05);
            color: white;
        }
        .form-field {
            display: grid;
            gap: 0.35rem;
        }
        .stack-item { padding: 0.95rem; }
        .media-thumb {
            position: relative;
            overflow: hidden;
            aspect-ratio: 16 / 9;
            background:
                radial-gradient(circle at top left, rgba(139, 92, 246, 0.42), transparent 40%),
                linear-gradient(135deg, rgba(14, 23, 46, 0.96), rgba(8, 13, 28, 0.96));
        }
        .media-thumb img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            transition: transform 0.3s ease;
        }
        .media-thumb:hover img { transform: scale(1.04); }
        .media-thumb-play {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.2s ease;
            pointer-events: none;
        }
        .media-thumb:hover .media-thumb-play { opacity: 1; }
        a.media-thumb { display: block; text-decoration: none; }
        .media-fallback-copy {
            position: absolute;
            inset: 0;
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
            gap: 0.35rem;
            padding: 1rem;
            background: linear-gradient(180deg, rgba(8, 13, 28, 0.08), rgba(8, 13, 28, 0.86));
        }
        .media-thumb.has-image .media-fallback-copy { display: none; }
        .media-kicker {
            display: inline-flex;
            width: fit-content;
            align-items: center;
            gap: 0.45rem;
            border-radius: 999px;
            padding: 0.38rem 0.6rem;
            background: rgba(255, 255, 255, 0.08);
            color: rgba(230, 238, 255, 0.96);
            font-size: 0.73rem;
            font-weight: 800;
            letter-spacing: 0.12em;
            text-transform: uppercase;
        }
        .media-stage iframe,
        .ov-media-player video {
            width: 100%;
            aspect-ratio: 16 / 9;
            border-radius: 20px;
            border: 0;
            background: rgba(5, 9, 22, 0.92);
        }
        .ov-player-controls {
            display: grid;
            gap: 0.75rem;
            align-items: center;
            grid-template-columns: auto auto minmax(0, 1fr) auto auto;
        }
        .ov-player-range,
        .ov-player-volume { width: 100%; accent-color: #22d3ee; }
        .ov-player-volume { min-width: 84px; max-width: 108px; }
        .ov-player-time { font-size: 0.92rem; color: var(--muted-strong); font-variant-numeric: tabular-nums; white-space: nowrap; }
        .ov-player-status { color: var(--muted); font-size: 0.92rem; min-height: 1.25em; }
        [data-reveal] { opacity: 1; transform: none; }
        [data-reveal].is-visible { opacity: 1; transform: none; }
        @media (max-width: 980px) {
            .hero-grid,
            .split-grid,
            .footer-grid,
            .ov-player-controls {
                grid-template-columns: 1fr;
            }
            .topbar-inner { flex-wrap: wrap; }
            .brand { flex: 1; }
            .nav-links { order: 3; width: 100%; padding: 0 0 0.5rem; justify-content: flex-start; }
        }
        @media (max-width: 640px) {
            .brand-name { display: none; }
            .nav-link span:not(.ov-icon) { display: none; }
            .nav-link .ov-icon { font-size: 1.25rem; }
            .nav-link { padding: 0.68rem 0.85rem; min-width: 2.7rem; }
        }
        .footer-links-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 1rem;
        }
        .footer-links-heading {
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            font-weight: 700;
            color: var(--muted);
            margin-bottom: 0.6rem;
        }
        .golive-auth-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 1rem;
            max-width: 560px;
        }
        .golive-auth-card {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 0.6rem;
            padding: 2rem 1.5rem;
            border-radius: var(--radius);
            border: 1px solid var(--border);
            background: rgba(255,255,255,0.04);
            text-decoration: none;
            color: inherit;
            text-align: center;
            transition: background 0.15s, border-color 0.15s;
        }
        .golive-auth-card:hover {
            background: rgba(139,92,246,0.12);
            border-color: rgba(139,92,246,0.4);
        }
        .golive-auth-icon {
            width: 52px;
            height: 52px;
            border-radius: 50%;
            background: rgba(139,92,246,0.15);
            display: flex;
            align-items: center;
            justify-content: center;
            color: #a78bfa;
        }
        .golive-auth-label {
            font-size: 1rem;
            font-weight: 700;
            color: white;
        }
        .golive-auth-sub {
            font-size: 0.82rem;
            color: var(--muted);
        }
        /* ── Go Live hero (logged-out) ── */
        .golive-hero {
            max-width: 680px;
        }
        .golive-method-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
        }
        .golive-method-card {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 0.5rem;
            padding: 1.25rem 1.2rem;
            border-radius: var(--radius);
            border: 1px solid var(--border);
            background: rgba(255,255,255,0.04);
        }
        .golive-method-icon {
            width: 46px;
            height: 46px;
            border-radius: 12px;
            background: rgba(34,211,238,0.1);
            color: var(--accent);
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 0.25rem;
        }
        .golive-method-name {
            font-size: 1rem;
            font-weight: 800;
            color: white;
        }
        .golive-method-sub {
            font-size: 0.82rem;
            color: var(--muted);
            line-height: 1.45;
        }
        .golive-cta-row {
            display: flex;
            gap: 0.75rem;
            flex-wrap: wrap;
            margin-bottom: 1.25rem;
        }
        .golive-cta-btn {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            padding: 0.7rem 1.4rem;
            border-radius: 999px;
            font-size: 0.92rem;
            font-weight: 700;
            text-decoration: none;
            transition: opacity 0.15s, background 0.15s;
        }
        .golive-cta-primary {
            background: var(--accent);
            color: #070d1c;
        }
        .golive-cta-primary:hover { opacity: 0.88; }
        .golive-cta-ghost {
            border: 1px solid var(--border);
            color: var(--muted-strong);
            background: rgba(255,255,255,0.04);
        }
        .golive-cta-ghost:hover { border-color: var(--accent); color: white; }
        .golive-restream-note {
            font-size: 0.84rem;
            color: var(--muted);
            margin: 0;
        }
        .golive-restream-note a { color: var(--accent); text-decoration: none; }
        .golive-restream-note a:hover { text-decoration: underline; }
        /* ── Destination presets ── */
        .sm-dest-presets {
            margin-bottom: 0.75rem;
        }
        .sm-dest-preset-row {
            display: flex;
            flex-wrap: wrap;
            gap: 0.4rem;
            margin-top: 0.35rem;
        }
        .sm-dest-preset-btn {
            padding: 0.35rem 0.75rem;
            border-radius: 999px;
            border: 1px solid rgba(139,92,246,0.35);
            background: rgba(139,92,246,0.1);
            color: #c4b5fd;
            font-size: 0.78rem;
            font-weight: 700;
            cursor: pointer;
            transition: background 0.15s, border-color 0.15s, color 0.15s;
        }
        .sm-dest-preset-btn:hover {
            background: rgba(139,92,246,0.25);
            border-color: rgba(139,92,246,0.65);
            color: white;
        }
        /* ── Compact video card (VODs / Clips grid) ── */
        .vc-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 12px;
            margin-top: 0.75rem;
        }
        .vc-card {
            display: block;
            text-decoration: none;
            color: inherit;
            border-radius: 10px;
            overflow: hidden;
            background: rgba(12,20,38,0.8);
            border: 1px solid rgba(255,255,255,0.07);
            transition: transform 0.15s, border-color 0.15s;
        }
        .vc-card:hover { transform: translateY(-3px); border-color: rgba(34,211,238,0.28); }
        .vc-thumb {
            position: relative;
            aspect-ratio: 16/9;
            background: radial-gradient(circle at top left, rgba(139,92,246,0.2), transparent 55%), rgba(8,13,28,0.95);
            overflow: hidden;
        }
        .vc-thumb img {
            width: 100%; height: 100%;
            object-fit: cover;
            display: block;
            transition: transform 0.2s;
        }
        .vc-card:hover .vc-thumb img { transform: scale(1.04); }
        .vc-thumb-empty {
            display: flex; align-items: center; justify-content: center;
            width: 100%; height: 100%; color: rgba(255,255,255,0.18);
        }
        .vc-duration {
            position: absolute; bottom: 5px; right: 6px;
            background: rgba(0,0,0,0.84); color: #fff;
            font-size: 0.68rem; font-weight: 700;
            padding: 2px 5px; border-radius: 4px; letter-spacing: 0.02em;
        }
        .vc-views {
            position: absolute; bottom: 5px; left: 6px;
            background: rgba(0,0,0,0.72); color: rgba(255,255,255,0.82);
            font-size: 0.66rem; font-weight: 600;
            padding: 2px 5px; border-radius: 4px;
            display: inline-flex; align-items: center; gap: 3px;
        }
        .vc-info { padding: 7px 9px 9px; }
        .vc-title {
            font-size: 0.87rem; font-weight: 650; line-height: 1.35;
            display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
            overflow: hidden; margin-bottom: 3px;
        }
        .vc-meta { font-size: 0.74rem; color: var(--muted); }
        .vc-channel { color: var(--muted-strong); text-decoration: none; }
        .vc-channel:hover { color: var(--accent); }
        @media (max-width: 600px) {
            .vc-grid { grid-template-columns: repeat(auto-fill, minmax(155px, 1fr)); gap: 8px; }
        }
        /* ── Streamer group card (Recently Online / Channels) ── */
        .channel-grid { grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)) !important; }
        .sgc {
            background: rgba(12,20,38,0.8);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 12px;
            overflow: hidden;
            transition: border-color 0.15s;
        }
        .sgc:hover { border-color: rgba(34,211,238,0.22); }
        .sgc.is-live { border-color: rgba(239,68,68,0.45); }
        .sgc-header {
            display: flex; align-items: center; gap: 9px;
            padding: 10px 12px 9px;
            text-decoration: none; color: inherit;
            border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .sgc-header:hover .sgc-name { color: var(--accent); }
        .sgc-avatar {
            width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
            background: linear-gradient(135deg, var(--accent-2), var(--accent));
            color: #000; font-size: 0.62rem; font-weight: 800;
            display: flex; align-items: center; justify-content: center;
        }
        .sgc-name {
            font-weight: 700; font-size: 0.9rem;
            flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .sgc-last-online { font-size: 0.7rem; color: var(--muted); white-space: nowrap; flex-shrink: 0; }
        .sgc-live-badge {
            font-size: 0.62rem; font-weight: 800; letter-spacing: 0.06em;
            color: #ef4444; background: rgba(239,68,68,0.14);
            border-radius: 4px; padding: 2px 5px; flex-shrink: 0;
        }
        .sgc-streams { display: flex; flex-direction: column; }
        .sgc-stream {
            display: flex; align-items: center; gap: 9px;
            padding: 6px 10px;
            text-decoration: none; color: inherit;
            border-top: 1px solid rgba(255,255,255,0.04);
            transition: background 0.1s;
        }
        .sgc-stream:hover { background: rgba(255,255,255,0.025); }
        .sgc-stream-thumb {
            width: 62px; height: 35px; border-radius: 4px; flex-shrink: 0;
            background: rgba(255,255,255,0.06); overflow: hidden;
        }
        .sgc-stream-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .sgc-stream-info { min-width: 0; }
        .sgc-stream-title {
            font-size: 0.8rem; font-weight: 600;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .sgc-stream-meta { font-size: 0.68rem; color: var(--muted); margin-top: 1px; }
        .sgc-visit {
            display: block; text-align: center; padding: 7px;
            font-size: 0.76rem; color: var(--accent); font-weight: 600;
            border-top: 1px solid rgba(255,255,255,0.04);
            text-decoration: none; transition: background 0.1s;
        }
        .sgc-visit:hover { background: rgba(34,211,238,0.05); }
    </style>`;
}

function _shellScript() {
    return `<script>
        (function () {
            if (window.OpenVibe && typeof window.OpenVibe.primeTheme === 'function') {
                Promise.resolve(window.OpenVibe.primeTheme()).catch(function () {});
            }

            Array.prototype.forEach.call(document.querySelectorAll('[data-reveal]'), function (element) {
                element.classList.add('is-visible');
            });

            var updatesFeed = document.querySelector('[data-updates-feed]');
            if (updatesFeed) {
                var storageKey = 'openvibe-live:updates-seen';
                var signature = updatesFeed.dataset.updatesFeed || '';
                var cards = Array.prototype.slice.call(updatesFeed.querySelectorAll('[data-update-id]'));
                var status = updatesFeed.querySelector('[data-updates-status]');
                var clearButton = updatesFeed.querySelector('[data-updates-clear]');
                var seen = false;
                try {
                    seen = !!window.localStorage && window.localStorage.getItem(storageKey) === signature;
                } catch (_storageError) {
                    seen = false;
                }
                var applyUpdatesState = function (allSeen) {
                    cards.forEach(function (card) {
                        card.classList.toggle('is-unread', !allSeen);
                    });
                    if (status) {
                        status.textContent = allSeen ? 'All caught up' : String(cards.length) + ' recent changes';
                    }
                    if (clearButton) clearButton.hidden = allSeen;
                };
                applyUpdatesState(seen || !cards.length);
                if (clearButton) {
                    clearButton.addEventListener('click', function () {
                        try {
                            if (window.localStorage) window.localStorage.setItem(storageKey, signature);
                        } catch (_storageError) {
                            // ignore storage failures
                        }
                        applyUpdatesState(true);
                    });
                }
            }

            Array.prototype.forEach.call(document.querySelectorAll('[data-filter-input]'), function (input) {
                var group = input.dataset.filterInput;
                var cards = Array.prototype.slice.call(document.querySelectorAll('[data-filter-group="' + group + '"]'));
                var status = document.querySelector('[data-filter-status="' + group + '"]');
                var apply = function () {
                    var query = String(input.value || '').trim().toLowerCase();
                    var visible = 0;
                    cards.forEach(function (card) {
                        var haystack = String(card.dataset.filterText || '').toLowerCase();
                        var show = !query || haystack.indexOf(query) !== -1;
                        card.hidden = !show;
                        if (show) visible += 1;
                    });
                    if (status) {
                        status.textContent = query ? String(visible) + ' matching results' : String(cards.length) + ' total items';
                    }
                };
                input.addEventListener('input', apply);
                apply();
            });

            Array.prototype.forEach.call(document.querySelectorAll('[data-chip-target]'), function (chip) {
                chip.addEventListener('click', function () {
                    var target = document.querySelector(chip.dataset.chipTarget || '');
                    if (!target) return;
                    target.value = chip.dataset.chipValue || '';
                    target.dispatchEvent(new Event('input', { bubbles: true }));
                    target.focus();
                });
            });

            function formatPlayerTime(seconds) {
                var value = Number(seconds);
                if (!Number.isFinite(value) || value < 0) return '--:--';
                var total = Math.floor(value);
                var hours = Math.floor(total / 3600);
                var minutes = Math.floor((total % 3600) / 60);
                var secs = total % 60;
                if (hours > 0) {
                    return String(hours) + ':' + String(minutes).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
                }
                return String(minutes) + ':' + String(secs).padStart(2, '0');
            }

            Array.prototype.forEach.call(document.querySelectorAll('[data-ov-player]'), function (root) {
                var video = root.querySelector('video');
                if (!video) return;
                var playToggle = root.querySelector('[data-player-action="toggle"]');
                var muteToggle = root.querySelector('[data-player-action="mute"]');
                var fullscreenToggle = root.querySelector('[data-player-action="fullscreen"]');
                var seek = root.querySelector('[data-player-seek]');
                var volume = root.querySelector('[data-player-volume]');
                var time = root.querySelector('[data-player-time]');
                var status = root.querySelector('[data-player-status]');

                var setStatus = function (message) {
                    if (status) status.textContent = message;
                };

                var sync = function () {
                    var duration = Number.isFinite(video.duration) ? video.duration : 0;
                    var current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
                    if (playToggle) playToggle.textContent = video.paused || video.ended ? 'Play' : 'Pause';
                    if (muteToggle) muteToggle.textContent = video.muted || video.volume === 0 ? 'Unmute' : 'Mute';
                    if (time) time.textContent = formatPlayerTime(current) + ' / ' + formatPlayerTime(duration);
                    if (seek && seek.dataset.seeking !== 'true') {
                        seek.disabled = !duration;
                        seek.value = duration ? String(Math.round((current / duration) * 1000)) : '0';
                    }
                    if (volume && document.activeElement !== volume) {
                        volume.value = String(video.muted ? 0 : video.volume);
                    }
                };

                video.controls = false;
                video.preload = 'metadata';
                setStatus('Ready to play');
                sync();

                if (playToggle) {
                    playToggle.addEventListener('click', function () {
                        var action = video.paused || video.ended ? video.play() : Promise.resolve(video.pause());
                        Promise.resolve(action).catch(function () {
                            setStatus('Playback could not start in this browser session.');
                        }).finally(sync);
                    });
                }

                if (muteToggle) {
                    muteToggle.addEventListener('click', function () {
                        video.muted = !video.muted;
                        if (!video.muted && video.volume === 0) {
                            video.volume = 0.7;
                        }
                        sync();
                    });
                }

                if (fullscreenToggle) {
                    fullscreenToggle.addEventListener('click', function () {
                        if (document.fullscreenElement && document.exitFullscreen) {
                            document.exitFullscreen().catch(function () {
                                setStatus('Fullscreen is not available here.');
                            });
                            return;
                        }
                        if (root.requestFullscreen) {
                            root.requestFullscreen().catch(function () {
                                setStatus('Fullscreen is not available here.');
                            });
                        }
                    });
                }

                if (seek) {
                    seek.addEventListener('input', function () {
                        seek.dataset.seeking = 'true';
                        var duration = Number.isFinite(video.duration) ? video.duration : 0;
                        if (time && duration) {
                            var nextTime = (Number(seek.value) / 1000) * duration;
                            time.textContent = formatPlayerTime(nextTime) + ' / ' + formatPlayerTime(duration);
                        }
                    });
                    seek.addEventListener('change', function () {
                        var duration = Number.isFinite(video.duration) ? video.duration : 0;
                        if (duration) {
                            video.currentTime = (Number(seek.value) / 1000) * duration;
                        }
                        delete seek.dataset.seeking;
                        sync();
                    });
                }

                if (volume) {
                    volume.addEventListener('input', function () {
                        var nextVolume = Math.max(0, Math.min(1, Number(volume.value)));
                        video.volume = nextVolume;
                        video.muted = nextVolume === 0;
                        sync();
                    });
                }

                video.addEventListener('loadedmetadata', sync);
                video.addEventListener('durationchange', sync);
                video.addEventListener('timeupdate', sync);
                video.addEventListener('volumechange', sync);
                video.addEventListener('play', function () { setStatus('Playing'); sync(); });
                video.addEventListener('pause', function () { setStatus(video.ended ? 'Playback finished' : 'Paused'); sync(); });
                video.addEventListener('waiting', function () { setStatus('Buffering…'); });
                video.addEventListener('canplay', function () {
                    if (video.paused && !video.ended) setStatus('Ready to play');
                });
                video.addEventListener('ended', function () { setStatus('Playback finished'); sync(); });
                video.addEventListener('error', function () {
                    setStatus('Playback error: the bytes exist, but this browser could not open the source.');
                });
            });
        })();
    </script>`;
}

/*
        .manager-note,
        .input-help {
            color: var(--muted);
            font-size: 0.9rem;
            line-height: 1.5;
        }
        .stack-item {
            padding: 0.95rem;
            border-radius: 18px;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .stack-item h4 {
            margin: 0;
            font-size: 1rem;
        }
        .stack-item p {
            margin: 0.45rem 0 0;
        }
        .timeline-card .card-title,
        .footer-title {
            font-size: 1.06rem;
        }
        .hero-panel.compact .hero-heading {
            max-width: 100%;
            font-size: clamp(2.1rem, 5vw, 3.6rem);
        }
        .footer-shell {
            padding-bottom: 3.5rem;
        }
        .footer-card {
            border-radius: var(--radius);
            padding: 1.2rem;
            margin-top: 1.2rem;
        }
        .footer-grid {
            display: grid;
            gap: 1rem;
            grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
        }
        .footer-links a {
            color: var(--muted-strong);
            font-size: 0.94rem;
        }
        .footer-links.is-column {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.45rem;
        }
        .footer-legal {
            margin-top: 1rem;
            padding-top: 1rem;
            border-top: 1px solid rgba(255, 255, 255, 0.08);
            display: flex;
            flex-wrap: wrap;
            gap: 0.8rem;
            justify-content: space-between;
            align-items: center;
        }
        .footer-legal-links {
            display: flex;
            gap: 0.75rem;
            flex-wrap: wrap;
            align-items: center;
        }
        .footer-links-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 1rem;
        }
        .footer-links-heading {
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            font-weight: 700;
            color: var(--muted);
            margin-bottom: 0.6rem;
        }
        .data-points {
            display: grid;
            gap: 0.85rem;
            grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        }
        .data-point {
            padding: 0.95rem;
            border-radius: 18px;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .data-point-label {
            color: var(--muted);
            font-size: 0.78rem;
            text-transform: uppercase;
            letter-spacing: 0.12em;
            font-weight: 700;
        }
        .data-point-value {
            margin-top: 0.35rem;
            font-size: 1.2rem;
            font-weight: 800;
            letter-spacing: -0.03em;
        }
        .flow-list {
            margin: 0;
            padding-left: 1.1rem;
            color: var(--muted-strong);
            line-height: 1.7;
        }
        .flow-list li + li {
            margin-top: 0.45rem;
        }
        .media-stage {
            padding: 1rem;
        }
        .media-stage iframe {
            width: 100%;
            aspect-ratio: 16 / 9;
            border: 0;
            border-radius: 20px;
            background: rgba(5, 9, 22, 0.8);
        }
        .ov-media-player {
            display: grid;
            gap: 0.85rem;
            padding: 0.85rem;
            border-radius: 24px;
            border: 1px solid rgba(34, 211, 238, 0.16);
            background:
                radial-gradient(circle at top, rgba(34, 211, 238, 0.12), transparent 52%),
                linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(7, 13, 28, 0.94));
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
        }
        .ov-media-player video {
            width: 100%;
            aspect-ratio: 16 / 9;
            border-radius: 20px;
            display: block;
            background: rgba(5, 9, 22, 0.92);
        }
        .ov-player-controls {
            display: grid;
            gap: 0.75rem;
            align-items: center;
            grid-template-columns: auto auto minmax(0, 1fr) auto auto;
        }
        .ov-player-button {
            appearance: none;
            border: 1px solid rgba(255, 255, 255, 0.12);
            background: rgba(255, 255, 255, 0.06);
            color: white;
            border-radius: 999px;
            padding: 0.62rem 0.9rem;
            font-weight: 700;
            cursor: pointer;
            transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
        }
        .ov-player-button:hover {
            transform: translateY(-1px);
            border-color: rgba(34, 211, 238, 0.32);
            background: rgba(34, 211, 238, 0.12);
        }
        .ov-player-range,
        .ov-player-volume {
            width: 100%;
            accent-color: #22d3ee;
        }
        .ov-player-volume {
            min-width: 84px;
            max-width: 108px;
        }
        .ov-player-time {
            font-size: 0.92rem;
            color: var(--muted-strong);
            font-variant-numeric: tabular-nums;
            white-space: nowrap;
        }
        .ov-player-status {
            color: var(--muted);
            font-size: 0.92rem;
            min-height: 1.25em;
        }
        [data-reveal] {
            opacity: 1;
            transform: none;
            transition: transform 0.7s cubic-bezier(0.2, 0.9, 0.2, 1), box-shadow 0.3s ease, border-color 0.3s ease;
        }
        [data-reveal].is-visible {
            opacity: 1;
            transform: none;
        }
        .muted-text {
            color: var(--muted);
        }
        @media (max-width: 1100px) {
            .hero-grid,
            .split-grid,
            .story-grid,
            .footer-grid {
                grid-template-columns: 1fr;
            }
            .hero-signal-rail {
                grid-template-columns: 1fr;
            }
            .stat-grid {
                grid-template-columns: repeat(3, minmax(0, 1fr));
            }
        }
        @media (max-width: 820px) {
            .topbar-inner {
                flex-wrap: wrap;
                justify-content: center;
                padding: 0.85rem 0;
            }
            .nav-links {
                order: 3;
                justify-content: center;
            }
            .stat-grid {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }
            .button,
            .button-secondary,
            .button-ghost,
            .nav-cta {
                width: 100%;
                justify-content: center;
            }
            .hero-actions,
            .button-row {
                flex-direction: column;
                align-items: stretch;
            }
            .ov-player-controls {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }
            .ov-player-time,
            .ov-player-range,
            .ov-player-volume {
                grid-column: 1 / -1;
            }
            .page-shell {
                width: min(var(--max-width), calc(100vw - 1.2rem));
            }
            .hero-panel,
            .section-panel,
            .footer-card {
                padding: 1rem;
            }
            .hero-stage-copy {
                position: static;
                max-width: 100%;
                margin: 1rem;
            }
        }
        @media (max-width: 560px) {
            .hero-heading {
                font-size: clamp(2rem, 12vw, 3rem);
            }
            .stat-grid {
                grid-template-columns: 1fr;
            }
            .card-grid,
            .channel-grid,
            .feature-grid,
            .surface-grid,
            .collection-grid {
                grid-template-columns: 1fr;
            }
        }
        @media (prefers-reduced-motion: reduce) {
            html { scroll-behavior: auto; }
            *, *::before, *::after {
                animation: none !important;
                transition: none !important;
            }
            [data-reveal] {
                opacity: 1;
                transform: none;
            }
        }
    </style>`;
}

function _shellScript() {
    return `<script>
        (function () {
            if (window.OpenVibe && typeof window.OpenVibe.primeTheme === 'function') {
                Promise.resolve(window.OpenVibe.primeTheme()).catch(() => {});
            }

            const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            const revealTargets = Array.from(document.querySelectorAll('[data-reveal]'));
            const reveal = (el) => el.classList.add('is-visible');
            if (!reducedMotion && 'IntersectionObserver' in window) {
                const observer = new IntersectionObserver((entries) => {
                    entries.forEach((entry) => {
                        if (!entry.isIntersecting) return;
                        reveal(entry.target);
                        observer.unobserve(entry.target);
                    });
                }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
                revealTargets.forEach((el) => observer.observe(el));
            } else {
                revealTargets.forEach(reveal);
            }

            const formatter = new Intl.NumberFormat('en-US');
            const compactFormatter = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
            const formatCount = (value, mode) => mode === 'compact' ? compactFormatter.format(value) : formatter.format(Math.round(value));
            const counterObserver = !reducedMotion && 'IntersectionObserver' in window
                ? new IntersectionObserver((entries) => {
                    entries.forEach((entry) => {
                        if (!entry.isIntersecting) return;
                        animateCounter(entry.target);
                        counterObserver.unobserve(entry.target);
                    });
                }, { threshold: 0.65 })
                : null;
            function animateCounter(el) {
                if (el.dataset.countAnimated === 'true') return;
                el.dataset.countAnimated = 'true';
                const target = Number(el.dataset.countTo || 0);
                if (!Number.isFinite(target)) return;
                const mode = el.dataset.countFormat || 'integer';
                const duration = 900;
                const startedAt = performance.now();
                function frame(now) {
                    const progress = Math.min((now - startedAt) / duration, 1);
                    const eased = 1 - Math.pow(1 - progress, 3);
                    el.textContent = formatCount(target * eased, mode);
                    if (progress < 1) requestAnimationFrame(frame);
                }
                requestAnimationFrame(frame);
            }
            document.querySelectorAll('[data-count-to]').forEach((el) => {
                if (counterObserver) counterObserver.observe(el);
                else animateCounter(el);
            });

            const rotator = document.querySelector('[data-rotating-words]');
            const heroStage = document.querySelector('[data-hero-stage]');
            if (heroStage) {
                const frames = Array.from(heroStage.querySelectorAll('[data-hero-frame]'));
                let activeIndex = Math.max(0, frames.findIndex((frame) => frame.classList.contains('is-active')));
                frames.forEach((frame, index) => {
                    frame.classList.toggle('is-active', index === activeIndex);
                });
                if (!reducedMotion && frames.length > 1) {
                    setInterval(() => {
                        frames[activeIndex].classList.remove('is-active');
                        let nextIndex = activeIndex;
                        while (frames.length > 1 && nextIndex === activeIndex) {
                            nextIndex = Math.floor(Math.random() * frames.length);
                        }
                        activeIndex = nextIndex;
                        frames[activeIndex].classList.add('is-active');
                    }, 4200);
                }
            }

            if (rotator) {
                const words = String(rotator.dataset.rotatingWords || '').split('|').map((item) => item.trim()).filter(Boolean);
                let index = 0;
                const applyWord = () => {
                    rotator.textContent = words[index] || 'creators';
                    rotator.classList.add('is-active');
                };
                applyWord();
                if (!reducedMotion && words.length > 1) {
                    setInterval(() => {
                        rotator.classList.remove('is-active');
                        setTimeout(() => {
                            index = (index + 1) % words.length;
                            applyWord();
                        }, 160);
                    }, 2400);
                }
            }

            const updatesFeed = document.querySelector('[data-updates-feed]');
            if (updatesFeed) {
                const storageKey = 'openvibe-live:updates-seen';
                const signature = updatesFeed.dataset.updatesFeed || '';
                const cards = Array.from(updatesFeed.querySelectorAll('[data-update-id]'));
                const status = updatesFeed.querySelector('[data-updates-status]');
                const clearButton = updatesFeed.querySelector('[data-updates-clear]');
                let seen = false;
                try {
                    seen = !!window.localStorage && window.localStorage.getItem(storageKey) === signature;
                } catch {
                    seen = false;
                }
                const applyUpdatesState = (allSeen) => {
                    cards.forEach((card) => {
                        card.classList.toggle('is-unread', !allSeen);
                    });
                    if (status) {
                        status.textContent = allSeen
                            ? 'All caught up'
                            : String(cards.length) + ' recent change' + (cards.length === 1 ? '' : 's') + ' unseen until cleared';
                    }
                    if (clearButton) clearButton.hidden = allSeen;
                };
                applyUpdatesState(seen || !cards.length);
                if (clearButton) {
                    clearButton.addEventListener('click', () => {
                        try {
                            if (window.localStorage) window.localStorage.setItem(storageKey, signature);
                        } catch {
                            // ignore storage failures
                        }
                        applyUpdatesState(true);
                    });
                }
            }

            document.querySelectorAll('[data-filter-input]').forEach((input) => {
                const group = input.dataset.filterInput;
                const cards = Array.from(document.querySelectorAll('[data-filter-group="' + group + '"]'));
                const status = document.querySelector('[data-filter-status="' + group + '"]');
                const apply = () => {
                    const query = input.value.trim().toLowerCase();
                    let visible = 0;
                    cards.forEach((card) => {
                        const haystack = String(card.dataset.filterText || '').toLowerCase();
                        const show = !query || haystack.includes(query);
                        card.hidden = !show;
                        if (show) visible += 1;
                    });
                    if (status) status.textContent = query
                        ? String(visible) + ' matching ' + (visible === 1 ? 'result' : 'results')
                        : String(cards.length) + ' total ' + (cards.length === 1 ? 'item' : 'items');
                };
                input.addEventListener('input', apply);
                apply();
            });

            document.querySelectorAll('[data-chip-target]').forEach((chip) => {
                chip.addEventListener('click', () => {
                    const target = document.querySelector(chip.dataset.chipTarget || '');
                    if (!target) return;
                    target.value = chip.dataset.chipValue || '';
                    target.dispatchEvent(new Event('input', { bubbles: true }));
                    target.focus();
                });
            });

            function formatPlayerTime(seconds) {
                const value = Number(seconds);
                if (!Number.isFinite(value) || value < 0) return '--:--';
                const total = Math.floor(value);
                const hours = Math.floor(total / 3600);
                const minutes = Math.floor((total % 3600) / 60);
                const secs = total % 60;
                if (hours > 0) {
                    return String(hours) + ':' + String(minutes).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
                }
                return String(minutes) + ':' + String(secs).padStart(2, '0');
            }

            document.querySelectorAll('[data-ov-player]').forEach((root) => {
                const video = root.querySelector('video');
                if (!video) return;
                const playToggle = root.querySelector('[data-player-action="toggle"]');
                const muteToggle = root.querySelector('[data-player-action="mute"]');
                const fullscreenToggle = root.querySelector('[data-player-action="fullscreen"]');
                const seek = root.querySelector('[data-player-seek]');
                const volume = root.querySelector('[data-player-volume]');
                const time = root.querySelector('[data-player-time]');
                const status = root.querySelector('[data-player-status]');

                const setStatus = (message) => {
                    if (status) status.textContent = message;
                };

                const sync = () => {
                    const duration = Number.isFinite(video.duration) ? video.duration : 0;
                    const current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
                    if (playToggle) playToggle.textContent = video.paused || video.ended ? 'Play' : 'Pause';
                    if (muteToggle) muteToggle.textContent = video.muted || video.volume === 0 ? 'Unmute' : 'Mute';
                    if (time) time.textContent = formatPlayerTime(current) + ' / ' + formatPlayerTime(duration);
                    if (seek && seek.dataset.seeking !== 'true') {
                        seek.disabled = !duration;
                        seek.value = duration ? String(Math.round((current / duration) * 1000)) : '0';
                    }
                    if (volume && document.activeElement !== volume) {
                        volume.value = String(video.muted ? 0 : video.volume);
                    }
                };

                video.controls = false;
                video.preload = 'metadata';
                setStatus('Ready to play');
                sync();

                if (playToggle) {
                    playToggle.addEventListener('click', async () => {
                        try {
                            if (video.paused || video.ended) {
                                await video.play();
                            } else {
                                video.pause();
                            }
                        } catch (_error) {
                            setStatus('Playback could not start in this browser session.');
                        }
                        sync();
                    });
                }

                if (muteToggle) {
                    muteToggle.addEventListener('click', () => {
                        video.muted = !video.muted;
                        if (!video.muted && video.volume === 0) {
                            video.volume = 0.7;
                        }
                        sync();
                    });
                }

                if (fullscreenToggle) {
                    fullscreenToggle.addEventListener('click', async () => {
                        try {
                            if (document.fullscreenElement) {
                                await document.exitFullscreen();
                            } else if (root.requestFullscreen) {
                                await root.requestFullscreen();
                            }
                        } catch (_error) {
                            setStatus('Fullscreen is not available here.');
                        }
                    });
                }

                if (seek) {
                    seek.addEventListener('input', () => {
                        seek.dataset.seeking = 'true';
                        const duration = Number.isFinite(video.duration) ? video.duration : 0;
                        if (time && duration) {
                            const nextTime = (Number(seek.value) / 1000) * duration;
                            time.textContent = formatPlayerTime(nextTime) + ' / ' + formatPlayerTime(duration);
                        }
                    });
                    seek.addEventListener('change', () => {
                        const duration = Number.isFinite(video.duration) ? video.duration : 0;
                        if (duration) {
                            video.currentTime = (Number(seek.value) / 1000) * duration;
                        }
                        delete seek.dataset.seeking;
                        sync();
                    });
                }

                if (volume) {
                    volume.addEventListener('input', () => {
                        const nextVolume = Math.max(0, Math.min(1, Number(volume.value)));
                        video.volume = nextVolume;
                        video.muted = nextVolume === 0;
                        sync();
                    });
                }

                video.addEventListener('loadedmetadata', sync);
                video.addEventListener('durationchange', sync);
                video.addEventListener('timeupdate', sync);
                video.addEventListener('volumechange', sync);
                video.addEventListener('play', () => {
                    setStatus('Playing');
                    sync();
                });
                video.addEventListener('pause', () => {
                    setStatus(video.ended ? 'Playback finished' : 'Paused');
                    sync();
                });
                video.addEventListener('waiting', () => setStatus('Buffering…'));
                video.addEventListener('canplay', () => {
                    if (video.paused && !video.ended) setStatus('Ready to play');
                });
                video.addEventListener('ended', () => {
                    setStatus('Playback finished');
                    sync();
                });
                video.addEventListener('error', () => {
                    setStatus('Playback error: the bytes exist, but this browser could not open the source.');
                });
            });
        })();
    </script>`;
}

*/

function renderNav(activeNav) {
    const items = [
        { href: '/', label: 'Home', id: 'home', icon: 'network' },
        { href: '/channels', label: 'Channels', id: 'channels', icon: 'community' },
        { href: '/vods', label: 'VODs', id: 'vods', icon: 'media' },
        { href: '/clips', label: 'Clips', id: 'clips', icon: 'live' },
        { href: '/go-live', label: 'Go Live', id: 'go-live', icon: 'launch' },
        { href: '/updates', label: 'Updates', id: 'updates', icon: 'content' },
    ];
    return items.map((item) => `<a class="nav-link ov-icon-label ${item.id === activeNav ? 'active' : ''}" href="${item.href}">${renderIcon(item.icon, { decorative: true })}<span>${escapeHtml(item.label)}</span></a>`).join('');
}

function renderFooter() {
    return `
        <footer class="footer-shell page-shell">
            <section class="footer-card" data-reveal>
                <div class="footer-grid">
                    <div>
                        <div class="eyebrow">OpenVibe Live</div>
                        <p class="footer-copy" style="margin-top:0.5rem;">A free, open source streaming platform with no ads, no algorithms, and no bullshit. Just streams, clips, and community.</p>
                        <p class="footer-copy" style="margin-top:0.75rem;"><a class="link-inline" href="mailto:contact@openvibe.live">contact@openvibe.live</a></p>
                    </div>
                    <div class="footer-links-grid">
                        <div>
                            <div class="footer-links-heading">Watch</div>
                            <div class="footer-links is-column">
                                <a href="/">Home</a>
                                <a href="/channels">Channels</a>
                                <a href="/vods">VODs</a>
                                <a href="/clips">Clips</a>
                            </div>
                        </div>
                        <div>
                            <div class="footer-links-heading">Create</div>
                            <div class="footer-links is-column">
                                <a href="/go-live">Go live</a>
                                <a href="${LIVE_NETWORK_URLS.restream}">Restream</a>
                                <a href="${LIVE_NETWORK_URLS.chat}">Chat</a>
                                <a href="${LIVE_NETWORK_URLS.community}">Community</a>
                            </div>
                        </div>
                        <div>
                            <div class="footer-links-heading">About</div>
                            <div class="footer-links is-column">
                                <a href="https://github.com/openvibe">GitHub</a>
                                <a href="/tos">Terms</a>
                                <a href="/dmca">DMCA</a>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="footer-legal">
                    <span class="footer-copy" style="margin:0;font-size:0.82rem;">© ${new Date().getFullYear()} OpenVibe · Open source · Free to use</span>
                </div>
            </section>
        </footer>`;
}

function renderPage({ title, description, canonical, ogType, ogImage, activeNav, bodyHtml, baseUrl, extraStyles, extraScripts }) {
    const signInHref = `/auth/login?return_to=${encodeURIComponent(canonical || `${baseUrl || ''}/`)}`;
    return `<!doctype html>
        <html lang="en">
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%238b5cf6'/%3E%3Cstop offset='100%25' stop-color='%2322d3ee'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='64' height='64' rx='18' fill='url(%23g)'/%3E%3Ctext x='50%25' y='54%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial,sans-serif' font-size='24' font-weight='700' fill='white'%3EOV%3C/text%3E%3C/svg%3E">
            ${_meta({ title, description, canonical, ogType, ogImage })}
            ${_shellStyles()}
            <link rel="stylesheet" href="/assets/openvibe-icons.css">
            <script src="/assets/openvibe-icons.js" defer></script>
        </head>
        <body>
            <header class="topbar">
                <div class="page-shell topbar-inner">
                    <a class="brand" href="/">
                        <span class="brand-mark">OV</span>
                        <span class="brand-copy">
                            <span class="brand-name">openvibe.live</span>
                        </span>
                    </a>
                    <nav class="nav-links" aria-label="Primary">
                        ${renderNav(activeNav)}
                    </nav>
                    <div class="nav-account" data-live-nav-session>
                        <span class="nav-session-status">Checking session…</span>
                        <a class="button-secondary" href="${signInHref}">Sign in</a>
                    </div>
                </div>
            </header>
            ${extraStyles ? `<style>${extraStyles}</style>` : ''}
            <main class="page-shell">
                ${bodyHtml}
            </main>
            ${renderFooter(baseUrl)}
            <script src="/assets/openvibe.js?v=20260503-1"></script>
            <script src="/assets/live-dashboard-local.js?v=20260604-1"></script>
            <script src="/js/realtime.js?v=20260507-1"></script>
            ${_shellScript()}
            ${extraScripts ? `<script>${extraScripts}</script>` : ''}
        </body>
        </html>`;
}

function renderPill(label, tone) {
    return `<span class="pill ${escapeHtml(tone || '')}">${escapeHtml(label)}</span>`;
}

function renderMediaThumb({ url, title, eyebrow, subtitle, initials, baseUrl, href }) {
    const imageUrl = canRenderImageUrl(url) ? url : null;
    const inner = `
        ${imageUrl ? `<img src="${escapeHtml(absoluteUrl(imageUrl, baseUrl))}" alt="${escapeHtml(title || subtitle || 'OpenVibe Live media')}" loading="lazy" onerror="if(this.parentElement){this.parentElement.classList.remove('has-image');} this.remove();">` : ''}
        <div class="media-fallback-copy">
            <span class="media-kicker">${escapeHtml(eyebrow || 'OpenVibe Live')}</span>
            <strong>${escapeHtml(title || 'Untitled broadcast')}</strong>
            <span>${escapeHtml(subtitle || initials || 'Live discovery')}</span>
        </div>
        <div class="media-thumb-play" aria-hidden="true">
            <svg width="44" height="44" viewBox="0 0 44 44" fill="none"><circle cx="22" cy="22" r="22" fill="rgba(0,0,0,0.55)"/><polygon points="17,13 35,22 17,31" fill="white"/></svg>
        </div>`;
    if (href) {
        return `<a class="media-thumb ${imageUrl ? 'has-image' : ''}" href="${escapeHtml(href)}" tabindex="-1" aria-hidden="true">${inner}</a>`;
    }
    return `<div class="media-thumb ${imageUrl ? 'has-image' : ''}">${inner}</div>`;
}

function renderVideoCard(stream, baseUrl) {
    const slug = normalizeCreatorSlug(stream.channel_slug);
    const channelName = stream.channel_name || (slug ? `@${slug}` : 'Creator');
    const title = sanitizeStreamTitle(stream.title) || 'Untitled stream';
    const href = stream.route_url || (slug ? streamPath(slug, stream.id) : '/channels');
    const thumbUrl = (stream.thumbnail_url && canRenderImageUrl(stream.thumbnail_url))
        ? absoluteUrl(stream.thumbnail_url, baseUrl) : null;
    const duration = stream.duration_seconds ? formatDurationSeconds(stream.duration_seconds) : null;
    const viewCount = stream.view_count || stream.viewer_count || 0;
    const rawDate = stream.created_at || stream.updated_at || stream.started_at;
    const filterText = `${title} ${slug || ''} ${channelName} ${stream.category || ''}`.toLowerCase();
    return `
        <a class="vc-card" href="${escapeHtml(href)}" title="${escapeHtml(title)}" data-stream-id="${escapeHtml(String(stream.id || ''))}" data-filter-group="vods" data-filter-text="${escapeHtml(filterText)}" data-views="${escapeHtml(String(viewCount))}" data-date="${escapeHtml(rawDate || '')}">
            <div class="vc-thumb">
                ${thumbUrl
                    ? `<img src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(title)}" loading="lazy" onerror="this.parentElement.classList.add('no-img');this.remove();">`
                    : `<div class="vc-thumb-empty"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.25"><path d="M15 10l-5-3v6l5-3z"/><rect x="2" y="5" width="20" height="14" rx="2"/></svg></div>`}
                ${duration ? `<span class="vc-duration">${escapeHtml(duration)}</span>` : ''}
                ${viewCount ? `<span class="vc-views"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>${escapeHtml(formatCompactNumber(viewCount))}</span>` : ''}
            </div>
            <div class="vc-info">
                <div class="vc-title">${escapeHtml(title)}</div>
                <div class="vc-meta"><span class="vc-channel">@${escapeHtml(slug || channelName)}</span>${rawDate ? ` · ${escapeHtml(timeAgo(rawDate))}` : ''}</div>
            </div>
        </a>`;
}

function renderStreamerGroupCard(channel, baseUrl) {
    const slug = channel.slug || 'unknown';
    const displayName = channel.display_name || slug;
    const href = channelPath(slug);
    const currentStream = channel.currentStream || null;
    const isLive = !!(currentStream && currentStream.is_live);
    const streams = (channel.recentStreams || (channel.recentStream ? [channel.recentStream] : [])).slice(0, 4);
    const lastOnline = !isLive && streams[0] && streams[0].ended_at ? timeAgo(streams[0].ended_at) : null;
    const initials = initialsFrom(displayName);
    const stats = channel.stats || null;
    const statsBits = [];
    if (stats) {
        statsBits.push(`${formatNumber(stats.total_streams || 0)} stream${Number(stats.total_streams || 0) === 1 ? '' : 's'}`);
    }

    const streamsHtml = streams.length ? streams.map((s) => {
        const streamTitle = sanitizeStreamTitle(s.title) || 'Stream';
        const streamHref = streamPath(slug, s.id);
        const thumbUrl = s.thumbnail_url && canRenderImageUrl(s.thumbnail_url) ? absoluteUrl(s.thumbnail_url, baseUrl) : null;
        const timeStr = s.ended_at ? timeAgo(s.ended_at) : (s.started_at ? timeAgo(s.started_at) : '');
        const dur = s.duration_seconds ? formatDurationSeconds(s.duration_seconds) : null;
        return `<a class="sgc-stream" href="${escapeHtml(streamHref)}">
            <div class="sgc-stream-thumb">${thumbUrl ? `<img src="${escapeHtml(thumbUrl)}" alt="" loading="lazy" onerror="this.remove();">` : ''}</div>
            <div class="sgc-stream-info">
                <div class="sgc-stream-title">${escapeHtml(streamTitle)}</div>
                <div class="sgc-stream-meta">${escapeHtml(timeStr)}${dur ? ` · ${escapeHtml(dur)}` : ''}</div>
            </div>
        </a>`;
    }).join('') : '';

    return `<div class="sgc${isLive ? ' is-live' : ''}">
        <a class="sgc-header" href="${escapeHtml(href)}">
            <span class="sgc-avatar">${escapeHtml(initials)}</span>
            <span class="sgc-name">${escapeHtml(displayName)}</span>
            ${isLive ? '<span class="sgc-live-badge">LIVE</span>' : (lastOnline ? `<span class="sgc-last-online">${escapeHtml(lastOnline)}</span>` : '')}
        </a>
        <div class="sgc-streams">${streamsHtml}</div>
        <a class="sgc-visit" href="${escapeHtml(href)}">${statsBits.length ? escapeHtml(statsBits[0]) + ' · ' : ''}Visit →</a>
    </div>`;
}

function renderStreamCard(stream, channel, baseUrl, options) {
    const opts = options || {};
    const slug = normalizeCreatorSlug(stream.channel_slug || (channel && channel.slug));
    const channelName = stream.channel_name || (channel && (channel.display_name || channel.slug)) || (slug ? `@${slug}` : 'Creator');
    const isReplayMedia = stream.kind === 'vod' || stream.kind === 'clip';
    const href = stream.route_url || (slug ? streamPath(slug, stream.id) : '/channels');
    const audiencePill = stream.is_live
        ? renderPill(`${formatCompactNumber(stream.viewer_count || 0)} watching`, 'live')
        : (isReplayMedia
            ? renderPill(`${formatCompactNumber(stream.view_count || 0)} views`, 'soft')
            : renderPill(`Peak ${formatCompactNumber(stream.peak_viewers || 0)}`, 'soft'));
    const viewCount = stream.is_live ? (stream.viewer_count || 0) : (stream.view_count || 0);
    const eyePill = `<span class="pill soft eye-pill"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>${escapeHtml(formatCompactNumber(viewCount))}</span>`;
    const tags = [
        opts.badge && !opts.hideBadge ? `<span class="pill ${escapeHtml(opts.badgeTone || 'primary')}" data-stream-status-badge>${escapeHtml(opts.badge)}</span>` : '',
        eyePill,
        stream.category ? renderPill(stream.category, 'muted') : '',
    ].filter(Boolean).join('');
    const summary = stream.summary || (stream.is_live
        ? `Started ${timeAgo(stream.started_at)}`
        : (isReplayMedia
            ? timeAgo(stream.created_at || stream.updated_at)
            : `${stream.ended_at ? `Ended ${timeAgo(stream.ended_at)}` : timeAgo(stream.started_at || stream.updated_at)}`));
    const detailBits = Array.isArray(stream.detail_bits) && stream.detail_bits.length
        ? stream.detail_bits.filter(Boolean)
        : (isReplayMedia
            ? [
                slug ? `@${slug}` : channelName,
                stream.duration_seconds ? formatDurationSeconds(stream.duration_seconds) : null,
            ].filter(Boolean)
            : [
                slug ? `@${slug}` : channelName,
                stream.has_clips ? `${formatNumber(stream.clip_count)} clip${stream.clip_count === 1 ? '' : 's'}` : null,
            ].filter(Boolean));
    const filterText = `${stream.title || ''} ${slug} ${channelName} ${stream.category || ''} ${detailBits.join(' ')}`.toLowerCase();
    const kicker = isReplayMedia
        ? `<a class="link-inline" href="${channelPath(slug || 'channels')}">${escapeHtml(channelName)}</a> · ${escapeHtml(summary)}`
        : `<a class="link-inline" href="${channelPath(slug || 'channels')}">${escapeHtml(channelName)}</a> · ${escapeHtml(summary)}`;
    const rawDate = stream.created_at || stream.updated_at || stream.started_at;
    const footerMeta = stream.footer_meta || (isReplayMedia
        ? `<span title="${escapeHtml(formatDateTime(rawDate))}">${escapeHtml(formatShortDate(rawDate))}</span>`
        : (stream.started_at ? `<span title="${escapeHtml(formatDateTime(stream.started_at))}">${escapeHtml(formatShortDate(stream.started_at))}</span>` : ''));
    const ctaLabel = stream.cta_label || (isReplayMedia ? `Watch ${stream.kind} →` : 'Watch →');
    return `
        <article class="glass-card is-inline" data-reveal data-stream-id="${escapeHtml(String(stream.id || ''))}" data-filter-group="${escapeHtml(opts.filterGroup || '')}" data-filter-text="${escapeHtml(filterText)}" data-views="${escapeHtml(String(viewCount))}" data-date="${escapeHtml(stream.created_at || stream.updated_at || stream.started_at || '')}">
            ${renderMediaThumb({
                url: stream.thumbnail_url || (channel && channel.avatar_url) || null,
                title: sanitizeStreamTitle(stream.title) || 'Untitled stream',
                eyebrow: stream.is_live ? 'Live now' : (opts.badge || 'Broadcast'),
                subtitle: channelName,
                initials: initialsFrom(channelName),
                baseUrl,
                href,
            })}
            <div class="pill-row">${tags}</div>
            <a class="card-link" href="${href}"><h3 class="card-title">${escapeHtml(sanitizeStreamTitle(stream.title) || 'Untitled stream')}</h3></a>
            <div class="card-kicker">${kicker}</div>
            ${detailBits.length ? `<p class="card-body">${escapeHtml(detailBits.join(' · '))}</p>` : ''}
            <div class="card-footer">
                <span class="meta-item">${footerMeta}</span>
                <a class="link-inline" href="${href}">${escapeHtml(ctaLabel)}</a>
            </div>
        </article>`;
}

function renderChannelCard(channel, baseUrl, options) {
    const opts = options || {};
    const currentStream = opts.currentStream || channel.currentStream || null;
    const previewStream = opts.previewStream || currentStream || channel.recentStream || null;
    const stats = opts.stats || channel.stats || null;
    const liveLabel = currentStream ? renderPill('Live now', 'live') : renderPill('Offline', 'muted');
    const descriptorBits = [
        `@${channel.slug}`,
        channel.category || null,
        channel.protocol || null,
    ].filter(Boolean);
    const statBits = [];
    if (stats) {
        statBits.push(`${formatNumber(stats.total_streams || 0)} stream${(stats.total_streams || 0) === 1 ? '' : 's'}`);
        if (stats.vods) statBits.push(`${formatNumber(stats.vods)} VOD${stats.vods === 1 ? '' : 's'}`);
        if (stats.clips) statBits.push(`${formatNumber(stats.clips)} clip${stats.clips === 1 ? '' : 's'}`);
    }
    const filterText = `${channel.display_name || ''} ${channel.slug || ''} ${(channel.tags || []).join(' ')} ${descriptorBits.join(' ')} ${statBits.join(' ')}`.toLowerCase();
    return `
        <article class="glass-card is-inline" data-reveal data-filter-group="${escapeHtml(opts.filterGroup || '')}" data-filter-text="${escapeHtml(filterText)}">
            ${renderMediaThumb({
                url: (previewStream && previewStream.thumbnail_url) || channel.avatar_url || null,
                title: (previewStream && previewStream.title) || `${channel.display_name || channel.slug} channel`,
                eyebrow: currentStream ? 'Live creator' : (previewStream ? 'Recent creator' : 'Creator route'),
                subtitle: channel.display_name || channel.slug,
                initials: initialsFrom(channel.display_name || channel.slug),
            actionLabel: 'Browse creators',
            content: recentlyOnlineHtml ? `<div class="channel-grid">${recentlyOnlineHtml}</div>` : null,
            emptyTitle: 'No creators have wrapped a stream yet',
            emptyBody: 'As soon as creators finish their first broadcasts, they show up here with richer recap cards instead of a flat list of ended sessions.',
            emptyHref: '/channels',
            emptyLabel: 'Browse creators',
        })}

        ${renderSection({
            title: 'Recent clips',
            subtitle: 'Short highlights for quick discovery and easy sharing.',
            actionHref: '/clips',
            actionLabel: 'Open clips route',
            content: recentClipsHtml ? `<div class="card-grid">${recentClipsHtml}</div>` : null,
            emptyTitle: 'Clip media is still pending',
            emptyBody: 'The route is live and styled, but it will only populate when canonical clip media exists in OpenVibe storage.',
            emptyHref: '/clips',
            emptyLabel: 'Open clips route',
        })}

        ${renderSection({
            title: 'Recent VODs',
            subtitle: 'Replays stay easy to find after the stream ends.',
            actionHref: '/vods',
            actionLabel: 'Open VOD library',
            content: recentVodsHtml ? `<div class="card-grid">${recentVodsHtml}</div>` : null,
            emptyTitle: 'No public VOD objects yet',
            emptyBody: 'When replay media is staged in canonical storage, VOD cards appear here and in the dedicated VOD route.',
            emptyHref: '/vods',
            emptyLabel: 'Open the VOD route',
        })}

        ${renderSection({
            title: 'Featured creators',
            subtitle: 'Creators worth checking right now based on live status, recent activity, and current momentum.',
            actionHref: '/channels',
            actionLabel: 'Open creator directory',
            content: featuredChannelsHtml ? `<div class="channel-grid">${featuredChannelsHtml}</div>` : null,
            emptyTitle: 'Featured creators will appear here',
            emptyBody: 'Once the live graph has enough channel activity, featured ranking is derived automatically from that data.',
            emptyHref: '/channels',
            emptyLabel: 'Browse channels',
        })}

        <section class="section-panel">
            <div class="section-head">
                <div>
                    <h2 class="section-title">Community pulse</h2>
                    <p class="section-subtitle">Threads, pastes, rooms, calls, and relay signals that keep each creator’s orbit feeling alive.</p>
                </div>
                <div class="inline-actions">
                    <a class="section-link" href="${LIVE_NETWORK_URLS.community}">Open community</a>
                    <a class="section-link" href="${LIVE_NETWORK_URLS.chat}">Open chat</a>
                </div>
            </div>
            <div class="story-grid">
                <article class="glass-card" data-reveal>
                    <div class="eyebrow">Threads and pastes</div>
                    <div class="list-stack">
                        <div>
                            <h3 class="card-title">Recent discussions</h3>
                            <div class="data-points" style="margin-top:0.85rem;">
                                ${recentThreadsHtml || renderSignalCard({ eyebrow: 'Community', title: 'Threads will show up here', body: 'Once openvibe.community fills with stream-linked discussion, this panel will surface it automatically.', meta: 'No public threads yet' })}
                            </div>
                        </div>
                        <div>
                            <h3 class="card-title">Recent pastes</h3>
                            <div class="data-points" style="margin-top:0.85rem;">
                                ${recentPasteSignalsHtml || renderSignalCard({ eyebrow: 'Community', title: 'Public pastes will show up here', body: 'Screenshots, notes, logs, and text drops from openvibe.community land here once they are public.', meta: 'No public pastes yet' })}
                            </div>
                        </div>
                    </div>
                </article>
                <article class="glass-card" data-reveal>
                    <div class="eyebrow">Chat and relay</div>
                    <div class="list-stack">
                        <div>
                            <h3 class="card-title">Relay status</h3>
                            <div class="data-points" style="margin-top:0.85rem;">
                                ${relaySignalsHtml || renderSignalCard({ eyebrow: 'Discord relay', title: 'Relay mappings will surface here', body: 'Pastes already has relay tables and loop-prevention plumbing; this panel shows when they are active.', meta: 'No enabled relay mappings yet' })}
                            </div>
                        </div>
                        <div>
                            <h3 class="card-title">Conversation surfaces</h3>
                            <div class="data-points" style="margin-top:0.85rem;">
                                ${roomSignalsHtml || renderSignalCard({ eyebrow: 'Chat room', title: 'Public rooms will surface here', body: 'OpenVibe Chat already exposes reusable rooms, DMs, calls, and TTS for deeper live integration.', meta: 'No public rooms yet' })}
                                ${activeCallsHtml}
                            </div>
                        </div>
                    </div>
                </article>
            </div>
        </section>

        <section class="section-panel">
            <div class="section-head">
                <div>
                    <h2 class="section-title">Go live your way</h2>
                    <p class="section-subtitle">Keep the quick route obvious, and keep <a class="link-inline" href="${LIVE_NETWORK_URLS.restream}">openre.stream</a> close when you need more control.</p>
                </div>
                <div class="inline-actions">
                    <a class="section-link" href="/go-live">Open stream manager</a>
                    <a class="section-link" href="${LIVE_NETWORK_URLS.restream}">Open openre.stream</a>
                </div>
            </div>
            <div class="story-grid">
                <article class="glass-card" data-reveal>
                    <div class="eyebrow">Broadcast tracks</div>
                    <div class="list-stack">
                        ${GO_LIVE_TRACKS.map((track) => `
                            <div class="data-point">
                                <div class="data-point-label">${escapeHtml(track.label)}</div>
                                <div class="data-point-value">${escapeHtml(track.title)}</div>
                                <div class="subtle-copy">${escapeHtml(track.body)}</div>
                            </div>
                        `).join('')}
                    </div>
                </article>
                <article class="glass-card" data-reveal>
                    <div class="eyebrow">Why this feels better</div>
                    <div class="feature-grid">${featureCards}</div>
                </article>
            </div>
        </section>

        <section class="section-panel" id="recent-changes">
            <div class="section-head">
                <div>
                    <h2 class="section-title">Recent changes</h2>
                    <p class="section-subtitle">${BUILD_UPDATES.length} fresh notes from the native live product surface, with an unread state that stays visible until you clear it.</p>
                </div>
                <a class="section-link" href="/updates">View all updates</a>
            </div>
            <div class="timeline-tools" data-updates-feed="${escapeHtml(updatesSignature)}">
                <span class="pill soft timeline-status" data-updates-status>Checking for unseen changes…</span>
                <button class="button-ghost timeline-clear" type="button" data-updates-clear>Mark updates as seen</button>
                <div class="surface-grid" style="width:100%;">${updatesHtml}</div>
            </div>
        </section>

        <section class="section-panel">
            <div class="section-head">
                <div>
                    <h2 class="section-title">Why OpenVibe exists</h2>
                    <p class="section-subtitle">This is meant to feel like a real exit from ad-first platform design: calmer discovery, portable identity, visible support links, and community memory that does not get paved over.</p>
                </div>
            </div>
            <div class="story-grid">
                <article class="glass-card" data-reveal>
                    <div class="eyebrow">Origin story</div>
                    <p class="body-copy">OpenVibe is built for streamers and communities who want more than a black-box platform. Stream to multiple sites at once, keep your own @username everywhere, and own your VOD archive. Simple tools, no locked-in subscriptions.</p>
                    <div class="data-points">
                        <div class="data-point">
                            <div class="data-point-label">Channels</div>
                            <div class="data-point-value">${escapeHtml(formatNumber((stats && stats.channels) || 0))}</div>
                        </div>
                        <div class="data-point">
                            <div class="data-point-label">Stream hours</div>
                            <div class="data-point-value">${escapeHtml(formatDurationSeconds((stats && stats.stream_time_seconds) || 0))}</div>
                        </div>
                        <div class="data-point">
                            <div class="data-point-label">Platform</div>
                            <div class="data-point-value">Creator-first</div>
                        </div>
                    </div>
                </article>
                <article class="glass-card" data-reveal>
                    <div class="eyebrow">Why OpenVibe</div>
                    <ul class="flow-list">
                        ${MISSION_PILLARS.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
                    </ul>
                    <div class="button-row" style="margin-top:1rem;">
                        <a class="button-secondary" href="/go-live">Start streaming</a>
                        <a class="button-ghost" href="/channels">Browse channels</a>
                    </div>
                </article>
            </div>
        </section>
    `;
    return renderPage({
        title: 'openvibe.live — discover live channels',
        description: 'A modern native discovery surface for OpenVibe live channels, recent broadcasts, VODs, clips, and go-live paths.',
        canonical: `${baseUrl}/`,
        activeNav: 'home',
        bodyHtml: pageContent,
        baseUrl,
    });
}

function renderChannelPage({ channel, currentStream, recentStreams, recentVods, recentClips, channelStats, relatedChannels, baseUrl }) {
    const slug = channel.slug;
    const isLive = !!currentStream && currentStream.is_live;
    const title = `${channel.display_name || slug}${isLive ? ' — LIVE NOW' : ''} — openvibe.live`;
    const description = channel.description
        || (isLive
            ? `${channel.display_name || slug} is live right now on OpenVibe Live.`
            : `${channel.display_name || slug} on openvibe.live — channel activity, recent broadcasts, and replay state.`);
    const recentBroadcastsHtml = (recentStreams || []).filter((stream) => !currentStream || stream.id !== currentStream.id).slice(0, 8)
        .map((stream) => renderStreamCard(stream, channel, baseUrl, { badge: stream.is_live ? 'Live' : 'Broadcast', badgeTone: stream.is_live ? 'live' : 'soft' }))
        .join('');
    const recentVodsHtml = (recentVods || []).slice(0, 4).map((stream) => renderStreamCard(stream, channel, baseUrl, { badge: 'VOD', badgeTone: 'success' })).join('');
    const recentClipsHtml = (recentClips || []).slice(0, 4).map((stream) => renderStreamCard(stream, channel, baseUrl, { badge: 'Clip', badgeTone: 'primary' })).join('');
    const relatedChannelsHtml = (relatedChannels || []).slice(0, 4).map((candidate) => renderChannelCard(candidate, baseUrl, { currentStream: candidate.currentStream, stats: candidate.stats })).join('');
    const ogImage = absoluteUrl((currentStream && currentStream.thumbnail_url) || channel.avatar_url || '', baseUrl) || null;
    const pageContent = `
        <section class="hero-panel compact">
            <div class="story-grid">
                <div class="hero-copy" data-reveal>
                    <div class="eyebrow">${escapeHtml(isLive ? 'Creator live now' : 'Creator channel')}</div>
                    <div class="channel-head" style="align-items:flex-start; margin-bottom:1rem;">
                        <div class="avatar-badge" style="width:4.4rem;height:4.4rem;border-radius:1.45rem;">
                            ${canRenderImageUrl(channel.avatar_url)
                                ? `<img src="${escapeHtml(absoluteUrl(channel.avatar_url, baseUrl))}" alt="${escapeHtml(channel.display_name || slug)} avatar" loading="lazy" onerror="this.parentElement.textContent='${escapeHtml(initialsFrom(channel.display_name || slug))}'">`
                                : escapeHtml(initialsFrom(channel.display_name || slug))}
                        </div>
                        <div>
                            <h1 class="hero-heading" style="max-width:100%; margin-bottom:0.65rem;">${escapeHtml(channel.display_name || slug)}</h1>
                            <div class="pill-row">
                                ${renderPill(`@${slug}`, 'soft')}
                                ${renderPill(isLive ? 'Live now' : 'Offline', isLive ? 'live' : 'muted')}
                                ${channel.category ? renderPill(channel.category, 'primary') : ''}
                                ${channel.protocol ? renderPill(channel.protocol, 'muted') : ''}
                            </div>
                        </div>
                    </div>
                    <p>${escapeHtml(channel.description || 'This channel is part of the current OpenVibe live graph and exposes its stream history, VOD state, and discovery metadata natively.')}</p>
                    <div class="hero-actions">
                        ${currentStream ? `<a class="button" href="${streamPath(slug, currentStream.id)}">Watch current stream</a>` : `<a class="button" href="/go-live">Set up a live session</a>`}
                        <a class="button-secondary" href="/vods?channel=${encodeURIComponent(slug)}">Channel VODs</a>
                        <a class="button-ghost" href="/clips?channel=${encodeURIComponent(slug)}">Channel clips</a>
                    </div>
                </div>
                <div class="glass-card" data-reveal>
                    <div class="eyebrow">Channel snapshot</div>
                    <div class="data-points">
                        <div class="data-point">
                            <div class="data-point-label">Streams tracked</div>
                            <div class="data-point-value">${escapeHtml(formatNumber((channelStats && channelStats.total_streams) || 0))}</div>
                        </div>
                        <div class="data-point">
                            <div class="data-point-label">Peak viewers</div>
                            <div class="data-point-value">${escapeHtml(formatCompactNumber((channelStats && channelStats.peak_viewers) || 0))}</div>
                        </div>
                        <div class="data-point">
                            <div class="data-point-label">VODs</div>
                            <div class="data-point-value">${escapeHtml(formatNumber((channelStats && channelStats.vods) || 0))}</div>
                        </div>
                        <div class="data-point">
                            <div class="data-point-label">Clips</div>
                            <div class="data-point-value">${escapeHtml(formatNumber((channelStats && channelStats.clips) || 0))}</div>
                        </div>
                        <div class="data-point">
                            <div class="data-point-label">Stream time</div>
                            <div class="data-point-value">${escapeHtml(formatDurationSeconds((channelStats && channelStats.stream_time_seconds) || 0))}</div>
                        </div>
                    </div>
                    <div class="meta-row" style="margin-top:1rem;">
                        ${(channel.tags || []).slice(0, 5).map((tag) => renderPill(tag, 'soft')).join('')}
                    </div>
                    <p class="card-body" style="margin-top:1rem;">${escapeHtml((channelStats && channelStats.last_activity_at) ? `Last activity ${timeAgo(channelStats.last_activity_at)}.` : 'Waiting for the next broadcast to land in the mirrored graph.')}</p>
                </div>
            </div>
        </section>

        ${currentStream ? renderSection({
            title: 'Live on channel',
            subtitle: 'Current session details and direct stream route.',
            content: `<div class="split-grid"><div>${renderStreamCard(currentStream, channel, baseUrl, { badge: 'Live now', badgeTone: 'live' })}</div><aside class="glass-card" data-reveal><div class="eyebrow">Why this matters</div><p class="card-body">The channel route now keeps current session context, broadcast history, replay state, and creator identity in a single native page.</p><ul class="flow-list"><li>Current viewers: ${escapeHtml(formatNumber(currentStream.viewer_count || 0))}</li><li>Peak viewers: ${escapeHtml(formatNumber(currentStream.peak_viewers || 0))}</li><li>Started: ${escapeHtml(formatDateTime(currentStream.started_at))}</li></ul></aside></div>`,
        }) : renderSection({
            title: 'Current status',
            subtitle: 'This channel is offline, but its recent activity and media state are still easy to browse.',
            content: renderEmptyState('Offline right now', 'The channel is not currently live, but recent broadcasts, VODs, and clips remain available below where present.', '/go-live', 'Open go-live guide'),
        })}

        ${renderSection({
            title: 'Recent broadcasts',
            subtitle: 'The newest sessions for this creator, whether live, ended, or replay-ready.',
            content: recentBroadcastsHtml ? `<div class="card-grid">${recentBroadcastsHtml}</div>` : null,
            emptyTitle: 'No recent broadcasts yet',
            emptyBody: 'As streams are mirrored into the live graph, they appear here automatically.',
        })}

        ${renderSection({
            title: 'Channel VODs',
            subtitle: 'Replay-linked broadcasts for this creator.',
            actionHref: `/vods?channel=${encodeURIComponent(slug)}`,
            actionLabel: 'Open full VOD list',
            content: recentVodsHtml ? `<div class="card-grid">${recentVodsHtml}</div>` : null,
            emptyTitle: 'No channel VODs yet',
            emptyBody: 'Replay attachments will appear here as soon as they are connected to this channel in the canonical model.',
            emptyHref: `/vods?channel=${encodeURIComponent(slug)}`,
            emptyLabel: 'Open VOD route anyway',
        })}

        ${renderSection({
            title: 'Channel clips',
            subtitle: 'Highlight cards populate as clip metadata lands for this creator.',
            actionHref: `/clips?channel=${encodeURIComponent(slug)}`,
            actionLabel: 'Open full clip list',
            content: recentClipsHtml ? `<div class="card-grid">${recentClipsHtml}</div>` : null,
            emptyTitle: 'No clips on this channel yet',
            emptyBody: 'Clip cards show up here once clip metadata is staged for this creator.',
            emptyHref: `/clips?channel=${encodeURIComponent(slug)}`,
            emptyLabel: 'Open clips route anyway',
        })}

        ${renderSection({
            title: 'More creators to explore',
            subtitle: 'Feature-ranked channels help viewers stay inside the native discovery flow.',
            content: relatedChannelsHtml ? `<div class="channel-grid">${relatedChannelsHtml}</div>` : null,
            emptyTitle: 'No related creators yet',
            emptyBody: 'As the live graph expands, related creators will be suggested here.',
        })}
    `;
    return renderPage({
        title,
        description,
        canonical: `${baseUrl}${channelPath(slug)}`,
        ogType: isLive ? 'video.other' : 'profile',
        ogImage,
        activeNav: 'channels',
        bodyHtml: pageContent,
        baseUrl,
    });
}

function renderStreamPage({ channel, stream, moreFromChannel, baseUrl }) {
    const slug = normalizeCreatorSlug(channel ? channel.slug : stream.channel_slug);
    const channelName = channel ? (channel.display_name || channel.slug) : (stream.channel_name || slug || 'Creator');
    const isLive = !!stream.is_live;
    const title = `${stream.title || 'Untitled stream'} — ${channelName} — openvibe.live`;
    const description = isLive
        ? `${stream.title || 'Untitled stream'} is live now from ${channelName} on openvibe.live.`
        : `${stream.title || 'Untitled stream'} by ${channelName} on openvibe.live.`;
    const ogImage = absoluteUrl(stream.thumbnail_url || (channel && channel.avatar_url) || '', baseUrl) || null;
    const moreFromChannelHtml = (moreFromChannel || []).slice(0, 6).map((item) => renderStreamCard(item, channel, baseUrl, { badge: item.is_live ? 'Live' : 'Broadcast', badgeTone: item.is_live ? 'live' : 'soft' })).join('');
    const mediaStage = stream.embed_url
        ? `<iframe src="${escapeHtml(stream.embed_url)}" allowfullscreen title="${escapeHtml(stream.title || 'Stream embed')}"></iframe>`
        : renderMediaThumb({
            url: stream.thumbnail_url || (channel && channel.avatar_url) || null,
            title: stream.title || 'Untitled stream',
            eyebrow: isLive ? 'Live stage' : 'Broadcast replay',
            subtitle: channelName,
            initials: initialsFrom(channelName),
            baseUrl,
        });
    const pageContent = `
        <section class="hero-panel compact">
            <div class="hero-copy" data-reveal>
                <div class="eyebrow">${escapeHtml(isLive ? 'Live session' : 'Broadcast record')}</div>
                <h1 class="hero-heading" style="max-width:12ch"><span class="hero-gradient">${escapeHtml(stream.title || 'Untitled stream')}</span></h1>
                <p>By ${slug ? `<a class="link-inline" href="${channelPath(slug)}">${escapeHtml(channelName)}</a>` : escapeHtml(channelName)} · ${escapeHtml(stream.category || 'uncategorized')} · ${escapeHtml(isLive ? `${formatCompactNumber(stream.viewer_count || 0)} watching right now` : `Peak ${formatCompactNumber(stream.peak_viewers || 0)} viewers`)}</p>
                <div class="hero-actions">
                    <a class="button" href="${slug ? channelPath(slug) : '/channels'}">${slug ? 'Back to channel' : 'Browse creators'}</a>
                    <a class="button-secondary" href="/vods${slug ? `?channel=${encodeURIComponent(slug)}` : ''}">${slug ? 'Channel VODs' : 'Browse VODs'}</a>
                    <a class="button-ghost" href="/clips${slug ? `?channel=${encodeURIComponent(slug)}` : ''}">${slug ? 'Channel clips' : 'Browse clips'}</a>
                </div>
            </div>
        </section>

        <section class="section-panel">
            <div class="split-grid">
                <article class="glass-card media-stage" data-reveal>
                    ${mediaStage}
                    <div class="pill-row">
                        ${renderPill(isLive ? 'Live now' : 'Not live', isLive ? 'live' : 'muted')}
                        ${stream.category ? renderPill(stream.category, 'primary') : ''}
                        ${renderPill('Stream session', 'success')}
                    </div>
                    <p class="card-body">${escapeHtml(stream.vod_media_id ? `A VOD attachment is already linked to this broadcast (${stream.vod_media_id}).` : 'This broadcast does not yet expose a VOD attachment in the current runtime graph.')}</p>
                </article>
                <aside class="list-stack">
                    <article class="glass-card" data-reveal>
                        <div class="eyebrow">Stream stats</div>
                        <div class="data-points">
                            <div class="data-point"><div class="data-point-label">Current viewers</div><div class="data-point-value">${escapeHtml(formatNumber(stream.viewer_count || 0))}</div></div>
                            <div class="data-point"><div class="data-point-label">Peak viewers</div><div class="data-point-value">${escapeHtml(formatNumber(stream.peak_viewers || 0))}</div></div>
                            <div class="data-point"><div class="data-point-label">Clip count</div><div class="data-point-value">${escapeHtml(formatNumber(stream.clip_count || 0))}</div></div>
                            <div class="data-point"><div class="data-point-label">Status</div><div class="data-point-value">${escapeHtml(isLive ? 'Live' : 'Ended')}</div></div>
                        </div>
                    </article>
                    <article class="glass-card" data-reveal>
                        <div class="eyebrow">Broadcast details</div>
                        <ul class="flow-list">
                            <li>Started: ${escapeHtml(stream.started_at ? formatDateTime(stream.started_at) : 'Unknown')}</li>
                            <li>Ended: ${escapeHtml(stream.ended_at ? formatDateTime(stream.ended_at) : (isLive ? 'Still live' : 'Unknown'))}</li>
                            <li>Category: ${escapeHtml(stream.category || 'uncategorized')}</li>
                            <li>Source: ${escapeHtml(stream.source || 'native')}</li>
                            <li>Channel binding: ${escapeHtml(stream.channel_binding_mode || 'default')}</li>
                        </ul>
                    </article>
                </aside>
            </div>
        </section>

        ${renderSection({
            title: `More from ${channelName}`,
            subtitle: 'Keep moving through the creator’s recent activity without backing out to a generic index.',
            content: moreFromChannelHtml ? `<div class="card-grid">${moreFromChannelHtml}</div>` : null,
            emptyTitle: 'No other broadcasts yet',
            emptyBody: 'Once more sessions exist for this creator, they appear here automatically.',
            emptyHref: slug ? channelPath(slug) : '/channels',
            emptyLabel: slug ? 'Open channel page' : 'Browse creators',
        })}
    `;
    return renderPage({
        title,
        description,
        canonical: slug ? `${baseUrl}${streamPath(slug, stream.id)}` : `${baseUrl}/channels`,
        ogType: isLive ? 'video.other' : 'video.movie',
        ogImage,
        activeNav: 'channels',
        bodyHtml: pageContent,
        baseUrl,
    });
}

function renderMediaDetailPage({ item, channel, moreByCreator, baseUrl }) {
    const kind = item && item.kind === 'clip' ? 'clip' : 'vod';
    const kindLabel = kind === 'clip' ? 'Clip' : 'VOD';
    const slug = normalizeCreatorSlug(item.channel_slug || (channel && channel.slug));
    const channelName = item.channel_name || (channel && (channel.display_name || channel.slug)) || slug || 'Creator';
    const title = `${item.title || `Untitled ${kindLabel}`} — ${channelName} — openvibe.live`;
    const description = item.description || `${kindLabel} by ${channelName} on openvibe.live`;
    const canonicalId = encodeURIComponent(item.legacy_id || item.id);
    const canonical = `${baseUrl}/${kind}/${canonicalId}`;
    const ogImage = absoluteUrl(item.thumbnail_url || (channel && channel.avatar_url) || '', baseUrl) || null;
    const backHref = `/${kind === 'clip' ? 'clips' : 'vods'}`;

    const player = item.playback_ready && item.playback_url
        ? renderCustomMediaPlayer({
            title: item.title || `Untitled ${kindLabel}`,
            playbackUrl: item.playback_url,
            posterUrl: ogImage || '',
            mimeType: item.playback_mime_type || item.mime_type || '',
            statusText: item.playback_note || 'Playback ready',
        })
        : renderMediaThumb({
            url: item.thumbnail_url || (channel && channel.avatar_url) || null,
            title: item.title || `Untitled ${kindLabel}`,
            eyebrow: kindLabel,
            subtitle: channelName,
            initials: initialsFrom(channelName),
            baseUrl,
        });

    const moreCardsHtml = (moreByCreator || []).map((v) => {
        const vHref = `/${kind}/${encodeURIComponent(v.legacy_id || v.id)}`;
        const vThumb = canRenderImageUrl(v.thumbnail_url) ? absoluteUrl(v.thumbnail_url, baseUrl) : null;
        return `
        <a class="more-card" href="${escapeHtml(vHref)}">
            <div class="more-card-thumb ${vThumb ? 'has-image' : ''}">
                ${vThumb ? `<img src="${escapeHtml(vThumb)}" alt="${escapeHtml(v.title || 'VOD')}" loading="lazy">` : `<span>${escapeHtml(initialsFrom(channelName))}</span>`}
                <div class="media-thumb-play" aria-hidden="true"><svg width="32" height="32" viewBox="0 0 44 44" fill="none"><circle cx="22" cy="22" r="22" fill="rgba(0,0,0,0.55)"/><polygon points="17,13 35,22 17,31" fill="white"/></svg></div>
            </div>
            <div class="more-card-title">${escapeHtml(v.title || 'Untitled')}</div>
            <div class="more-card-meta">${v.duration_seconds ? escapeHtml(formatDurationSeconds(v.duration_seconds)) : ''}</div>
        </a>`;
    }).join('');

    const pageContent = `
        <div class="vod-back-row">
            <a class="vod-back-btn" href="${escapeHtml(backHref)}">← Back to ${kind === 'clip' ? 'Clips' : 'VODs'}</a>
        </div>

        <section class="section-panel vod-player-section">
            ${player}
            <div class="vod-meta-row">
                <div>
                    <h1 class="vod-title">${escapeHtml(item.title || `Untitled ${kindLabel}`)}</h1>
                    <div class="vod-meta-sub">
                        ${slug && slug !== 'unknown' ? `<a class="link-inline" href="${channelPath(slug)}">@${escapeHtml(slug)}</a>` : escapeHtml(channelName)}
                        ${item.category ? ` · ${renderPill(item.category, 'muted')}` : ''}
                    </div>
                </div>
                <div class="vod-stats">
                    <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>${escapeHtml(formatNumber(item.view_count || 0))}</span>
                    ${item.duration_seconds ? `<span>${escapeHtml(formatDurationSeconds(item.duration_seconds))}</span>` : ''}
                    <span>${escapeHtml(formatShortDate(item.created_at || item.updated_at))}</span>
                </div>
            </div>
        </section>

        ${moreCardsHtml ? `
        <section class="section-panel">
            <h2 class="section-title" style="margin-bottom:1rem;">More by ${escapeHtml(channelName)}</h2>
            <div class="more-slider">${moreCardsHtml}</div>
        </section>` : ''}`;

    return renderPage({
        title,
        description,
        canonical,
        ogType: 'video.other',
        ogImage,
        activeNav: kind === 'clip' ? 'clips' : 'vods',
        bodyHtml: pageContent,
        baseUrl,
        extraStyles: `
        .vod-back-row { padding: 0.75rem 0; }
        .vod-back-btn {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            font-size: 0.9rem;
            font-weight: 600;
            color: var(--muted);
            transition: color 0.15s;
        }
        .vod-back-btn:hover { color: white; }
        .vod-player-section { padding: 0; overflow: hidden; }
        .vod-player-section .ov-media-player,
        .vod-player-section .media-thumb { border-radius: var(--radius) var(--radius) 0 0; }
        .vod-meta-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 1rem;
            padding: 1rem 1.2rem;
            flex-wrap: wrap;
        }
        .vod-title { margin: 0 0 0.4rem; font-size: clamp(1.1rem, 3vw, 1.5rem); letter-spacing: -0.02em; }
        .vod-meta-sub { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; color: var(--muted); font-size: 0.9rem; }
        .vod-stats { display: flex; gap: 1rem; align-items: center; color: var(--muted); font-size: 0.88rem; white-space: nowrap; flex-wrap: wrap; }
        .more-slider {
            display: flex;
            gap: 1rem;
            overflow-x: auto;
            scroll-snap-type: x mandatory;
            padding-bottom: 0.5rem;
            scrollbar-width: thin;
            scrollbar-color: rgba(255,255,255,0.12) transparent;
        }
        .more-card {
            flex: 0 0 200px;
            scroll-snap-align: start;
            text-decoration: none;
            color: inherit;
        }
        .more-card-thumb {
            aspect-ratio: 16/9;
            border-radius: 10px;
            overflow: hidden;
            background: linear-gradient(135deg, rgba(14,23,46,0.96), rgba(8,13,28,0.96));
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 0.5rem;
        }
        .more-card-thumb img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s ease; }
        .more-card:hover .more-card-thumb img { transform: scale(1.05); }
        .more-card:hover .media-thumb-play { opacity: 1; }
        .more-card-thumb span { color: var(--muted); font-size: 1.2rem; font-weight: 700; }
        .more-card-title { font-size: 0.88rem; font-weight: 600; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .more-card-meta { font-size: 0.78rem; color: var(--muted); margin-top: 0.2rem; }`,
    });
}

function renderCustomMediaPlayer({ title, playbackUrl, posterUrl, mimeType, statusText }) {
    return `
        <div class="ov-media-player" data-ov-player>
            <video controls playsinline preload="metadata" poster="${escapeHtml(posterUrl || '')}" aria-label="openvibe.media playback — ${escapeHtml(title || 'media')}">
                <source src="${escapeHtml(playbackUrl || '')}"${mimeType ? ` type="${escapeHtml(mimeType)}"` : ''}>
            </video>
            <div class="ov-player-controls">
                <button class="ov-player-button" type="button" data-player-action="toggle">Play</button>
                <button class="ov-player-button" type="button" data-player-action="mute">Mute</button>
                <input class="ov-player-range" type="range" min="0" max="1000" step="1" value="0" data-player-seek aria-label="Seek playback position">
                <div class="ov-player-time" data-player-time>0:00 / --:--</div>
                <div style="display:flex;gap:0.6rem;align-items:center;justify-content:flex-end;">
                    <input class="ov-player-volume" type="range" min="0" max="1" step="0.05" value="1" data-player-volume aria-label="Playback volume">
                    <button class="ov-player-button" type="button" data-player-action="fullscreen">Full screen</button>
                </div>
            </div>
            <div class="ov-player-status" data-player-status role="status" aria-live="polite">${escapeHtml(statusText || 'Playback ready')}</div>
            ${mimeType ? `<div class="ov-player-meta" aria-hidden="true">Detected type: ${escapeHtml(mimeType)}</div>` : ''}
        </div>`;
}

function renderSection({ title, titleHtml, subtitle, actionHref, actionLabel, content, emptyTitle, emptyBody, emptyHref, emptyLabel }) {
    const actionHtml = actionHref && actionLabel
        ? `<a class="section-link" href="${actionHref}">${escapeHtml(actionLabel)}</a>`
        : '';
    const bodyHtml = content && String(content).trim()
        ? content
        : `
            <article class="empty-state" data-reveal>
                <h3 class="card-title">${escapeHtml(emptyTitle || 'Nothing here yet')}</h3>
                <p class="card-body">${escapeHtml(emptyBody || 'This section will populate when more public activity is available.')}</p>
                ${emptyHref && emptyLabel ? `<div class="form-actions" style="margin-top:1rem;"><a class="button-secondary" href="${emptyHref}">${escapeHtml(emptyLabel)}</a></div>` : ''}
            </article>`;
    const resolvedTitle = titleHtml || escapeHtml(title || 'Section');
    return `
        <section class="section-panel">
            <div class="section-head">
                <div>
                    <h2 class="section-title ov-icon-label">${resolvedTitle}</h2>
                    ${subtitle ? `<p class="section-subtitle">${subtitle}</p>` : ''}
                </div>
                ${actionHtml}
            </div>
            ${bodyHtml}
        </section>`;
}

function renderSignalCard({ eyebrow, title, body, meta, href }) {
    const content = `
        <div class="eyebrow">${escapeHtml(eyebrow || 'Signal')}</div>
        <h3 class="card-title">${escapeHtml(title || 'Untitled signal')}</h3>
        <p class="card-body">${escapeHtml(body || '')}</p>
        ${meta ? `<div class="card-kicker">${escapeHtml(meta)}</div>` : ''}`;
    return href
        ? `<a class="glass-card" data-reveal href="${href}">${content}</a>`
        : `<article class="glass-card" data-reveal>${content}</article>`;
}

function renderChannelCard(channel, baseUrl, options) {
    const opts = options || {};
    const currentStream = opts.currentStream || channel.currentStream || null;
    const previewStream = opts.previewStream || currentStream || channel.recentStream || null;
    const stats = opts.stats || channel.stats || null;
    const slug = channel.slug || 'unknown';
    const displayName = channel.display_name || slug;
    // Primary category: prefer last stream category, fall back to channel category
    const category = (previewStream && previewStream.category) || channel.category || null;
    // Last-live time — most important piece of info for recently-online context
    const lastLiveTime = previewStream && previewStream.ended_at ? timeAgo(previewStream.ended_at) : null;
    const cleanTitle = sanitizeStreamTitle(previewStream && previewStream.title);
    const rawDurationSec = previewStream && previewStream.duration_seconds
        ? previewStream.duration_seconds
        : (previewStream && previewStream.ended_at && previewStream.started_at
            ? Math.max(0, Math.round((new Date(String(previewStream.ended_at).includes('T') ? previewStream.ended_at : previewStream.ended_at.replace(' ', 'T') + 'Z') - new Date(String(previewStream.started_at).includes('T') ? previewStream.started_at : previewStream.started_at.replace(' ', 'T') + 'Z')) / 1000))
            : 0);
    const streamDuration = rawDurationSec > 60 ? formatDurationSeconds(rawDurationSec) : null;
    const statsBits = [];
    if (stats) {
        statsBits.push(`${formatNumber(stats.total_streams || 0)} stream${Number(stats.total_streams || 0) === 1 ? '' : 's'}`);
        if (stats.vods) statsBits.push(`${formatNumber(stats.vods)} VOD${Number(stats.vods) === 1 ? '' : 's'}`);
        if (stats.clips) statsBits.push(`${formatNumber(stats.clips)} clip${Number(stats.clips) === 1 ? '' : 's'}`);
    }
    const filterText = `${displayName} ${slug} ${category || ''} ${statsBits.join(' ')}`.toLowerCase();
    return `
        <article class="glass-card is-inline" data-reveal data-filter-group="${escapeHtml(opts.filterGroup || '')}" data-filter-text="${escapeHtml(filterText)}">
            ${renderMediaThumb({
                url: (previewStream && previewStream.thumbnail_url) || channel.avatar_url || null,
                title: cleanTitle || displayName,
                eyebrow: currentStream ? 'Live now' : (lastLiveTime || (previewStream ? 'Recently' : 'Channel')),
                subtitle: displayName,
                initials: initialsFrom(displayName),
                baseUrl,
            })}
            <div class="pill-row">
                ${currentStream ? renderPill('Live now', 'live') : renderPill('Offline', 'muted')}
                ${category ? renderPill(category, 'soft') : ''}
            </div>
            <a class="card-link" href="${channelPath(slug)}"><h3 class="card-title">${escapeHtml(displayName)}</h3></a>
            <div class="card-kicker">@${escapeHtml(slug)}${lastLiveTime ? ` · last live ${escapeHtml(lastLiveTime)}` : ''}</div>
            ${cleanTitle ? `<p class="card-body">${escapeHtml(cleanTitle)}${streamDuration ? ` · ${escapeHtml(streamDuration)}` : ''}</p>` : (streamDuration ? `<p class="card-body">${escapeHtml(streamDuration)}</p>` : (channel.description ? `<p class="card-body">${escapeHtml(channel.description)}</p>` : ''))}
            <div class="card-footer">
                <span class="meta-item">${escapeHtml(statsBits.join(' · ') || 'New channel')}</span>
                <a class="link-inline" href="${channelPath(slug)}">Visit →</a>
            </div>
        </article>`;
}

function renderHomePage({ channels, featuredChannels, trendingNow, liveNow, recentlyEnded, recentlyOnlineChannels, recentVods, recentClips, categories, stats, community, chat, baseUrl }) {
    const liveNowHtml = (liveNow || []).slice(0, 6).map((stream) => renderStreamCard(stream, null, baseUrl, { badge: 'Live now', badgeTone: 'live' })).join('');
    const recentlyOnlineHtml = (recentlyOnlineChannels || []).slice(0, 12).map((channel) => renderStreamerGroupCard(channel, baseUrl)).join('');
    const recentVodsHtml = (recentVods || []).slice(0, 12).map((item) => renderVideoCard(item, baseUrl)).join('');
    const recentClipsHtml = (recentClips || []).slice(0, 12).map((item) => renderVideoCard(item, baseUrl)).join('');
    const featuredChannelsHtml = (featuredChannels || []).slice(0, 8).map((channel) => renderStreamerGroupCard(channel, baseUrl)).join('');
    const recentThreadsHtml = (((community && community.recentThreads) || []).slice(0, 4)).map((thread) => renderSignalCard({
        eyebrow: 'Thread',
        title: thread.title || 'Untitled thread',
        body: thread.preview_text || thread.body || 'Recent thread activity.',
        meta: thread.created_at ? timeAgo(thread.created_at) : '',
        href: thread.route_url || LIVE_NETWORK_URLS.community,
    })).join('');
    const recentPasteCardsHtml = (((community && community.recentPastes) || []).slice(0, 8)).map((paste) => {
        const imgHtml = paste.image_url
            ? `<a href="${escapeHtml(paste.route_url || LIVE_NETWORK_URLS.community)}" class="paste-thumb-link"><img class="paste-thumb" src="${escapeHtml(paste.image_url)}" alt="${escapeHtml(paste.title || 'Paste screenshot')}" loading="lazy" onerror="this.closest('.paste-card').classList.add('no-thumb')"></a>`
            : '';
        return `<article class="paste-card glass-card${paste.image_url ? '' : ' no-thumb'}" data-reveal>
            ${imgHtml}
            <div class="paste-card-body">
                <div class="pill-row"><span class="pill soft">${escapeHtml(paste.kind || 'paste')}</span></div>
                <a class="card-link" href="${escapeHtml(paste.route_url || LIVE_NETWORK_URLS.community)}"><h3 class="card-title">${escapeHtml(paste.title || paste.slug || 'Untitled paste')}</h3></a>
                <div class="card-kicker">${escapeHtml(paste.created_by_actor_id ? paste.created_by_actor_id.replace(/^user:[^:]+:/, '@') : '')} · ${escapeHtml(timeAgo(paste.created_at))}</div>
            </div>
        </article>`;
    }).join('');
    const roomSignalsHtml = (((chat && chat.publicRooms) || []).slice(0, 3)).map((room) => renderSignalCard({
        eyebrow: 'Chat room',
        title: room.display_name || room.slug || 'Open room',
        body: room.description || 'Public room open to everyone.',
        meta: room.member_count ? `${formatNumber(room.member_count)} members` : 'Public',
        href: LIVE_NETWORK_URLS.chat,
    })).join('');
    const categoryChips = (categories || []).slice(0, 10).map((category) => `<button class="button-ghost" type="button" data-chip-target="#live-home-filter" data-chip-value="${escapeHtml(category.name || category.category || category.label || '')}">${escapeHtml(category.name || category.category || category.label || 'Uncategorized')}</button>`).join('');
    const liveCount = (liveNow && liveNow.length) || 0;
    const channelCount = (stats && stats.channels) || (channels && channels.length) || 0;
    const vodCount = (stats && stats.vods) || (recentVods && recentVods.length) || 0;
    const clipCount = (stats && stats.clips) || (recentClips && recentClips.length) || 0;
    const totalViewers = (stats && stats.current_viewers) || 0;
    const peakViewers = (stats && stats.peak_viewers) || 0;
    const totalStreams = (stats && stats.total_streams) || 0;
    const streamTime = (stats && stats.stream_time_seconds) || 0;

    const pageContent = `
        <section class="hero-panel compact live-home-hero">
            <div class="hero-copy" data-reveal>
                <div class="eyebrow">OpenVibe Live</div>
                <h1 class="hero-heading">Watch live, share clips, and <span class="hero-gradient">never lose your route.</span></h1>
                <p>A live streaming home that keeps your channel, VODs, and community all at the same @handle — no platform churn required.</p>
            </div>
            <div class="hero-stat-bar">
                <span class="hero-stat"><strong data-live-count>${escapeHtml(String(liveCount))}</strong> live</span>
                <span class="hero-stat-sep">·</span>
                <span class="hero-stat"><strong>${escapeHtml(formatNumber(channelCount))}</strong> channels</span>
                <span class="hero-stat-sep">·</span>
                <span class="hero-stat"><strong>${escapeHtml(formatNumber(vodCount))}</strong> VODs</span>
                <span class="hero-stat-sep">·</span>
                <span class="hero-stat"><strong>${escapeHtml(formatNumber(clipCount))}</strong> clips</span>
                ${totalStreams ? `<span class="hero-stat-sep">·</span><span class="hero-stat"><strong>${escapeHtml(formatNumber(totalStreams))}</strong> streams</span>` : ''}
            </div>
            ${liveNowHtml ? `
            <div style="margin-top:1.5rem;">
                <div class="hero-cta-row" style="margin-bottom:1.5rem;">
                    <a class="btn-golive" href="/go-live"><span class="btn-golive-dot"></span>Go live</a>
                    <a class="btn-restream" href="${LIVE_NETWORK_URLS.restream}"><span class="btn-restream-icon">⌗</span>Restream control room</a>
                </div>
                <div class="card-grid" style="margin-top:1.5rem;" data-live-now-grid>${liveNowHtml}</div>
            </div>
            ` : `
            <div class="empty-state" style="margin-top:1.5rem;">
                <div class="hero-cta-row">
                    <a class="btn-golive" href="/go-live"><span class="btn-golive-dot"></span>Go live</a>
                    <a class="btn-restream" href="${LIVE_NETWORK_URLS.restream}"><span class="btn-restream-icon">⌗</span>Restream control room</a>
                </div>
                <p>Nobody is live right now.</p>
            </div>
            `}
        </section>


        ${recentlyOnlineHtml ? renderSection({
            titleHtml: `${renderIcon('clock', { decorative: true })} Recently Online`,
            subtitle: null,
            actionHref: '/channels',
            actionLabel: 'All channels',
            content: `<div class="channel-grid">${recentlyOnlineHtml}</div>`,
            emptyTitle: 'No recent stream activity',
            emptyBody: 'Channels with recent broadcasts appear here.',
            emptyHref: '/channels',
            emptyLabel: 'Browse channels',
        }) : ''}

        ${renderSection({
            titleHtml: `${renderIcon('media', { decorative: true })} Recent VODs`,
            subtitle: null,
            actionHref: '/vods',
            actionLabel: 'View all VODs',
            content: recentVodsHtml ? `<div class="vc-grid">${recentVodsHtml}</div>` : null,
            emptyTitle: 'No VODs yet',
            emptyBody: 'When replays are ready they show up here automatically.',
            emptyHref: '/vods',
            emptyLabel: 'VOD library',
        })}

        ${renderSection({
            titleHtml: `${renderIcon('live', { decorative: true })} Recent clips`,
            subtitle: null,
            actionHref: '/clips',
            actionLabel: 'View all clips',
            content: recentClipsHtml ? `<div class="vc-grid">${recentClipsHtml}</div>` : null,
            emptyTitle: 'No clips yet',
            emptyBody: 'Clips appear here once they have been saved.',
            emptyHref: '/clips',
            emptyLabel: 'Clips',
        })}

        ${recentPasteCardsHtml ? `
        <section class="section-panel">
            <div class="section-head">
                <div>
                    <h2 class="section-title ov-icon-label">${renderIcon('community', { decorative: true })} Community pulse</h2>
                    <p class="section-subtitle">Screenshots, notes, and shared content from the community.</p>
                </div>
                <a class="section-link" href="${LIVE_NETWORK_URLS.community}">View all pastes</a>
            </div>
            <div class="card-grid paste-grid">${recentPasteCardsHtml}</div>
        </section>` : ''}

        <section class="section-panel">
            <div class="section-head">
                <div>
                    <h2 class="section-title">Built different</h2>
                    <p class="section-subtitle">No algorithm, no ads, no dark patterns.</p>
                </div>
                <div class="inline-actions">
                    <a class="section-link" href="/go-live">Start streaming</a>
                    <a class="section-link" href="/channels">Browse channels</a>
                </div>
            </div>
            <div class="story-grid" style="grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));">
                <article class="glass-card" data-reveal>
                    <div class="eyebrow">No algorithm</div>
                    <h3 class="card-title">Your channel, chronologically</h3>
                    <p class="card-body">No recommendation engine deciding what gets seen. Your stream appears when you go live. Feeds are sorted by time, not by what keeps people anxious.</p>
                </article>
                <article class="glass-card" data-reveal>
                    <div class="eyebrow">One handle</div>
                    <h3 class="card-title">Stream everywhere, exist here</h3>
                    <p class="card-body">Your @handle ties together live, VODs, clips, and community. Multistream to Twitch or YouTube — your home base stays put.</p>
                </article>
                <article class="glass-card" data-reveal>
                    <div class="eyebrow">Open source</div>
                    <h3 class="card-title">Built in the open</h3>
                    <p class="card-body">Every line of platform code is public. Run your own instance, fork it, or just verify what we do with your data. No hidden systems.</p>
                </article>
            </div>
        </section>`;
    return renderPage({
        title: 'OpenVibe Live — watch live streams',
        description: 'Watch live channels, catch replays, and find your community. No ads, no algorithm, no bullshit.',
        canonical: `${baseUrl}/`,
        activeNav: 'home',
        bodyHtml: pageContent,
        baseUrl,
    });
}

function renderChannelsPage({ channels, featuredChannels, categories, baseUrl }) {
    const featuredHtml = (featuredChannels || []).slice(0, 6).map((channel) => renderStreamerGroupCard(channel, baseUrl)).join('');
    const allChannelsHtml = (channels || []).slice(0, 200).map((channel) => renderStreamerGroupCard(channel, baseUrl)).join('');
    const categoryChips = (categories || []).slice(0, 10).map((category) => `<button class="button-ghost" type="button" data-chip-target="#channels-filter" data-chip-value="${escapeHtml(category.name || category.category || category.label || '')}">${escapeHtml(category.name || category.category || category.label || 'Uncategorized')}</button>`).join('');
    const pageContent = `
        <section class="section-panel">
            <div class="search-bar" style="justify-content:space-between;margin-bottom:1rem;">
                <input id="channels-filter" class="filter-input" type="search" placeholder="Search channels" aria-label="Search channels" style="flex:1;max-width:340px;" data-filter-input="channels">
                ${categoryChips}
            </div>
            ${featuredHtml ? `<div class="channel-grid" style="margin-bottom:1.5rem;">${featuredHtml}</div>` : ''}
            ${allChannelsHtml ? `<div class="channel-grid" data-filter-grid="channels">${allChannelsHtml}</div>` : ''}
        </section>`;
    return renderPage({
        title: 'Channels — openvibe.live',
        description: 'Browse every staged OpenVibe Live creator route.',
        canonical: `${baseUrl}/channels`,
        activeNav: 'channels',
        bodyHtml: pageContent,
        baseUrl,
        extraScripts: `
        (function() {
            var input = document.getElementById('channels-filter');
            var grid = document.querySelector('[data-filter-grid="channels"]');
            if (!input || !grid) return;
            input.addEventListener('input', function() {
                var q = input.value.toLowerCase().trim();
                grid.querySelectorAll('.sgc').forEach(function(card) {
                    var name = (card.querySelector('.sgc-name') || {}).textContent || '';
                    var titles = Array.from(card.querySelectorAll('.sgc-stream-title')).map(function(el) { return el.textContent; }).join(' ');
                    card.style.display = (!q || (name + ' ' + titles).toLowerCase().includes(q)) ? '' : 'none';
                });
            });
        })();`,
    });
}

function renderCollectionPage({ kind, title, description, emptyMessage, items, baseUrl }) {
    const navKey = kind === 'clips' ? 'clips' : 'vods';
    const cardsHtml = (items || []).slice(0, 200).map((item) => renderVideoCard(item, baseUrl)).join('');
    const pageContent = `
        <section class="section-panel">
            <div class="search-bar" style="justify-content:space-between;">
                <input class="filter-input" type="search" placeholder="Search ${navKey}" data-filter-input="${navKey}" aria-label="Search ${navKey}" style="flex:1;max-width:340px;">
                <div class="sort-group" data-sort-group="${navKey}">
                    <button class="sort-btn active" data-sort="recent">Recent</button>
                    <button class="sort-btn" data-sort="popularity">Popularity</button>
                </div>
            </div>
            ${cardsHtml ? `<div class="vc-grid" data-sort-grid="${navKey}" data-filter-grid="${navKey}">${cardsHtml}</div>` : `
            <article class="empty-state" data-reveal>
                <h3 class="card-title">${navKey === 'clips' ? 'No clips yet' : 'No VODs yet'}</h3>
                <p class="card-body">${escapeHtml(emptyMessage || 'Nothing here yet.')}</p>
            </article>`}
        </section>`;
    return renderPage({
        title: `${escapeHtml(title || (navKey === 'clips' ? 'OpenVibe Clips' : 'OpenVibe VOD Library'))} — openvibe.live`,
        description: description || '',
        canonical: `${baseUrl}/${navKey}`,
        activeNav: navKey,
        bodyHtml: pageContent,
        baseUrl,
        extraStyles: `
        .sort-group { display:flex; gap:0.4rem; }
        .sort-btn {
            padding: 0.55rem 1rem;
            border-radius: 999px;
            border: 1px solid var(--border);
            background: rgba(255,255,255,0.04);
            color: var(--muted);
            font-size: 0.85rem;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.15s, border-color 0.15s, color 0.15s;
        }
        .sort-btn.active, .sort-btn:hover {
            background: rgba(139,92,246,0.18);
            border-color: rgba(139,92,246,0.5);
            color: white;
        }`,
        extraScripts: `
        (function() {
            // Sort
            document.querySelectorAll('[data-sort-group]').forEach(function(group) {
                const key = group.dataset.sortGroup;
                const grid = document.querySelector('[data-sort-grid="' + key + '"]');
                if (!grid) return;
                group.querySelectorAll('.sort-btn').forEach(function(btn) {
                    btn.addEventListener('click', function() {
                        group.querySelectorAll('.sort-btn').forEach(function(b) { b.classList.remove('active'); });
                        btn.classList.add('active');
                        const cards = Array.from(grid.querySelectorAll('[data-stream-id]'));
                        cards.sort(function(a, b) {
                            if (btn.dataset.sort === 'popularity') {
                                return parseInt(b.dataset.views || '0', 10) - parseInt(a.dataset.views || '0', 10);
                            }
                            return (b.dataset.date || '').localeCompare(a.dataset.date || '');
                        });
                        cards.forEach(function(c) { grid.appendChild(c); });
                    });
                });
            });
            // Search filter
            document.querySelectorAll('[data-filter-input]').forEach(function(input) {
                const key = input.dataset.filterInput;
                const grid = document.querySelector('[data-filter-grid="' + key + '"]');
                if (!grid) return;
                input.addEventListener('input', function() {
                    const q = input.value.toLowerCase().trim();
                    grid.querySelectorAll('[data-filter-text]').forEach(function(card) {
                        card.style.display = (!q || (card.dataset.filterText || '').includes(q)) ? '' : 'none';
                    });
                });
            });
        })();`,
    });
}

function renderGoLivePage({ baseUrl, session }) {
    const signedIn = !!(session && session.authenticated && session.user && !session.anonymous);
    const viewerName = signedIn
        ? String(session.user.display_name || session.user.username || 'creator').trim()
        : String(session && session.user && (session.user.display_name || session.user.username) || '').trim();
    const signInHref = `/auth/login?return_to=${encodeURIComponent(`${baseUrl}/go-live`)}`;
    const tracksHtml = GO_LIVE_TRACKS.map((track) => `
        <article class="glass-card" data-reveal>
            <div class="eyebrow">${escapeHtml(track.label)}</div>
            <h3 class="card-title">${escapeHtml(track.title)}</h3>
            <p class="card-body">${escapeHtml(track.body)}</p>
            <div class="card-kicker">${escapeHtml(track.meta)}</div>
        </article>
    `).join('');
    const managerSection = signedIn
        ? `
        <section class="section-panel" id="stream-manager">
            <div class="sm-top-bar">
                <div>
                    <div class="eyebrow">Stream control</div>
                    <h1 class="section-title" style="font-size:1.5rem">Your stream manager</h1>
                    <p class="section-subtitle">Select a stream slot to configure your profile and go live.</p>
                </div>
                <div class="sm-top-actions">
                    <a class="section-link" href="${escapeHtml(LIVE_NETWORK_URLS.restream)}">Open openre.stream</a>
                    <a class="section-link" href="${escapeHtml(LIVE_NETWORK_URLS.network)}">Account</a>
                </div>
            </div>

            <div class="sm-layout" data-stream-manager>
                <!-- LEFT SIDEBAR: stream slot list -->
                <aside class="sm-sidebar">
                    <div class="sm-sidebar-head">
                        <span class="sm-sidebar-label">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/></svg>
                            My Streams
                        </span>
                        <button class="sm-add-btn" data-sm-action="new-channel" title="Create new stream slot">+</button>
                    </div>
                    <div class="sm-slots" data-sm-slots>
                        <div class="sm-slot-skeleton">Loading…</div>
                    </div>
                    <div class="sm-sidebar-dest-head">Destinations</div>
                    <div class="sm-dest-list" data-sm-dest-list>
                        <div class="sm-slot-skeleton">Loading…</div>
                    </div>
                </aside>

                <!-- RIGHT PANEL -->
                <div class="sm-main">
                    <!-- No slot selected prompt -->
                    <div class="sm-empty-prompt" data-sm-no-slot>
                        <div class="sm-empty-icon">
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/></svg>
                        </div>
                        <h3 class="sm-empty-heading">Go Live</h3>
                        <p class="sm-empty-sub">Select a stream slot to configure your profile and go live.</p>
                    </div>

                    <!-- New channel form -->
                    <div class="sm-new-channel-panel" data-sm-new-channel style="display:none;">
                        <div class="sm-panel-header">
                            <div>
                                <div class="sm-panel-eyebrow">New Stream Slot</div>
                                <h3 class="sm-panel-title">Create channel</h3>
                            </div>
                            <button class="sm-close-btn" data-sm-action="cancel-new-channel" aria-label="Close">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>
                        <form class="sm-form" id="sm-new-channel-form">
                            <label class="sm-field-group">
                                <span class="sm-field-label">HANDLE</span>
                                <input class="sm-input" type="text" name="slug" placeholder="your-handle" autocomplete="off" required>
                            </label>
                            <label class="sm-field-group">
                                <span class="sm-field-label">DISPLAY NAME</span>
                                <input class="sm-input" type="text" name="display_name" placeholder="Your channel name" autocomplete="off">
                            </label>
                            <label class="sm-field-group">
                                <span class="sm-field-label">DESCRIPTION</span>
                                <textarea class="sm-input" name="description" rows="2" placeholder="Short channel bio…"></textarea>
                            </label>
                            <label class="sm-checkbox-row">
                                <input type="checkbox" name="nsfw" value="1">
                                <span>NSFW channel</span>
                            </label>
                            <div class="sm-form-actions">
                                <button class="sm-btn-primary" type="submit">Create channel</button>
                                <button class="sm-btn-ghost" type="button" data-sm-action="cancel-new-channel">Cancel</button>
                                <span class="sm-status-text" data-sm-status="new-channel"></span>
                            </div>
                        </form>
                    </div>

                    <!-- Slot editor panel -->
                    <div class="sm-slot-editor" data-sm-slot-editor style="display:none;">
                        <!-- Slot header -->
                        <div class="sm-slot-header">
                            <div class="sm-slot-header-info">
                                <div class="sm-slot-channel-name" data-sm-slot-name>Channel</div>
                                <a class="sm-slot-channel-link" data-sm-slot-link href="#" target="_blank"></a>
                            </div>
                            <a class="sm-chat-btn" data-sm-slot-chat href="#" target="_blank">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                                Chat
                            </a>
                        </div>

                        <!-- Sub-tab bar -->
                        <div class="sm-tabs" data-sm-stab-bar role="tablist">
                            <button class="sm-tab active" role="tab" data-sm-stab="stream"   aria-selected="true">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                                Stream
                            </button>
                            <button class="sm-tab" role="tab" data-sm-stab="settings">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                                Settings
                            </button>
                            <button class="sm-tab" role="tab" data-sm-stab="endpoint">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                                Endpoint
                            </button>
                            <button class="sm-tab" role="tab" data-sm-stab="history">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="12 8 12 12 14 14"/><path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5"/></svg>
                                History
                            </button>
                            <button class="sm-tab" role="tab" data-sm-stab="restream">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/><path d="M3 5v14"/></svg>
                                Restream
                            </button>
                        </div>

                        <!-- Stream tab -->
                        <div class="sm-stab-content" data-sm-stab-panel="stream">
                            <form class="sm-form" id="sm-stream-form">
                                <label class="sm-field-group">
                                    <span class="sm-field-label">TITLE</span>
                                    <input class="sm-input" type="text" name="title" placeholder="Tonight's stream title" autocomplete="off">
                                </label>
                                <label class="sm-field-group">
                                    <span class="sm-field-label">DESCRIPTION</span>
                                    <textarea class="sm-input" name="description" rows="3" placeholder="What's the stream about?"></textarea>
                                </label>
                                <div class="sm-field-group">
                                    <span class="sm-field-label">CATEGORY</span>
                                    <div class="sm-category-row">
                                        <select class="sm-input sm-select" name="category">
                                            <option value="Desktop">Desktop</option>
                                            <option value="Gaming">Gaming</option>
                                            <option value="Art">Art</option>
                                            <option value="Music">Music</option>
                                            <option value="Talk">Talk</option>
                                            <option value="Science &amp; Tech">Science &amp; Tech</option>
                                            <option value="IRL">IRL</option>
                                            <option value="Coding">Coding</option>
                                            <option value="Other">Other</option>
                                        </select>
                                        <label class="sm-nsfw-toggle">
                                            <input type="checkbox" name="nsfw" value="1" class="sm-nsfw-cb">
                                            <span class="sm-nsfw-dot"></span>
                                            <span class="sm-nsfw-label">NSFW</span>
                                        </label>
                                    </div>
                                </div>
                                <div class="sm-field-group">
                                    <span class="sm-field-label">URL SLUG <span class="sm-field-optional">(optional)</span></span>
                                    <div class="sm-slug-row">
                                        <span class="sm-slug-prefix" data-sm-slug-prefix>openvibe.live/@…/</span>
                                        <input class="sm-input sm-slug-input" type="text" name="url_slug" placeholder="e.g. tuesday-session">
                                    </div>
                                </div>
                                <div class="sm-field-group">
                                    <span class="sm-field-label">STREAMING METHOD</span>
                                    <div class="sm-method-grid">
                                        <button type="button" class="sm-method-card" data-method="browser">
                                            <div class="sm-method-icon">
                                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                                            </div>
                                            <div class="sm-method-name">Browser</div>
                                            <div class="sm-method-sub">Camera, mic, or screen from your browser</div>
                                        </button>
                                        <button type="button" class="sm-method-card active" data-method="whip">
                                            <div class="sm-method-icon">
                                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/></svg>
                                            </div>
                                            <div class="sm-method-name">WHIP</div>
                                            <div class="sm-method-sub">OBS WHIP encoder / external WebRTC</div>
                                        </button>
                                        <button type="button" class="sm-method-card" data-method="rtmp">
                                            <div class="sm-method-icon">
                                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg>
                                            </div>
                                            <div class="sm-method-name">RTMP</div>
                                            <div class="sm-method-sub">OBS / Streamlabs / IRL Pro</div>
                                        </button>
                                        <button type="button" class="sm-method-card" data-method="cli">
                                            <div class="sm-method-icon">
                                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
                                            </div>
                                            <div class="sm-method-name">CLI / FFmpeg</div>
                                            <div class="sm-method-sub">FFmpeg, Pi, RTSP cameras</div>
                                        </button>
                                    </div>
                                    <input type="hidden" name="protocol" value="whip">
                                </div>
                                <div class="sm-autodetect-box" data-sm-autodetect>
                                    <span class="sm-autodetect-dot"></span>
                                    <div>
                                        <div class="sm-autodetect-title">Auto-detect enabled</div>
                                        <div class="sm-autodetect-sub">Your stream will go live automatically when your encoder connects. Configure your software using the Endpoint tab, then just start streaming.</div>
                                    </div>
                                </div>

                                <!-- Inline browser broadcast (shown only when Browser method selected) -->
                                <div id="sm-inline-broadcast" style="display:none;margin-top:1.25rem;padding-top:1.25rem;border-top:1px solid rgba(255,255,255,0.08);">
                                    <div class="sm-broadcast-setup" id="sm-bcast-setup">
                                        <div class="sm-bcast-preview-wrap">
                                            <video id="sm-bcast-preview" class="sm-bcast-preview" autoplay muted playsinline></video>
                                            <div class="sm-bcast-preview-overlay" id="sm-bcast-pip-overlay" style="display:none;">
                                                <video id="sm-bcast-pip" class="sm-bcast-pip-video" autoplay muted playsinline></video>
                                            </div>
                                            <div class="sm-bcast-preview-label" id="sm-bcast-live-badge" style="display:none;">
                                                <span class="sm-live-dot"></span> LIVE
                                            </div>
                                        </div>
                                        <div class="sm-bcast-controls">
                                            <div class="sm-field-group">
                                                <span class="sm-field-label">SOURCE</span>
                                                <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
                                                    <button type="button" class="sm-btn-ghost sm-bcast-source-btn active" id="sm-bcast-camera-btn" data-source="camera">
                                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                                                        Camera
                                                    </button>
                                                    <button type="button" class="sm-btn-ghost sm-bcast-source-btn" id="sm-bcast-screen-btn" data-source="screen">
                                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                                                        Screen
                                                    </button>
                                                    <button type="button" class="sm-btn-ghost sm-bcast-source-btn" id="sm-bcast-screen-pip-btn" data-source="screen+camera">
                                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><rect x="14" y="11" width="7" height="5" rx="1" fill="currentColor" opacity="0.7"/></svg>
                                                        Screen + Cam
                                                    </button>
                                                </div>
                                            </div>
                                            <div class="sm-field-group" id="sm-bcast-video-group">
                                                <span class="sm-field-label">CAMERA</span>
                                                <select class="sm-input sm-select" id="sm-bcast-video-select">
                                                    <option value="">Default camera</option>
                                                </select>
                                            </div>
                                            <div class="sm-field-group">
                                                <span class="sm-field-label">MICROPHONE</span>
                                                <select class="sm-input sm-select" id="sm-bcast-audio-select">
                                                    <option value="">Default microphone</option>
                                                </select>
                                            </div>
                                            <div class="sm-field-group">
                                                <span class="sm-field-label">QUALITY</span>
                                                <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;">
                                                    <select class="sm-input sm-select" id="sm-bcast-res" style="flex:1;min-width:110px;">
                                                        <option value="1280x720">720p</option>
                                                        <option value="1920x1080">1080p</option>
                                                        <option value="854x480">480p</option>
                                                        <option value="640x360">360p</option>
                                                    </select>
                                                    <select class="sm-input sm-select" id="sm-bcast-fps" style="width:70px;">
                                                        <option value="30">30fps</option>
                                                        <option value="60">60fps</option>
                                                        <option value="24">24fps</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div id="sm-bcast-idle-controls">
                                                <button class="sm-btn-primary sm-btn-block" type="button" id="sm-bcast-start-btn">
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="margin-right:0.35rem;"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                                    Start Broadcast
                                                </button>
                                                <p class="sm-note" style="margin-top:0.5rem;" id="sm-bcast-prereq-note">Create a stream below first, then start broadcasting.</p>
                                            </div>
                                            <div id="sm-bcast-live-controls" style="display:none;">
                                                <div class="sm-bcast-live-status">
                                                    <span class="sm-live-dot"></span>
                                                    <span id="sm-bcast-timer">00:00</span>
                                                    <span class="sm-bcast-viewers" id="sm-bcast-viewers">0 viewers</span>
                                                </div>
                                                <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.75rem;">
                                                    <button type="button" class="sm-btn-ghost" id="sm-bcast-mute-video-btn">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                                                        Cam On
                                                    </button>
                                                    <button type="button" class="sm-btn-ghost" id="sm-bcast-mute-audio-btn">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                                                        Mic On
                                                    </button>
                                                    <button type="button" class="sm-btn-ghost sm-icon-btn-danger" id="sm-bcast-end-btn">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                                                        End Broadcast
                                                    </button>
                                                </div>
                                                <span class="sm-status-text" id="sm-bcast-live-status" style="margin-top:0.4rem;display:block;"></span>
                                            </div>
                                            <span class="sm-status-text" id="sm-bcast-status"></span>
                                        </div>
                                    </div>
                                </div>

                                <div class="sm-form-actions">
                                    <button class="sm-btn-primary" type="submit" id="sm-create-stream-btn">Create stream</button>
                                    <button class="sm-btn-live" type="button" id="sm-go-live-btn" style="display:none;">
                                        <span class="sm-live-dot"></span> Go Live
                                    </button>
                                    <button class="sm-btn-ghost" type="button" id="sm-end-stream-btn" style="display:none;">End stream</button>
                                    <span class="sm-status-text" data-sm-status="stream-form"></span>
                                </div>
                            </form>
                        </div>

                        <!-- Settings tab -->
                        <div class="sm-stab-content" data-sm-stab-panel="settings" style="display:none;">
                            <form class="sm-form" id="sm-settings-form">
                                <input type="hidden" name="slug">
                                <label class="sm-field-group">
                                    <span class="sm-field-label">DISPLAY NAME</span>
                                    <input class="sm-input" type="text" name="display_name" autocomplete="off">
                                </label>
                                <label class="sm-field-group">
                                    <span class="sm-field-label">DESCRIPTION</span>
                                    <textarea class="sm-input" name="description" rows="2"></textarea>
                                </label>
                                <label class="sm-field-group">
                                    <span class="sm-field-label">VISIBILITY</span>
                                    <select class="sm-input sm-select" name="visibility">
                                        <option value="public">Public</option>
                                        <option value="unlisted">Unlisted</option>
                                        <option value="private">Private</option>
                                    </select>
                                </label>
                                <label class="sm-checkbox-row">
                                    <input type="checkbox" name="recording_enabled" value="1" checked>
                                    <span>Enable VOD recording</span>
                                </label>
                                <label class="sm-checkbox-row">
                                    <input type="checkbox" name="chat_enabled" value="1" checked>
                                    <span>Enable chat</span>
                                </label>
                                <label class="sm-checkbox-row">
                                    <input type="checkbox" name="nsfw" value="1">
                                    <span>NSFW channel</span>
                                </label>
                                <div class="sm-settings-key-section">
                                    <div class="sm-field-label" style="margin-bottom:0.4rem;">STREAM KEY</div>
                                    <div class="sm-key-row">
                                        <input class="sm-input sm-key-input" type="password" name="stream_key_display" readonly placeholder="••••••••••••">
                                        <button type="button" class="sm-icon-btn" data-sm-action="toggle-key-visibility" title="Show/hide key">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                        </button>
                                        <button type="button" class="sm-icon-btn" data-sm-action="copy-stream-key" title="Copy key">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                        </button>
                                        <button type="button" class="sm-icon-btn sm-icon-btn-danger" data-sm-action="regenerate-key" title="Regenerate">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                                        </button>
                                    </div>
                                </div>
                                <div class="sm-form-actions">
                                    <button class="sm-btn-primary" type="submit">Save changes</button>
                                    <span class="sm-status-text" data-sm-status="settings-form"></span>
                                </div>
                            </form>
                        </div>

                        <!-- Endpoint tab -->
                        <div class="sm-stab-content" data-sm-stab-panel="endpoint" style="display:none;">
                            <div class="sm-endpoint-panel" data-sm-endpoint-panel>
                                <div class="sm-endpoint-empty">
                                    <p class="sm-note">Create a stream to reveal ingest details, or check your channel settings for the persistent RTMP URL.</p>
                                </div>
                            </div>
                        </div>

                        <!-- History tab -->
                        <div class="sm-stab-content" data-sm-stab-panel="history" style="display:none;">
                            <div data-sm-history-panel>
                                <p class="sm-note">Loading recent streams…</p>
                            </div>
                        </div>

                        <!-- Restream tab -->
                        <div class="sm-stab-content" data-sm-stab-panel="restream" style="display:none;">
                            <div class="sm-dest-list-full" data-sm-dest-list-full>
                                <p class="sm-note">Loading destinations…</p>
                            </div>
                            <div class="sm-panel-header" style="margin-top:1.5rem;">
                                <h4 class="sm-panel-title" style="font-size:0.95rem;">Add destination</h4>
                            </div>
                            <div class="sm-dest-presets">
                                <span class="sm-field-label" style="display:block;margin-bottom:0.5rem;">QUICK ADD</span>
                                <div class="sm-dest-preset-row">
                                    <button type="button" class="sm-dest-preset-btn" data-preset-kind="kick" data-preset-label="Kick" data-preset-url="rtmp://fa723fc1b171.global-contribute.live-video.net/app/">Kick</button>
                                    <button type="button" class="sm-dest-preset-btn" data-preset-kind="twitch" data-preset-label="Twitch" data-preset-url="rtmp://live.twitch.tv/app/">Twitch</button>
                                    <button type="button" class="sm-dest-preset-btn" data-preset-kind="youtube" data-preset-label="YouTube" data-preset-url="rtmp://a.rtmp.youtube.com/live2">YouTube</button>
                                    <button type="button" class="sm-dest-preset-btn" data-preset-kind="custom" data-preset-label="RobotStreamer" data-preset-url="rtmp://stream.robotstreamer.com/live">RobotStreamer</button>
                                    <button type="button" class="sm-dest-preset-btn" data-preset-kind="custom" data-preset-label="" data-preset-url="">Custom RTMP</button>
                                </div>
                            </div>
                            <form class="sm-form" id="sm-dest-form" style="margin-top:0.75rem;">
                                <div class="sm-field-group">
                                    <span class="sm-field-label">KIND</span>
                                    <select class="sm-input sm-select" name="kind">
                                        <option value="custom">Custom RTMP</option>
                                        <option value="youtube">YouTube</option>
                                        <option value="twitch">Twitch</option>
                                        <option value="kick">Kick</option>
                                        <option value="facebook">Facebook</option>
                                        <option value="robotstreamer">RobotStreamer</option>
                                    </select>
                                </div>
                                <label class="sm-field-group">
                                    <span class="sm-field-label">LABEL</span>
                                    <input class="sm-input" type="text" name="label" placeholder="Main multistream target" autocomplete="off" required>
                                </label>
                                <label class="sm-field-group">
                                    <span class="sm-field-label">TARGET URL</span>
                                    <input class="sm-input" type="url" name="target_url" placeholder="rtmp://example.com/live" autocomplete="off" required>
                                </label>
                                <label class="sm-field-group">
                                    <span class="sm-field-label">STREAM KEY</span>
                                    <input class="sm-input" type="text" name="target_key" placeholder="Destination stream key" autocomplete="off">
                                </label>
                                <div class="sm-field-group">
                                    <span class="sm-field-label">OUTPUT QUALITY <span class="sm-field-optional">(optional)</span></span>
                                    <div style="display:flex;gap:0.5rem;">
                                        <select class="sm-input sm-select" name="dest_resolution" style="flex:1;">
                                            <option value="">Default resolution</option>
                                            <option value="1080p">1080p</option>
                                            <option value="720p">720p</option>
                                            <option value="480p">480p</option>
                                            <option value="360p">360p</option>
                                        </select>
                                        <select class="sm-input sm-select" name="dest_bitrate" style="flex:1;">
                                            <option value="">Default bitrate</option>
                                            <option value="6000">6000 kbps</option>
                                            <option value="4000">4000 kbps</option>
                                            <option value="2500">2500 kbps</option>
                                            <option value="1500">1500 kbps</option>
                                            <option value="800">800 kbps</option>
                                        </select>
                                    </div>
                                </div>
                                <label class="sm-checkbox-row">
                                    <input type="checkbox" name="enabled" value="1" checked>
                                    <span>Enabled</span>
                                </label>
                                <div class="sm-form-actions">
                                    <button class="sm-btn-primary" type="submit">Save destination</button>
                                    <span class="sm-status-text" data-sm-status="dest-form"></span>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </section>`
        : `
        <section class="section-panel" id="stream-manager">
            <div class="golive-hero">
                <h1 class="section-title" style="margin-bottom:0.5rem;">Go live</h1>
                <p class="section-subtitle" style="margin-bottom:2rem;">Three ways to stream. Pick what fits your setup.</p>
                <div class="golive-method-grid">
                    <div class="golive-method-card">
                        <div class="golive-method-icon">
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                        </div>
                        <div class="golive-method-name">Browser</div>
                        <div class="golive-method-sub">Camera, mic, or screen — no software needed</div>
                    </div>
                    <div class="golive-method-card">
                        <div class="golive-method-icon">
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/></svg>
                        </div>
                        <div class="golive-method-name">OBS / WHIP</div>
                        <div class="golive-method-sub">Connect OBS via WHIP encoder — low latency, full control</div>
                    </div>
                    <div class="golive-method-card">
                        <div class="golive-method-icon">
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg>
                        </div>
                        <div class="golive-method-name">RTMP</div>
                        <div class="golive-method-sub">Streamlabs, IRL Pro, FFmpeg, or any RTMP encoder</div>
                    </div>
                </div>
                <div class="golive-cta-row">
                    <a class="golive-cta-btn golive-cta-primary" href="${escapeHtml(signInHref)}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                        Sign in to get started
                    </a>
                    <a class="golive-cta-btn golive-cta-ghost" href="${escapeHtml(LIVE_NETWORK_URLS.restream)}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
                        Stream on openre.stream
                    </a>
                </div>
                <p class="golive-restream-note">Need to stream to Twitch, YouTube, and Kick simultaneously? <a href="${escapeHtml(LIVE_NETWORK_URLS.restream)}">openre.stream</a> handles multi-destination restreaming — no account required.</p>
            </div>
        </section>`;
    const pageContent = `
        ${managerSection}

    `;
    return renderPage({
        title: 'Go live — openvibe.live',
        description: 'OpenVibe Live broadcasting guide for browser, OBS, RTMP, WHIP, and restream workflows.',
        canonical: `${baseUrl}/go-live`,
        activeNav: 'go-live',
        bodyHtml: pageContent + (signedIn ? '<script src="/js/stream-manager.js?v=20260604-1"></script>' : ''),
        baseUrl,
        extraStyles: `
            /* ── Stream Manager v2 ──────────────────────────────── */
            .sm-top-bar {
                display: flex; justify-content: space-between; align-items: flex-start;
                gap: 1rem; flex-wrap: wrap; margin-bottom: 1.25rem;
            }
            .sm-top-actions { display: flex; gap: 0.6rem; flex-wrap: wrap; align-items: center; margin-top: 0.4rem; }
            .sm-layout {
                display: grid;
                grid-template-columns: 260px 1fr;
                gap: 0;
                min-height: 580px;
                border-radius: 20px;
                border: 1px solid rgba(255,255,255,0.09);
                background: rgba(7,13,28,0.72);
                overflow: hidden;
            }
            /* sidebar */
            .sm-sidebar {
                border-right: 1px solid rgba(255,255,255,0.08);
                display: flex; flex-direction: column;
                background: rgba(5,9,22,0.6);
            }
            .sm-sidebar-head {
                display: flex; align-items: center; justify-content: space-between;
                padding: 0.85rem 1rem 0.65rem;
                border-bottom: 1px solid rgba(255,255,255,0.07);
                font-size: 0.78rem; font-weight: 800; text-transform: uppercase;
                letter-spacing: 0.1em; color: var(--muted);
            }
            .sm-sidebar-label { display: flex; align-items: center; gap: 0.4rem; }
            .sm-add-btn {
                width: 24px; height: 24px; border-radius: 7px;
                border: 1px solid rgba(255,255,255,0.14);
                background: rgba(255,255,255,0.06);
                color: white; font-size: 1rem; line-height: 1;
                cursor: pointer; display: grid; place-items: center;
                transition: background 0.15s, border-color 0.15s;
            }
            .sm-add-btn:hover { background: rgba(34,211,238,0.15); border-color: rgba(34,211,238,0.4); }
            .sm-slots { flex: 1; overflow-y: auto; padding: 0.5rem 0; }
            .sm-slot-skeleton { padding: 0.9rem 1rem; color: var(--muted); font-size: 0.82rem; }
            .sm-slot-item {
                display: flex; align-items: center; gap: 0.6rem;
                padding: 0.65rem 1rem; cursor: pointer;
                border-left: 2px solid transparent;
                transition: background 0.12s, border-color 0.12s;
                position: relative;
            }
            .sm-slot-item:hover { background: rgba(255,255,255,0.04); }
            .sm-slot-item.active {
                background: rgba(34,211,238,0.07);
                border-left-color: var(--accent);
            }
            .sm-slot-dot {
                width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
                background: rgba(255,255,255,0.2);
                transition: background 0.2s;
            }
            .sm-slot-dot.live { background: #22c55e; box-shadow: 0 0 6px rgba(34,197,94,0.6); }
            .sm-slot-info { flex: 1; min-width: 0; }
            .sm-slot-title { font-size: 0.88rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .sm-slot-meta { font-size: 0.73rem; color: var(--muted); display: flex; align-items: center; gap: 0.35rem; margin-top: 0.1rem; }
            .sm-slot-proto {
                display: inline-flex; align-items: center;
                padding: 0.1rem 0.4rem; border-radius: 4px;
                background: rgba(255,255,255,0.07); font-size: 0.67rem; font-weight: 800;
                text-transform: uppercase; letter-spacing: 0.06em;
            }
            .sm-slot-proto.whip  { color: #22d3ee; }
            .sm-slot-proto.rtmp  { color: #f97316; }
            .sm-slot-proto.browser { color: #a78bfa; }
            .sm-slot-proto.cli   { color: #94a3b8; }
            .sm-sidebar-dest-head {
                padding: 0.6rem 1rem 0.4rem;
                border-top: 1px solid rgba(255,255,255,0.07);
                font-size: 0.72rem; font-weight: 800; text-transform: uppercase;
                letter-spacing: 0.1em; color: var(--muted);
            }
            .sm-dest-list { overflow-y: auto; max-height: 120px; padding-bottom: 0.5rem; }
            .sm-dest-item {
                display: flex; align-items: center; gap: 0.5rem;
                padding: 0.5rem 1rem; cursor: pointer; font-size: 0.82rem;
                transition: background 0.12s;
            }
            .sm-dest-item:hover { background: rgba(255,255,255,0.04); }
            .sm-dest-item.active { background: rgba(139,92,246,0.1); }
            .sm-dest-kind-badge {
                font-size: 0.65rem; font-weight: 800; text-transform: uppercase;
                padding: 0.1rem 0.35rem; border-radius: 4px;
                background: rgba(139,92,246,0.18); color: #a78bfa;
            }
            /* right main panel */
            .sm-main {
                display: flex; flex-direction: column;
                min-width: 0; position: relative;
            }
            .sm-empty-prompt {
                flex: 1; display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                gap: 0.8rem; padding: 3rem 2rem; text-align: center; color: var(--muted);
            }
            .sm-empty-icon { color: rgba(34,211,238,0.4); }
            .sm-empty-heading { margin: 0; font-size: 1.3rem; color: var(--text); }
            .sm-empty-sub { margin: 0; font-size: 0.9rem; }
            /* slot editor */
            .sm-slot-editor,
            .sm-new-channel-panel,
            .sm-dest-panel { padding: 1.2rem 1.4rem; flex: 1; display: flex; flex-direction: column; gap: 0; overflow-y: auto; }
            .sm-panel-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; }
            .sm-panel-eyebrow { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 800; color: var(--accent); margin-bottom: 0.25rem; }
            .sm-panel-title { margin: 0; font-size: 1.1rem; font-weight: 800; }
            .sm-close-btn {
                width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0;
                border: 1px solid rgba(255,255,255,0.12);
                background: rgba(255,255,255,0.05); color: var(--muted);
                cursor: pointer; display: grid; place-items: center;
                transition: background 0.15s, color 0.15s;
            }
            .sm-close-btn:hover { background: rgba(255,255,255,0.1); color: white; }
            .sm-slot-header {
                display: flex; justify-content: space-between; align-items: flex-start;
                margin-bottom: 1rem; gap: 0.8rem;
            }
            .sm-slot-channel-name { font-size: 1.1rem; font-weight: 800; margin-bottom: 0.2rem; }
            .sm-slot-channel-link { font-size: 0.8rem; color: var(--muted); font-family: ui-monospace, Consolas, monospace; transition: color 0.15s; }
            .sm-slot-channel-link:hover { color: var(--accent); }
            .sm-chat-btn {
                display: inline-flex; align-items: center; gap: 0.35rem;
                padding: 0.45rem 0.85rem; border-radius: 999px;
                border: 1px solid rgba(255,255,255,0.12);
                background: rgba(255,255,255,0.05);
                font-size: 0.82rem; font-weight: 700; color: var(--muted-strong);
                white-space: nowrap; transition: border-color 0.15s, background 0.15s, color 0.15s;
            }
            .sm-chat-btn:hover { border-color: rgba(34,211,238,0.4); background: rgba(34,211,238,0.08); color: white; }
            /* tabs */
            .sm-tabs {
                display: flex; gap: 0; margin-bottom: 1.2rem;
                border-bottom: 1px solid rgba(255,255,255,0.08);
            }
            .sm-tab {
                display: inline-flex; align-items: center; gap: 0.35rem;
                padding: 0.65rem 1rem; font-size: 0.84rem; font-weight: 700;
                color: var(--muted); border: none; background: none; cursor: pointer;
                border-bottom: 2px solid transparent; margin-bottom: -1px;
                transition: color 0.15s, border-color 0.15s;
            }
            .sm-tab:hover { color: var(--muted-strong); }
            .sm-tab.active { color: var(--text); border-bottom-color: var(--accent); }
            .sm-tab svg { opacity: 0.7; }
            .sm-tab.active svg { opacity: 1; }
            /* form elements */
            .sm-form { display: flex; flex-direction: column; gap: 0.9rem; }
            .sm-field-group { display: flex; flex-direction: column; gap: 0.35rem; }
            .sm-field-label {
                font-size: 0.72rem; font-weight: 800; text-transform: uppercase;
                letter-spacing: 0.1em; color: var(--muted);
            }
            .sm-field-optional { font-weight: 400; text-transform: none; letter-spacing: 0; font-size: 0.72rem; }
            .sm-input {
                width: 100%; padding: 0.7rem 0.85rem;
                border-radius: 10px; border: 1px solid rgba(255,255,255,0.1);
                background: rgba(255,255,255,0.05); color: white;
                font-size: 0.9rem; font-family: inherit;
                transition: border-color 0.15s, background 0.15s;
            }
            .sm-input:focus { outline: none; border-color: rgba(34,211,238,0.5); background: rgba(34,211,238,0.04); }
            .sm-input::placeholder { color: rgba(148,163,184,0.5); }
            .sm-select { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 0.75rem center; padding-right: 2.2rem; }
            .sm-checkbox-row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.88rem; cursor: pointer; }
            .sm-checkbox-row input { width: 16px; height: 16px; cursor: pointer; accent-color: var(--accent); }
            .sm-category-row { display: flex; gap: 0.6rem; align-items: center; }
            .sm-category-row .sm-input { flex: 1; }
            .sm-nsfw-toggle { display: flex; align-items: center; gap: 0.4rem; cursor: pointer; white-space: nowrap; font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
            .sm-nsfw-cb { accent-color: #f97316; width: 14px; height: 14px; }
            .sm-nsfw-dot { width: 8px; height: 8px; border-radius: 50%; background: #f97316; opacity: 0.5; transition: opacity 0.15s; }
            .sm-nsfw-cb:checked ~ .sm-nsfw-dot { opacity: 1; }
            .sm-slug-row { display: flex; align-items: center; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; overflow: hidden; background: rgba(255,255,255,0.05); }
            .sm-slug-prefix { padding: 0.7rem 0.5rem 0.7rem 0.85rem; font-size: 0.82rem; color: var(--muted); white-space: nowrap; font-family: ui-monospace, Consolas, monospace; }
            .sm-slug-input { border: none; border-radius: 0; background: transparent; flex: 1; padding-left: 0; min-width: 0; }
            .sm-slug-input:focus { border: none; background: transparent; }
            /* streaming method cards */
            .sm-method-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; margin-top: 0.25rem; }
            .sm-method-card {
                display: flex; flex-direction: column; align-items: flex-start;
                padding: 0.75rem 0.8rem; border-radius: 12px; cursor: pointer;
                border: 1.5px solid rgba(255,255,255,0.1);
                background: rgba(255,255,255,0.03);
                text-align: left; transition: border-color 0.15s, background 0.15s;
            }
            .sm-method-card:hover { border-color: rgba(255,255,255,0.22); background: rgba(255,255,255,0.06); }
            .sm-method-card.active { border-color: rgba(251,191,36,0.7); background: rgba(251,191,36,0.08); }
            .sm-method-icon { color: var(--muted-strong); margin-bottom: 0.4rem; }
            .sm-method-card.active .sm-method-icon { color: #fbbf24; }
            .sm-method-name { font-size: 0.88rem; font-weight: 800; color: var(--text); }
            .sm-method-sub { font-size: 0.72rem; color: var(--muted); margin-top: 0.2rem; line-height: 1.35; }
            /* autodetect */
            .sm-autodetect-box {
                display: flex; align-items: flex-start; gap: 0.65rem;
                padding: 0.8rem 0.95rem; border-radius: 10px;
                border: 1px solid rgba(34,211,238,0.2);
                background: rgba(34,211,238,0.05);
            }
            .sm-autodetect-dot {
                width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 0.45rem;
                background: var(--accent);
                animation: sm-pulse 2s ease-in-out infinite;
            }
            @keyframes sm-pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.45; transform:scale(0.7); } }
            .sm-autodetect-title { font-size: 0.85rem; font-weight: 700; color: var(--accent); }
            .sm-autodetect-sub { font-size: 0.8rem; color: var(--muted); margin-top: 0.15rem; line-height: 1.4; }
            /* action buttons */
            .sm-form-actions { display: flex; gap: 0.6rem; flex-wrap: wrap; align-items: center; margin-top: 0.4rem; }
            .sm-btn-primary {
                display: inline-flex; align-items: center; gap: 0.4rem;
                padding: 0.6rem 1.2rem; border-radius: 999px; font-weight: 700; font-size: 0.88rem;
                background: linear-gradient(135deg, rgba(139,92,246,0.9), rgba(34,211,238,0.75));
                border: none; color: white; cursor: pointer; transition: opacity 0.15s, transform 0.15s;
            }
            .sm-btn-primary:hover { opacity: 0.88; transform: translateY(-1px); }
            .sm-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
            .sm-btn-live {
                display: inline-flex; align-items: center; gap: 0.5rem;
                padding: 0.6rem 1.2rem; border-radius: 999px; font-weight: 800; font-size: 0.88rem;
                background: linear-gradient(135deg, #dc2626, #f97316);
                border: none; color: white; cursor: pointer;
                box-shadow: 0 0 18px rgba(220,38,38,0.4);
                transition: opacity 0.15s, transform 0.15s, box-shadow 0.15s;
            }
            .sm-btn-live:hover { opacity: 0.88; transform: translateY(-1px); box-shadow: 0 0 28px rgba(220,38,38,0.6); }
            .sm-live-dot { width: 8px; height: 8px; border-radius: 50%; background: white; animation: sm-pulse 1.2s ease-in-out infinite; }
            .sm-btn-ghost {
                display: inline-flex; align-items: center; gap: 0.4rem;
                padding: 0.58rem 1rem; border-radius: 999px; font-weight: 700; font-size: 0.88rem;
                border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04);
                color: var(--muted-strong); cursor: pointer; transition: border-color 0.15s, color 0.15s;
            }
            .sm-btn-ghost:hover { border-color: rgba(255,255,255,0.28); color: white; }
            .sm-status-text { font-size: 0.82rem; color: var(--muted); }
            .sm-status-text.ok { color: #4ade80; }
            .sm-status-text.err { color: #f87171; }
            .sm-note { color: var(--muted); font-size: 0.88rem; margin: 0; }
            /* key row */
            .sm-settings-key-section { margin-top: 0.25rem; }
            .sm-key-row { display: flex; align-items: center; gap: 0.4rem; }
            .sm-key-input { flex: 1; font-family: ui-monospace, Consolas, monospace; font-size: 0.82rem; }
            .sm-icon-btn {
                width: 34px; height: 34px; flex-shrink: 0; border-radius: 8px;
                border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04);
                color: var(--muted); cursor: pointer; display: grid; place-items: center;
                transition: border-color 0.15s, color 0.15s, background 0.15s;
            }
            .sm-icon-btn:hover { border-color: rgba(255,255,255,0.25); color: white; background: rgba(255,255,255,0.08); }
            .sm-icon-btn-danger:hover { border-color: rgba(248,113,113,0.5); color: #f87171; background: rgba(248,113,113,0.08); }
            /* endpoint panel */
            .sm-endpoint-panel { display: flex; flex-direction: column; gap: 0.75rem; }
            .sm-endpoint-row {
                display: flex; flex-direction: column; gap: 0.3rem;
            }
            .sm-endpoint-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 800; color: var(--muted); }
            .sm-endpoint-value-row {
                display: flex; align-items: center; gap: 0.4rem;
            }
            .sm-endpoint-code {
                flex: 1; padding: 0.65rem 0.85rem; border-radius: 10px;
                border: 1px solid rgba(255,255,255,0.09);
                background: rgba(0,0,0,0.3); font-size: 0.8rem;
                font-family: ui-monospace, Consolas, monospace; color: #e2e8f0;
                word-break: break-all; min-width: 0;
            }
            /* history items */
            .sm-history-item {
                display: flex; justify-content: space-between; align-items: center;
                gap: 0.5rem; padding: 0.7rem 0;
                border-bottom: 1px solid rgba(255,255,255,0.06);
            }
            .sm-history-item:last-child { border-bottom: none; }
            .sm-history-title { font-size: 0.9rem; font-weight: 600; }
            .sm-history-meta { font-size: 0.78rem; color: var(--muted); margin-top: 0.1rem; }
            /* dest list */
            .sm-dest-full-item {
                display: flex; justify-content: space-between; align-items: center;
                gap: 0.5rem; padding: 0.65rem 0;
                border-bottom: 1px solid rgba(255,255,255,0.06);
            }
            .sm-dest-full-item:last-child { border-bottom: none; }
            /* stab content spacing */
            .sm-stab-content { flex: 1; }
            /* broadcast panel */
            .sm-broadcast-setup { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
            .sm-bcast-preview-wrap {
                position: relative; border-radius: 12px; overflow: hidden;
                background: #0a0a0a; aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center;
            }
            .sm-bcast-preview { width: 100%; height: 100%; object-fit: cover; display: block; }
            .sm-bcast-preview-overlay { position: absolute; bottom: 8px; right: 8px; width: 28%; aspect-ratio: 16/9; border-radius: 8px; overflow: hidden; border: 2px solid rgba(255,255,255,0.25); }
            .sm-bcast-pip-video { width: 100%; height: 100%; object-fit: cover; }
            .sm-bcast-preview-label { position: absolute; top: 8px; left: 8px; display: flex; align-items: center; gap: 0.4rem; padding: 0.3rem 0.7rem; border-radius: 999px; background: rgba(220,38,38,0.85); font-size: 0.72rem; font-weight: 800; color: white; letter-spacing: 0.08em; }
            .sm-bcast-controls { display: flex; flex-direction: column; gap: 0.75rem; }
            .sm-bcast-source-btn { padding: 0.4rem 0.8rem !important; font-size: 0.8rem !important; }
            .sm-bcast-source-btn.active { border-color: var(--accent) !important; color: var(--accent) !important; }
            .sm-btn-block { width: 100%; justify-content: center; }
            .sm-bcast-live-status { display: flex; align-items: center; gap: 0.75rem; padding: 0.7rem 0.85rem; border-radius: 10px; background: rgba(220,38,38,0.12); border: 1px solid rgba(220,38,38,0.3); }
            .sm-bcast-viewers { font-size: 0.82rem; color: var(--muted); margin-left: auto; }
            #sm-bcast-timer { font-size: 0.9rem; font-weight: 800; font-family: ui-monospace, monospace; color: #f87171; }
            /* responsive */
            @media (max-width: 740px) {
                .sm-layout { grid-template-columns: 1fr; }
                .sm-sidebar { border-right: none; border-bottom: 1px solid rgba(255,255,255,0.08); max-height: 220px; }
                .sm-method-grid { grid-template-columns: repeat(2, 1fr); }
                .sm-broadcast-setup { grid-template-columns: 1fr; }
            }
        `,
    });
}

function renderUpdatesPage({ baseUrl }) {
    const updatesHtml = BUILD_UPDATES.map((item) => `
        <article class="timeline-card" data-reveal>
            <div class="eyebrow">${escapeHtml(item.date)}</div>
            <h3 class="card-title">${escapeHtml(item.title)}</h3>
            <p class="card-body">${escapeHtml(item.body)}</p>
        </article>
    `).join('');
    const pageContent = `
        <section class="hero-panel compact">
            <div class="hero-copy" data-reveal>
                <div class="eyebrow">Release notes</div>
                <h1 class="hero-heading">Recent <span class="hero-gradient">OpenVibe Live updates</span></h1>
                <p>A focused record of changes landing in the native live surface — the kind of thing that should be easy to scan without trawling through implementation details.</p>
            </div>
        </section>
        ${renderSection({
            title: 'Shipped in this surface',
            subtitle: 'Current product deltas that affect the live discovery and routing experience.',
            content: `<div class="surface-grid">${updatesHtml}</div>`,
        })}
    `;
    return renderPage({
        title: 'Updates — openvibe.live',
        description: 'Recent changes to the OpenVibe Live discovery, routing, and product shell.',
        canonical: `${baseUrl}/updates`,
        activeNav: 'updates',
        bodyHtml: pageContent,
        baseUrl,
    });
}

function renderMissingMediaPage({ kind, mediaId, baseUrl }) {
    const label = kind === 'clip' ? 'clip' : 'VOD';
    const route = `/${kind}/${encodeURIComponent(String(mediaId || 'missing'))}`;
    const pageContent = `
        <section class="hero-panel compact">
            <div class="hero-copy" data-reveal>
                <div class="eyebrow">${escapeHtml(label)} not found</div>
                <h1 class="hero-heading">This ${escapeHtml(label)} is <span class="hero-gradient">missing or not yet staged</span></h1>
                <p>The route exists, but the canonical media object could not be resolved from the current OpenVibe media service.</p>
                <div class="hero-actions">
                    <a class="button" href="/${kind === 'clip' ? 'clips' : 'vods'}">Browse ${escapeHtml(kind === 'clip' ? 'clips' : 'VODs')}</a>
                    <a class="button-secondary" href="/channels">Browse creators</a>
                    <a class="button-ghost" href="/">Return home</a>
                </div>
            </div>
        </section>`;
    return renderPage({
        title: `${label} missing — openvibe.live`,
        description: `The requested ${label} could not be found in the current canonical media surface.`,
        canonical: `${baseUrl}${route}`,
        activeNav: kind === 'clip' ? 'clips' : 'vods',
        bodyHtml: pageContent,
        baseUrl,
    });
}

function renderOfflinePage({ slug, baseUrl }) {
    const pageContent = `
        <section class="hero-panel compact">
            <div class="hero-copy" data-reveal>
                <div class="eyebrow">Channel not found</div>
                <h1 class="hero-heading">@${escapeHtml(slug)} is <span class="hero-gradient">offline or not yet mirrored</span></h1>
                <p>This route exists, but the channel has not streamed yet or is not present in the current OpenVibe live graph.</p>
                <div class="hero-actions">
                    <a class="button" href="/channels">Browse live channels</a>
                    <a class="button-secondary" href="/go-live">See go-live paths</a>
                    <a class="button-ghost" href="/">Return home</a>
                </div>
            </div>
        </section>`;
    return renderPage({
        title: `@${slug} — offline on openvibe.live`,
        description: `${slug} is offline or has not yet been mirrored into the current OpenVibe live graph.`,
        canonical: `${baseUrl}${channelPath(slug)}`,
        activeNav: 'channels',
        bodyHtml: pageContent,
        baseUrl,
    });
}

module.exports = {
    renderChannelPage,
    renderStreamPage,
    renderMediaDetailPage,
    renderHomePage,
    renderCollectionPage,
    renderChannelsPage,
    renderGoLivePage,
    renderUpdatesPage,
    renderMissingMediaPage,
    renderOfflinePage,
    escapeHtml,
};
