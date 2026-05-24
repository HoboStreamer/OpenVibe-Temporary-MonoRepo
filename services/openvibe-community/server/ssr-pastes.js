'use strict';

const {
    escapeHtml, timeAgo, pasteLanguageLabel,
    _shell, _pasteCard,
    COMMUNITY_URLS,
} = require('./ssr-shared');

function renderPastesPage(pastes, opts) {
    opts = opts || {};
    const limit = opts.limit || 60;
    const sort = opts.sort || 'recent';
    const items = (pastes || []).slice(0, limit);
    const bodyHtml = `
        <section class="hero">
            <div class="eyebrow">Community</div>
            <h1 class="page-title">Pastes</h1>
            <p class="page-sub">Public code snippets, configuration shares, and quick notes.</p>
        </section>
        <div class="section-head">
            <h2 class="section-title">${items.length} paste${items.length === 1 ? '' : 's'}</h2>
            <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;">
                <a class="section-link${sort === 'recent' ? ' active' : ''}" href="/pastes?sort=recent" style="${sort === 'recent' ? 'border-color:rgba(34,211,238,.5);color:var(--accent);background:rgba(34,211,238,.08);' : ''}">Most recent</a>
                <a class="section-link${sort === 'views' ? ' active' : ''}" href="/pastes?sort=views" style="${sort === 'views' ? 'border-color:rgba(34,211,238,.5);color:var(--accent);background:rgba(34,211,238,.08);' : ''}">Most viewed</a>
                <a class="section-link" href="/pulse">Pulse</a>
                <a class="section-link" href="/threads">Threads</a>
            </div>
        </div>
        <div class="search-bar">
            <input class="filter-input" type="search" placeholder="Filter pastes…" data-filter-input="pastes" aria-label="Filter pastes">
        </div>
        ${items.length
            ? `<div class="card-grid">
                ${items.map((p) => `<div data-filter-group="pastes" data-filter-text="${escapeHtml((p.title || '') + ' ' + (p.language || '') + ' ' + (p.content || '').slice(0, 200))}">${_pasteCard(p)}</div>`).join('')}
               </div>`
            : `<div class="empty-state"><p>No public pastes yet.</p></div>`}
        <script>
        (function(){
            var input = document.querySelector('[data-filter-input="pastes"]');
            if (!input) return;
            var items = Array.from(document.querySelectorAll('[data-filter-group="pastes"]'));
            input.addEventListener('input', function() {
                var q = input.value.trim().toLowerCase();
                items.forEach(function(el) { el.hidden = q && !el.dataset.filterText.toLowerCase().includes(q); });
            });
        })();
        </script>`;
    return _shell({ title: 'Pastes — OpenVibe Community', description: 'Public code snippets and notes from the OpenVibe network.', active: 'pastes', bodyHtml });
}

