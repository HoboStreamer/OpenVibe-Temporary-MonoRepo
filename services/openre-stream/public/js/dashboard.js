/**
 * dashboard.js — openre.stream interactive dashboard  v=20260505
 *
 * Handles:
 *   - Copy buttons for RTMP URL and stream key
 *   - Channel edit form (inline panel show/hide + PATCH API)
 *   - Stream key regeneration
 *   - Destination deletion
 *
 * Plain JS IIFE — no module system, no bundler.
 */
(function () {
    'use strict';

    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
        var ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.focus(); ta.select();
        try { document.execCommand('copy'); } catch (_) {}
        document.body.removeChild(ta);
        return Promise.resolve();
    }

    function api(method, path, body) {
        var opts = { method: method, credentials: 'same-origin', headers: {} };
        if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
        return fetch(path, opts).then(function (res) {
            if (!res.ok) return res.json().catch(function () { return {}; }).then(function (e) {
                throw new Error(e.error || e.message || 'Request failed (' + res.status + ')');
            });
            return res.json();
        });
    }

    function setStatus(elId, text, isError) {
        var el = document.getElementById(elId);
        if (!el) return;
        el.textContent = text;
        el.style.color = isError ? 'var(--color-danger,#e55)' : 'var(--color-ok,#5c5)';
    }

    // ── channel edit panel open/close ─────────────────────────────────────────
    function openChannelEdit(btn) {
        var panel = document.getElementById('dash-channel-edit-panel');
        var form  = document.getElementById('dash-channel-edit-form');
        if (!panel || !form) return;

        var slug        = btn.getAttribute('data-slug') || '';
        var displayName = btn.getAttribute('data-display-name') || '';
        var description = btn.getAttribute('data-description') || '';

        form.querySelector('[name="slug"]').value         = slug;
        form.querySelector('[name="display_name"]').value = displayName;
        form.querySelector('[name="description"]').value  = description;

        panel.style.display = '';
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        setStatus('dash-channel-edit-status', '');
    }

    function closeChannelEdit() {
        var panel = document.getElementById('dash-channel-edit-panel');
        if (panel) panel.style.display = 'none';
    }

    // ── channel edit form submit ──────────────────────────────────────────────
    var editForm = document.getElementById('dash-channel-edit-form');
    if (editForm) {
        editForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var fd = new FormData(editForm);
            var slug = fd.get('slug');
            if (!slug) return;
            var btn = editForm.querySelector('[type="submit"]');
            if (btn) btn.disabled = true;

            api('PATCH', '/api/v1/channels/' + encodeURIComponent(slug), {
                display_name: fd.get('display_name'),
                description:  fd.get('description'),
            }).then(function (res) {
                var ch = res.channel || res;
                if (ch && ch.slug) {
                    // Update the card heading live
                    var card = document.querySelector('[data-channel-slug="' + slug + '"]');
                    if (card) {
                        var title = card.querySelector('.card-title');
                        if (title) title.textContent = ch.display_name || ch.slug;
                    }
                    setStatus('dash-channel-edit-status', 'Saved!');
                    setTimeout(closeChannelEdit, 1200);
                }
            }).catch(function (err) {
                setStatus('dash-channel-edit-status', err.message, true);
            }).finally(function () {
                if (btn) btn.disabled = false;
            });
        });
    }

    // ── delegated click handler ───────────────────────────────────────────────
    document.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-dash-action]');
        if (!btn) return;
        var action = btn.getAttribute('data-dash-action');

        // ── copy value ────────────────────────────────────────────────────────
        if (action === 'copy') {
            var val = btn.getAttribute('data-copy');
            if (!val) return;
            copyToClipboard(val).then(function () {
                var orig = btn.textContent; btn.textContent = 'Copied!';
                setTimeout(function () { btn.textContent = orig; }, 1500);
            });
            return;
        }

        // ── regenerate stream key ─────────────────────────────────────────────
        if (action === 'regenerate-key') {
            var slug = btn.getAttribute('data-slug');
            if (!slug) return;
            if (!confirm('Regenerate the stream key for @' + slug + '? Any in-progress stream using the old key will be cut.')) return;
            btn.disabled = true;
            api('POST', '/api/v1/channels/' + encodeURIComponent(slug) + '/regenerate-key', {})
                .then(function (res) {
                    var ch = res.channel || res;
                    if (ch && ch.stream_key) {
                        // Update the display inline
                        var card = document.querySelector('[data-channel-slug="' + slug + '"]');
                        if (card) {
                            var keyEl = card.querySelector('[data-stream-key]');
                            if (keyEl) {
                                keyEl.setAttribute('data-stream-key', ch.stream_key);
                                keyEl.textContent = ch.stream_key.substring(0, 8) + '\u2026';
                            }
                            // Update copy button
                            var copyBtn = card.querySelector('[data-dash-action="copy"][data-copy]');
                            if (copyBtn && copyBtn.previousElementSibling === keyEl) {
                                copyBtn.setAttribute('data-copy', ch.stream_key);
                            }
                            // Update the regenerate button's sibling copy button
                            var allCopyBtns = card.querySelectorAll('[data-dash-action="copy"]');
                            allCopyBtns.forEach(function (cb) {
                                // Find the copy button that was next to the key display
                                var prev = cb.previousElementSibling;
                                if (prev && prev.getAttribute('data-stream-key') !== null) {
                                    cb.setAttribute('data-copy', ch.stream_key);
                                }
                            });
                        }
                    }
                    btn.disabled = false;
                    btn.textContent = 'Regenerated!';
                    setTimeout(function () { btn.textContent = 'Regenerate'; }, 2000);
                }).catch(function (err) {
                    alert('Regenerate failed: ' + err.message);
                    btn.disabled = false;
                });
            return;
        }

        // ── edit channel ──────────────────────────────────────────────────────
        if (action === 'edit-channel') {
            openChannelEdit(btn);
            return;
        }

        // ── close channel edit ────────────────────────────────────────────────
        if (action === 'close-channel-edit') {
            closeChannelEdit();
            return;
        }

        // ── delete destination ────────────────────────────────────────────────
        if (action === 'delete-destination') {
            var id = btn.getAttribute('data-dest-id');
            if (!id) return;
            if (!confirm('Remove this destination permanently?')) return;
            btn.disabled = true;
            api('DELETE', '/api/v1/destinations/' + encodeURIComponent(id))
                .then(function () {
                    var card = document.querySelector('[data-dest-id="' + id + '"]');
                    if (card) {
                        card.style.transition = 'opacity .3s';
                        card.style.opacity = '0';
                        setTimeout(function () { card.remove(); }, 350);
                    }
                }).catch(function (err) {
                    alert('Delete failed: ' + err.message);
                    btn.disabled = false;
                });
            return;
        }
    });
})();
