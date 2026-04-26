'use strict';

// openvibe-live — server-rendered HTML for channel + stream pages.
// Goal: search engines and link-unfurlers see real <title>, <meta>, OG/twitter
// tags, canonical URLs, and a meaningful first paint of the channel/stream
// state. Client-side hydration is layered on top later (out of scope here).

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _meta({ title, description, canonical, ogType, ogImage }) {
    const desc = description || 'OpenVibe Live — real-time streaming on the OpenVibe network.';
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
        body{font-family:system-ui,-apple-system,sans-serif;max-width:960px;margin:0 auto;padding:1.5rem;color:#1d2330;background:#f7f8fb}
        header{display:flex;align-items:center;gap:1rem;border-bottom:1px solid #e3e6ee;padding-bottom:1rem;margin-bottom:1rem}
        .avatar{width:64px;height:64px;border-radius:50%;background:#e3e6ee;object-fit:cover}
        h1{margin:0;font-size:1.4rem}
        .live-badge{display:inline-block;background:#d1004a;color:#fff;font-weight:bold;padding:.15rem .5rem;border-radius:4px;font-size:.75rem;margin-left:.5rem;letter-spacing:.05em}
        .offline{color:#777}
        .stream-card{background:#fff;border-radius:8px;padding:1rem;margin-bottom:1rem;box-shadow:0 1px 3px rgba(0,0,0,.05)}
        .thumb{display:block;max-width:100%;border-radius:6px;margin-bottom:.75rem}
        .meta{color:#5f6473;font-size:.9rem}
        a{color:#1858d8;text-decoration:none}a:hover{text-decoration:underline}
        nav a{margin-right:1rem;font-size:.9rem}
    </style>`;
}

function renderChannelPage({ channel, currentStream, recentStreams, baseUrl }) {
    const slug = channel.slug;
    const isLive = !!currentStream && currentStream.status === 'started';
    const title = `${channel.display_name || slug} on openvibe.live${isLive ? ' — LIVE NOW' : ''}`;
    const desc  = channel.description
        || (isLive
            ? `${channel.display_name || slug} is live right now on openvibe.live${currentStream && currentStream.title ? ` — ${currentStream.title}` : ''}.`
            : `${channel.display_name || slug} — channel page on openvibe.live.`);
    const canonical = `${baseUrl}/c/${encodeURIComponent(slug)}`;
    const ogImage = (currentStream && currentStream.thumbnail_url) || channel.avatar_url || null;

    const recent = (recentStreams || []).slice(0, 10).map(s => `
        <li class="stream-card">
            <a href="/c/${encodeURIComponent(slug)}/s/${encodeURIComponent(s.id)}">
                ${s.thumbnail_url ? `<img class="thumb" src="${escapeHtml(s.thumbnail_url)}" alt="${escapeHtml(s.title || 'Stream')} thumbnail">` : ''}
                <strong>${escapeHtml(s.title || 'Untitled stream')}</strong>
            </a>
            <div class="meta">${escapeHtml(s.status)}${s.started_at ? ' · started ' + escapeHtml(s.started_at) : ''}${s.category ? ' · ' + escapeHtml(s.category) : ''}</div>
        </li>
    `).join('');

    return `<!doctype html><html lang="en"><head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        ${_meta({ title, description: desc, canonical, ogType: isLive ? 'video.other' : 'profile', ogImage })}
        ${_shellStyles()}
    </head><body>
        <nav><a href="/">openvibe.live</a> &nbsp;·&nbsp; <a href="/c/${encodeURIComponent(slug)}">@${escapeHtml(slug)}</a></nav>
        <header>
            ${channel.avatar_url ? `<img class="avatar" src="${escapeHtml(channel.avatar_url)}" alt="${escapeHtml(channel.display_name || slug)}">`
                                   : `<div class="avatar" aria-hidden="true"></div>`}
            <div>
                <h1>${escapeHtml(channel.display_name || slug)} ${isLive ? '<span class="live-badge">LIVE</span>' : '<span class="offline">offline</span>'}</h1>
                <div class="meta">@${escapeHtml(slug)}${channel.description ? ' · ' + escapeHtml(channel.description) : ''}</div>
            </div>
        </header>

        ${isLive ? `<section class="stream-card">
            <strong>Now streaming:</strong>
            <h2 style="margin:.5rem 0">${escapeHtml(currentStream.title || 'Untitled stream')}</h2>
            ${currentStream.embed_url ? `<iframe src="${escapeHtml(currentStream.embed_url)}" style="width:100%;aspect-ratio:16/9;border:0;border-radius:6px" allowfullscreen></iframe>`
                                       : (currentStream.thumbnail_url ? `<img class="thumb" src="${escapeHtml(currentStream.thumbnail_url)}" alt="Live thumbnail">` : '')}
            <div class="meta">started ${escapeHtml(currentStream.started_at || '')}${currentStream.category ? ' · ' + escapeHtml(currentStream.category) : ''}</div>
            <p><a href="/c/${encodeURIComponent(slug)}/s/${encodeURIComponent(currentStream.id)}">Open stream page →</a></p>
        </section>` : `<section class="stream-card offline"><p>${escapeHtml(channel.display_name || slug)} is currently offline. Recent streams below.</p></section>`}

        <h3>Recent streams</h3>
        ${recent ? `<ul style="list-style:none;padding:0">${recent}</ul>` : '<p class="offline">No streams yet.</p>'}
    </body></html>`;
}

function renderStreamPage({ channel, stream, baseUrl }) {
    const slug = channel ? channel.slug : (stream.channel_slug || 'unknown');
    const title = `${stream.title || 'Stream'} — ${channel ? (channel.display_name || slug) : slug} on openvibe.live`;
    const desc  = stream.title
        ? `${stream.title} — broadcast by ${channel ? (channel.display_name || slug) : slug} on openvibe.live.`
        : `Stream by ${channel ? (channel.display_name || slug) : slug} on openvibe.live.`;
    const canonical = `${baseUrl}/c/${encodeURIComponent(slug)}/s/${encodeURIComponent(stream.id)}`;
    const isLive = stream.status === 'started';
    const ogImage = stream.thumbnail_url || (channel && channel.avatar_url) || null;

    return `<!doctype html><html lang="en"><head>
        <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        ${_meta({ title, description: desc, canonical, ogType: isLive ? 'video.other' : 'video.movie', ogImage })}
        ${_shellStyles()}
    </head><body>
        <nav><a href="/">openvibe.live</a> &nbsp;·&nbsp; <a href="/c/${encodeURIComponent(slug)}">@${escapeHtml(slug)}</a></nav>
        <header>
            <div>
                <h1>${escapeHtml(stream.title || 'Untitled stream')} ${isLive ? '<span class="live-badge">LIVE</span>' : ''}</h1>
                <div class="meta">by <a href="/c/${encodeURIComponent(slug)}">@${escapeHtml(slug)}</a> · status: ${escapeHtml(stream.status)}${stream.category ? ' · ' + escapeHtml(stream.category) : ''}</div>
            </div>
        </header>

        <section class="stream-card">
            ${stream.embed_url ? `<iframe src="${escapeHtml(stream.embed_url)}" style="width:100%;aspect-ratio:16/9;border:0;border-radius:6px" allowfullscreen></iframe>`
              : (stream.thumbnail_url ? `<img class="thumb" src="${escapeHtml(stream.thumbnail_url)}" alt="${escapeHtml(stream.title || 'Stream')} thumbnail">` : '')}
            ${stream.vod_media_id ? `<p>VOD: <code>${escapeHtml(stream.vod_media_id)}</code></p>` : ''}
            ${stream.started_at ? `<div class="meta">started ${escapeHtml(stream.started_at)}${stream.ended_at ? ' · ended ' + escapeHtml(stream.ended_at) : ''}</div>` : ''}
        </section>
    </body></html>`;
}

function renderHomePage({ channels, baseUrl }) {
    const title = 'openvibe.live — discover live channels';
    const desc  = 'Browse live channels and recent streams on the OpenVibe network.';
    const canonical = `${baseUrl}/`;
    const items = (channels || []).slice(0, 50).map(c => `
        <li class="stream-card"><a href="/c/${encodeURIComponent(c.slug)}"><strong>${escapeHtml(c.display_name || c.slug)}</strong></a>
        <div class="meta">@${escapeHtml(c.slug)}${c.description ? ' · ' + escapeHtml(c.description) : ''}</div></li>
    `).join('');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        ${_meta({ title, description: desc, canonical })}${_shellStyles()}
    </head><body>
        <header><div><h1>openvibe.live</h1><div class="meta">${escapeHtml(desc)}</div></div></header>
        <h3>Channels</h3>
        ${items ? `<ul style="list-style:none;padding:0">${items}</ul>` : '<p class="offline">No channels yet.</p>'}
    </body></html>`;
}

function renderOfflinePage({ slug, baseUrl }) {
    const title = `@${slug} — offline on openvibe.live`;
    const canonical = `${baseUrl}/c/${encodeURIComponent(slug)}`;
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        ${_meta({ title, description: `${slug} is offline.`, canonical })}${_shellStyles()}
    </head><body><h1>@${escapeHtml(slug)} <span class="offline">offline</span></h1><p>This channel hasn't streamed yet, or hasn't been registered on openvibe.live.</p></body></html>`;
}

module.exports = { renderChannelPage, renderStreamPage, renderHomePage, renderOfflinePage, escapeHtml };
