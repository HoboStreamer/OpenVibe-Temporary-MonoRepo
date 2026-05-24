'use strict';

const {
    renderStreamCard,
    renderVideoCard,
    renderChannelCard,
    renderStreamerGroupCard,
    renderPage,
    renderSection,
    renderEmptyState,
    escapeHtml,
    formatNumber,
    formatCompactNumber,
    formatDurationSeconds,
    formatDateTime,
    channelPath,
    streamPath,
    timeAgo,
    renderPill,
    absoluteUrl,
    canRenderImageUrl,
    initialsFrom,
    LIVE_NETWORK_URLS,
} = require('./ssr-shared');

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

module.exports = { renderChannelPage, renderChannelsPage, renderOfflinePage };
