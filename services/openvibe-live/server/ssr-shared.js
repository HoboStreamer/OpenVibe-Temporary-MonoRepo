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
            background: var(--bg, #050916);
            color: var(--text, #f8fafc);
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
            background: color-mix(in srgb, var(--bg, #050916) 72%, transparent);
            border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.08));
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
            background: color-mix(in srgb, var(--bg, #050916) 97%, transparent);
            border: 1px solid var(--border, rgba(255,255,255,0.12)); border-radius: 14px;
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
            background: var(--panel, rgba(15, 23, 42, 0.9));
            border: 1px solid var(--border, rgba(255,255,255,0.1));
            box-shadow: 0 22px 60px rgba(0, 0, 0, 0.34);
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
        .stat-grid { grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
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
        .media-stage iframe {
            width: 100%;
            aspect-ratio: 16 / 9;
            border-radius: 20px;
            border: 0;
            background: var(--bg, #050916);
        }
        .ov-media-player {
            position: relative;
            overflow: hidden;
            border-radius: 20px;
            background: #000;
            border: none;
            box-shadow: none;
            cursor: pointer;
            user-select: none;
        }
        .ov-media-player video {
            width: 100%;
            aspect-ratio: 16 / 9;
            display: block;
            background: var(--bg, #050916);
        }
        .ov-player-overlay {
            position: absolute;
            inset: 0;
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
            opacity: 0;
            transition: opacity 0.2s ease;
            pointer-events: none;
        }
        .ov-player-overlay.is-visible { opacity: 1; pointer-events: auto; }
        .ov-player-center-btn {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) scale(1.1);
            width: 72px;
            height: 72px;
            border-radius: 50%;
            background: rgba(0, 0, 0, 0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            opacity: 0;
            transition: opacity 0.15s ease, transform 0.15s ease;
            pointer-events: none;
        }
        .ov-player-center-btn.is-flash { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        .ov-player-bar {
            background: linear-gradient(transparent, rgba(0, 0, 0, 0.82));
            padding: 2.5rem 0.85rem 0.7rem;
        }
        .ov-player-progress { margin-bottom: 0.55rem; }
        .ov-player-range { width: 100%; accent-color: #22d3ee; cursor: pointer; display: block; }
        .ov-player-controls-row { display: flex; align-items: center; gap: 0.4rem; }
        .ov-player-btn {
            appearance: none;
            border: none;
            background: transparent;
            color: white;
            cursor: pointer;
            padding: 0.4rem;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.15s;
            flex-shrink: 0;
        }
        .ov-player-btn:hover { background: rgba(255, 255, 255, 0.15); }
        .ov-player-btn svg { display: block; pointer-events: none; }
        .ov-player-time { font-size: 0.8rem; color: rgba(255, 255, 255, 0.9); font-variant-numeric: tabular-nums; white-space: nowrap; padding: 0 0.2rem; }
        .ov-player-spacer { flex: 1; }
        .ov-player-volume-group { display: flex; align-items: center; gap: 0.35rem; }
        .ov-player-volume { width: 72px; accent-color: #22d3ee; cursor: pointer; }
        .ov-player-status {
            position: absolute;
            top: 0.75rem;
            left: 0.85rem;
            color: rgba(255, 255, 255, 0.5);
            font-size: 0.75rem;
            pointer-events: none;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
            min-height: 1em;
        }
        @media (max-width: 480px) { .ov-player-volume-group { display: none; } }
        [data-reveal] { opacity: 1; transform: none; }
        [data-reveal].is-visible { opacity: 1; transform: none; }
        @media (max-width: 980px) {
            .hero-grid,
            .split-grid,
            .footer-grid {
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

            var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            var _revealObs = null;
            var _counterObs = null;
            var formatter = new Intl.NumberFormat('en-US');
            var compactFormatter = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
            function formatCount(value, mode) {
                return mode === 'compact' ? compactFormatter.format(value) : formatter.format(Math.round(value));
            }

            function animateCounter(el) {
                if (el.dataset.countAnimated === 'true') return;
                el.dataset.countAnimated = 'true';
                var target = Number(el.dataset.countTo || 0);
                if (!Number.isFinite(target)) return;
                var mode = el.dataset.countFormat || 'integer';
                var duration = 900;
                var startedAt = performance.now();
                function frame(now) {
                    var progress = Math.min((now - startedAt) / duration, 1);
                    var eased = 1 - Math.pow(1 - progress, 3);
                    el.textContent = formatCount(target * eased, mode);
                    if (progress < 1) requestAnimationFrame(frame);
                }
                requestAnimationFrame(frame);
            }

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

            window.OvInitContent = function initContent(container) {
                var root = container || document.body;

                // Reveal animations
                if (!_revealObs && !reducedMotion && 'IntersectionObserver' in window) {
                    _revealObs = new IntersectionObserver(function (entries) {
                        entries.forEach(function (entry) {
                            if (!entry.isIntersecting) return;
                            entry.target.classList.add('is-visible');
                            _revealObs.unobserve(entry.target);
                        });
                    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
                }
                Array.prototype.forEach.call(root.querySelectorAll('[data-reveal]'), function (el) {
                    if (_revealObs) _revealObs.observe(el);
                    else el.classList.add('is-visible');
                });

                // Counter animations
                if (!_counterObs && !reducedMotion && 'IntersectionObserver' in window) {
                    _counterObs = new IntersectionObserver(function (entries) {
                        entries.forEach(function (entry) {
                            if (!entry.isIntersecting) return;
                            animateCounter(entry.target);
                            _counterObs.unobserve(entry.target);
                        });
                    }, { threshold: 0.65 });
                }
                Array.prototype.forEach.call(root.querySelectorAll('[data-count-to]'), function (el) {
                    if (_counterObs) _counterObs.observe(el);
                    else animateCounter(el);
                });

                // Hero stage frame cycling
                var heroStage = root.querySelector('[data-hero-stage]');
                if (heroStage && !heroStage._ovHeroInit) {
                    heroStage._ovHeroInit = true;
                    var frames = Array.prototype.slice.call(heroStage.querySelectorAll('[data-hero-frame]'));
                    var activeIndex = Math.max(0, frames.findIndex(function (f) { return f.classList.contains('is-active'); }));
                    frames.forEach(function (f, i) { f.classList.toggle('is-active', i === activeIndex); });
                    if (!reducedMotion && frames.length > 1) {
                        setInterval(function () {
                            frames[activeIndex].classList.remove('is-active');
                            var nextIndex = activeIndex;
                            while (frames.length > 1 && nextIndex === activeIndex) {
                                nextIndex = Math.floor(Math.random() * frames.length);
                            }
                            activeIndex = nextIndex;
                            frames[activeIndex].classList.add('is-active');
                        }, 4200);
                    }
                }

                // Rotating words
                var rotator = root.querySelector('[data-rotating-words]');
                if (rotator && !rotator._ovRotatorInit) {
                    rotator._ovRotatorInit = true;
                    var words = String(rotator.dataset.rotatingWords || '').split('|').map(function (w) { return w.trim(); }).filter(Boolean);
                    var wordIndex = 0;
                    function applyWord() { rotator.textContent = words[wordIndex] || 'creators'; rotator.classList.add('is-active'); }
                    applyWord();
                    if (!reducedMotion && words.length > 1) {
                        setInterval(function () {
                            rotator.classList.remove('is-active');
                            setTimeout(function () { wordIndex = (wordIndex + 1) % words.length; applyWord(); }, 160);
                        }, 2400);
                    }
                }

                // Updates feed
                var updatesFeed = root.querySelector('[data-updates-feed]');
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

                // Filter inputs
                Array.prototype.forEach.call(root.querySelectorAll('[data-filter-input]'), function (input) {
                    var group = input.dataset.filterInput;
                    var filterCards = Array.prototype.slice.call(document.querySelectorAll('[data-filter-group="' + group + '"]'));
                    var filterStatus = document.querySelector('[data-filter-status="' + group + '"]');
                    var apply = function () {
                        var query = String(input.value || '').trim().toLowerCase();
                        var visible = 0;
                        filterCards.forEach(function (card) {
                            var haystack = String(card.dataset.filterText || '').toLowerCase();
                            var show = !query || haystack.indexOf(query) !== -1;
                            card.hidden = !show;
                            if (show) visible += 1;
                        });
                        if (filterStatus) {
                            filterStatus.textContent = query ? String(visible) + ' matching results' : String(filterCards.length) + ' total items';
                        }
                    };
                    input.addEventListener('input', apply);
                    apply();
                });

                // Chip targets
                Array.prototype.forEach.call(root.querySelectorAll('[data-chip-target]'), function (chip) {
                    chip.addEventListener('click', function () {
                        var target = document.querySelector(chip.dataset.chipTarget || '');
                        if (!target) return;
                        target.value = chip.dataset.chipValue || '';
                        target.dispatchEvent(new Event('input', { bubbles: true }));
                        target.focus();
                    });
                });

                // Video players
                Array.prototype.forEach.call(root.querySelectorAll('[data-ov-player]'), function (playerRoot) {
                    var video = playerRoot.querySelector('video');
                    if (!video) return;
                    var playToggle = playerRoot.querySelector('[data-player-action="toggle"]');
                    var muteToggle = playerRoot.querySelector('[data-player-action="mute"]');
                    var fullscreenToggle = playerRoot.querySelector('[data-player-action="fullscreen"]');
                    var seek = playerRoot.querySelector('[data-player-seek]');
                    var volumeInput = playerRoot.querySelector('[data-player-volume]');
                    var timeEl = playerRoot.querySelector('[data-player-time]');
                    var statusEl = playerRoot.querySelector('[data-player-status]');
                    var overlay = playerRoot.querySelector('[data-player-overlay]');
                    var centerBtn = playerRoot.querySelector('[data-player-center]');
                    var hintDuration = Number(playerRoot.dataset.durationHint) || 0;
                    var hideTimer = null;
                    var centerFlashTimer = null;

                    function setStatus(msg) { if (statusEl) statusEl.textContent = msg; }

                    function effectiveDuration() {
                        return Number.isFinite(video.duration) && video.duration > 0 ? video.duration : hintDuration;
                    }

                    function sync() {
                        var dur = effectiveDuration();
                        var cur = Number.isFinite(video.currentTime) ? video.currentTime : 0;
                        var paused = video.paused || video.ended;
                        if (playToggle) {
                            playToggle.setAttribute('aria-label', paused ? 'Play' : 'Pause');
                            playToggle.innerHTML = paused
                                ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>'
                                : '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
                        }
                        if (muteToggle) {
                            var muted = video.muted || video.volume === 0;
                            muteToggle.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
                            muteToggle.innerHTML = muted
                                ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>'
                                : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
                        }
                        if (timeEl) timeEl.textContent = formatPlayerTime(cur) + ' / ' + formatPlayerTime(dur > 0 ? dur : null);
                        if (seek && seek.dataset.seeking !== 'true') {
                            seek.disabled = !dur;
                            seek.value = dur ? String(Math.round((cur / dur) * 1000)) : '0';
                        }
                        if (volumeInput && document.activeElement !== volumeInput) {
                            volumeInput.value = String(video.muted ? 0 : video.volume);
                        }
                    }

                    function showOverlay() {
                        if (overlay) overlay.classList.add('is-visible');
                        clearTimeout(hideTimer);
                        if (!video.paused) {
                            hideTimer = setTimeout(function () {
                                if (!video.paused && overlay) overlay.classList.remove('is-visible');
                            }, 3000);
                        }
                    }

                    function flashCenterBtn(nowPaused) {
                        if (!centerBtn) return;
                        centerBtn.innerHTML = nowPaused
                            ? '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>'
                            : '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
                        centerBtn.classList.add('is-flash');
                        clearTimeout(centerFlashTimer);
                        centerFlashTimer = setTimeout(function () { centerBtn.classList.remove('is-flash'); }, 500);
                    }

                    video.controls = false;
                    setStatus('');
                    showOverlay();
                    sync();

                    playerRoot.addEventListener('mousemove', showOverlay);
                    playerRoot.addEventListener('mouseenter', showOverlay);
                    playerRoot.addEventListener('mouseleave', function () {
                        clearTimeout(hideTimer);
                        if (!video.paused && overlay) overlay.classList.remove('is-visible');
                    });
                    playerRoot.addEventListener('touchstart', function (e) {
                        if (e.target.closest && (e.target.closest('[data-player-action]') || e.target.closest('[data-player-seek]') || e.target.closest('[data-player-volume]'))) return;
                        if (overlay && overlay.classList.contains('is-visible')) {
                            if (!video.paused) { overlay.classList.remove('is-visible'); clearTimeout(hideTimer); }
                        } else {
                            showOverlay();
                        }
                    }, { passive: true });
                    playerRoot.addEventListener('click', function (e) {
                        if (e.target.closest && (e.target.closest('[data-player-action]') || e.target.closest('[data-player-seek]') || e.target.closest('[data-player-volume]'))) return;
                        var wasPaused = video.paused || video.ended;
                        flashCenterBtn(!wasPaused);
                        showOverlay();
                        if (wasPaused) {
                            video.play().catch(function () { setStatus('Playback could not start.'); });
                        } else {
                            video.pause();
                        }
                    });

                    document.addEventListener('keydown', function (e) {
                        if (!document.body.contains(playerRoot)) return;
                        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
                        if (e.key === ' ' || e.key === 'k') {
                            e.preventDefault();
                            var wasPaused = video.paused || video.ended;
                            flashCenterBtn(!wasPaused);
                            showOverlay();
                            if (wasPaused) { video.play().catch(function () {}); } else { video.pause(); }
                        } else if (e.key === 'f' || e.key === 'F') {
                            e.preventDefault();
                            if (document.fullscreenElement) { document.exitFullscreen && document.exitFullscreen(); }
                            else if (playerRoot.requestFullscreen) { playerRoot.requestFullscreen(); }
                        } else if (e.key === 'm' || e.key === 'M') {
                            e.preventDefault();
                            video.muted = !video.muted;
                            if (!video.muted && video.volume === 0) video.volume = 0.7;
                            showOverlay(); sync();
                        } else if (e.key === 'ArrowRight') {
                            e.preventDefault();
                            var dur = effectiveDuration();
                            if (dur) { video.currentTime = Math.min(video.currentTime + 5, dur); showOverlay(); sync(); }
                        } else if (e.key === 'ArrowLeft') {
                            e.preventDefault();
                            video.currentTime = Math.max(video.currentTime - 5, 0);
                            showOverlay(); sync();
                        }
                    });

                    if (playToggle) {
                        playToggle.addEventListener('click', function (e) {
                            e.stopPropagation();
                            var wasPaused = video.paused || video.ended;
                            if (wasPaused) {
                                video.play().catch(function () { setStatus('Playback could not start.'); });
                            } else {
                                video.pause();
                            }
                            showOverlay();
                        });
                    }
                    if (muteToggle) {
                        muteToggle.addEventListener('click', function (e) {
                            e.stopPropagation();
                            video.muted = !video.muted;
                            if (!video.muted && video.volume === 0) video.volume = 0.7;
                            sync(); showOverlay();
                        });
                    }
                    if (fullscreenToggle) {
                        fullscreenToggle.addEventListener('click', function (e) {
                            e.stopPropagation();
                            if (document.fullscreenElement) {
                                document.exitFullscreen && document.exitFullscreen().catch(function () { setStatus('Fullscreen unavailable.'); });
                            } else if (playerRoot.requestFullscreen) {
                                playerRoot.requestFullscreen().catch(function () { setStatus('Fullscreen unavailable.'); });
                            }
                            showOverlay();
                        });
                    }
                    if (seek) {
                        seek.addEventListener('input', function (e) {
                            e.stopPropagation();
                            seek.dataset.seeking = 'true';
                            var dur = effectiveDuration();
                            if (timeEl && dur) {
                                var nextTime = (Number(seek.value) / 1000) * dur;
                                timeEl.textContent = formatPlayerTime(nextTime) + ' / ' + formatPlayerTime(dur);
                            }
                            showOverlay();
                        });
                        seek.addEventListener('change', function (e) {
                            e.stopPropagation();
                            var dur = effectiveDuration();
                            if (dur) video.currentTime = (Number(seek.value) / 1000) * dur;
                            delete seek.dataset.seeking;
                            sync(); showOverlay();
                        });
                    }
                    if (volumeInput) {
                        volumeInput.addEventListener('input', function (e) {
                            e.stopPropagation();
                            var vol = Math.max(0, Math.min(1, Number(volumeInput.value)));
                            video.volume = vol;
                            video.muted = vol === 0;
                            sync();
                        });
                    }
                    video.addEventListener('loadedmetadata', sync);
                    video.addEventListener('durationchange', sync);
                    video.addEventListener('timeupdate', sync);
                    video.addEventListener('volumechange', sync);
                    video.addEventListener('play', function () { setStatus(''); sync(); showOverlay(); });
                    video.addEventListener('pause', function () { setStatus(video.ended ? 'Playback finished' : ''); sync(); showOverlay(); });
                    video.addEventListener('waiting', function () { setStatus('Buffering\u2026'); });
                    video.addEventListener('canplay', function () {
                        if (statusEl && statusEl.textContent === 'Buffering\u2026') setStatus('');
                        sync();
                    });
                    video.addEventListener('ended', function () { setStatus('Playback finished'); sync(); showOverlay(); });
                    video.addEventListener('error', function () { setStatus('Could not play this video in your browser.'); });
                });

                // Re-execute embedded page scripts (for pjax navigation)
                Array.prototype.forEach.call(root.querySelectorAll('script[data-ov-page-script]'), function (s) {
                    var ns = document.createElement('script');
                    ns.textContent = s.textContent;
                    s.parentNode.replaceChild(ns, s);
                });
            };

            window.OvInitContent(document.body);
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

const VOD_ENABLED = process.env.ENABLE_VOD === 'true';

function renderNav(activeNav) {
    const items = [
        { href: '/', label: 'Home', id: 'home', icon: 'network', pjax: true },
        { href: '/channels', label: 'Channels', id: 'channels', icon: 'community', pjax: true },
        ...(VOD_ENABLED ? [{ href: '/vods', label: 'VODs', id: 'vods', icon: 'media', pjax: true }] : []),
        { href: '/clips', label: 'Clips', id: 'clips', icon: 'live', pjax: true },
        { href: '/go-live', label: 'Go Live', id: 'go-live', icon: 'launch', pjax: false },
        { href: '/updates', label: 'Updates', id: 'updates', icon: 'content', pjax: true },
    ];
    return items.map((item) => `<a class="nav-link ov-icon-label ${item.id === activeNav ? 'active' : ''}" href="${item.href}"${item.pjax ? ' data-ov-pjax' : ''}>${renderIcon(item.icon, { decorative: true })}<span>${escapeHtml(item.label)}</span></a>`).join('');
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
                ${extraScripts ? `<script data-ov-page-script="1">${extraScripts}</script>` : ''}
            </main>
            ${renderFooter(baseUrl)}
            <script src="/assets/openvibe.js?v=20260503-1"></script>
            <script src="/assets/live-dashboard-local.js?v=20260604-1"></script>
            <script src="/js/realtime.js?v=20260507-1"></script>
            ${_shellScript()}
            <script src="/assets/chat-bubble.js" defer></script>
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

function renderEmptyState(title, body, href, label) {
    return `
        <article class="empty-state" data-reveal>
            <h3 class="card-title">${escapeHtml(title || 'Nothing here yet')}</h3>
            <p class="card-body">${escapeHtml(body || '')}</p>
            ${href && label ? `<div class="form-actions" style="margin-top:1rem;"><a class="button-secondary" href="${escapeHtml(href)}">${escapeHtml(label)}</a></div>` : ''}
        </article>`;
}

module.exports = {
    LIVE_NETWORK_URLS,
    BUILD_UPDATES,
    GO_LIVE_TRACKS,
    MISSION_PILLARS,
    escapeHtml,
    absoluteUrl,
    formatNumber,
    formatCompactNumber,
    formatDurationSeconds,
    formatDateTime,
    formatShortDate,
    timeAgo,
    initialsFrom,
    labelizeKey,
    normalizeCreatorSlug,
    sanitizeStreamTitle,
    channelPath,
    streamPath,
    canRenderImageUrl,
    VOD_ENABLED,
    renderPill,
    renderMediaThumb,
    renderVideoCard,
    renderStreamerGroupCard,
    renderStreamCard,
    renderChannelCard,
    renderSection,
    renderSignalCard,
    renderEmptyState,
    renderPage,
    renderNav,
    renderFooter,
};
