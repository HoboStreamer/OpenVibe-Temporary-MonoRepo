'use strict';

const {
    renderVideoCard,
    renderStreamCard,
    renderPage,
    renderSection,
    renderMediaThumb,
    renderPill,
    escapeHtml,
    formatNumber,
    formatDateTime,
    formatDurationSeconds,
    formatShortDate,
    timeAgo,
    channelPath,
    streamPath,
    absoluteUrl,
    canRenderImageUrl,
    initialsFrom,
    normalizeCreatorSlug,
    sanitizeStreamTitle,
    formatCompactNumber,
    LIVE_NETWORK_URLS,
} = require('./ssr-shared');

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
    const mediaEmbed = stream.embed_url
        ? `<iframe src="${escapeHtml(stream.embed_url)}" allowfullscreen title="${escapeHtml(stream.title || 'Stream embed')}"></iframe>`
        : isLive
            ? `<video id="sp-live-video" autoplay playsinline style="width:100%;aspect-ratio:16/9;border-radius:var(--radius);background:#000;display:block;" poster="${escapeHtml(stream.thumbnail_url || (channel && channel.avatar_url) || '')}"></video>`
            : renderMediaThumb({
                url: stream.thumbnail_url || (channel && channel.avatar_url) || null,
                title: stream.title || 'Untitled stream',
                eyebrow: 'Broadcast replay',
                subtitle: channelName,
                initials: initialsFrom(channelName),
                baseUrl,
            });

    const pageContent = `
        <div class="sp-layout">
            <div class="sp-main">
                <div class="sp-embed">${mediaEmbed}</div>
                <div class="sp-info">
                    <div class="sp-title-row">
                        <div>
                            <div class="pill-row" style="margin-bottom:.5rem;">
                                ${renderPill(isLive ? 'Live now' : 'Ended', isLive ? 'live' : 'muted')}
                                ${stream.category ? renderPill(stream.category, 'primary') : ''}
                            </div>
                            <h1 class="sp-title">${escapeHtml(stream.title || 'Untitled stream')}</h1>
                            <p class="sp-byline">
                                ${slug ? `<a class="link-inline" href="${channelPath(slug)}">${escapeHtml(channelName)}</a>` : escapeHtml(channelName)}
                                · ${escapeHtml(isLive ? `${formatCompactNumber(stream.viewer_count || 0)} watching` : `Peak ${formatCompactNumber(stream.peak_viewers || 0)} viewers`)}
                                ${stream.started_at ? ` · started ${escapeHtml(timeAgo(stream.started_at))}` : ''}
                            </p>
                        </div>
                        <div class="sp-actions">
                            <a class="button" href="${slug ? channelPath(slug) : '/channels'}">${slug ? 'Channel page' : 'Browse creators'}</a>
                            <a class="button-secondary" href="/vods${slug ? `?channel=${encodeURIComponent(slug)}` : ''}">${slug ? 'VODs' : 'Browse VODs'}</a>
                            <a class="button-ghost" href="/clips${slug ? `?channel=${encodeURIComponent(slug)}` : ''}">${slug ? 'Clips' : 'Browse clips'}</a>
                        </div>
                    </div>
                    <div class="sp-stats">
                        <div class="sp-stat"><span class="sp-stat-label">Viewers</span><span class="sp-stat-val">${escapeHtml(formatNumber(stream.viewer_count || 0))}</span></div>
                        <div class="sp-stat"><span class="sp-stat-label">Peak</span><span class="sp-stat-val">${escapeHtml(formatNumber(stream.peak_viewers || 0))}</span></div>
                        <div class="sp-stat"><span class="sp-stat-label">Category</span><span class="sp-stat-val">${escapeHtml(stream.category || '—')}</span></div>
                        <div class="sp-stat"><span class="sp-stat-label">Started</span><span class="sp-stat-val">${escapeHtml(stream.started_at ? formatDateTime(stream.started_at) : '—')}</span></div>
                        ${stream.ended_at ? `<div class="sp-stat"><span class="sp-stat-label">Ended</span><span class="sp-stat-val">${escapeHtml(formatDateTime(stream.ended_at))}</span></div>` : ''}
                        <div class="sp-stat"><span class="sp-stat-label">Clips</span><span class="sp-stat-val">${escapeHtml(formatNumber(stream.clip_count || 0))}</span></div>
                    </div>
                </div>
            </div>

            <aside class="sp-chat glass-card" id="sp-chat">
                <div class="sp-chat-header">
                    <span class="eyebrow" style="margin:0;">Stream Chat</span>
                    ${isLive ? renderPill('Live', 'live') : renderPill('Replay', 'muted')}
                    <button class="sp-global-toggle" id="sp-global-toggle" title="Also show Global Chat" aria-pressed="false">🌐 Global</button>
                </div>
                <div class="sp-chat-feed" id="sp-chat-feed"><div class="sp-chat-empty">Connecting…</div></div>
                <div class="sp-chat-composer" id="sp-chat-composer">
                    <div class="sp-chat-who" id="sp-chat-who" title="Click to change name"></div>
                    <div class="sp-chat-row">
                        <input class="sp-chat-input" id="sp-chat-input" type="text" placeholder="Say something…" maxlength="500" autocomplete="off">
                        <button class="button" id="sp-chat-send" type="button" style="flex-shrink:0;padding:.45rem .8rem;font-size:.8rem;">Send</button>
                    </div>
                </div>
            </aside>
        </div>

        ${moreFromChannelHtml ? renderSection({
            title: `More from ${channelName}`,
            subtitle: null,
            content: `<div class="card-grid">${moreFromChannelHtml}</div>`,
        }) : ''}
    `;

    const extraStyles = `
        .sp-layout { display:grid; grid-template-columns:1fr 320px; gap:1rem; align-items:start; padding:1.25rem 0 2rem; }
        .sp-main { min-width:0; display:flex; flex-direction:column; gap:.75rem; }
        .sp-embed { width:100%; border-radius:var(--radius); overflow:hidden; background:#000; }
        .sp-embed iframe { width:100%; aspect-ratio:16/9; border:0; display:block; }
        .sp-embed .media-thumb { border-radius:var(--radius); }
        .sp-info { display:flex; flex-direction:column; gap:.75rem; }
        .sp-title-row { display:flex; gap:1rem; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; }
        .sp-title { font-size:clamp(1.1rem,2.5vw,1.6rem); font-weight:700; margin:0 0 .3rem; letter-spacing:-.02em; line-height:1.2; }
        .sp-byline { font-size:.88rem; color:var(--muted); margin:0; }
        .sp-actions { display:flex; gap:.5rem; flex-wrap:wrap; flex-shrink:0; align-items:flex-start; }
        .sp-stats { display:flex; gap:1.25rem; flex-wrap:wrap; padding:.75rem 0; border-top:1px solid var(--border); }
        .sp-stat { display:flex; flex-direction:column; gap:.15rem; }
        .sp-stat-label { font-size:.68rem; text-transform:uppercase; letter-spacing:.1em; color:var(--muted); font-weight:700; }
        .sp-stat-val { font-size:.88rem; font-weight:600; color:var(--text); }
        .sp-chat { display:flex; flex-direction:column; height:calc(100vh - 90px); max-height:720px; position:sticky; top:70px; padding:0; overflow:hidden; }
        .sp-chat-header { display:flex; align-items:center; gap:.6rem; padding:.75rem 1rem; border-bottom:1px solid var(--border); flex-shrink:0; flex-wrap:wrap; }
        .sp-global-toggle { margin-left:auto; font-size:.68rem; padding:.25rem .55rem; border-radius:999px; border:1px solid var(--border); background:transparent; color:var(--muted); cursor:pointer; transition:background .15s,color .15s; white-space:nowrap; }
        .sp-global-toggle:hover { background:rgba(255,255,255,.07); color:var(--text); }
        .sp-global-toggle.active { background:var(--accent,#8b5cf6); border-color:transparent; color:#fff; }
        .sp-chat-msg-global { opacity:.6; }
        .sp-chat-msg-room { font-size:.65rem; font-weight:600; color:var(--muted); margin-right:.2rem; }
        .sp-chat-feed { flex:1; overflow-y:auto; padding:.6rem .85rem; display:flex; flex-direction:column; gap:.2rem; }
        .sp-chat-empty { color:var(--muted); font-size:.8rem; text-align:center; padding:1.5rem 0; margin:auto 0; }
        .sp-chat-msg { padding:.3rem .45rem; border-radius:8px; }
        .sp-chat-msg:hover { background:rgba(255,255,255,.03); }
        .sp-chat-msg-meta { display:flex; gap:.4rem; align-items:baseline; margin-bottom:.1rem; }
        .sp-chat-msg-name { font-size:.74rem; font-weight:700; color:var(--accent); }
        .sp-chat-msg-time { font-size:.65rem; color:var(--muted); }
        .sp-chat-msg-body { font-size:.83rem; color:var(--text); line-height:1.45; word-break:break-word; }
        .sp-chat-composer { flex-shrink:0; padding:.5rem .75rem; border-top:1px solid var(--border); display:flex; flex-direction:column; gap:.3rem; }
        .sp-chat-who { font-size:.68rem; color:var(--muted); cursor:pointer; }
        .sp-chat-who:hover { color:var(--accent); }
        .sp-chat-row { display:flex; gap:.4rem; }
        .sp-chat-input { flex:1; background:rgba(255,255,255,.06); border:1px solid var(--border); border-radius:8px; padding:.4rem .65rem; color:var(--text); font-size:.83rem; outline:none; transition:border-color .15s; }
        .sp-chat-input:focus { border-color:var(--accent); }
        .sp-chat-input::placeholder { color:var(--muted); }
        @media(max-width:900px) { .sp-layout { grid-template-columns:1fr; } .sp-chat { height:420px; position:static; } }
    `;

    const extraScripts = `
        ${isLive && !stream.embed_url && slug ? `(function() {
            var WHEP_BASE = ${JSON.stringify(LIVE_NETWORK_URLS.restream)};
            var CHANNEL_SLUG = ${JSON.stringify(slug)};
            var _whepPc = null;
            var _whepResourceUrl = null;

            async function initViewer() {
                var video = document.getElementById('sp-live-video');
                if (!video || !WHEP_BASE || !CHANNEL_SLUG) return;
                try {
                    var pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
                    pc.addTransceiver('video', { direction: 'recvonly' });
                    pc.addTransceiver('audio', { direction: 'recvonly' });
                    pc.ontrack = function(ev) {
                        if (ev.streams && ev.streams[0] && !video.srcObject) {
                            video.srcObject = ev.streams[0];
                            video.play().catch(function() {});
                        }
                    };
                    var offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    if (pc.iceGatheringState !== 'complete') {
                        await new Promise(function(resolve) {
                            var fn = function() { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', fn); resolve(); } };
                            pc.addEventListener('icegatheringstatechange', fn);
                            setTimeout(resolve, 5000);
                        });
                    }
                    var resp = await fetch(WHEP_BASE + '/whep/' + encodeURIComponent(CHANNEL_SLUG), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/sdp' },
                        body: pc.localDescription.sdp,
                    });
                    if (!resp.ok) { console.warn('[viewer] WHEP ' + resp.status); return; }
                    _whepResourceUrl = resp.headers.get('Location');
                    var answer = await resp.text();
                    await pc.setRemoteDescription({ type: 'answer', sdp: answer });
                    _whepPc = pc;
                    pc.onconnectionstatechange = function() {
                        if (pc.connectionState === 'failed') {
                            setTimeout(function() { if (_whepPc === pc) initViewer(); }, 3000);
                        }
                    };
                } catch(err) {
                    console.warn('[viewer] WHEP setup error:', err.message);
                }
            }
            initViewer();
        })();` : ''}
        (function() {
            var CHAT_BASE = ${JSON.stringify(LIVE_NETWORK_URLS.chat)};
            var STREAM_ID = ${JSON.stringify(String(stream.id || ''))};
            var ROOM_TITLE = ${JSON.stringify(String(channel.display_name || channel.slug || stream.id || ''))};
            var POLL = 3000;
            var MAX = 60;
            var feed = document.getElementById('sp-chat-feed');
            var composer = document.getElementById('sp-chat-composer');
            var whoEl = document.getElementById('sp-chat-who');
            var input = document.getElementById('sp-chat-input');
            var sendBtn = document.getElementById('sp-chat-send');
            var toggleBtn = document.getElementById('sp-global-toggle');
            var lastStreamId = null;
            var lastGlobalId = null;
            var streamMsgs = [];
            var globalMsgs = [];
            var showGlobal = false;

            // Auto-assign anonymous ID; replaced async with logged-in username
            var myName = (function() {
                var saved = localStorage.getItem('ov-chat-name');
                if (saved) return saved;
                var id = 'Anon_' + Math.random().toString(36).slice(2,6).toUpperCase();
                localStorage.setItem('ov-chat-name', id);
                return id;
            })();

            fetch(CHAT_BASE + '/api/v1/session', {mode:'cors',credentials:'include'})
                .then(function(r){return r.json();})
                .then(function(d){
                    if(d.authenticated && d.user && (d.user.display_name || d.user.username)){
                        myName = d.user.display_name || d.user.username;
                    }
                    updateWho();
                }).catch(function(){});

            function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
            function timeStr(ts) { return new Date(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); }

            function updateWho() {
                whoEl.textContent = 'Chatting as ' + myName + ' \xb7 click to change';
            }
            updateWho();
            whoEl.addEventListener('click', enterNaming);

            function enterNaming() {
                composer.innerHTML = '<div style="padding:.5rem .75rem;display:flex;flex-direction:column;gap:.4rem;"><p style="margin:0;font-size:.75rem;color:var(--muted);">Change your name:</p><div class="sp-chat-row"><input class="sp-chat-input" id="sp-ni" type="text" placeholder="Your name…" maxlength="32" value="' + esc(myName) + '"><button class="button" id="sp-nok" type="button" style="flex-shrink:0;padding:.4rem .7rem;font-size:.8rem;">OK</button></div></div>';
                var ni = document.getElementById('sp-ni');
                ni.focus(); ni.select();
                document.getElementById('sp-nok').addEventListener('click', function() { saveName(ni.value); });
                ni.addEventListener('keydown', function(e) { if(e.key==='Enter') saveName(ni.value); });
            }

            function saveName(v) {
                v = (v||'').trim().slice(0,32);
                if(!v) return;
                myName = v;
                localStorage.setItem('ov-chat-name', v);
                restoreComposer();
                document.getElementById('sp-chat-input').focus();
            }

            function restoreComposer() {
                composer.innerHTML = '<div class="sp-chat-who" id="sp-chat-who" title="Click to change name"></div><div class="sp-chat-row"><input class="sp-chat-input" id="sp-chat-input" type="text" placeholder="Say something…" maxlength="500" autocomplete="off"><button class="button" id="sp-chat-send" type="button" style="flex-shrink:0;padding:.45rem .8rem;font-size:.8rem;">Send</button></div>';
                whoEl = document.getElementById('sp-chat-who');
                input = document.getElementById('sp-chat-input');
                sendBtn = document.getElementById('sp-chat-send');
                whoEl.addEventListener('click', enterNaming);
                sendBtn.addEventListener('click', send);
                input.addEventListener('keydown', function(e) { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();} });
                updateWho();
            }

            function renderMsgs() {
                var atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 60;
                var combined = streamMsgs.slice();
                if (showGlobal) {
                    // Merge global messages, excluding fan-out copies that originated from this stream
                    var streamRef = STREAM_ID;
                    var globalOnly = globalMsgs.filter(function(m) {
                        return !(m.metadata && m.metadata.from_room_ref === streamRef);
                    });
                    combined = combined.concat(globalOnly.map(function(m) {
                        return Object.assign({}, m, { _isGlobal: true });
                    }));
                    combined.sort(function(a,b){ return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0; });
                }
                if(!combined.length) { feed.innerHTML = '<div class="sp-chat-empty">No messages yet.</div>'; return; }
                feed.innerHTML = combined.map(function(m) {
                    var name = (m.metadata && m.metadata.sender_name) || m.sender_id || 'Anonymous';
                    var roomTag = m._isGlobal ? '<span class="sp-chat-msg-room">[Global]</span>' : '';
                    var cls = 'sp-chat-msg' + (m._isGlobal ? ' sp-chat-msg-global' : '');
                    return '<div class="'+cls+'"><div class="sp-chat-msg-meta">'+roomTag+'<span class="sp-chat-msg-name">'+esc(name)+'</span><span class="sp-chat-msg-time">'+timeStr(m.created_at)+'</span></div><div class="sp-chat-msg-body">'+esc(m.body)+'</div></div>';
                }).join('');
                if(atBottom || lastStreamId === null) feed.scrollTop = feed.scrollHeight;
            }

            function pollStream() {
                fetch(CHAT_BASE + '/api/chat/stream/' + encodeURIComponent(STREAM_ID) + '/history?limit=' + MAX, {mode:'cors',credentials:'include'})
                    .then(function(r){return r.json();})
                    .then(function(d){
                        var items = (d.items||[]).slice().reverse();
                        var newest = items.length ? items[items.length-1].id : null;
                        if(newest !== lastStreamId){ streamMsgs=items; lastStreamId=newest; renderMsgs(); }
                        else if(!items.length && lastStreamId===null){ renderMsgs(); }
                    }).catch(function(){});
            }

            function pollGlobal() {
                if (!showGlobal) return;
                fetch(CHAT_BASE + '/api/chat/rooms/global/messages?limit=' + MAX, {mode:'cors',credentials:'include'})
                    .then(function(r){return r.json();})
                    .then(function(d){
                        var items = (d.items||[]).slice().reverse();
                        var newest = items.length ? items[items.length-1].id : null;
                        if(newest !== lastGlobalId){ globalMsgs=items; lastGlobalId=newest; renderMsgs(); }
                    }).catch(function(){});
            }

            function poll() { pollStream(); pollGlobal(); }

            // Global chat toggle
            toggleBtn.addEventListener('click', function() {
                showGlobal = !showGlobal;
                toggleBtn.classList.toggle('active', showGlobal);
                toggleBtn.setAttribute('aria-pressed', String(showGlobal));
                if (showGlobal) { pollGlobal(); } else { renderMsgs(); }
            });

            function send() {
                var text = (input.value||'').trim();
                if(!text)return;
                var savedText = text;
                input.value=''; input.disabled=true; sendBtn.disabled=true;
                fetch(CHAT_BASE + '/api/chat/stream/' + encodeURIComponent(STREAM_ID) + '/send', {
                    method:'POST', mode:'cors', credentials:'include',
                    headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({body:text, room_title:ROOM_TITLE, metadata:{sender_name:myName}}),
                }).then(function(r){
                    if(!r.ok) throw new Error('send failed '+r.status);
                    return pollStream();
                }).catch(function(){input.value = savedText;})
                .finally(function(){input.disabled=false;sendBtn.disabled=false;input.focus();});
            }

            sendBtn.addEventListener('click', send);
            input.addEventListener('keydown', function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}});
            poll();
            setInterval(poll, POLL);
        })();
    `;

    return renderPage({
        title,
        description,
        canonical: slug ? `${baseUrl}${streamPath(slug, stream.id)}` : `${baseUrl}/channels`,
        ogType: isLive ? 'video.other' : 'video.movie',
        ogImage,
        activeNav: 'channels',
        bodyHtml: pageContent,
        extraStyles,
        extraScripts,
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
            durationSeconds: item.duration_seconds || 0,
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
function renderCustomMediaPlayer({ title, playbackUrl, posterUrl, mimeType, durationSeconds }) {
    return `
        <div class="ov-media-player" data-ov-player data-duration-hint="${escapeHtml(String(durationSeconds || 0))}">
            <video playsinline preload="metadata" poster="${escapeHtml(posterUrl || '')}" aria-label="openvibe.media playback \u2014 ${escapeHtml(title || 'media')}">
                <source src="${escapeHtml(playbackUrl || '')}"${mimeType ? ` type="${escapeHtml(mimeType)}"` : ''}>
            </video>
            <div class="ov-player-overlay" data-player-overlay>
                <div class="ov-player-center-btn" data-player-center aria-hidden="true"></div>
                <div class="ov-player-bar">
                    <div class="ov-player-progress">
                        <input class="ov-player-range" type="range" min="0" max="1000" step="1" value="0" data-player-seek aria-label="Seek playback position">
                    </div>
                    <div class="ov-player-controls-row">
                        <button class="ov-player-btn" type="button" data-player-action="toggle" aria-label="Play">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                        </button>
                        <button class="ov-player-btn" type="button" data-player-action="mute" aria-label="Mute">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                        </button>
                        <div class="ov-player-time" data-player-time>0:00 / --:--</div>
                        <div class="ov-player-spacer"></div>
                        <div class="ov-player-volume-group">
                            <input class="ov-player-volume" type="range" min="0" max="1" step="0.05" value="1" data-player-volume aria-label="Volume">
                        </div>
                        <button class="ov-player-btn" type="button" data-player-action="fullscreen" aria-label="Full screen">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
                        </button>
                    </div>
                </div>
            </div>
            <div class="ov-player-status" data-player-status role="status" aria-live="polite"></div>
        </div>`;
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

module.exports = {
    renderStreamPage,
    renderMediaDetailPage,
    renderCustomMediaPlayer,
    renderCollectionPage,
    renderMissingMediaPage,
};
