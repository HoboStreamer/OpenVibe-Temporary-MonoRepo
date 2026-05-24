'use strict';

const {
    escapeHtml, timeAgo, pasteLanguageLabel,
    _shell, _threadCard,
    COMMUNITY_URLS, SIGN_IN_URL, ANON_URL,
} = require('./ssr-shared');

function renderThreadsPage(threads, opts) {
    opts = opts || {};
    const limit = opts.limit || 60;
    const items = (threads || []).slice(0, limit);
    const bodyHtml = `
        <section class="hero">
            <div class="eyebrow">Community</div>
            <h1 class="page-title">Threads</h1>
            <p class="page-sub">Paste-based discussions. Start a thread from any paste — it becomes the OP.</p>
        </section>
        <div class="section-head">
            <h2 class="section-title">${items.length} thread${items.length === 1 ? '' : 's'}</h2>
            <div style="display:flex;gap:.5rem">
                <a class="section-link" href="/pastes">Browse pastes</a>
                <a class="section-link" href="/pulse">Pulse</a>
            </div>
        </div>
        <div class="search-bar">
            <input class="filter-input" type="search" placeholder="Filter threads…" data-filter-input="threads" aria-label="Filter threads">
        </div>
        ${items.length
            ? `<div class="card-grid" id="threads-grid">
                ${items.map((t) => `<div data-filter-group="threads" data-filter-text="${escapeHtml((t.title || '') + ' ' + (t.metadata && t.metadata.paste_language || ''))}">${_threadCard(t)}</div>`).join('')}
               </div>`
            : `<div class="empty-state"><p>No threads yet.</p><p>Open any paste and press <strong>Start Thread</strong> to kick one off.</p><a class="link-inline" href="/pastes">Browse pastes →</a></div>`}
        <script>
        (function(){
            var input = document.querySelector('[data-filter-input="threads"]');
            if (!input) return;
            var items = Array.from(document.querySelectorAll('[data-filter-group="threads"]'));
            input.addEventListener('input', function() {
                var q = input.value.trim().toLowerCase();
                items.forEach(function(el) { el.hidden = q && !el.dataset.filterText.toLowerCase().includes(q); });
            });
        })();
        (function(){
            var NETWORK_URL = '${escapeHtml(COMMUNITY_URLS.network)}';
            var LOCAL_KEY = 'ov-fav-threads';
            function loadLocal() { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch { return []; } }
            function saveLocal(arr) { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(arr)); } catch {} }
            function isFav(id) { return loadLocal().some(function(t){ return t.id === id; }); }
            function syncToNetwork(threads) {
                fetch(NETWORK_URL + '/api/v1/user-modules/me/openvibe.favorites', {
                    method: 'PUT', credentials: 'include',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify({ data: { threads: threads } }),
                }).catch(function(){});
            }
            function toggle(btn) {
                var id = btn.dataset.threadId;
                var title = btn.dataset.threadTitle;
                var url = btn.dataset.threadUrl;
                var favs = loadLocal();
                var idx = favs.findIndex(function(t){ return t.id === id; });
                if (idx >= 0) { favs.splice(idx, 1); } else { favs.unshift({ id: id, title: title, url: url, savedAt: new Date().toISOString() }); }
                saveLocal(favs);
                syncToNetwork(favs);
                var nowFav = idx < 0;
                btn.textContent = nowFav ? '\\u2605' : '\\u2606';
                btn.classList.toggle('is-fav', nowFav);
                btn.setAttribute('aria-label', nowFav ? 'Remove from favorites' : 'Add to favorites');
            }
            document.querySelectorAll('.ov-thread-star').forEach(function(btn) {
                if (isFav(btn.dataset.threadId)) { btn.textContent = '\\u2605'; btn.classList.add('is-fav'); btn.setAttribute('aria-label', 'Remove from favorites'); }
                btn.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); toggle(btn); });
            });
        })();
        </script>`;
    return _shell({ title: 'Threads — OpenVibe Community', description: 'Paste-based threads on OpenVibe Community.', active: 'threads', bodyHtml });
}

