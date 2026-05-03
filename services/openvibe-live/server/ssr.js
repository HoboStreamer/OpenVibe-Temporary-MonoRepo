'use strict';

const { resolvePublicOrigin } = require('@openvibe/sdk/url-defaults');

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

const FEATURE_MATRIX = [
    {
        eyebrow: 'Discovery',
        title: 'Live-first without the clutter',
        body: 'The homepage keeps active streams, recent broadcasts, creators, VODs, and clips within one smooth discovery flow.',
    },
    {
        eyebrow: 'Broadcasting',
        title: 'Multiple ways to go live',
        body: 'Browser, OBS, RTMP, WHIP, and restream entry points stay visible so creators can choose the workflow that fits.',
    },
    {
        eyebrow: 'Canonical data',
        title: 'Truthful migration surfaces',
        body: 'If VODs or clips have not been staged yet, the page says so plainly instead of faking a finished product.',
    },
    {
        eyebrow: 'SEO + sharing',
        title: 'Channel and stream SSR by default',
        body: 'Every creator and broadcast route gets real titles, metadata, canonical URLs, and a meaningful first paint.',
    },
    {
        eyebrow: 'Polish',
        title: 'Fast interactions with motion',
        body: 'Hover lift, soft reveal animations, counter motion, and responsive panels make the experience feel modern without overwhelming it.',
    },
    {
        eyebrow: 'Connected platform',
        title: 'Built to plug into the rest of OpenVibe',
        body: 'The live surface is ready to connect outward to chat, community, media, tools, and account flows as the broader plan lands.',
    },
];

const LIVE_SURFACES = [
    {
        href: '/channels',
        label: 'Creator directory',
        title: 'Browse every staged channel',
        body: 'Search creators, inspect their activity, and jump directly into current or recent broadcasts.',
    },
    {
        href: '/vods',
        label: 'Replay library',
        title: 'Keep the VOD path first-class',
        body: 'Streams with replay attachments show up in a dedicated VOD surface rather than being buried inside channel pages.',
    },
    {
        href: '/clips',
        label: 'Highlights',
        title: 'Clip-ready discovery',
        body: 'When clip metadata exists it has a home, and when it does not the empty state tells the truth cleanly.',
    },
    {
        href: '/go-live',
        label: 'Broadcast path',
        title: 'Clear go-live onboarding',
        body: 'Browser, OBS, RTMP, WHIP, and restream routes are explained in one place for streamers and operators.',
    },
    {
        href: '/updates',
        label: 'Release notes',
        title: 'See what changed recently',
        body: 'Track current work, parity progress, and product changes without digging through implementation details.',
    },
    {
        href: '/',
        label: 'Watch now',
        title: 'Live and recent on one stage',
        body: 'The main landing page keeps current broadcasts, recent activity, featured creators, and stats in a single flow.',
    },
];

const GO_LIVE_TRACKS = [
    {
        label: 'Browser broadcast',
        title: 'Quickest route to first pixels',
        body: 'Ideal for creators who want to go live without a full desktop studio setup.',
        meta: 'Best for quick sessions, demos, and lighter-weight streams',
    },
    {
        label: 'OBS / RTMP',
        title: 'Traditional desktop workflow',
        body: 'Use a familiar scene-based studio with overlays, capture stacks, and higher production control.',
        meta: 'Fits the standard creator workflow and downstream restream setups',
    },
    {
        label: 'WHIP',
        title: 'Direct, modern live publishing',
        body: 'Use WHIP-compatible tooling where available for lower-friction real-time ingest paths.',
        meta: 'Useful for newer live pipelines and API-driven broadcasting',
    },
    {
        label: 'Restream',
        title: 'Push once, publish wider',
        body: 'Keep the OpenVibe channel canonical while still distributing to other RTMP-compatible destinations.',
        meta: 'Great for multi-platform creators who do not want duplicate control panels',
    },
];

const OPENVIBE_NETWORK_LINKS = [
    {
        href: LIVE_NETWORK_URLS.restream,
        label: 'OpenRe.Stream',
        title: 'Restream control plane',
        body: 'Keep OBS, RTMP, WHIP, and multi-destination publishing under an OpenVibe-owned ingest and routing layer.',
    },
    {
        href: LIVE_NETWORK_URLS.chat,
        label: 'OpenVibe Chat',
        title: 'Chat, DMs, calls, and TTS',
        body: 'Move stream chat, private conversations, voice/video calls, and TTS queue management into a reusable network product.',
    },
    {
        href: LIVE_NETWORK_URLS.community,
        label: 'OpenVibe Community',
        title: 'Pastes, threads, and Discord relay',
        body: 'Bring Hobo-style pastes, social discussion, and relay-aware community surfaces into a native OpenVibe home.',
    },
    {
        href: LIVE_NETWORK_URLS.network,
        label: 'OpenVibe Network',
        title: 'Accounts, themes, and platform control',
        body: 'Tie together identity, operator visibility, themes, service discovery, and account management without losing creator ownership.',
    },
];

const MISSION_PILLARS = [
    'Build a calmer alternative to engagement-maximizing streaming platforms.',
    'Keep creator identity portable with canonical @username routes and honest metadata.',
    'Prefer open tooling, visible governance, and a path toward community stewardship over growth-at-all-costs.',
    'Leave legal, DMCA, and contact surfaces visible instead of burying them behind support mazes.',
];

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function canRenderImageUrl(url) {
    if (!url) return false;
    const value = String(url);
    return /^(https?:)?\/\//i.test(value) || /^data:/i.test(value) || value.startsWith('/');
}

function absoluteUrl(url, baseUrl) {
    if (!url) return '';
    const value = String(url);
    if (/^https?:\/\//i.test(value) || /^data:/i.test(value)) return value;
    if (value.startsWith('//')) return `https:${value}`;
    if (value.startsWith('/')) return `${baseUrl.replace(/\/$/, '')}${value}`;
    return `${baseUrl.replace(/\/$/, '')}/${value.replace(/^\//, '')}`;
}

function toDate(value) {
    if (!value) return null;
    const raw = String(value);
    const normalized = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatNumber(value, options) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) return '0';
    return new Intl.NumberFormat('en-US', options || {}).format(numeric);
}

function formatCompactNumber(value) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) return '0';
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(numeric);
}

function formatDateTime(value) {
    const parsed = toDate(value);
    return parsed
        ? parsed.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
        : String(value || 'Unknown');
}

function timeAgo(value) {
    const parsed = toDate(value);
    if (!parsed) return 'just now';
    const diff = Date.now() - parsed.getTime();
    if (diff <= 0) return 'just now';
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 6) return `${weeks}w ago`;
    return formatDateTime(value);
}

function initialsFrom(value) {
    const words = String(value || 'OV')
        .replace(/[^a-z0-9\s]/gi, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2);
    if (!words.length) return 'OV';
    return words.map((part) => part.charAt(0).toUpperCase()).join('');
}

function pageTitle(baseTitle, suffix) {
    return suffix ? `${baseTitle} — ${suffix}` : baseTitle;
}

function channelPath(slug) {
    return `/@${encodeURIComponent(String(slug || 'unknown'))}`;
}

function streamPath(slug, streamId) {
    return `${channelPath(slug)}/s/${encodeURIComponent(String(streamId || 'unknown'))}`;
}

