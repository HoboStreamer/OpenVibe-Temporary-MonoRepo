'use strict';

const { renderIcon } = require('@openvibe/icons');

const {
    renderStreamCard,
    renderStreamerGroupCard,
    renderVideoCard,
    renderSignalCard,
    timeAgo,
    escapeHtml,
    formatNumber,
    LIVE_NETWORK_URLS,
    renderPage,
    renderSection,
} = require('./ssr-shared');

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
        const authorId = paste.author_id || paste.created_by_actor_id || '';
        const authorLabel = authorId ? authorId.replace(/^user:[^:]+:/, '@') : 'Unknown';
        return `<article class="paste-card glass-card${paste.image_url ? '' : ' no-thumb'}" data-reveal>
            ${imgHtml}
            <div class="paste-card-body">
                <div class="pill-row"><span class="pill soft">${escapeHtml(paste.kind || 'paste')}</span></div>
                <a class="card-link" href="${escapeHtml(paste.route_url || LIVE_NETWORK_URLS.community)}"><h3 class="card-title">${escapeHtml(paste.title || paste.slug || 'Untitled paste')}</h3></a>
                <div class="card-kicker">${escapeHtml(authorLabel)} · ${escapeHtml(timeAgo(paste.created_at))}</div>
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
            <div class="story-grid" style="grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));">
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

module.exports = { renderHomePage };