function renderThreadDetailPage(thread, posts, opts) {
    opts = opts || {};
    if (!thread) {
        const bodyHtml = `<section class="hero"><h1 class="page-title">Thread not found</h1><p><a class="link-inline" href="/threads">Back to threads →</a></p></section>`;
        return _shell({ title: 'Thread not found — OpenVibe Community', active: 'threads', bodyHtml });
    }

    const title     = thread.title || 'Untitled thread';
    const paste     = opts.paste || null;
    const postItems = (posts || []).slice(0, 500);
    const threadId  = thread.id || thread.slug || '';
    const meta      = thread.metadata || {};

    const opLang = paste ? (paste.language || null) : (meta.paste_language || null);
    const opImg  = paste ? (paste.metadata && paste.metadata.image_url || null) : (meta.paste_image_url || null);
    const opBody = paste ? (paste.body || '') : '';
    const opSlug = paste ? paste.slug : (meta.paste_slug || null);
    const opLines = opBody ? opBody.split('\n').length : 0;
    const opPreview = opBody.length > 3000
        ? escapeHtml(opBody.slice(0, 3000)) + '\n… (' + (opLines - opBody.slice(0, 3000).split('\n').length) + ' more lines)'
        : escapeHtml(opBody);

    const opHtml = `
        <div class="bbs-op">
            <div class="bbs-op-head">
                <span class="bbs-subject">${escapeHtml(title)}</span>
                <span class="bbs-meta">
                    ${opLang ? `<span class="pill success" style="font-size:.68rem;padding:.15rem .45rem">${escapeHtml(pasteLanguageLabel(opLang))}</span>` : ''}
                    ${opSlug ? `<a class="link-inline" href="/p/${encodeURIComponent(opSlug)}" style="font-size:.8rem">view paste</a>` : ''}
                    <span style="color:var(--muted);font-size:.8rem">${timeAgo(thread.created_at)}</span>
                    <span class="bbs-no">No.0</span>
                </span>
            </div>
            ${opImg ? `<div style="margin:.75rem 0"><img src="${escapeHtml(opImg)}" alt="" style="max-width:min(300px,100%);max-height:260px;object-fit:cover;border-radius:10px" loading="lazy"></div>` : ''}
            ${opBody ? `<pre class="bbs-code">${opPreview}</pre>` : '<p style="color:var(--muted);font-size:.9rem">No paste content.</p>'}
        </div>`;

    const repliesHtml = postItems.length
        ? postItems.map((p, i) => {
            const name    = escapeHtml((p.metadata && p.metadata.display_name) || p.author_id || 'Anonymous');
            const content = escapeHtml(String(p.body || '').slice(0, 5000));
            const ts      = timeAgo(p.created_at);
            return `<div class="bbs-reply" id="r${i + 1}">
                <div class="bbs-reply-head">
                    <span class="bbs-name">${name}</span>
                    <span class="bbs-ts">${ts}</span>
                    <a class="bbs-no" href="#r${i + 1}">No.${i + 1}</a>
                </div>
                <div class="bbs-reply-body">${content}</div>
            </div>`;
        }).join('')
        : `<div class="bbs-empty">No replies yet. Be the first.</div>`;

    const replyForm = `
        <div class="bbs-form-wrap">
            <h3 style="margin:0 0 .75rem;font-size:1rem">Post a Reply</h3>
            <form method="POST" action="/threads/${encodeURIComponent(threadId)}/reply">
                <textarea name="body" placeholder="Write your reply…" maxlength="2000" required
                    style="width:100%;min-height:90px;resize:vertical;background:rgba(255,255,255,.05);border:1px solid var(--border);border-radius:10px;padding:.65rem .9rem;color:var(--text);font-family:inherit;font-size:.9rem;outline:none;box-sizing:border-box"></textarea>
                <div style="margin-top:.6rem;display:flex;gap:.75rem;align-items:center;flex-wrap:wrap">
                    <button type="submit" style="background:rgba(34,211,238,.12);border:1px solid rgba(34,211,238,.3);color:var(--accent);border-radius:999px;padding:.45rem 1.2rem;font-weight:700;cursor:pointer;font-size:.88rem;font-family:inherit">Post Reply</button>
                    <span style="color:var(--muted);font-size:.8rem">Requires an OpenVibe identity — <a class="link-inline" href="${SIGN_IN_URL}">sign in</a> or <a class="link-inline" href="${ANON_URL}">go anonymous</a>.</span>
                </div>
            </form>
        </div>`;

    const inlineStyles = `<style>
        .bbs-wrap { max-width: 820px; }
        .bbs-op { background: rgba(15,23,42,.7); border: 1px solid rgba(255,255,255,.1); border-radius: 16px; padding: 1.1rem 1.25rem; margin-bottom: 1rem; }
        .bbs-op-head { display: flex; flex-wrap: wrap; gap: .5rem; align-items: baseline; margin-bottom: .6rem; }
        .bbs-subject { font-weight: 800; font-size: 1.05rem; color: var(--text); }
        .bbs-meta { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }
        .bbs-no { font-size: .78rem; color: var(--muted); font-family: monospace; }
        .bbs-code { background: rgba(2,6,23,.92); border: 1px solid rgba(255,255,255,.08); border-radius: 10px; padding: .9rem 1rem; font-size: .83rem; overflow-x: auto; white-space: pre-wrap; word-break: break-word; color: #e2e8f0; margin: 0; font-family: 'SFMono-Regular', Consolas, monospace; }
        .bbs-replies { display: flex; flex-direction: column; gap: .6rem; }
        .bbs-reply { background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.07); border-radius: 12px; padding: .75rem 1rem; }
        .bbs-reply-head { display: flex; gap: .6rem; align-items: baseline; flex-wrap: wrap; margin-bottom: .4rem; }
        .bbs-name { font-weight: 700; font-size: .82rem; color: var(--accent-2); }
        .bbs-ts { color: var(--muted); font-size: .78rem; }
        .bbs-reply-body { font-size: .9rem; white-space: pre-wrap; word-break: break-word; line-height: 1.55; }
        .bbs-empty { color: var(--muted); font-size: .88rem; padding: 1.5rem 0; text-align: center; }
        .bbs-form-wrap { background: rgba(15,23,42,.7); border: 1px solid rgba(255,255,255,.1); border-radius: 16px; padding: 1.1rem 1.25rem; margin-top: 1.5rem; }
        .bbs-divider { border: none; border-top: 1px solid rgba(255,255,255,.07); margin: 1.25rem 0; }
    </style>`;

    const bodyHtml = `
        ${inlineStyles}
        <div class="bbs-wrap">
            <div style="margin-bottom:1rem">
                <a class="link-inline" href="/threads" style="font-size:.88rem">← Threads</a>
            </div>
            ${opHtml}
            <hr class="bbs-divider">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem;flex-wrap:wrap;gap:.5rem">
                <span style="font-size:.88rem;color:var(--muted)">${postItems.length} ${postItems.length === 1 ? 'reply' : 'replies'}</span>
            </div>
            <div class="bbs-replies">${repliesHtml}</div>
            ${replyForm}
        </div>`;

    return _shell({
        title: `${title} — OpenVibe Community`,
        description: paste ? `${pasteLanguageLabel(opLang)} paste thread` : title,
        active: 'threads',
        bodyHtml,
    });
}

module.exports = { renderThreadsPage, renderThreadDetailPage };