function formatDurationSeconds(totalSeconds) {
    const numeric = Math.max(0, Number(totalSeconds || 0));
    if (!Number.isFinite(numeric) || numeric <= 0) return '0m';
    const days = Math.floor(numeric / 86400);
    const hours = Math.floor((numeric % 86400) / 3600);
    const minutes = Math.floor((numeric % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${Math.max(1, minutes)}m`;
}

function truncateText(value, maxLength) {
    const text = String(value == null ? '' : value).trim();
    const cap = Number.isFinite(maxLength) ? maxLength : 120;
    if (!text) return '';
    if (text.length <= cap) return text;
    return `${text.slice(0, Math.max(0, cap - 1)).trimEnd()}…`;
}

function labelizeKey(value) {
    return String(value || 'unknown')
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function _meta({ title, description, canonical, ogType, ogImage }) {
    const desc = description || 'OpenVibe Live — creator-first discovery and broadcasting across the OpenVibe network.';
    return `
        <title>${escapeHtml(title)}</title>
        <meta name="description" content="${escapeHtml(desc)}">
        <link rel="canonical" href="${escapeHtml(canonical)}">
        <meta property="og:type" content="${escapeHtml(ogType || 'website')}">
        <meta property="og:title" content="${escapeHtml(title)}">
        <meta property="og:description" content="${escapeHtml(desc)}">
        ${ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}">` : ''}
        <meta property="og:url" content="${escapeHtml(canonical)}">
        <meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}">
        <meta name="twitter:title" content="${escapeHtml(title)}">
        <meta name="twitter:description" content="${escapeHtml(desc)}">
        ${ogImage ? `<meta name="twitter:image" content="${escapeHtml(ogImage)}">` : ''}
    `;
}

function _shellStyles() {
    return `<style>
        :root {
            color-scheme: dark;
            --ov-accent: #8b5cf6;
            --ov-accent-2: #22d3ee;
            --ov-bg: #060916;
            --ov-bg-elev: rgba(10, 18, 38, 0.82);
            --ov-bg-elev-2: rgba(14, 23, 46, 0.92);
            --ov-text: #edf3ff;
            --ov-text-dim: #9fb0cf;
            --ov-text-faint: #c7d4ee;
            --ov-border: rgba(148, 163, 184, 0.16);
            --ov-shadow: 0 28px 90px rgba(2, 8, 23, 0.52);
            --bg: var(--ov-bg);
            --bg-elev: var(--ov-bg-elev);
            --bg-elev-strong: var(--ov-bg-elev-2);
            --bg-soft: rgba(19, 31, 62, 0.68);
            --surface: rgba(255, 255, 255, 0.05);
            --surface-2: rgba(255, 255, 255, 0.08);
            --surface-3: rgba(255, 255, 255, 0.12);
            --border: var(--ov-border);
            --border-strong: rgba(148, 163, 184, 0.26);
            --text: var(--ov-text);
            --muted: var(--ov-text-dim);
            --muted-strong: var(--ov-text-faint);
            --primary: var(--ov-accent);
            --primary-2: #6d28d9;
            --accent: var(--ov-accent-2);
            --success: #34d399;
            --warn: #f59e0b;
            --danger: #fb7185;
            --shadow: var(--ov-shadow);
            --radius: 28px;
            --radius-lg: 36px;
            --radius-md: 20px;
            --radius-sm: 14px;
            --max-width: 1280px;
        }
        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        body {
            margin: 0;
            min-height: 100vh;
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background:
                radial-gradient(circle at top left, rgba(139, 92, 246, 0.30), transparent 30%),
                radial-gradient(circle at 85% 10%, rgba(34, 211, 238, 0.18), transparent 25%),
                radial-gradient(circle at 20% 100%, rgba(37, 99, 235, 0.16), transparent 26%),
                linear-gradient(180deg, #050814 0%, #07101f 42%, #050814 100%);
            color: var(--text);
            overflow-x: hidden;
        }
        body::before,
        body::after {
            content: '';
            position: fixed;
            inset: auto;
            width: 28rem;
            height: 28rem;
            border-radius: 999px;
            pointer-events: none;
            filter: blur(90px);
            opacity: 0.32;
            z-index: -1;
        }
        body::before {
            top: -8rem;
            left: -6rem;
            background: rgba(139, 92, 246, 0.55);
        }
        body::after {
            bottom: -10rem;
            right: -8rem;
            background: rgba(34, 211, 238, 0.35);
        }
        a { color: inherit; text-decoration: none; }
        img { display: block; max-width: 100%; }
        code {
            font-family: 'SFMono-Regular', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 999px;
            padding: 0.16rem 0.55rem;
            font-size: 0.8rem;
            color: #d8e6ff;
        }
        .page-shell {
            width: min(var(--max-width), calc(100vw - 2rem));
            margin: 0 auto;
        }
        .topbar {
            position: sticky;
            top: 0;
            z-index: 50;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            background: rgba(5, 9, 22, 0.68);
            backdrop-filter: blur(18px);
            box-shadow: 0 12px 30px rgba(2, 8, 23, 0.16);
        }
        .topbar-inner {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
            min-height: 74px;
        }
        .brand {
            display: inline-flex;
            align-items: center;
            gap: 0.85rem;
            min-width: 0;
        }
        .brand-mark {
            width: 2.8rem;
            height: 2.8rem;
            border-radius: 18px;
            background: linear-gradient(135deg, var(--primary), var(--accent));
            display: grid;
            place-items: center;
            font-weight: 800;
            color: white;
            box-shadow: var(--shadow);
        }
        .brand-copy {
            min-width: 0;
        }
        .brand-name {
            font-size: 1rem;
            font-weight: 750;
            letter-spacing: 0.02em;
        }
        .brand-sub {
            color: var(--muted);
            font-size: 0.82rem;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .nav-links {
            display: inline-flex;
            align-items: center;
            gap: 0.35rem;
            flex-wrap: wrap;
            justify-content: center;
        }
        .nav-link {
            padding: 0.72rem 1rem;
            border-radius: 999px;
            color: var(--muted-strong);
            font-size: 0.92rem;
            transition: transform 0.25s ease, background 0.25s ease, color 0.25s ease, border-color 0.25s ease;
            border: 1px solid transparent;
        }
        .nav-link:hover,
        .nav-link.active {
            background: var(--surface-2);
            border-color: var(--surface-2);
            color: white;
            transform: translateY(-1px);
        }
        .nav-cta {
            display: inline-flex;
            align-items: center;
            gap: 0.55rem;
            padding: 0.78rem 1.1rem;
            border-radius: 999px;
            background: linear-gradient(135deg, var(--primary), var(--primary-2) 60%, var(--accent));
            color: white;
            font-weight: 700;
            border: 0;
            box-shadow: var(--shadow);
            transition: transform 0.25s ease, box-shadow 0.25s ease;
        }
        .nav-cta:hover { transform: translateY(-2px); box-shadow: 0 24px 56px rgba(99, 102, 241, 0.42); }
        main.page-shell {
            padding: 1.6rem 0 4.5rem;
        }
        .hero-panel,
        .glass-card,
        .section-panel,
        .timeline-card,
        .stat-card,
        .footer-card {
            background: linear-gradient(180deg, var(--bg-elev-strong), var(--bg-elev));
            border: 1px solid var(--border);
            box-shadow: var(--shadow);
        }
        .hero-panel {
            position: relative;
            overflow: hidden;
            border-radius: var(--radius-lg);
            padding: clamp(1.4rem, 2vw, 2rem);
            margin-bottom: 1.25rem;
        }
        .hero-panel::before {
            content: '';
            position: absolute;
            inset: -1px;
            background: linear-gradient(120deg, rgba(139, 92, 246, 0.18), transparent 32%, rgba(34, 211, 238, 0.14));
            pointer-events: none;
            border-radius: inherit;
        }
        .live-home-hero .hero-grid,
        .live-home-hero .hero-signal-rail,
        .live-home-hero .stat-grid {
            position: relative;
            z-index: 1;
        }
        .hero-stage {
            position: absolute;
            inset: 0;
            overflow: hidden;
            border-radius: inherit;
            pointer-events: none;
        }
        .hero-frame {
            position: absolute;
            inset: 0;
            opacity: 0;
            transform: scale(1.04);
            background-position: center;
            background-size: cover;
            transition: opacity 1.1s ease, transform 6.5s ease;
        }
        .hero-frame::after {
            content: '';
            position: absolute;
            inset: 0;
            background:
                linear-gradient(180deg, rgba(5, 9, 22, 0.35), rgba(5, 9, 22, 0.82) 70%, rgba(5, 9, 22, 0.94)),
                radial-gradient(circle at top right, rgba(34, 211, 238, 0.20), transparent 34%),
                radial-gradient(circle at 18% 24%, rgba(139, 92, 246, 0.26), transparent 38%);
        }
        .hero-frame.is-active {
            opacity: 1;
            transform: scale(1);
        }
        .hero-stage-copy {
            position: absolute;
            right: 1.1rem;
            bottom: 1.1rem;
            display: grid;
            gap: 0.25rem;
            max-width: min(26rem, calc(100% - 2.2rem));
            padding: 0.85rem 1rem;
            border-radius: 18px;
            background: rgba(5, 9, 22, 0.56);
            border: 1px solid rgba(255, 255, 255, 0.08);
            backdrop-filter: blur(18px);
            color: white;
        }
        .hero-stage-copy strong {
            font-size: 0.98rem;
            letter-spacing: -0.02em;
        }
        .hero-stage-copy span:last-child {
            color: rgba(226, 232, 240, 0.82);
            font-size: 0.84rem;
        }
        .hero-aside-stack {
            display: grid;
            gap: 1rem;
            align-content: start;
            position: relative;
            z-index: 1;
        }
        .hero-signal-rail {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            margin-top: 1rem;
        }
        .hero-signal-card {
            min-height: 100%;
        }
        .timeline-tools {
            display: flex;
            gap: 0.75rem;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            margin-bottom: 1rem;
        }
        .timeline-status {
            color: var(--muted-strong);
        }
        .timeline-clear {
            cursor: pointer;
        }
        .update-badge {
            display: none;
        }
        .timeline-card.is-unread {
            border-color: rgba(34, 211, 238, 0.28);
            box-shadow: 0 22px 60px rgba(8, 47, 73, 0.36);
        }
        .timeline-card.is-unread .update-badge {
            display: inline-flex;
        }
        .hero-grid,
        .split-grid,
        .story-grid,
        .feature-grid,
        .surface-grid,
        .card-grid,
        .stat-grid,
        .channel-grid,
        .collection-grid {
            display: grid;
            gap: 1rem;
        }
        .hero-grid {
            grid-template-columns: minmax(0, 1.55fr) minmax(300px, 0.95fr);
            align-items: stretch;
        }
        .hero-copy,
        .hero-spotlight {
            position: relative;
            z-index: 1;
        }
        .eyebrow {
            display: inline-flex;
            align-items: center;
            gap: 0.45rem;
            font-size: 0.76rem;
            text-transform: uppercase;
            letter-spacing: 0.14em;
            font-weight: 800;
            color: rgba(191, 219, 254, 0.9);
            padding: 0.5rem 0.8rem;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.07);
            border: 1px solid rgba(255, 255, 255, 0.08);
            margin-bottom: 1rem;
        }
        .hero-heading {
            font-size: clamp(2.3rem, 6vw, 4.5rem);
            line-height: 0.96;
            letter-spacing: -0.04em;
            margin: 0 0 1rem;
            max-width: 10ch;
        }
        .hero-gradient {
            background: linear-gradient(135deg, var(--text) 0%, color-mix(in srgb, var(--text) 72%, var(--primary) 28%) 30%, color-mix(in srgb, var(--text) 46%, var(--accent) 54%) 100%);
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
        }
        .hero-rotator {
            display: inline-block;
            color: #67e8f9;
            min-width: 8ch;
            transition: opacity 0.18s ease, transform 0.18s ease;
        }
        .hero-rotator:not(.is-active) {
            opacity: 0.72;
            transform: translateY(4px);
        }
        .hero-copy p,
        .hero-note,
        .section-subtitle,
        .card-body,
        .body-copy,
        .subtle-copy,
        .empty-copy,
        .stream-meta,
        .card-kicker,
        .footer-copy {
            color: var(--muted);
            line-height: 1.65;
        }
        .hero-copy p {
            max-width: 58rem;
            font-size: 1.03rem;
            margin: 0;
        }
        .hero-actions,
        .button-row,
        .footer-links,
        .pill-row,
        .meta-row,
        .chip-cloud,
        .card-footer,
        .inline-actions {
            display: flex;
            gap: 0.75rem;
            flex-wrap: wrap;
            align-items: center;
        }
        .hero-actions {
            margin-top: 1.4rem;
        }
        .button,
        .button-secondary,
        .button-ghost {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.55rem;
            padding: 0.88rem 1.15rem;
            border-radius: 999px;
            font-weight: 700;
            border: 1px solid transparent;
            transition: transform 0.25s ease, background 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;
        }
        .button {
            background: linear-gradient(135deg, var(--primary), #4f46e5 64%, var(--accent));
            color: white;
            box-shadow: 0 16px 36px rgba(99, 102, 241, 0.34);
        }
        .button:hover,
        .button-secondary:hover,
        .button-ghost:hover {
            transform: translateY(-2px);
        }
        .button-secondary {
            background: rgba(255, 255, 255, 0.08);
            color: white;
            border-color: rgba(255, 255, 255, 0.1);
        }
        .button-ghost {
            color: var(--muted-strong);
            border-color: rgba(255, 255, 255, 0.08);
            background: rgba(255, 255, 255, 0.03);
        }
        .hero-note {
            margin-top: 1.15rem;
            max-width: 48rem;
        }
        .hero-spotlight {
            border-radius: var(--radius);
            padding: 1rem;
        }
        .hero-spotlight .spotlight-title {
            font-size: 1.1rem;
            margin: 0.65rem 0 0.45rem;
        }
        .hero-spotlight .spotlight-copy {
            color: var(--muted);
            line-height: 1.6;
            margin: 0;
        }
        .stat-grid {
            grid-template-columns: repeat(6, minmax(0, 1fr));
            margin-top: 1.15rem;
        }
        .stat-card {
            border-radius: var(--radius-md);
            padding: 1rem 1rem 1.05rem;
            position: relative;
            overflow: hidden;
        }
        .stat-card::after {
            content: '';
            position: absolute;
            inset: auto 1rem 0;
            height: 4px;
            border-radius: 999px;
            background: linear-gradient(90deg, rgba(139, 92, 246, 0.95), rgba(34, 211, 238, 0.9));
        }
        .stat-label {
            color: rgba(191, 219, 254, 0.72);
            font-size: 0.78rem;
            text-transform: uppercase;
            letter-spacing: 0.12em;
            font-weight: 800;
        }
        .stat-value {
            font-size: clamp(1.45rem, 4vw, 2.2rem);
            font-weight: 800;
            margin-top: 0.35rem;
            letter-spacing: -0.04em;
        }
        .stat-meta {
            font-size: 0.86rem;
            color: var(--muted);
            margin-top: 0.35rem;
        }
        .section-panel {
            border-radius: var(--radius);
            padding: 1.25rem;
            margin-top: 1.1rem;
        }
        .section-head {
            display: flex;
            justify-content: space-between;
            gap: 1rem;
            align-items: flex-end;
            margin-bottom: 1rem;
        }
        .section-title {
            margin: 0;
            font-size: clamp(1.4rem, 3vw, 2rem);
            letter-spacing: -0.03em;
        }
        .section-subtitle {
            margin-top: 0.32rem;
            max-width: 54rem;
        }
        .section-link {
            padding: 0.76rem 0.95rem;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.08);
            color: var(--muted-strong);
            font-size: 0.9rem;
            white-space: nowrap;
        }
        .card-grid,
        .channel-grid,
        .feature-grid,
        .surface-grid,
        .collection-grid {
            grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        }
        .split-grid {
            grid-template-columns: minmax(0, 1.45fr) minmax(300px, 0.9fr);
            align-items: start;
            margin-top: 1.1rem;
        }
        .story-grid {
            grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
            align-items: stretch;
        }
        .glass-card,
        .timeline-card {
            border-radius: var(--radius-md);
            padding: 1rem;
            position: relative;
            overflow: hidden;
            transition: transform 0.32s cubic-bezier(0.2, 0.9, 0.2, 1), border-color 0.32s ease, background 0.32s ease, box-shadow 0.32s ease;
        }
        .glass-card:hover,
        .timeline-card:hover {
            transform: translateY(-6px);
            border-color: rgba(96, 165, 250, 0.26);
            background: linear-gradient(180deg, rgba(18, 30, 59, 0.95), rgba(10, 17, 34, 0.96));
            box-shadow: 0 30px 70px rgba(2, 8, 23, 0.5);
        }
        .glass-card.is-inline {
            display: flex;
            flex-direction: column;
            justify-content: space-between;
        }
        .media-thumb {
            position: relative;
            aspect-ratio: 16 / 9;
            border-radius: 20px;
            overflow: hidden;
            background:
                radial-gradient(circle at top left, rgba(139, 92, 246, 0.42), transparent 40%),
                linear-gradient(135deg, rgba(14, 23, 46, 0.96), rgba(8, 13, 28, 0.96));
            border: 1px solid rgba(255, 255, 255, 0.07);
            margin-bottom: 1rem;
        }
        .media-thumb img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
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
        .media-thumb.has-image .media-fallback-copy {
            display: none;
        }
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
        .media-fallback-copy strong {
            font-size: 1.15rem;
            line-height: 1.1;
            letter-spacing: -0.03em;
        }
        .media-fallback-copy span {
            color: rgba(219, 234, 254, 0.8);
            font-size: 0.92rem;
        }
        .card-title {
            margin: 0;
            font-size: 1.15rem;
            letter-spacing: -0.03em;
        }
        .card-link { display: inline-flex; }
        .card-body {
            margin-top: 0.55rem;
            font-size: 0.96rem;
        }
        .card-kicker {
            font-size: 0.84rem;
            margin-top: 0.5rem;
        }
        .meta-row {
            margin-top: 0.85rem;
        }
        .meta-item,
        .pill,
        .category-chip {
            display: inline-flex;
            align-items: center;
            gap: 0.42rem;
            border-radius: 999px;
            padding: 0.42rem 0.72rem;
            font-size: 0.78rem;
            line-height: 1;
            border: 1px solid rgba(255, 255, 255, 0.08);
            background: rgba(255, 255, 255, 0.05);
            color: rgba(230, 238, 255, 0.9);
        }
        .pill.live {
            background: color-mix(in srgb, var(--danger) 18%, transparent);
            border-color: color-mix(in srgb, var(--danger) 34%, transparent);
            color: color-mix(in srgb, white 78%, var(--danger) 22%);
        }
        .pill.success {
            background: rgba(52, 211, 153, 0.14);
            border-color: rgba(52, 211, 153, 0.24);
            color: #bbf7d0;
        }
        .pill.warn {
            background: color-mix(in srgb, var(--warn) 16%, transparent);
            border-color: color-mix(in srgb, var(--warn) 28%, transparent);
            color: color-mix(in srgb, white 72%, var(--warn) 28%);
        }
        .pill.primary {
            background: rgba(139, 92, 246, 0.16);
            border-color: rgba(139, 92, 246, 0.28);
            color: #ddd6fe;
        }
        .pill.soft {
            background: color-mix(in srgb, var(--accent) 15%, transparent);
            border-color: color-mix(in srgb, var(--accent) 26%, transparent);
            color: color-mix(in srgb, white 70%, var(--accent) 30%);
        }
        .pill.muted {
            color: var(--muted);
        }
        .card-footer {
            margin-top: 1rem;
            justify-content: space-between;
        }
        .link-inline {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            color: #c7d2fe;
            font-weight: 650;
        }
        .avatar-badge {
            width: 3.4rem;
            height: 3.4rem;
            border-radius: 1.2rem;
            overflow: hidden;
            display: grid;
            place-items: center;
            flex: none;
            background: linear-gradient(135deg, rgba(139, 92, 246, 0.48), rgba(34, 211, 238, 0.28));
            color: white;
            font-weight: 800;
            font-size: 1.05rem;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .avatar-badge img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        .channel-head {
            display: flex;
            align-items: center;
            gap: 0.85rem;
        }
        .channel-name {
            margin: 0;
            font-size: 1.08rem;
        }
        .channel-handle,
        .subtle-copy,
        .directory-status,
        .empty-copy {
            color: var(--muted);
            font-size: 0.92rem;
        }
        .chip-cloud {
            margin-top: 1rem;
        }
        .category-chip {
            cursor: pointer;
            transition: transform 0.22s ease, border-color 0.22s ease, background 0.22s ease;
        }
        .category-chip:hover {
            transform: translateY(-2px);
            border-color: rgba(34, 211, 238, 0.28);
            background: rgba(34, 211, 238, 0.12);
        }
        .search-bar {
            display: flex;
            gap: 0.8rem;
            flex-wrap: wrap;
            align-items: center;
            margin-bottom: 1rem;
        }
        .filter-input {
            flex: 1 1 280px;
            min-width: 240px;
            padding: 0.95rem 1rem;
            border-radius: 18px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            background: rgba(255, 255, 255, 0.05);
            color: white;
            font-size: 0.98rem;
            outline: none;
            transition: border-color 0.22s ease, background 0.22s ease, box-shadow 0.22s ease;
        }
        .filter-input:focus {
            border-color: rgba(34, 211, 238, 0.36);
            background: rgba(255, 255, 255, 0.08);
            box-shadow: 0 0 0 3px rgba(34, 211, 238, 0.12);
        }
        .empty-state {
            padding: 1.2rem;
            border-radius: 22px;
            border: 1px dashed rgba(148, 163, 184, 0.26);
            background: rgba(255, 255, 255, 0.03);
        }
        .empty-state h3 {
            margin: 0 0 0.45rem;
            font-size: 1.08rem;
        }
        .list-stack {
            display: grid;
            gap: 0.9rem;
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

function renderNav(activeNav) {
    const items = [
        { href: '/', label: 'Home', id: 'home' },
        { href: '/channels', label: 'Channels', id: 'channels' },
        { href: '/vods', label: 'VODs', id: 'vods' },
        { href: '/clips', label: 'Clips', id: 'clips' },
        { href: '/go-live', label: 'Go Live', id: 'go-live' },
        { href: '/updates', label: 'Updates', id: 'updates' },
    ];
    return items.map((item) => `<a class="nav-link ${item.id === activeNav ? 'active' : ''}" href="${item.href}">${escapeHtml(item.label)}</a>`).join('');
}

function renderFooter() {
    return `
        <footer class="footer-shell page-shell">
            <section class="footer-card" data-reveal>
                <div class="footer-grid">
                    <div>
                        <div class="eyebrow">OpenVibe Live</div>
                        <h2 class="footer-title" style="margin:0 0 0.55rem">Creator-first discovery, open infrastructure, and visible escape hatches.</h2>
                        <p class="footer-copy">OpenVibe Live is being shaped as a creator-owned alternative: canonical @handles, reusable platform services, honest migration state, and legal/reporting links that stay obvious instead of disappearing into a support void.</p>
                        <div class="data-points" style="margin-top:1rem;">
                            <div class="data-point">
                                <div class="data-point-label">Model</div>
                                <div class="data-point-value">Open source</div>
                            </div>
                            <div class="data-point">
                                <div class="data-point-label">Direction</div>
                                <div class="data-point-value">Not-for-profit minded</div>
                            </div>
                            <div class="data-point">
                                <div class="data-point-label">Contact</div>
                                <div class="data-point-value"><a class="link-inline" href="mailto:hello@openvibe.live">hello@openvibe.live</a></div>
                            </div>
                        </div>
                    </div>
                    <div>
                        <div class="data-points">
                            <div class="data-point">
                                <div class="data-point-label">Explore</div>
                                <div class="footer-links is-column">
                                    <a href="/">Home</a>
                                    <a href="/channels">Channels</a>
                                    <a href="/vods">VODs</a>
                                    <a href="/clips">Clips</a>
                                    <a href="/go-live">Go Live</a>
                                    <a href="/updates">Updates</a>
                                </div>
                            </div>
                            <div class="data-point">
                                <div class="data-point-label">Network</div>
                                <div class="footer-links is-column">
                                    <a href="${LIVE_NETWORK_URLS.restream}">OpenRe.Stream</a>
                                    <a href="${LIVE_NETWORK_URLS.chat}">OpenVibe Chat</a>
                                    <a href="${LIVE_NETWORK_URLS.community}">OpenVibe Community</a>
                                    <a href="${LIVE_NETWORK_URLS.network}">OpenVibe Network</a>
                                </div>
                            </div>
                            <div class="data-point">
                                <div class="data-point-label">Project</div>
                                <div class="footer-links is-column">
                                    <a href="https://github.com/openvibe">GitHub</a>
                                    <a href="/tos">Terms</a>
                                    <a href="/dmca">DMCA</a>
                                    <a href="mailto:dmca@openvibe.live">dmca@openvibe.live</a>
                                    <a href="/health">Health</a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="footer-legal">
                    <p class="footer-copy" style="margin:0">OpenVibe Live surfaces what the current runtime can prove right now: live sessions, recent activity, creator routes, media linkage state, and the adjacent community/chat systems already available across the network.</p>
                    <div class="footer-legal-links">
                        <span class="pill soft">Open source & community-run</span>
                        <span class="pill primary">Canonical @username routes</span>
                        <span class="pill warn">DMCA-ready reporting path</span>
                    </div>
                </div>
            </section>
        </footer>`;
}

function renderPage({ title, description, canonical, ogType, ogImage, activeNav, bodyHtml, baseUrl }) {
    return `<!doctype html>
        <html lang="en">
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%238b5cf6'/%3E%3Cstop offset='100%25' stop-color='%2322d3ee'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='64' height='64' rx='18' fill='url(%23g)'/%3E%3Ctext x='50%25' y='54%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial,sans-serif' font-size='24' font-weight='700' fill='white'%3EOV%3C/text%3E%3C/svg%3E">
            ${_meta({ title, description, canonical, ogType, ogImage })}
            ${_shellStyles()}
        </head>
        <body>
            <header class="topbar">
                <div class="page-shell topbar-inner">
                    <a class="brand" href="/">
                        <span class="brand-mark">OV</span>
                        <span class="brand-copy">
                            <span class="brand-name">openvibe.live</span>
                            <span class="brand-sub">Native live discovery for the OpenVibe graph</span>
                        </span>
                    </a>
                    <nav class="nav-links" aria-label="Primary">
                        ${renderNav(activeNav)}
                    </nav>
                    <a class="nav-cta" href="/go-live">Launch your stream</a>
                </div>
            </header>
            <main class="page-shell">
                ${bodyHtml}
            </main>
            ${renderFooter(baseUrl)}
            <script src="/assets/openvibe.js?v=20260503-1"></script>
            ${_shellScript()}
        </body>
        </html>`;
}

function renderPill(label, tone) {
    return `<span class="pill ${escapeHtml(tone || '')}">${escapeHtml(label)}</span>`;
}

function renderMediaThumb({ url, title, eyebrow, subtitle, initials, baseUrl }) {
    const imageUrl = canRenderImageUrl(url) ? url : null;
    return `
        <div class="media-thumb ${imageUrl ? 'has-image' : ''}">
            ${imageUrl ? `<img src="${escapeHtml(absoluteUrl(imageUrl, baseUrl))}" alt="${escapeHtml(title || subtitle || 'OpenVibe Live media')}" loading="lazy" onerror="if(this.parentElement){this.parentElement.classList.remove('has-image');} this.remove();">` : ''}
            <div class="media-fallback-copy">
                <span class="media-kicker">${escapeHtml(eyebrow || 'OpenVibe Live')}</span>
                <strong>${escapeHtml(title || 'Untitled broadcast')}</strong>
                <span>${escapeHtml(subtitle || initials || 'Live discovery')}</span>
            </div>
        </div>`;
}

function renderStreamCard(stream, channel, baseUrl, options) {
    const opts = options || {};
    const slug = stream.channel_slug || (channel && channel.slug) || 'unknown';
    const channelName = stream.channel_name || (channel && (channel.display_name || channel.slug)) || slug;
    const isReplayMedia = stream.kind === 'vod' || stream.kind === 'clip';
    const href = stream.route_url || streamPath(slug, stream.id);
    const audiencePill = stream.is_live
        ? renderPill(`${formatCompactNumber(stream.viewer_count || 0)} watching`, 'live')
        : (isReplayMedia
            ? renderPill(`${formatCompactNumber(stream.view_count || 0)} views`, 'soft')
            : renderPill(`Peak ${formatCompactNumber(stream.peak_viewers || 0)}`, 'soft'));
    const readinessPill = isReplayMedia
        ? renderPill(stream.playback_ready ? 'Playback ready' : labelizeKey(stream.status || 'staged'), stream.playback_ready ? 'success' : 'warn')
        : '';
    const tags = [
        opts.badge ? renderPill(opts.badge, opts.badgeTone || 'primary') : '',
        audiencePill,
        readinessPill,
        stream.category ? renderPill(stream.category, 'muted') : '',
        stream.source === 'hobostreamer' ? renderPill('Migrated', 'warn') : renderPill('Native', 'success'),
    ].filter(Boolean).join('');
    const summary = stream.summary || (stream.is_live
        ? `Started ${timeAgo(stream.started_at)}${stream.protocol ? ` · ${stream.protocol}` : ''}`
        : (isReplayMedia
            ? `${stream.playback_ready ? 'Canonical playback ready' : `Status ${labelizeKey(stream.status || 'staged')}`} · ${timeAgo(stream.created_at || stream.updated_at)}`
            : `${stream.ended_at ? `Ended ${timeAgo(stream.ended_at)}` : `Updated ${timeAgo(stream.started_at || stream.updated_at)}`}${stream.protocol ? ` · ${stream.protocol}` : ''}`));
    const detailBits = Array.isArray(stream.detail_bits) && stream.detail_bits.length
        ? stream.detail_bits.filter(Boolean)
        : (isReplayMedia
            ? [
                slug ? `@${slug}` : null,
                stream.duration_seconds ? formatDurationSeconds(stream.duration_seconds) : null,
                stream.kind === 'vod' ? 'Replay library' : 'Highlight clip',
            ].filter(Boolean)
            : [
                `@${slug}`,
                stream.vod_media_id ? 'VOD attached' : 'No VOD yet',
                stream.has_clips ? `${formatNumber(stream.clip_count)} clip${stream.clip_count === 1 ? '' : 's'}` : 'No clips yet',
            ]);
    const filterText = `${stream.title || ''} ${slug} ${channelName} ${stream.category || ''} ${summary} ${detailBits.join(' ')}`.toLowerCase();
    const kicker = isReplayMedia
        ? `From ${slug && slug !== 'unknown' ? `<a class="link-inline" href="${channelPath(slug)}">${escapeHtml(channelName)}</a>` : escapeHtml(channelName)} · ${escapeHtml(summary)}`
        : `By <a class="link-inline" href="${channelPath(slug)}">${escapeHtml(channelName)}</a> · ${escapeHtml(summary)}`;
    const footerMeta = stream.footer_meta || (isReplayMedia
        ? formatDateTime(stream.created_at || stream.updated_at)
        : (stream.started_at ? formatDateTime(stream.started_at) : 'Schedule TBD'));
    const ctaLabel = stream.cta_label || (isReplayMedia ? `Open ${stream.kind} →` : 'Open stream →');
    return `
        <article class="glass-card is-inline" data-reveal data-filter-group="${escapeHtml(opts.filterGroup || '')}" data-filter-text="${escapeHtml(filterText)}">
            ${renderMediaThumb({
                url: stream.thumbnail_url || (channel && channel.avatar_url) || null,
                title: stream.title || 'Untitled stream',
                eyebrow: stream.is_live ? 'Live now' : (opts.badge || 'Broadcast'),
                subtitle: channelName,
                initials: initialsFrom(channelName),
                baseUrl,
            })}
            <div class="pill-row">${tags}</div>
            <a class="card-link" href="${href}"><h3 class="card-title">${escapeHtml(stream.title || 'Untitled stream')}</h3></a>
            <div class="card-kicker">${kicker}</div>
            <p class="card-body">${escapeHtml(detailBits.join(' · '))}</p>
            <div class="card-footer">
                <span class="meta-item">${escapeHtml(footerMeta)}</span>
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
                baseUrl,
            })}
            <div class="channel-head">
                <div class="avatar-badge">
                    ${canRenderImageUrl(channel.avatar_url)
                        ? `<img src="${escapeHtml(absoluteUrl(channel.avatar_url, baseUrl))}" alt="${escapeHtml(channel.display_name || channel.slug)} avatar" loading="lazy" onerror="this.parentElement.textContent='${escapeHtml(initialsFrom(channel.display_name || channel.slug))}'">`
                        : escapeHtml(initialsFrom(channel.display_name || channel.slug))}
                </div>
                <div>
                    <div class="pill-row">${liveLabel}${channel.source === 'hobostreamer' ? renderPill('Migrated account', 'warn') : ''}</div>
                    <a class="card-link" href="${channelPath(channel.slug)}"><h3 class="channel-name">${escapeHtml(channel.display_name || channel.slug)}</h3></a>
                    <div class="channel-handle">${escapeHtml(descriptorBits.join(' · ') || `@${channel.slug}`)}</div>
                </div>
            </div>
            <p class="card-body">${escapeHtml(channel.description || (currentStream ? `Currently live with “${currentStream.title || 'Untitled stream'}”.` : 'Offline right now, but ready for channel discovery and replay links.'))}</p>
            <div class="pill-row">${(channel.tags || []).slice(0, 4).map((tag) => renderPill(tag, 'soft')).join('')}</div>
            ${statBits.length ? `<div class="meta-row">${statBits.map((item) => `<span class="meta-item">${escapeHtml(item)}</span>`).join('')}</div>` : ''}
            <div class="card-footer">
                <span class="meta-item">${stats && stats.last_activity_at ? `Last active ${timeAgo(stats.last_activity_at)}` : 'Waiting for next stream'}</span>
                <a class="link-inline" href="${channelPath(channel.slug)}">Open channel →</a>
            </div>
        </article>`;
}

function collectHeroFrames({ trendingNow, liveNow, recentlyEnded, channelMap, baseUrl }) {
    const frames = [];
    const seen = new Set();
    [trendingNow || [], liveNow || [], recentlyEnded || []].forEach((list) => {
        list.forEach((stream) => {
            const channel = channelMap && channelMap.get(stream.channel_slug);
            const rawUrl = stream.thumbnail_url || (channel && channel.avatar_url) || null;
            if (!canRenderImageUrl(rawUrl)) return;
            const url = absoluteUrl(rawUrl, baseUrl);
            if (!url || seen.has(url)) return;
            seen.add(url);
            frames.push({
                url,
                title: stream.title || 'Untitled stream',
                subtitle: (channel && (channel.display_name || channel.slug)) || stream.channel_slug || 'OpenVibe creator',
                eyebrow: stream.is_live ? 'Live frame' : 'Recent frame',
            });
        });
    });
    return frames.slice(0, 6);
}

function renderRecentlyOnlineChannelCard(entry, baseUrl) {
    const channel = entry || {};
    const stats = channel.stats || {};
    const recentStream = channel.recentStream || channel.lastStream || null;
    const title = channel.display_name || channel.slug || 'Unknown creator';
    const totalLive = formatDurationSeconds(stats.stream_time_seconds || 0);
    const previewTitle = (recentStream && recentStream.title) || `${title} recently online`;
    const recentLabel = recentStream && recentStream.ended_at
        ? `Ended ${timeAgo(recentStream.ended_at)}`
        : (stats.last_ended_at ? `Ended ${timeAgo(stats.last_ended_at)}` : 'Recently online');
    return `
        <article class="glass-card is-inline" data-reveal>
            ${renderMediaThumb({
                url: (recentStream && recentStream.thumbnail_url) || channel.avatar_url || null,
                title: previewTitle,
                eyebrow: 'Recently online',
                subtitle: title,
                initials: initialsFrom(title),
                baseUrl,
            })}
            <div class="pill-row">
                ${renderPill('Recently online', 'soft')}
                ${renderPill(`${totalLive} total live`, 'primary')}
                ${recentStream && recentStream.category ? renderPill(recentStream.category, 'muted') : ''}
            </div>
            <a class="card-link" href="${channelPath(channel.slug)}"><h3 class="card-title">${escapeHtml(title)}</h3></a>
            <div class="card-kicker">@${escapeHtml(channel.slug || 'unknown')} · ${escapeHtml(recentLabel)}</div>
            <p class="card-body">${escapeHtml(previewTitle)}${recentStream && recentStream.vod_media_id ? ' · VOD attached' : ''}${recentStream && recentStream.has_clips ? ' · Clips ready' : ''}</p>
            <div class="data-points" style="margin-top:0.95rem;">
                <div class="data-point">
                    <div class="data-point-label">Stream time</div>
                    <div class="data-point-value">${escapeHtml(totalLive)}</div>
                </div>
                <div class="data-point">
                    <div class="data-point-label">Streams tracked</div>
                    <div class="data-point-value">${escapeHtml(formatNumber(stats.total_streams || 0))}</div>
                </div>
                <div class="data-point">
                    <div class="data-point-label">Peak viewers</div>
                    <div class="data-point-value">${escapeHtml(formatCompactNumber(stats.peak_viewers || 0))}</div>
                </div>
            </div>
            <div class="card-footer">
                <span class="meta-item">${escapeHtml(stats.last_activity_at ? `Last activity ${timeAgo(stats.last_activity_at)}` : 'Waiting for the next session')}</span>
                <a class="link-inline" href="${recentStream ? streamPath(channel.slug, recentStream.id) : channelPath(channel.slug)}">${recentStream ? 'Open latest stream →' : 'Open channel →'}</a>
            </div>
        </article>`;
}

function renderEmptyState(title, body, href, label) {
    return `
        <div class="empty-state" data-reveal>
            <h3>${escapeHtml(title)}</h3>
            <p class="empty-copy">${escapeHtml(body)}</p>
            ${href && label ? `<div class="inline-actions"><a class="button-secondary" href="${href}">${escapeHtml(label)}</a></div>` : ''}
        </div>`;
}

function renderPasteCard(paste, baseUrl) {
    const title = paste.title || paste.slug || 'Untitled paste';
    const preview = truncateText(paste.preview_text || paste.body || 'Migrated community paste.', 160);
    const sourceLabel = paste.source === 'hobostreamer' ? 'Migrated paste' : 'Community paste';
    const kindLabel = paste.kind === 'screenshot' ? 'Screenshot' : 'Paste';
    return `
        <article class="glass-card is-inline" data-reveal>
            ${renderMediaThumb({
                url: paste.image_url || null,
                title,
                eyebrow: kindLabel,
                subtitle: title,
                initials: initialsFrom(title),
                baseUrl,
            })}
            <div class="pill-row">
                ${renderPill(kindLabel, 'primary')}
                ${paste.language ? renderPill(labelizeKey(paste.language), 'soft') : ''}
                ${renderPill(`${formatNumber(paste.view_count || 0)} views`, 'muted')}
                ${renderPill(sourceLabel, paste.source === 'hobostreamer' ? 'warn' : 'success')}
            </div>
            <h3 class="card-title">${escapeHtml(title)}</h3>
            <div class="card-kicker">${escapeHtml(timeAgo(paste.created_at))} · ${escapeHtml(paste.slug || 'community')}</div>
            <p class="card-body">${escapeHtml(preview || 'Community paste imported into the OpenVibe network.')}</p>
            <div class="card-footer">
                <span class="meta-item">${escapeHtml(paste.image_url ? 'Preview available' : 'Text-first paste')}</span>
                <a class="link-inline" href="${escapeHtml(paste.route_url || LIVE_NETWORK_URLS.community)}">Open community →</a>
            </div>
        </article>`;
}

function renderSection({ id, title, subtitle, actionHref, actionLabel, content, emptyTitle, emptyBody, emptyHref, emptyLabel }) {
    return `
        <section class="section-panel" ${id ? `id="${escapeHtml(id)}"` : ''}>
            <div class="section-head">
                <div>
                    <h2 class="section-title">${escapeHtml(title)}</h2>
                    ${subtitle ? `<p class="section-subtitle">${escapeHtml(subtitle)}</p>` : ''}
                </div>
                ${actionHref && actionLabel ? `<a class="section-link" href="${actionHref}">${escapeHtml(actionLabel)}</a>` : ''}
            </div>
            ${content ? content : renderEmptyState(emptyTitle || title, emptyBody || 'Nothing to show yet.', emptyHref, emptyLabel)}
        </section>`;
}

function renderStatsStrip(stats) {
    const items = [
        { label: 'Live now', value: stats.live_now || 0, meta: 'active sessions', format: 'integer' },
        { label: 'Channels', value: stats.channels || 0, meta: 'creator routes', format: 'integer' },
        { label: 'Current viewers', value: stats.current_viewers || 0, meta: 'across live sessions', format: 'compact' },
        { label: 'Peak live viewers', value: stats.peak_live_viewers || 0, meta: 'sum of current live peaks', format: 'compact' },
        { label: 'Public VODs', value: stats.vods || 0, meta: 'canonical replay objects', format: 'integer' },
        { label: 'Public clips', value: stats.clips || 0, meta: 'canonical highlight objects', format: 'integer' },
    ];
    return `<div class="stat-grid">${items.map((item) => `
        <article class="stat-card" data-reveal>
            <div class="stat-label">${escapeHtml(item.label)}</div>
            <div class="stat-value">${escapeHtml(item.format === 'compact' ? formatCompactNumber(item.value) : formatNumber(item.value))}</div>
            <div class="stat-meta">${escapeHtml(item.meta)}</div>
        </article>
    `).join('')}</div>`;
}

function renderSignalCard({ eyebrow, title, body, meta, href }) {
    return `
        <article class="data-point">
            <div class="data-point-label">${escapeHtml(eyebrow || 'Signal')}</div>
            <div class="data-point-value" style="font-size:1rem; line-height:1.25;">
                ${href ? `<a class="link-inline" href="${href}">${escapeHtml(title || 'Untitled')}</a>` : escapeHtml(title || 'Untitled')}
            </div>
            ${body ? `<div class="subtle-copy" style="margin-top:0.35rem;">${escapeHtml(body)}</div>` : ''}
            ${meta ? `<div class="subtle-copy" style="margin-top:0.35rem;">${escapeHtml(meta)}</div>` : ''}
        </article>`;
}

function renderCollectionPage({ kind, title, description, emptyMessage, items, baseUrl }) {
    const pageContent = `
        <section class="hero-panel compact">
            <div class="hero-copy" data-reveal>
                <div class="eyebrow">${escapeHtml(kind === 'vods' ? 'Replay library' : 'Highlights library')}</div>
                <h1 class="hero-heading"><span class="hero-gradient">${escapeHtml(title)}</span></h1>
                <p>${escapeHtml(description)}</p>
                <div class="hero-actions">
                    <a class="button" href="/">Back to live discovery</a>
                    <a class="button-secondary" href="/channels">Browse channels</a>
                    <a class="button-ghost" href="/go-live">Go live on OpenVibe</a>
                </div>
            </div>
        </section>
        ${renderSection({
            title,
            subtitle: kind === 'vods'
                ? 'Replays stay first-class even when live sessions end.'
                : 'Fast highlights stay visible as clip metadata arrives.',
            content: items && items.length
                ? `<div>
                    <div class="search-bar">
                        <input class="filter-input" type="search" placeholder="Filter ${escapeHtml(kind)} by title, creator, or category" data-filter-input="${escapeHtml(kind)}">
                        <div class="directory-status" data-filter-status="${escapeHtml(kind)}">${escapeHtml(items.length)} total items</div>
                    </div>
                    <div class="collection-grid">${items.map((item, index) => renderStreamCard(item, null, baseUrl, {
                        badge: kind === 'vods' ? 'VOD' : 'CLIP',
                        badgeTone: kind === 'vods' ? 'success' : 'primary',
                        filterGroup: kind,
                        transitionDelay: index,
                    })).join('')}</div>
                </div>`
                : null,
            emptyTitle: kind === 'vods' ? 'No VODs staged yet' : 'No clips staged yet',
            emptyBody: emptyMessage,
            emptyHref: '/go-live',
            emptyLabel: 'Open go-live guide',
        })}
    `;
    return renderPage({
        title: pageTitle(title, 'openvibe.live'),
        description,
        canonical: `${baseUrl}/${kind}`,
        activeNav: kind,
        bodyHtml: pageContent,
        baseUrl,
    });
}

function renderChannelsPage({ channels, featuredChannels, categories, baseUrl }) {
    const pageContent = `
        <section class="hero-panel compact">
            <div class="hero-grid">
                <div class="hero-copy" data-reveal>
                    <div class="eyebrow">Creator directory</div>
                    <h1 class="hero-heading">Browse the <span class="hero-gradient">OpenVibe creator graph</span></h1>
                    <p>Channels are searchable, activity-aware, and linked directly into live sessions, recent broadcasts, VOD routes, and clip state.</p>
                    <div class="hero-actions">
                        <a class="button" href="/">Watch what is live</a>
                        <a class="button-secondary" href="/go-live">Set up your stream</a>
                    </div>
                </div>
                <div class="glass-card" data-reveal>
                    <div class="eyebrow">Featured now</div>
                    <div class="list-stack">${(featuredChannels || []).slice(0, 3).map((channel) => `
                        <div class="data-point">
                            <div class="data-point-label">${escapeHtml(channel.currentStream ? 'Live creator' : 'Creator to watch')}</div>
                            <div class="data-point-value"><a class="link-inline" href="${channelPath(channel.slug)}">${escapeHtml(channel.display_name || channel.slug)}</a></div>
                            <div class="subtle-copy">${escapeHtml(channel.currentStream ? (channel.currentStream.title || 'Live now') : ((channel.stats && channel.stats.last_activity_at) ? `Last active ${timeAgo(channel.stats.last_activity_at)}` : 'Waiting for next stream'))}</div>
                        </div>
                    `).join('')}</div>
                </div>
            </div>
            <div class="chip-cloud">
                ${(categories || []).map((category) => `<button class="category-chip" type="button" data-chip-target="[data-filter-input=channels]" data-chip-value="${escapeHtml(category.label)}">${escapeHtml(category.label)} · ${escapeHtml(category.count)}</button>`).join('')}
            </div>
        </section>
        ${renderSection({
            id: 'channels-directory',
            title: 'All channels',
            subtitle: 'Search by creator, category, or metadata already staged in the live graph.',
            content: channels && channels.length
                ? `<div>
                    <div class="search-bar">
                        <input class="filter-input" type="search" placeholder="Find a creator by name, handle, category, or tag" data-filter-input="channels">
                        <div class="directory-status" data-filter-status="channels">${escapeHtml(channels.length)} total channels</div>
                    </div>
                    <div class="channel-grid">${channels.map((channel) => renderChannelCard(channel, baseUrl, { filterGroup: 'channels' })).join('')}</div>
                </div>`
                : null,
            emptyTitle: 'No channels in the live graph yet',
            emptyBody: 'Channels appear here as they are mirrored into the live service or created natively through the wider OpenVibe platform.',
            emptyHref: '/go-live',
            emptyLabel: 'Learn how to go live',
        })}
    `;
    return renderPage({
        title: 'Channels — openvibe.live',
        description: 'Browse staged creators, live creators, and recent OpenVibe channels.',
        canonical: `${baseUrl}/channels`,
        activeNav: 'channels',
        bodyHtml: pageContent,
        baseUrl,
    });
}

function renderHomePage({ channels, featuredChannels, trendingNow, liveNow, recentlyEnded, recentlyOnlineChannels, recentVods, recentClips, categories, stats, community, chat, baseUrl }) {
    const channelMap = new Map((channels || []).map((channel) => [channel.slug, channel]));
    const communityData = community || {};
    const chatData = chat || {};
    const spotlightStream = (trendingNow && trendingNow[0]) || (liveNow && liveNow[0]) || (recentlyEnded && recentlyEnded[0]) || null;
    const spotlightChannel = spotlightStream ? channelMap.get(spotlightStream.channel_slug) : null;
    const heroFrames = collectHeroFrames({ trendingNow, liveNow, recentlyEnded, channelMap, baseUrl });
    const liveNowHtml = (liveNow || []).map((stream) => renderStreamCard(stream, channelMap.get(stream.channel_slug), baseUrl, { badge: 'Live now', badgeTone: 'live', filterGroup: 'home-live' })).join('');
    const featuredChannelsHtml = (featuredChannels || []).map((channel) => renderChannelCard(channel, baseUrl, { currentStream: channel.currentStream, previewStream: channel.currentStream || channel.recentStream || null, stats: channel.stats })).join('');
    const recentlyOnlineEntries = Array.isArray(recentlyOnlineChannels) && recentlyOnlineChannels.length
        ? recentlyOnlineChannels
        : (recentlyEnded || []).reduce((list, stream) => {
            if (!stream || !stream.channel_slug || list.some((entry) => entry.slug === stream.channel_slug)) return list;
            const channel = channelMap.get(stream.channel_slug);
            if (!channel) return list;
            list.push(Object.assign({}, channel, { recentStream: stream }));
            return list;
        }, []);
    const recentlyOnlineHtml = recentlyOnlineEntries.map((entry) => renderRecentlyOnlineChannelCard(entry, baseUrl)).join('');
    const recentVodsHtml = (recentVods || []).map((stream) => renderStreamCard(stream, channelMap.get(stream.channel_slug), baseUrl, { badge: 'VOD', badgeTone: 'success' })).join('');
    const recentClipsHtml = (recentClips || []).map((stream) => renderStreamCard(stream, channelMap.get(stream.channel_slug), baseUrl, { badge: 'Clip', badgeTone: 'primary' })).join('');
    const recentThreadsHtml = (communityData.recentThreads || []).slice(0, 4).map((thread) => renderSignalCard({
        eyebrow: thread.ref_type === 'discord_channel' ? 'Discord thread' : labelizeKey(thread.thread_type || 'discussion'),
        title: thread.title || thread.slug || 'Untitled thread',
        body: thread.ref_type === 'discord_channel'
            ? 'Relayed discussion ready for broader OpenVibe-native participation.'
            : 'Cross-service discussion surface prepared for live, VOD, clip, and creator context.',
        meta: `Last activity ${timeAgo(thread.last_activity_at)} · ${labelizeKey(thread.status || 'open')}`,
    })).join('');
    const recentPastesHtml = (communityData.recentPastes || []).slice(0, 10).map((paste) => renderPasteCard(paste, baseUrl)).join('');
    const relaySignalsHtml = (communityData.discordRelays || []).slice(0, 4).map((relay) => renderSignalCard({
        eyebrow: 'Discord relay',
        title: `#${relay.discord_channel_id}`,
        body: relay.openvibe_thread_id
            ? `Bound to thread ${relay.openvibe_thread_id}.`
            : 'Relay mapping is live and waiting for a linked thread.',
        meta: `${labelizeKey(relay.relay_direction)} · ${relay.enabled ? 'Enabled' : 'Disabled'}`,
    })).join('');
    const roomSignalsHtml = (chatData.publicRooms || []).slice(0, 4).map((room) => renderSignalCard({
        eyebrow: labelizeKey(room.room_type || 'room'),
        title: room.title || labelizeKey(room.external_ref_type || 'public room'),
        body: room.external_ref_id ? `Reference ${room.external_ref_id}` : 'Reusable conversation surface for live-adjacent chat.',
        meta: `Updated ${timeAgo(room.updated_at)}`,
    })).join('');
    const activeCallsHtml = (chatData.activeCalls || []).slice(0, 3).map((call) => renderSignalCard({
        eyebrow: 'Active call',
        title: `${labelizeKey(call.call_type)} ${labelizeKey(call.status)}`,
        body: `Room ${call.room_id}`,
        meta: `Started ${timeAgo(call.started_at)}`,
    })).join('');
    const featureCards = FEATURE_MATRIX.map((feature) => `
        <article class="glass-card" data-reveal>
            <div class="eyebrow">${escapeHtml(feature.eyebrow)}</div>
            <h3 class="card-title">${escapeHtml(feature.title)}</h3>
            <p class="card-body">${escapeHtml(feature.body)}</p>
        </article>
    `).join('');
    const liveSurfaceCards = LIVE_SURFACES.map((surface) => `
        <article class="glass-card" data-reveal>
            <div class="eyebrow">${escapeHtml(surface.label)}</div>
            <a class="card-link" href="${surface.href}"><h3 class="card-title">${escapeHtml(surface.title)}</h3></a>
            <p class="card-body">${escapeHtml(surface.body)}</p>
            <div class="card-footer">
                <span class="meta-item">live surface</span>
                <a class="link-inline" href="${surface.href}">Open →</a>
            </div>
        </article>
    `).join('');
    const networkCards = OPENVIBE_NETWORK_LINKS.map((surface) => `
        <article class="glass-card" data-reveal>
            <div class="eyebrow">${escapeHtml(surface.label)}</div>
            <a class="card-link" href="${surface.href}"><h3 class="card-title">${escapeHtml(surface.title)}</h3></a>
            <p class="card-body">${escapeHtml(surface.body)}</p>
            <div class="card-footer">
                <span class="meta-item">network surface</span>
                <a class="link-inline" href="${surface.href}">Open →</a>
            </div>
        </article>
    `).join('');
    const updatesHtml = BUILD_UPDATES.slice(0, 4).map((item) => `
        <article class="timeline-card" data-reveal data-update-id="${escapeHtml(item.id || `${item.date}-${item.title}`)}">
            <div class="eyebrow">${escapeHtml(item.date)}</div>
            <h3 class="card-title">${escapeHtml(item.title)}</h3>
            <p class="card-body">${escapeHtml(item.body)}</p>
            <div class="pill-row" style="margin-top:0.85rem;">
                <span class="pill primary update-badge">Unseen</span>
                <span class="pill soft">Shipping note</span>
            </div>
        </article>
    `).join('');
    const updatesSignature = BUILD_UPDATES.map((item) => item.id || `${item.date}:${item.title}`).join('|');
    const categoriesHtml = (categories || []).map((category) => `<button class="category-chip" type="button" data-chip-target="[data-filter-input=home-live]" data-chip-value="${escapeHtml(category.label)}">${escapeHtml(category.label)} · ${escapeHtml(category.count)}</button>`).join('');
    const heroSignalsHtml = [
        {
            eyebrow: 'Low latency first',
            title: 'Start fast, then graduate to openre.stream',
            body: 'Browser + WHIP quick-start paths stay up front, while OBS/RTMP and multi-destination routing push into openre.stream as the serious broadcast control plane.',
        },
        {
            eyebrow: 'After the stream',
            title: 'Clips, VODs, chat, and community stay on the same story arc',
            body: 'Viewers can slide from the live session into highlights, replays, threads, pastes, DMs, calls, and Discord-aware community surfaces without losing the creator thread.',
        },
        {
            eyebrow: 'Creator permanence',
            title: 'Canonical @handles, visible legal paths, and better platform memory',
            body: 'Routes, support links, DMCA reporting, and account-aware discovery stay visible instead of being buried behind a growth-loop UI maze.',
        },
    ].map((signal) => `
        <article class="glass-card hero-signal-card" data-reveal>
            <div class="eyebrow">${escapeHtml(signal.eyebrow)}</div>
            <h3 class="card-title">${escapeHtml(signal.title)}</h3>
            <p class="card-body">${escapeHtml(signal.body)}</p>
        </article>
    `).join('');
    const heroStageHtml = heroFrames.length ? `
        <div class="hero-stage" data-hero-stage aria-hidden="true">
            ${heroFrames.map((frame, index) => `
                <div class="hero-frame${index === 0 ? ' is-active' : ''}" data-hero-frame style="background-image:url('${escapeHtml(frame.url)}')">
                    <div class="hero-stage-copy">
                        <span class="pill ${index === 0 ? 'live' : 'soft'}">${escapeHtml(frame.eyebrow)}</span>
                        <strong>${escapeHtml(frame.title)}</strong>
                        <span>${escapeHtml(frame.subtitle)}</span>
                    </div>
                </div>
            `).join('')}
        </div>` : '';
    const pageContent = `
        <section class="hero-panel live-home-hero" data-shell-marker="openvibe.live — native fallback shell">
            ${heroStageHtml}
            <div class="hero-grid">
                <div class="hero-copy" data-reveal>
                    <div class="eyebrow">Native streaming discovery</div>
                    <h1 class="hero-heading">OpenVibe Live for <span class="hero-gradient hero-rotator" data-rotating-words="builders|makers|communities|multi-stream creators"></span></h1>
                    <p>Discover what is live, who just wrapped a session, which creators are active, and which adjacent community/chat surfaces are already awake — all without falling back to a legacy UI shell or a vibes-only broadcast stack.</p>
                    <div class="hero-actions">
                        <a class="button" href="#live-now">Watch live now</a>
                        <a class="button-secondary" href="${LIVE_NETWORK_URLS.restream}">Open openre.stream</a>
                        <a class="button-ghost" href="/go-live">Set up your stream</a>
                    </div>
                    <p class="hero-note">Fresh now: animated live-frame hero transitions, live-now immediately under the fold, creator recap cards with total live time, clipped highlights ahead of VODs, and a recent-changes feed that stays visibly unread until you clear it.</p>
                </div>
                <div class="hero-aside-stack">
                    <aside class="hero-spotlight glass-card" data-reveal>
                        <div class="eyebrow">Spotlight</div>
                        ${spotlightStream
                            ? `${renderMediaThumb({
                                url: spotlightStream.thumbnail_url || (spotlightChannel && spotlightChannel.avatar_url) || null,
                                title: spotlightStream.title || 'Untitled stream',
                                eyebrow: spotlightStream.is_live ? 'Trending live' : 'Recent highlight',
                                subtitle: spotlightChannel ? (spotlightChannel.display_name || spotlightChannel.slug) : (spotlightStream.channel_slug || 'openvibe'),
                                initials: initialsFrom(spotlightStream.channel_slug || 'OV'),
                                baseUrl,
                            })}
                            <div class="pill-row">
                                ${renderPill(spotlightStream.is_live ? 'Live now' : 'Recent session', spotlightStream.is_live ? 'live' : 'soft')}
                                ${renderPill(`${formatCompactNumber(spotlightStream.peak_viewers || 0)} peak`, 'primary')}
                                ${spotlightStream.category ? renderPill(spotlightStream.category, 'muted') : ''}
                            </div>
                            <h2 class="spotlight-title"><a href="${streamPath(spotlightStream.channel_slug, spotlightStream.id)}">${escapeHtml(spotlightStream.title || 'Untitled stream')}</a></h2>
                            <p class="spotlight-copy">By <a class="link-inline" href="${channelPath(spotlightStream.channel_slug)}">${escapeHtml((spotlightChannel && (spotlightChannel.display_name || spotlightChannel.slug)) || spotlightStream.channel_slug || 'unknown')}</a> · ${escapeHtml(spotlightStream.is_live ? `${formatCompactNumber(spotlightStream.viewer_count || 0)} currently watching` : `Last active ${timeAgo(spotlightStream.ended_at || spotlightStream.started_at)}`)}</p>
                            <div class="card-footer">
                                <span class="meta-item">${escapeHtml(formatDateTime(spotlightStream.started_at || spotlightStream.ended_at || spotlightStream.updated_at))}</span>
                                <a class="link-inline" href="${streamPath(spotlightStream.channel_slug, spotlightStream.id)}">Watch stream →</a>
                            </div>`
                            : renderEmptyState('No spotlight stream yet', 'As live and recent broadcasts arrive, this panel automatically highlights the most relevant session.', '/go-live', 'Open go-live guide')}
                    </aside>
                    <article class="glass-card" data-reveal>
                        <div class="eyebrow">Low-latency route</div>
                        <h3 class="card-title">Keep <a class="link-inline" href="${LIVE_NETWORK_URLS.restream}">openre.stream</a> obvious</h3>
                        <p class="card-body">Use openvibe.live for discovery, canonical creator routing, clips, and VOD visibility. Use openre.stream when you need ingest control, multi-destination restreaming, and a stronger operational cockpit.</p>
                        <div class="pill-row" style="margin-top:0.9rem;">
                            ${renderPill('Discovery on openvibe.live', 'soft')}
                            ${renderPill('Routing on openre.stream', 'warn')}
                        </div>
                    </article>
                </div>
            </div>
            <div class="hero-signal-rail">${heroSignalsHtml}</div>
            ${renderStatsStrip(stats || {})}
        </section>

        ${renderSection({
            id: 'live-now',
            title: 'Live now',
            subtitle: 'Current broadcasts mirrored into openvibe.live with viewer and peak context, directly after the hero where they belong.',
            actionHref: '/channels',
            actionLabel: 'Browse all channels',
            content: liveNowHtml
                ? `<div>
                    <div class="search-bar">
                        <input class="filter-input" type="search" placeholder="Filter live streams by creator, title, or category" data-filter-input="home-live">
                        <div class="directory-status" data-filter-status="home-live">${escapeHtml((liveNow || []).length)} live items</div>
                    </div>
                    <div class="card-grid">${liveNowHtml}</div>
                </div>`
                : null,
            emptyTitle: 'No one is live right now',
            emptyBody: 'The live stage is ready. When the next session starts, it appears here automatically with channel and stream routes.',
            emptyHref: '/go-live',
            emptyLabel: 'Be the first to go live',
        })}

        <section class="section-panel" data-reveal>
            <div class="section-head">
                <div>
                    <h2 class="section-title">Category pulse</h2>
                    <p class="section-subtitle">Use the current live graph to pivot quickly into the kinds of broadcasts you want to watch or build.</p>
                </div>
            </div>
            <div class="chip-cloud">${categoriesHtml || '<span class="muted-text">No categories are staged yet.</span>'}</div>
        </section>

        ${renderSection({
            title: 'Recently online creators',
            subtitle: 'Catch creators who just wrapped a stream, complete with thumbnails, total live time, and replay/hightlight hints.',
            actionHref: '/channels',
            actionLabel: 'Browse creators',
            content: recentlyOnlineHtml ? `<div class="channel-grid">${recentlyOnlineHtml}</div>` : null,
            emptyTitle: 'No creators have wrapped a stream yet',
            emptyBody: 'As soon as creators finish their first broadcasts, they show up here with richer recap cards instead of a flat list of ended sessions.',
            emptyHref: '/channels',
            emptyLabel: 'Browse creators',
        })}

        ${renderSection({
            title: 'Recent clips',
            subtitle: 'Highlights stay explicit and ready once canonical clip media is staged.',
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
            subtitle: 'Canonical replay media keeps the HoboStreamer-style home feed alive on the new network.',
            actionHref: '/vods',
            actionLabel: 'Open VOD library',
            content: recentVodsHtml ? `<div class="card-grid">${recentVodsHtml}</div>` : null,
            emptyTitle: 'No public VOD objects yet',
            emptyBody: 'When replay media is staged in canonical storage, VOD cards appear here and in the dedicated VOD route.',
            emptyHref: '/vods',
            emptyLabel: 'Open the VOD route',
        })}

        ${renderSection({
            title: 'Recent pastes',
            subtitle: 'Screenshots, snippets, notes, and logs from the canonical OpenVibe community surface.',
            actionHref: LIVE_NETWORK_URLS.community,
            actionLabel: 'Open community',
            content: recentPastesHtml ? `<div class="card-grid">${recentPastesHtml}</div>` : null,
            emptyTitle: 'No public pastes yet',
            emptyBody: 'Once public pastes are staged in openvibe.community, they appear here right alongside live, clips, and VODs.',
            emptyHref: LIVE_NETWORK_URLS.community,
            emptyLabel: 'Open community',
        })}

        ${renderSection({
            title: 'Featured creators',
            subtitle: 'Channels are ranked using live state, recent activity, and current viewer momentum.',
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
                    <p class="section-subtitle">Recent threads, Discord relay readiness, and chat/call activity from the canonical OpenVibe community and chat services.</p>
                </div>
                <div class="inline-actions">
                    <a class="section-link" href="${LIVE_NETWORK_URLS.community}">Open community</a>
                    <a class="section-link" href="${LIVE_NETWORK_URLS.chat}">Open chat</a>
                </div>
            </div>
            <div class="story-grid">
                <article class="glass-card" data-reveal>
                    <div class="eyebrow">Threads</div>
                    <div class="list-stack">
                        <div>
                            <h3 class="card-title">Recent discussions</h3>
                            <div class="data-points" style="margin-top:0.85rem;">
                                ${recentThreadsHtml || renderSignalCard({ eyebrow: 'Community', title: 'Threads will show up here', body: 'Once openvibe.community threads begin filling with creator and stream-linked discussion, this panel will surface them automatically.', meta: 'No public threads yet' })}
                            </div>
                        </div>
                    </div>
                </article>
                <article class="glass-card" data-reveal>
                    <div class="eyebrow">Discord and chat</div>
                    <div class="list-stack">
                        <div>
                            <h3 class="card-title">Relay readiness</h3>
                            <div class="data-points" style="margin-top:0.85rem;">
                                ${relaySignalsHtml || renderSignalCard({ eyebrow: 'Discord relay', title: 'Relay mappings will surface here', body: 'OpenVibe Community already has relay tables and loop-prevention plumbing; this panel highlights the current read-only state.', meta: 'No enabled relay mappings yet' })}
                            </div>
                        </div>
                        <div>
                            <h3 class="card-title">Conversation surfaces</h3>
                            <div class="data-points" style="margin-top:0.85rem;">
                                ${roomSignalsHtml || renderSignalCard({ eyebrow: 'Chat room', title: 'Public rooms will surface here', body: 'OpenVibe Chat already exposes reusable room, DM, call, and TTS primitives ready for deeper live integration.', meta: 'No public rooms yet' })}
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
                    <h2 class="section-title">Go live however you want</h2>
                    <p class="section-subtitle">The product should make the broadcast path obvious, flexible, non-mysterious, and connected to openre.stream when you need a stronger control plane.</p>
                </div>
                <a class="section-link" href="/go-live">Open full guide</a>
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

        <section class="section-panel">
            <div class="section-head">
                <div>
                    <h2 class="section-title">Explore OpenVibe</h2>
                    <p class="section-subtitle">Live is only one surface. The broader platform fills in identity, chat, community, media, themes, and restream control without fragmenting the creator story.</p>
                </div>
            </div>
            <div class="story-grid">
                <article class="glass-card" data-reveal>
                    <div class="eyebrow">Live surfaces</div>
                    <div class="surface-grid">${liveSurfaceCards}</div>
                </article>
                <article class="glass-card" data-reveal>
                    <div class="eyebrow">Connected network</div>
                    <div class="surface-grid">${networkCards}</div>
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
                    <p class="section-subtitle">This is meant to feel like a real exit from ad-first platform design: calmer discovery, portable identity, visible legal/reporting paths, and a platform that can be stewarded openly.</p>
                </div>
            </div>
            <div class="story-grid">
                <article class="glass-card" data-reveal>
                    <div class="eyebrow">Origin story</div>
                    <p class="body-copy">OpenVibe is being built for creators and communities who want out of opaque recommendation loops, missing support links, and growth-at-all-costs product decisions. The goal is practical: give creators canonical identities, better control of their routing stack, and platform services they can actually understand.</p>
                    <div class="data-points">
                        <div class="data-point">
                            <div class="data-point-label">Creator routes</div>
                            <div class="data-point-value">${escapeHtml(formatNumber((stats && stats.channels) || 0))}</div>
                        </div>
                        <div class="data-point">
                            <div class="data-point-label">Mirrored stream time</div>
                            <div class="data-point-value">${escapeHtml(formatDurationSeconds((stats && stats.stream_time_seconds) || 0))}</div>
                        </div>
                        <div class="data-point">
                            <div class="data-point-label">Direction</div>
                            <div class="data-point-value">Not-for-profit minded</div>
                        </div>
                    </div>
                </article>
                <article class="glass-card" data-reveal>
                    <div class="eyebrow">Promises we want to keep</div>
                    <ul class="flow-list">
                        ${MISSION_PILLARS.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
                    </ul>
                    <div class="button-row" style="margin-top:1rem;">
                        <a class="button-secondary" href="https://github.com/openvibe">GitHub</a>
                        <a class="button-ghost" href="/tos">Terms</a>
                        <a class="button-ghost" href="/dmca">DMCA</a>
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
    const slug = channel ? channel.slug : (stream.channel_slug || 'unknown');
    const channelName = channel ? (channel.display_name || slug) : slug;
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
                <p>By <a class="link-inline" href="${channelPath(slug)}">${escapeHtml(channelName)}</a> · ${escapeHtml(stream.category || 'uncategorized')} · ${escapeHtml(isLive ? `${formatCompactNumber(stream.viewer_count || 0)} watching right now` : `Peak ${formatCompactNumber(stream.peak_viewers || 0)} viewers`)}</p>
                <div class="hero-actions">
                    <a class="button" href="${channelPath(slug)}">Back to channel</a>
                    <a class="button-secondary" href="/vods?channel=${encodeURIComponent(slug)}">Channel VODs</a>
                    <a class="button-ghost" href="/clips?channel=${encodeURIComponent(slug)}">Channel clips</a>
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
                        ${stream.source === 'hobostreamer' ? renderPill('Migrated session', 'warn') : renderPill('Native session', 'success')}
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
            emptyHref: channelPath(slug),
            emptyLabel: 'Open channel page',
        })}
    `;
    return renderPage({
        title,
        description,
        canonical: `${baseUrl}${streamPath(slug, stream.id)}`,
        ogType: isLive ? 'video.other' : 'video.movie',
        ogImage,
        activeNav: 'channels',
        bodyHtml: pageContent,
        baseUrl,
    });
}

function renderMediaDetailPage({ item, channel, baseUrl }) {
    const kind = item && item.kind === 'clip' ? 'clip' : 'vod';
    const kindLabel = kind === 'clip' ? 'Clip' : 'VOD';
    const slug = item.channel_slug || (channel && channel.slug) || 'unknown';
    const channelName = item.channel_name || (channel && (channel.display_name || channel.slug)) || slug;
    const title = `${item.title || `Untitled ${kindLabel}` } — ${channelName} — openvibe.live`;
    const description = item.description
        || `${kindLabel} from ${channelName} on openvibe.live, backed by canonical OpenVibe media storage.`;
    const canonicalId = encodeURIComponent(item.legacy_id || item.id);
    const canonical = `${baseUrl}/${kind}/${canonicalId}`;
    const ogImage = absoluteUrl(item.thumbnail_url || (channel && channel.avatar_url) || '', baseUrl) || null;
    const playbackHref = item.player_playback_url || item.playback_url || null;
    const playbackSummary = item.playback_ready
        ? (item.playback_note || 'This media object is already staged and can be played directly through the canonical OpenVibe media service.')
        : 'The metadata is present, but the backing bytes or playback state are still being finalized. The page stays honest instead of pretending the file is ready.';
    const playbackHeroCopy = item.playback_ready
        ? (item.playback_mode === 'file-direct-oversize'
            ? 'Playback is ready through direct OpenVibe file delivery.'
            : 'Playback is ready through openvibe.media.')
        : `Playback status is currently ${labelizeKey(item.status || 'staged')}.`;
    const playbackStage = item.playback_ready && item.playback_url
        ? renderCustomMediaPlayer({
            title: item.title || `Untitled ${kindLabel}`,
            playbackUrl: item.playback_url,
            posterUrl: ogImage || '',
            mimeType: item.playback_mime_type || item.mime_type || '',
            statusText: item.playback_note || 'Ready to play',
        })
        : renderMediaThumb({
            url: item.thumbnail_url || (channel && channel.avatar_url) || null,
            title: item.title || `Untitled ${kindLabel}`,
            eyebrow: kindLabel,
            subtitle: channelName,
            initials: initialsFrom(channelName),
            baseUrl,
        });
    const pageContent = `
        <section class="hero-panel compact">
            <div class="hero-copy" data-reveal>
                <div class="eyebrow">Canonical ${escapeHtml(kindLabel)}</div>
                <h1 class="hero-heading" style="max-width:12ch"><span class="hero-gradient">${escapeHtml(item.title || `Untitled ${kindLabel}`)}</span></h1>
                <p>From ${slug && slug !== 'unknown' ? `<a class="link-inline" href="${channelPath(slug)}">${escapeHtml(channelName)}</a>` : escapeHtml(channelName)} · ${escapeHtml(playbackHeroCopy)}</p>
                <div class="hero-actions">
                    ${slug && slug !== 'unknown' ? `<a class="button" href="${channelPath(slug)}">Open creator channel</a>` : `<a class="button" href="/channels">Browse creators</a>`}
                    <a class="button-secondary" href="/${kind === 'clip' ? 'clips' : 'vods'}${slug && slug !== 'unknown' ? `?channel=${encodeURIComponent(slug)}` : ''}">Browse more ${escapeHtml(kind === 'clip' ? 'clips' : 'VODs')}</a>
                    <a class="button-ghost" href="/">Back to live home</a>
                </div>
            </div>
        </section>

        <section class="section-panel">
            <div class="split-grid">
                <article class="glass-card media-stage" data-reveal>
                    ${playbackStage}
                    <div class="pill-row">
                        ${renderPill(kindLabel, kind === 'clip' ? 'primary' : 'success')}
                        ${renderPill(item.playback_ready ? 'Playback ready' : labelizeKey(item.status || 'staged'), item.playback_ready ? 'success' : 'warn')}
                        ${item.category ? renderPill(item.category, 'muted') : ''}
                        ${item.playback_mode === 'file-direct-oversize' ? renderPill('Direct file delivery', 'warn') : ''}
                        ${item.source === 'hobostreamer' ? renderPill('Migrated from HoboStreamer', 'warn') : renderPill('Native OpenVibe media', 'soft')}
                    </div>
                    <p class="card-body">${escapeHtml(playbackSummary)}</p>
                </article>
                <aside class="list-stack">
                    <article class="glass-card" data-reveal>
                        <div class="eyebrow">Media details</div>
                        <div class="data-points">
                            <div class="data-point"><div class="data-point-label">Views</div><div class="data-point-value">${escapeHtml(formatNumber(item.view_count || 0))}</div></div>
                            <div class="data-point"><div class="data-point-label">Duration</div><div class="data-point-value">${escapeHtml(item.duration_seconds ? formatDurationSeconds(item.duration_seconds) : 'Unknown')}</div></div>
                            <div class="data-point"><div class="data-point-label">Status</div><div class="data-point-value">${escapeHtml(labelizeKey(item.status || 'staged'))}</div></div>
                            <div class="data-point"><div class="data-point-label">Created</div><div class="data-point-value">${escapeHtml(formatDateTime(item.created_at || item.updated_at))}</div></div>
                        </div>
                    </article>
                    <article class="glass-card" data-reveal>
                        <div class="eyebrow">Canonical links</div>
                        <ul class="flow-list">
                            <li>Media ID: <code>${escapeHtml(item.id)}</code></li>
                            <li>Route ID: <code>${escapeHtml(item.legacy_id || item.id)}</code></li>
                            <li>Creator route: ${slug && slug !== 'unknown' ? `<a class="link-inline" href="${channelPath(slug)}">@${escapeHtml(slug)}</a>` : 'unbound'}</li>
                            <li>Player source: ${item.playback_ready && playbackHref ? `<a class="link-inline" href="${escapeHtml(playbackHref)}">openvibe.media playback</a>` : 'not ready yet'}</li>
                            ${item.playback_api_url ? `<li>Playback API: ${item.playback_api_ready ? `<a class="link-inline" href="${escapeHtml(item.playback_api_url)}">redirect-enabled playback</a>` : 'size-limited or not yet ready for redirect playback'}</li>` : ''}
                            ${item.playback_mime_type ? `<li>Detected type: <code>${escapeHtml(item.playback_mime_type)}</code></li>` : ''}
                        </ul>
                    </article>
                </aside>
            </div>
        </section>`;
    return renderPage({
        title,
        description,
        canonical,
        ogType: 'video.other',
        ogImage,
        activeNav: kind === 'clip' ? 'clips' : 'vods',
        bodyHtml: pageContent,
        baseUrl,
    });
}

function renderCustomMediaPlayer({ title, playbackUrl, posterUrl, mimeType, statusText }) {
    return `
        <div class="ov-media-player" data-ov-player>
            <video controls playsinline preload="metadata" poster="${escapeHtml(posterUrl || '')}" aria-label="${escapeHtml(title || 'OpenVibe media playback')}">
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
            <div class="ov-player-status" data-player-status role="status" aria-live="polite">${escapeHtml(statusText || 'Ready to play')}</div>
        </div>`;
}

function renderGoLivePage({ baseUrl }) {
    const tracksHtml = GO_LIVE_TRACKS.map((track) => `
        <article class="glass-card" data-reveal>
            <div class="eyebrow">${escapeHtml(track.label)}</div>
            <h3 class="card-title">${escapeHtml(track.title)}</h3>
            <p class="card-body">${escapeHtml(track.body)}</p>
            <div class="card-kicker">${escapeHtml(track.meta)}</div>
        </article>
    `).join('');
    const pageContent = `
        <section class="hero-panel compact">
            <div class="hero-copy" data-reveal>
                <div class="eyebrow">Broadcast guide</div>
                <h1 class="hero-heading">Go live on <span class="hero-gradient">OpenVibe</span></h1>
                <p>OpenVibe Live keeps the broadcast path explicit: start quickly in-browser, use a studio route like OBS/RTMP, adopt WHIP where available, or hand the heavier multi-destination and ingest-control work to <a class="link-inline" href="${LIVE_NETWORK_URLS.restream}">openre.stream</a> without hiding your canonical creator route.</p>
                <div class="hero-actions">
                    <a class="button" href="/channels">Browse channels first</a>
                    <a class="button-secondary" href="${LIVE_NETWORK_URLS.restream}">Open openre.stream</a>
                    <a class="button-secondary" href="/updates">See recent product work</a>
                    <a class="button-ghost" href="/">Back to live discovery</a>
                </div>
            </div>
        </section>
        ${renderSection({
            title: 'Broadcast tracks',
            subtitle: 'Choose the publishing style that matches your setup today.',
            content: `<div class="feature-grid">${tracksHtml}</div>`,
        })}
        ${renderSection({
            title: 'Practical rollout sequence',
            subtitle: 'A clean, low-friction path for creators and operators.',
            content: `
                <div class="story-grid">
                    <article class="glass-card" data-reveal>
                        <div class="eyebrow">Streamer flow</div>
                        <ol class="flow-list">
                            <li>Claim or verify the creator account and channel identity.</li>
                            <li>Choose a broadcast path: browser, OBS/RTMP, WHIP, or restream.</li>
                            <li>Go live and let the session mirror into the canonical OpenVibe live graph.</li>
                            <li>Use the live, VOD, and clip routes to keep discovery flowing after the stream ends.</li>
                        </ol>
                    </article>
                    <article class="glass-card" data-reveal>
                        <div class="eyebrow">Operator truth</div>
                        <p class="card-body">The live surface is intentionally honest about what is already connected. It will show live sessions, recent broadcasts, viewer counts, VOD linkage, and clip state when those facts exist — and clean empty states when they do not.</p>
                    </article>
                </div>`,
        })}
        ${renderSection({
            title: 'Where openre.stream fits',
            subtitle: 'Separate the stream-routing control plane from the discovery layer without fragmenting creator identity.',
            content: `
                <div class="story-grid">
                    <article class="glass-card" data-reveal>
                        <div class="eyebrow">Control plane</div>
                        <p class="card-body">Use openre.stream when you need ingest orchestration, multi-destination restreaming, or a dedicated operator workflow. Let openvibe.live stay focused on discovery, channel identity, and replay/highlight visibility.</p>
                        <ul class="flow-list">
                            <li>Keep the creator’s canonical public route on <code>openvibe.live</code>.</li>
                            <li>Use <code>openre.stream</code> for the routing and publishing complexity.</li>
                            <li>Mirror the resulting session back into the live graph so clips, VODs, and discovery continue from one source of truth.</li>
                        </ul>
                    </article>
                    <article class="glass-card" data-reveal>
                        <div class="eyebrow">Why split it</div>
                        <div class="data-points">
                            <div class="data-point">
                                <div class="data-point-label">Discovery</div>
                                <div class="data-point-value">openvibe.live</div>
                            </div>
                            <div class="data-point">
                                <div class="data-point-label">Routing</div>
                                <div class="data-point-value">openre.stream</div>
                            </div>
                            <div class="data-point">
                                <div class="data-point-label">Conversation</div>
                                <div class="data-point-value">openvibe.chat</div>
                            </div>
                        </div>
                    </article>
                </div>`,
        })}
    `;
    return renderPage({
        title: 'Go live — openvibe.live',
        description: 'OpenVibe Live broadcasting guide for browser, OBS, RTMP, WHIP, and restream workflows.',
        canonical: `${baseUrl}/go-live`,
        activeNav: 'go-live',
        bodyHtml: pageContent,
        baseUrl,
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
