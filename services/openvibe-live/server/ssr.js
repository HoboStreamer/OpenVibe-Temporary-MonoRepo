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
            min-height: 220px;
            background:
                radial-gradient(circle at top left, rgba(139, 92, 246, 0.42), transparent 40%),
                linear-gradient(135deg, rgba(14, 23, 46, 0.96), rgba(8, 13, 28, 0.96));
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
            .topbar-inner { flex-wrap: wrap; justify-content: center; }
            .nav-links { justify-content: center; }
            .nav-account { justify-content: center; width: 100%; }
        }
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
                        <h2 class="footer-title" style="margin:0 0 0.55rem">Watch live, rewind fast, clip the good parts, and keep the creator route intact.</h2>
                        <p class="footer-copy">OpenVibe Live is being built to feel more like old-school creator web: clear channel routes, obvious community links, visible reporting paths, and a platform that does not hide how it works.</p>
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
                    <p class="footer-copy" style="margin:0">OpenVibe Live shows what the network can actually prove right now: live sessions, recent activity, creator routes, replay links, and the nearby chat and community surfaces that already exist.</p>
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
    const signInHref = `/auth/login?return_to=${encodeURIComponent(canonical || `${baseUrl || ''}/`)}`;
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
            <main class="page-shell">
                ${bodyHtml}
            </main>
            ${renderFooter(baseUrl)}
            <script src="/assets/openvibe.js?v=20260503-1"></script>
            <script src="/assets/live-dashboard-local.js?v=20260504-1"></script>
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
    const slug = normalizeCreatorSlug(stream.channel_slug || (channel && channel.slug));
    const channelName = stream.channel_name || (channel && (channel.display_name || channel.slug)) || slug || 'Creator';
    const isReplayMedia = stream.kind === 'vod' || stream.kind === 'clip';
    const href = stream.route_url || (slug ? streamPath(slug, stream.id) : '/channels');
    const audiencePill = stream.is_live
        ? renderPill(`${formatCompactNumber(stream.viewer_count || 0)} watching`, 'live')
        : (isReplayMedia
            ? renderPill(`${formatCompactNumber(stream.view_count || 0)} views`, 'soft')
            : renderPill(`Peak ${formatCompactNumber(stream.peak_viewers || 0)}`, 'soft'));
    const tags = [
        opts.badge ? renderPill(opts.badge, opts.badgeTone || 'primary') : '',
        audiencePill,
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
                                ${relaySignalsHtml || renderSignalCard({ eyebrow: 'Discord relay', title: 'Relay mappings will surface here', body: 'OpenVibe Community already has relay tables and loop-prevention plumbing; this panel shows when they are active.', meta: 'No enabled relay mappings yet' })}
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

function renderMediaDetailPage({ item, channel, baseUrl }) {
    const kind = item && item.kind === 'clip' ? 'clip' : 'vod';
    const kindLabel = kind === 'clip' ? 'Clip' : 'VOD';
    const slug = normalizeCreatorSlug(item.channel_slug || (channel && channel.slug));
    const channelName = item.channel_name || (channel && (channel.display_name || channel.slug)) || slug || 'Creator';
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

function renderSection({ title, subtitle, actionHref, actionLabel, content, emptyTitle, emptyBody, emptyHref, emptyLabel }) {
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
    return `
        <section class="section-panel">
            <div class="section-head">
                <div>
                    <h2 class="section-title">${escapeHtml(title || 'Section')}</h2>
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
    const descriptorBits = [
        `@${slug}`,
        channel.category || null,
        previewStream && previewStream.category ? previewStream.category : null,
    ].filter(Boolean);
    const statsBits = [];
    if (stats) {
        statsBits.push(`${formatNumber(stats.total_streams || 0)} stream${Number(stats.total_streams || 0) === 1 ? '' : 's'}`);
        if (stats.vods) statsBits.push(`${formatNumber(stats.vods)} VOD${Number(stats.vods) === 1 ? '' : 's'}`);
        if (stats.clips) statsBits.push(`${formatNumber(stats.clips)} clip${Number(stats.clips) === 1 ? '' : 's'}`);
    }
    const filterText = `${displayName} ${slug} ${descriptorBits.join(' ')} ${statsBits.join(' ')}`.toLowerCase();
    return `
        <article class="glass-card is-inline" data-reveal data-filter-group="${escapeHtml(opts.filterGroup || '')}" data-filter-text="${escapeHtml(filterText)}">
            ${renderMediaThumb({
                url: (previewStream && previewStream.thumbnail_url) || channel.avatar_url || null,
                title: (previewStream && previewStream.title) || `${displayName} channel`,
                eyebrow: currentStream ? 'Live creator' : (previewStream ? 'Recent creator' : 'Creator route'),
                subtitle: displayName,
                initials: initialsFrom(displayName),
                baseUrl,
            })}
            <div class="pill-row">
                ${currentStream ? renderPill('Live now', 'live') : renderPill('Offline', 'muted')}
                ${channel.category ? renderPill(channel.category, 'primary') : ''}
                ${previewStream && previewStream.category ? renderPill(previewStream.category, 'soft') : ''}
            </div>
            <a class="card-link" href="${channelPath(slug)}"><h3 class="card-title">${escapeHtml(displayName)}</h3></a>
            <div class="card-kicker">@${escapeHtml(slug)}${descriptorBits.length > 1 ? ` · ${escapeHtml(descriptorBits.slice(1).join(' · '))}` : ''}</div>
            <p class="card-body">${escapeHtml(channel.description || (previewStream ? `Latest stream: ${previewStream.title || 'Untitled stream'}` : 'Creator route ready for live sessions, VODs, and clips.'))}</p>
            <div class="card-footer">
                <span class="meta-item">${escapeHtml(statsBits.join(' · ') || (previewStream && previewStream.started_at ? `Last active ${timeAgo(previewStream.started_at)}` : 'Waiting for the next stream'))}</span>
                <a class="link-inline" href="${channelPath(slug)}">Open creator →</a>
            </div>
        </article>`;
}

function renderHomePage({ channels, featuredChannels, trendingNow, liveNow, recentlyEnded, recentlyOnlineChannels, recentVods, recentClips, categories, stats, community, chat, baseUrl }) {
    const liveNowHtml = (liveNow || []).slice(0, 6).map((stream) => renderStreamCard(stream, null, baseUrl, { badge: 'Live now', badgeTone: 'live' })).join('');
    const recentVodsHtml = (recentVods || []).slice(0, 6).map((item) => renderStreamCard(item, null, baseUrl, { badge: 'VOD', badgeTone: 'success' })).join('');
    const recentClipsHtml = (recentClips || []).slice(0, 6).map((item) => renderStreamCard(item, null, baseUrl, { badge: 'Clip', badgeTone: 'primary' })).join('');
    const featuredChannelsHtml = (featuredChannels || []).slice(0, 6).map((channel) => renderChannelCard(channel, baseUrl, { stats: channel.stats, previewStream: channel.recentStream, currentStream: channel.currentStream })).join('');
    const recentThreadsHtml = (((community && community.recentThreads) || []).slice(0, 4)).map((thread) => renderSignalCard({
        eyebrow: 'Thread',
        title: thread.title || 'Untitled thread',
        body: thread.preview_text || thread.body || 'Recent thread activity.',
        meta: thread.created_at ? timeAgo(thread.created_at) : '',
        href: thread.route_url || LIVE_NETWORK_URLS.community,
    })).join('');
    const recentPastesHtml = (((community && community.recentPastes) || []).slice(0, 4)).map((paste) => renderSignalCard({
        eyebrow: paste.kind || 'Paste',
        title: paste.title || paste.slug || 'Untitled paste',
        body: paste.preview_text || paste.body || 'Open on openvibe.community.',
        meta: `${timeAgo(paste.created_at)}${paste.view_count ? ` · ${formatNumber(paste.view_count)} views` : ''}`,
        href: paste.route_url || LIVE_NETWORK_URLS.community,
    })).join('');
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
                <div class="form-actions" style="margin-top:1.1rem;">
                    <a class="button" href="/go-live">Go live</a>
                    <a class="button-secondary" href="/channels">Browse channels</a>
                    <a class="button-ghost" href="${LIVE_NETWORK_URLS.restream}">Restream control room</a>
                </div>
            </div>
        </section>

        ${liveNowHtml ? `
        <section class="section-panel">
            <div class="section-head">
                <div>
                    <h2 class="section-title">Live now</h2>
                    <p class="section-subtitle">${liveCount} channel${liveCount === 1 ? '' : 's'} broadcasting right now.</p>
                </div>
                <a class="section-link" href="/channels">All channels →</a>
            </div>
            <div class="search-bar">
                <input id="live-home-filter" class="filter-input" type="search" placeholder="Filter streams, VODs, clips" data-filter-input="home-media" aria-label="Filter home media">
                ${categoryChips}
            </div>
            <div class="card-grid">${liveNowHtml}</div>
        </section>
        ` : `
        <section class="section-panel">
            <div class="section-head">
                <div>
                    <h2 class="section-title">Live now</h2>
                    <p class="section-subtitle">Nobody is broadcasting at the moment.</p>
                </div>
                <a class="section-link" href="/go-live">Go live →</a>
            </div>
            <div class="search-bar">
                <input id="live-home-filter" class="filter-input" type="search" placeholder="Filter VODs and clips" data-filter-input="home-media" aria-label="Filter home media">
                ${categoryChips}
            </div>
        </section>
        `}

        <section class="section-panel">
            <div class="data-points">
                <div class="data-point"><div class="data-point-label">Live now</div><div class="data-point-value">${escapeHtml(String(liveCount))}</div></div>
                <div class="data-point"><div class="data-point-label">Channels</div><div class="data-point-value">${escapeHtml(formatNumber(channelCount))}</div></div>
                ${totalViewers ? `<div class="data-point"><div class="data-point-label">Watching</div><div class="data-point-value">${escapeHtml(formatCompactNumber(totalViewers))}</div></div>` : ''}
                ${peakViewers ? `<div class="data-point"><div class="data-point-label">Peak viewers</div><div class="data-point-value">${escapeHtml(formatCompactNumber(peakViewers))}</div></div>` : ''}
                <div class="data-point"><div class="data-point-label">VODs</div><div class="data-point-value">${escapeHtml(formatNumber(vodCount))}</div></div>
                <div class="data-point"><div class="data-point-label">Clips</div><div class="data-point-value">${escapeHtml(formatNumber(clipCount))}</div></div>
                ${totalStreams ? `<div class="data-point"><div class="data-point-label">Total streams</div><div class="data-point-value">${escapeHtml(formatNumber(totalStreams))}</div></div>` : ''}
                ${streamTime ? `<div class="data-point"><div class="data-point-label">Stream time</div><div class="data-point-value">${escapeHtml(formatDurationSeconds(streamTime))}</div></div>` : ''}
            </div>
        </section>

        ${renderSection({
            title: 'Recent VODs',
            subtitle: 'Replays stay easy to find after the stream ends.',
            actionHref: '/vods',
            actionLabel: 'Open VOD library',
            content: recentVodsHtml ? `<div class="card-grid" data-filter-group-host="home-media">${recentVodsHtml}</div>` : null,
            emptyTitle: 'No VODs yet',
            emptyBody: 'When replays are ready they show up here automatically.',
            emptyHref: '/vods',
            emptyLabel: 'VOD library',
        })}

        ${renderSection({
            title: 'Recent clips',
            subtitle: 'Short highlights for quick sharing.',
            actionHref: '/clips',
            actionLabel: 'Open clips',
            content: recentClipsHtml ? `<div class="card-grid" data-filter-group-host="home-media">${recentClipsHtml}</div>` : null,
            emptyTitle: 'No clips yet',
            emptyBody: 'Clips appear here once they have been saved.',
            emptyHref: '/clips',
            emptyLabel: 'Clips library',
        })}

        ${featuredChannelsHtml ? renderSection({
            title: 'Featured creators',
            subtitle: 'Channels worth checking based on recent activity.',
            actionHref: '/channels',
            actionLabel: 'All channels',
            content: `<div class="channel-grid">${featuredChannelsHtml}</div>`,
        }) : ''}

        <section class="section-panel">
            <div class="section-head">
                <div>
                    <h2 class="section-title">Community pulse</h2>
                    <p class="section-subtitle">Threads, pastes, and chat rooms from the wider OpenVibe network.</p>
                </div>
                <div class="form-actions">
                    <a class="section-link" href="${LIVE_NETWORK_URLS.community}">Community</a>
                    <a class="section-link" href="${LIVE_NETWORK_URLS.chat}">Chat</a>
                </div>
            </div>
            ${(recentThreadsHtml || recentPastesHtml || roomSignalsHtml) ? `
            <div class="story-grid">
                ${(recentThreadsHtml || recentPastesHtml) ? `<div class="list-stack">${recentThreadsHtml}${recentPastesHtml}</div>` : ''}
                ${roomSignalsHtml ? `<div class="list-stack">${roomSignalsHtml}</div>` : ''}
            </div>` : `
            <div class="empty-state">
                <p>Community content will surface here once public threads and pastes exist on <a class="link-inline" href="${LIVE_NETWORK_URLS.community}">openvibe.community</a>.</p>
            </div>`}
        </section>

        <section class="section-panel">
            <div class="section-head">
                <div>
                    <h2 class="section-title">Why OpenVibe exists</h2>
                    <p class="section-subtitle">Burnout, corporate drift, and the urge to build something worth staying in.</p>
                </div>
            </div>
            <div class="story-grid">
                <article class="glass-card" data-reveal>
                    <div class="eyebrow">The short version</div>
                    <p class="card-body">We burned out watching platforms we loved get hollowed out — ad auctions replacing real feeds, AI-generated music flooding every corner of the internet, algorithms nudging creators toward whatever kept engagement metrics green instead of what they actually wanted to make.</p>
                    <p class="card-body" style="margin-top:0.7rem;">OpenVibe is not for profit. It is an attempt to build a streaming and community space that behaves like it was made for people, not for a growth dashboard.</p>
                </article>
                <article class="glass-card" data-reveal>
                    <div class="eyebrow">What we actually promise</div>
                    <ul class="flow-list">
                        <li>Your @handle stays the same across live, VODs, clips, and the community — no platform migrations required.</li>
                        <li>No advertising, no recommendation engine optimizing for addiction, no dark patterns to inflate session time.</li>
                        <li>If something is broken or incomplete we will say so instead of pretending it is a feature.</li>
                        <li>Small tools for real people: restreaming, pastes, chat, community threads — without needing five accounts to use all of them.</li>
                    </ul>
                    <div class="form-actions" style="margin-top:1rem;">
                        <a class="button-secondary" href="/go-live">Start streaming</a>
                        <a class="button-ghost" href="/channels">Browse channels</a>
                    </div>
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
    const featuredHtml = (featuredChannels || []).slice(0, 6).map((channel) => renderChannelCard(channel, baseUrl, { stats: channel.stats, currentStream: channel.currentStream, previewStream: channel.recentStream })).join('');
    const allChannelsHtml = (channels || []).slice(0, 200).map((channel) => renderChannelCard(channel, baseUrl, { stats: channel.stats, currentStream: channel.currentStream, previewStream: channel.recentStream, filterGroup: 'channels' })).join('');
    const categoryChips = (categories || []).slice(0, 10).map((category) => `<button class="button-ghost" type="button" data-chip-target="#channels-filter" data-chip-value="${escapeHtml(category.name || category.category || category.label || '')}">${escapeHtml(category.name || category.category || category.label || 'Uncategorized')}</button>`).join('');
    const pageContent = `
        <section class="hero-panel compact">
            <div class="hero-copy" data-reveal>
                <div class="eyebrow">Creator directory</div>
                <h1 class="hero-heading">Browse every staged <span class="hero-gradient">creator route</span></h1>
                <p>Search channels, inspect their recent activity, and jump directly into current or replay-ready broadcasts.</p>
            </div>
        </section>
        ${renderSection({
            title: 'Featured creators',
            subtitle: 'Channels with live momentum or strong recent activity.',
            content: featuredHtml ? `<div class="channel-grid">${featuredHtml}</div>` : null,
            emptyTitle: 'Featured creators will appear here',
            emptyBody: 'Once more activity lands in the live graph, featured ranking becomes more useful.',
        })}
        ${renderSection({
            title: 'All channels',
            subtitle: 'Filter by handle, category, or recent activity.',
            content: `
                <div class="search-bar">
                    <input id="channels-filter" class="filter-input" type="search" placeholder="Search creators" data-filter-input="channels" aria-label="Search creators">
                    ${categoryChips}
                </div>
                ${allChannelsHtml ? `<div class="channel-grid">${allChannelsHtml}</div>` : ''}`,
            emptyTitle: 'No channels are staged yet',
            emptyBody: 'Creator routes will show up here once the live service has channel records to expose.',
            emptyHref: '/go-live',
            emptyLabel: 'Open go-live',
        })}`;
    return renderPage({
        title: 'Channels — openvibe.live',
        description: 'Browse every staged OpenVibe Live creator route.',
        canonical: `${baseUrl}/channels`,
        activeNav: 'channels',
        bodyHtml: pageContent,
        baseUrl,
    });
}

function renderCollectionPage({ kind, title, description, emptyMessage, items, baseUrl }) {
    const navKey = kind === 'clips' ? 'clips' : 'vods';
    const badgeTone = kind === 'clips' ? 'primary' : 'success';
    const badgeLabel = kind === 'clips' ? 'Clip' : 'VOD';
    const cardsHtml = (items || []).slice(0, 200).map((item) => renderStreamCard(item, null, baseUrl, { badge: badgeLabel, badgeTone, filterGroup: navKey })).join('');
    const pageContent = `
        <section class="hero-panel compact">
            <div class="hero-copy" data-reveal>
                <div class="eyebrow">${escapeHtml(navKey)}</div>
                <h1 class="hero-heading">${escapeHtml(title || (navKey === 'clips' ? 'OpenVibe Clips' : 'OpenVibe VOD Library'))}</h1>
                <p>${escapeHtml(description || '')}</p>
            </div>
        </section>
        ${renderSection({
            title: navKey === 'clips' ? 'Recent clips' : 'Recent VODs',
            subtitle: navKey === 'clips' ? 'Fast highlights surfaced from canonical media objects.' : 'Replay media staged through the canonical OpenVibe media service.',
            content: `
                <div class="search-bar">
                    <input class="filter-input" type="search" placeholder="Filter this library" data-filter-input="${navKey}" aria-label="Filter ${navKey}">
                </div>
                ${cardsHtml ? `<div class="card-grid">${cardsHtml}</div>` : ''}`,
            emptyTitle: navKey === 'clips' ? 'No public clip media yet' : 'No public VOD media yet',
            emptyBody: emptyMessage || 'This route stays honest until canonical media objects exist.',
            emptyHref: '/channels',
            emptyLabel: 'Browse creators',
        })}`;
    return renderPage({
        title: `${escapeHtml(title || (navKey === 'clips' ? 'OpenVibe Clips' : 'OpenVibe VOD Library'))} — openvibe.live`,
        description: description || '',
        canonical: `${baseUrl}/${navKey}`,
        activeNav: navKey,
        bodyHtml: pageContent,
        baseUrl,
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
            <div class="section-head">
                <div>
                    <h2 class="section-title">Your stream manager</h2>
                    <p class="section-subtitle">Signed-in creators can load their channels, destinations, and recent streams right here, then jump to openre.stream for the heavier restream control plane.</p>
                </div>
                <div class="inline-actions">
                    <a class="section-link" href="${LIVE_NETWORK_URLS.restream}">Open openre.stream</a>
                    <a class="section-link" href="${LIVE_NETWORK_URLS.network}">Open account</a>
                </div>
            </div>
            <div class="story-grid">
                <article class="glass-card" data-reveal data-go-live-session>
                    <div class="eyebrow">Account status</div>
                    <h3 class="card-title">Loading ${escapeHtml(viewerName || 'your account')}…</h3>
                    <p class="card-body">This same-origin manager talks to the real OpenRe control plane through local live routes, so the sign-in state actually belongs to this surface.</p>
                </article>
                <article class="glass-card" data-reveal>
                    <div class="eyebrow">What this page can do</div>
                    <div class="data-points">
                        <div class="data-point">
                            <div class="data-point-label">Channel</div>
                            <div class="data-point-value">Claim a handle</div>
                        </div>
                        <div class="data-point">
                            <div class="data-point-label">Destinations</div>
                            <div class="data-point-value">Save RTMP targets</div>
                        </div>
                        <div class="data-point">
                            <div class="data-point-label">Streams</div>
                            <div class="data-point-value">Create and mark live</div>
                        </div>
                        <div class="data-point">
                            <div class="data-point-label">After the stream</div>
                            <div class="data-point-value">Keep VODs + clips tied in</div>
                        </div>
                    </div>
                </article>
            </div>
            <div class="story-grid" style="margin-top:1rem;">
                <article class="glass-card" data-reveal>
                    <div class="eyebrow">Channels</div>
                    <div data-go-live-channels class="list-stack"><p class="manager-note">Checking your channels…</p></div>
                    <form class="form-stack" id="go-live-channel-form" style="margin-top:1rem;">
                        <label>
                            <span class="data-point-label">Handle</span>
                            <input class="filter-input" type="text" name="slug" placeholder="your-handle" autocomplete="off">
                        </label>
                        <label>
                            <span class="data-point-label">Display name</span>
                            <input class="filter-input" type="text" name="display_name" placeholder="Your channel name" autocomplete="off">
                        </label>
                        <div class="form-actions">
                            <button class="button" type="submit">Create channel</button>
                            <span class="input-help">Claim your public @route before the next stream.</span>
                        </div>
                    </form>
                </article>
                <article class="glass-card" data-reveal>
                    <div class="eyebrow">Destinations</div>
                    <div data-go-live-destinations class="list-stack"><p class="manager-note">Checking your destinations…</p></div>
                    <form class="form-stack" id="go-live-destination-form" style="margin-top:1rem;">
                        <label>
                            <span class="data-point-label">Kind</span>
                            <select class="filter-input" name="kind">
                                <option value="custom">Custom RTMP</option>
                                <option value="youtube">YouTube</option>
                                <option value="twitch">Twitch</option>
                                <option value="kick">Kick</option>
                            </select>
                        </label>
                        <label>
                            <span class="data-point-label">Label</span>
                            <input class="filter-input" type="text" name="label" placeholder="Main multistream target" autocomplete="off">
                        </label>
                        <label>
                            <span class="data-point-label">Target URL</span>
                            <input class="filter-input" type="url" name="target_url" placeholder="rtmp://example.com/live" autocomplete="off">
                        </label>
                        <label>
                            <span class="data-point-label">Stream key</span>
                            <input class="filter-input" type="text" name="target_key" placeholder="Paste the destination key" autocomplete="off">
                        </label>
                        <div class="form-actions">
                            <button class="button-secondary" type="submit">Save destination</button>
                            <span class="input-help">These routes belong to your signed-in OpenVibe account.</span>
                        </div>
                    </form>
                </article>
            </div>
            <div class="story-grid" style="margin-top:1rem;">
                <article class="glass-card" data-reveal>
                    <div class="eyebrow">Create a stream</div>
                    <form class="form-stack" id="go-live-stream-form">
                        <label>
                            <span class="data-point-label">Channel</span>
                            <select class="filter-input" name="channel_slug">
                                <option value="">Select a channel</option>
                            </select>
                        </label>
                        <label>
                            <span class="data-point-label">Title</span>
                            <input class="filter-input" type="text" name="title" placeholder="Tonight’s stream title" autocomplete="off">
                        </label>
                        <label>
                            <span class="data-point-label">Category</span>
                            <input class="filter-input" type="text" name="category" placeholder="Art, coding, games, music…" autocomplete="off">
                        </label>
                        <label>
                            <span class="data-point-label">Protocol</span>
                            <select class="filter-input" name="protocol">
                                <option value="rtmp">RTMP / OBS</option>
                                <option value="whip">WHIP</option>
                                <option value="browser">Browser quick-start</option>
                            </select>
                        </label>
                        <div class="form-actions">
                            <button class="button" type="submit">Create stream</button>
                            <span class="input-help">This creates the stream record and returns fresh ingest details.</span>
                        </div>
                    </form>
                    <div data-go-live-ingest class="list-stack" style="margin-top:1rem;">
                        <p class="manager-note">Create a stream to reveal ingest details and hand-off info for OBS or your restream workflow.</p>
                    </div>
                </article>
                <article class="glass-card" data-reveal>
                    <div class="eyebrow">Recent streams</div>
                    <div data-go-live-streams class="list-stack"><p class="manager-note">Checking your recent streams…</p></div>
                </article>
            </div>
        </section>`
        : `
        <section class="section-panel" id="stream-manager">
            <div class="section-head">
                <div>
                    <h2 class="section-title">Sign in to unlock your stream manager</h2>
                    <p class="section-subtitle">This page only shows real creator controls to authenticated OpenVibe accounts. Anonymous visitors should not see fake channel or stream creation panels.</p>
                </div>
                <div class="inline-actions">
                    <a class="section-link" href="${LIVE_NETWORK_URLS.restream}">Open openre.stream</a>
                    <a class="section-link" href="/channels">Browse channels</a>
                </div>
            </div>
            <div class="story-grid">
                <article class="glass-card" data-reveal data-go-live-session>
                    <div class="eyebrow">Account status</div>
                    <h3 class="card-title">${escapeHtml(viewerName ? `Finish signing in, ${viewerName}` : 'Use your OpenVibe account')}</h3>
                    <p class="card-body">Claim your creator route, save real RTMP destinations, and generate ingest details from this same-origin live surface once you are signed in.</p>
                    <div class="form-actions" style="margin-top:1rem;">
                        <a class="button" href="${signInHref}">${escapeHtml(viewerName ? 'Create full account' : 'Sign in with OpenVibe')}</a>
                        <a class="button-secondary" href="${LIVE_NETWORK_URLS.restream}">Open openre.stream</a>
                        <a class="button-ghost" href="/">Back to live discovery</a>
                    </div>
                </article>
                <article class="glass-card" data-reveal>
                    <div class="eyebrow">What unlocks after sign-in</div>
                    <div class="data-points">
                        <div class="data-point">
                            <div class="data-point-label">Creator route</div>
                            <div class="data-point-value">Claim @handle</div>
                        </div>
                        <div class="data-point">
                            <div class="data-point-label">Destinations</div>
                            <div class="data-point-value">Save RTMP targets</div>
                        </div>
                        <div class="data-point">
                            <div class="data-point-label">Stream records</div>
                            <div class="data-point-value">Create + control</div>
                        </div>
                        <div class="data-point">
                            <div class="data-point-label">Identity</div>
                            <div class="data-point-value">One OpenVibe account</div>
                        </div>
                    </div>
                </article>
            </div>
        </section>`;
    const pageContent = `
        <section class="hero-panel compact">
            <div class="hero-grid">
                <div class="hero-copy" data-reveal>
                    <div class="eyebrow">Creator dashboard</div>
                    <h1 class="hero-heading">Go live with <span class="hero-gradient">OpenVibe</span></h1>
                    <p>Use one OpenVibe account to claim your creator route, prep your ingest, start a stream, and keep VODs, clips, chat, and community tied to the same channel.</p>
                    <div class="hero-actions">
                        <a class="button" href="#stream-manager">Open stream manager</a>
                        <a class="button-secondary" href="${LIVE_NETWORK_URLS.restream}">Open openre.stream</a>
                        <a class="button-ghost" href="/">Back to live discovery</a>
                    </div>
                    <div class="utility-links">
                        <a class="utility-link" href="${LIVE_NETWORK_URLS.network}">My account</a>
                        <a class="utility-link" href="${LIVE_NETWORK_URLS.chat}">Chat</a>
                        <a class="utility-link" href="${LIVE_NETWORK_URLS.community}">Community</a>
                        <a class="utility-link" href="/channels">Browse channels</a>
                    </div>
                </div>
                <article class="glass-card" data-reveal>
                    <div class="eyebrow">How it fits</div>
                    <h3 class="card-title">Discovery on openvibe.live. Routing on openre.stream.</h3>
                    <p class="card-body">Use this page when you want your public creator route and your basic stream controls in one place. Jump to <a class="link-inline" href="${LIVE_NETWORK_URLS.restream}">openre.stream</a> when you want the fuller restream cockpit.</p>
                    <div class="pill-row" style="margin-top:0.85rem;">
                        ${renderPill('Creator route on openvibe.live', 'soft')}
                        ${renderPill('Routing on openre.stream', 'warn')}
                        ${renderPill('One account across both', 'primary')}
                    </div>
                </article>
            </div>
        </section>
        ${managerSection}
        ${renderSection({
            title: 'Broadcast tracks',
            subtitle: 'Choose the publishing style that matches your setup today.',
            content: `<div class="feature-grid">${tracksHtml}</div>`,
        })}
        ${renderSection({
            title: 'A simple creator loop',
            subtitle: 'Keep the public route, the live session, and the after-stream surface tied together.',
            content: `
                <div class="story-grid">
                    <article class="glass-card" data-reveal>
                        <div class="eyebrow">Streamer flow</div>
                        <ol class="flow-list">
                            <li>Claim or verify the creator account and public channel handle.</li>
                            <li>Create a stream record and grab the ingest details you need.</li>
                            <li>Go live and let the session mirror into the canonical OpenVibe live graph.</li>
                            <li>Keep VODs, clips, chat, and community tied back to that same creator route.</li>
                        </ol>
                    </article>
                    <article class="glass-card" data-reveal>
                        <div class="eyebrow">Truth first</div>
                        <p class="card-body">The live surface stays honest. It shows live sessions, recent broadcasts, viewer counts, VOD linkage, and clip state when those facts exist — and clean empty states when they do not.</p>
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