function renderPasteViewPage(paste, opts) {
    opts = opts || {};
    if (!paste) {
        const bodyHtml = `<div class="empty-state"><h2>Paste not found</h2><p>This paste may have been deleted or is not publicly visible.</p><a class="link-inline" href="/pastes">← Back to pastes</a></div>`;
        return _shell({ title: 'Not found — OpenVibe Community', active: 'pastes', bodyHtml });
    }
    const title = paste.title || 'Untitled paste';
    const lang  = paste.language || 'txt';
    const content = paste.body || '';
    const imageUrl = paste.metadata && paste.metadata.image_url ? paste.metadata.image_url : null;
    const contentHtml = escapeHtml(content);
    const copyId = 'paste-content-pre';
    const expiresHtml = paste.expires_at
        ? `<div class="data-point"><div class="data-point-label">Expires</div><div class="data-point-value">${escapeHtml(new Date(paste.expires_at).toLocaleString())}</div></div>`
        : '';
    const morePastes = (opts && opts.morePastes) || [];
    const pasteStripHtml = morePastes.length ? `
        <div style="margin-top:2rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem;">
                <span style="font-size:.82rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);">More pastes</span>
                <a class="section-link" href="/pastes" style="font-size:.8rem;">Browse all →</a>
            </div>
            <div style="display:flex;gap:.75rem;overflow-x:auto;padding-bottom:.75rem;scrollbar-width:thin;">
                ${morePastes.map((p) => {
                    const pTitle = escapeHtml(p.title || 'Untitled paste');
                    const pLang  = escapeHtml(pasteLanguageLabel(p.language || 'txt'));
                    const pImg   = p.metadata && p.metadata.image_url ? escapeHtml(p.metadata.image_url) : null;
                    const pHref  = `/p/${encodeURIComponent(p.slug || p.id || '')}`;
                    const pViews = p.view_count ? `${p.view_count} view${p.view_count === 1 ? '' : 's'} · ` : '';
                    const pTime  = timeAgo(p.created_at);
                    return `<a href="${escapeHtml(pHref)}" style="flex:0 0 220px;border-radius:16px;background:rgba(15,23,42,.9);border:1px solid rgba(255,255,255,.09);padding:.85rem;text-decoration:none;display:flex;flex-direction:column;gap:.4rem;transition:border-color .15s;" onmouseover="this.style.borderColor='rgba(34,211,238,.4)'" onmouseout="this.style.borderColor='rgba(255,255,255,.09)'">
                        ${pImg ? `<img src="${pImg}" alt="" loading="lazy" style="width:100%;height:90px;object-fit:cover;border-radius:8px;margin-bottom:.2rem;">` : ''}
                        <span style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--accent);opacity:.8;">${pLang}</span>
                        <span style="font-size:.88rem;font-weight:700;color:var(--text);line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${pTitle}</span>
                        <span style="font-size:.75rem;color:var(--muted);margin-top:auto;">${pViews}${pTime}</span>
                    </a>`;
                }).join('')}
            </div>
        </div>` : '';
    const bodyHtml = `
        <section class="hero" style="margin-bottom:1rem">
            <div class="pill-row" style="margin-bottom:.5rem">
                <span class="pill success">Paste</span>
                <span class="pill">${escapeHtml(pasteLanguageLabel(lang))}</span>
                ${paste.visibility && paste.visibility !== 'public' ? `<span class="pill warn">${escapeHtml(paste.visibility)}</span>` : ''}
            </div>
            <h1 class="page-title" style="font-size:clamp(1.4rem,3vw,2.2rem)">${escapeHtml(title)}</h1>
            <p class="page-sub">
                Created ${timeAgo(paste.created_at)}
                ${paste.view_count ? ` · ${paste.view_count} view${paste.view_count === 1 ? '' : 's'}` : ''}
            </p>
        </section>
        ${imageUrl ? `<div style="margin-bottom:1.25rem;"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}" style="width:100%;max-height:420px;object-fit:contain;border-radius:16px;border:1px solid rgba(255,255,255,.09);background:rgba(0,0,0,.4);"></div>` : ''}
        <div class="data-points">
            <div class="data-point"><div class="data-point-label">Language</div><div class="data-point-value">${escapeHtml(pasteLanguageLabel(lang))}</div></div>
            <div class="data-point"><div class="data-point-label">Lines</div><div class="data-point-value">${content.split('\n').length}</div></div>
            <div class="data-point"><div class="data-point-label">Characters</div><div class="data-point-value">${content.length}</div></div>
            ${expiresHtml}
        </div>
        <div style="margin-top:1.5rem">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
                <span style="color:var(--muted);font-size:.85rem">${escapeHtml(pasteLanguageLabel(lang))} · ${escapeHtml(paste.slug || paste.id || '')}</span>
                <button id="copy-btn" style="background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.28);color:var(--accent);border-radius:999px;padding:.35rem .8rem;font-weight:700;cursor:pointer;font-size:.82rem">Copy</button>
            </div>
            <pre id="${copyId}" class="paste-content">${contentHtml}</pre>
        </div>
        ${paste.description ? `<section class="glass-card" style="margin-top:1rem"><div class="eyebrow">Description</div><p>${escapeHtml(paste.description)}</p></section>` : ''}
        <div style="margin-top:1.5rem;display:flex;gap:.75rem;flex-wrap:wrap;align-items:center">
            <a class="section-link" href="/pastes">← All pastes</a>
            ${opts && opts.thread
                ? `<a class="section-link" href="/threads/${encodeURIComponent(opts.thread.id)}" style="border-color:rgba(34,211,238,.35);color:var(--accent)">View Thread →</a>`
                : `<form method="POST" action="/pastes/${encodeURIComponent(paste.slug)}/promote" style="display:contents">
                    <button type="submit" style="display:inline-flex;align-items:center;min-height:2.2rem;padding:.5rem .85rem;border-radius:999px;border:1px solid rgba(139,92,246,.4);background:rgba(139,92,246,.08);color:#a78bfa;font-weight:600;font-size:.88rem;cursor:pointer;font-family:inherit;transition:border-color .15s,background .15s">Start Thread</button>
                   </form>`}
            <a class="section-link" href="/pulse">Community pulse</a>
        </div>
        ${pasteStripHtml}
        <script>
        (function(){
            var btn = document.getElementById('copy-btn');
            var pre = document.getElementById('${copyId}');
            if (!btn || !pre) return;
            btn.addEventListener('click', function() {
                var text = pre.textContent || '';
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(text).then(function() {
                        btn.textContent = 'Copied!';
                        setTimeout(function() { btn.textContent = 'Copy'; }, 2000);
                    }).catch(function() {
                        btn.textContent = 'Failed';
                        setTimeout(function() { btn.textContent = 'Copy'; }, 1500);
                    });
                } else {
                    try {
                        var range = document.createRange();
                        range.selectNodeContents(pre);
                        window.getSelection().removeAllRanges();
                        window.getSelection().addRange(range);
                        document.execCommand('copy');
                        window.getSelection().removeAllRanges();
                        btn.textContent = 'Copied!';
                        setTimeout(function() { btn.textContent = 'Copy'; }, 2000);
                    } catch (e) {
                        btn.textContent = 'Select manually';
                        setTimeout(function() { btn.textContent = 'Copy'; }, 2000);
                    }
                }
            });
        })();
        </script>`;
    const canonical = `${COMMUNITY_URLS.community}/p/${encodeURIComponent(paste.slug || '')}`;
    return _shell({ title: `${title} — OpenVibe Community`, description: paste.description || `${pasteLanguageLabel(lang)} paste`, canonical, active: 'pastes', bodyHtml });
}

module.exports = { renderPastesPage, renderPasteViewPage };
