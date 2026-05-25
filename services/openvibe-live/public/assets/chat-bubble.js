/* OpenVibe floating chat bubble — self-contained, drop in any page via <script src="/assets/chat-bubble.js"> */
(function () {
    'use strict';

    function resolveChatBase() {
        if (window.OpenVibe && typeof OpenVibe.resolveSurfaceUrl === 'function') {
            return OpenVibe.resolveSurfaceUrl('chat');
        }
        var h = location.hostname;
        return (h === 'localhost' || h.endsWith('.localhost'))
            ? 'http://openvibe.chat.localhost:4800'
            : 'https://openvibe.chat';
    }

    var CSS = [
        '.ov-chatbubble-btn{position:fixed;bottom:1.5rem;right:1.5rem;z-index:8000;width:52px;height:52px;border-radius:50%;background:var(--ov-accent,#8b5cf6);border:none;cursor:pointer;display:grid;place-items:center;box-shadow:0 4px 20px rgba(139,92,246,0.45);transition:transform 0.15s,box-shadow 0.15s;color:#fff}',
        '.ov-chatbubble-btn:hover{transform:scale(1.08);box-shadow:0 6px 28px rgba(139,92,246,0.6)}',
        '.ov-chatbubble-btn .ov-chatbubble-badge{position:absolute;top:4px;right:4px;width:10px;height:10px;border-radius:50%;background:#34d399;border:2px solid var(--ov-bg,#060917);display:none}',
        '.ov-chatbubble-btn.has-unread .ov-chatbubble-badge{display:block}',
        '.ov-chat-widget{position:fixed;bottom:5.5rem;right:1.5rem;z-index:8001;width:340px;max-height:480px;display:flex;flex-direction:column;background:color-mix(in srgb,var(--ov-bg,#060917) 92%,white);border:1px solid var(--ov-border,rgba(148,163,184,.14));border-radius:18px;box-shadow:0 16px 60px rgba(0,0,0,0.55);overflow:hidden;transform-origin:bottom right;transition:transform 0.18s cubic-bezier(.2,.8,.2,1),opacity 0.18s}',
        '.ov-chat-widget[hidden]{display:none}',
        '.ov-cw-header{display:flex;align-items:center;gap:.5rem;padding:.7rem 1rem;border-bottom:1px solid var(--ov-border,rgba(148,163,184,.14));flex-shrink:0;background:color-mix(in srgb,var(--ov-bg,#060917) 85%,white)}',
        '.ov-cw-header-title{flex:1;font-size:.85rem;font-weight:700;color:var(--ov-text,#eef4ff)}',
        '.ov-cw-header-sub{font-size:.72rem;color:var(--ov-text-dim,#a7b5d2)}',
        '.ov-cw-close{all:unset;cursor:pointer;color:var(--ov-text-dim,#a7b5d2);font-size:1.1rem;line-height:1;padding:.1rem .3rem;border-radius:6px;transition:color .12s,background .12s}',
        '.ov-cw-close:hover{color:var(--ov-text,#eef4ff);background:rgba(255,255,255,.06)}',
        '.ov-cw-feed{flex:1;min-height:0;overflow-y:auto;padding:.6rem .85rem;display:flex;flex-direction:column;gap:.25rem}',
        '.ov-cw-empty{color:var(--ov-text-dim,#a7b5d2);font-size:.8rem;text-align:center;padding:1.5rem 0;margin:auto 0}',
        '.ov-cw-msg{padding:.3rem .5rem;border-radius:8px;word-break:break-word}',
        '.ov-cw-msg:hover{background:rgba(255,255,255,.03)}',
        '.ov-cw-msg-meta{display:flex;gap:.45rem;align-items:baseline;margin-bottom:.1rem}',
        '.ov-cw-msg-name{font-size:.74rem;font-weight:700;color:var(--ov-accent,#8b5cf6)}',
        '.ov-cw-msg-time{font-size:.65rem;color:var(--ov-text-dim,#a7b5d2)}',
        '.ov-cw-msg-room{font-size:.65rem;font-weight:600;color:var(--ov-text-dim,#a7b5d2);opacity:.75}',
        '.ov-cw-msg-body{font-size:.83rem;color:var(--ov-text,#eef4ff);line-height:1.45}',
        '.ov-cw-composer{flex-shrink:0;padding:.5rem .75rem;border-top:1px solid var(--ov-border,rgba(148,163,184,.14));display:flex;flex-direction:column;gap:.3rem;background:color-mix(in srgb,var(--ov-bg,#060917) 88%,white)}',
        '.ov-cw-who{font-size:.68rem;color:var(--ov-text-dim,#a7b5d2)}',
        '.ov-cw-row{display:flex;gap:.4rem}',
        '.ov-cw-input{flex:1;background:color-mix(in srgb,var(--ov-bg,#060917) 75%,white);border:1px solid var(--ov-border,rgba(148,163,184,.14));border-radius:8px;padding:.45rem .7rem;color:var(--ov-text,#eef4ff);font-size:.83rem;font-family:var(--ov-font,Inter,sans-serif);outline:none;transition:border-color .15s}',
        '.ov-cw-input:focus{border-color:var(--ov-accent,#8b5cf6)}',
        '.ov-cw-input::placeholder{color:var(--ov-text-dim,#a7b5d2)}',
        '.ov-cw-name-prompt{padding:.6rem .85rem .5rem;display:flex;flex-direction:column;gap:.4rem}',
        '.ov-cw-name-prompt p{margin:0;font-size:.75rem;color:var(--ov-text-dim,#a7b5d2)}',
        '@media(max-width:420px){.ov-chat-widget{width:calc(100vw - 2rem);right:1rem}.ov-chatbubble-btn{right:1rem;bottom:1rem}}',
    ].join('\n');

    function inject() {
        if (document.getElementById('ov-chatbubble-btn')) return; // already mounted

        var style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        var btnEl = document.createElement('button');
        btnEl.className = 'ov-chatbubble-btn';
        btnEl.id = 'ov-chatbubble-btn';
        btnEl.setAttribute('aria-label', 'Open chat');
        btnEl.title = 'Global chat';
        btnEl.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg><span class="ov-chatbubble-badge"></span>';
        document.body.appendChild(btnEl);

        var widgetEl = document.createElement('div');
        widgetEl.className = 'ov-chat-widget';
        widgetEl.id = 'ov-chat-widget';
        widgetEl.setAttribute('hidden', '');
        widgetEl.innerHTML =
            '<div class="ov-cw-header">' +
                '<span style="font-size:1rem">#</span>' +
                '<span class="ov-cw-header-title">global</span>' +
                '<span class="ov-cw-header-sub">OpenVibe Chat</span>' +
                '<button class="ov-cw-close" id="ov-cw-close" aria-label="Close chat">✕</button>' +
            '</div>' +
            '<div class="ov-cw-feed" id="ov-cw-feed"><div class="ov-cw-empty">Connecting…</div></div>' +
            '<div class="ov-cw-composer" id="ov-cw-composer">' +
                '<div class="ov-cw-who" id="ov-cw-who"></div>' +
                '<div class="ov-cw-row">' +
                    '<input class="ov-cw-input" id="ov-cw-input" type="text" placeholder="Message #global…" maxlength="500" autocomplete="off" />' +
                    '<button class="ov-btn ov-btn-primary" id="ov-cw-send" type="button" style="padding:.45rem .8rem;font-size:.8rem">Send</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(widgetEl);

        var ROOM = 'global';
        var POLL = 3000;
        var MAX  = 60;

        var bubble   = document.getElementById('ov-chatbubble-btn');
        var widget   = document.getElementById('ov-chat-widget');
        var closeBtn = document.getElementById('ov-cw-close');
        var feed     = document.getElementById('ov-cw-feed');
        var whoEl    = document.getElementById('ov-cw-who');
        var input    = document.getElementById('ov-cw-input');
        var sendBtn  = document.getElementById('ov-cw-send');

        var lastId    = null;
        var msgs      = [];
        var isOpen    = false;
        var pollTimer = null;

        var myName = (function () {
            var saved = localStorage.getItem('ov-chat-anon-id');
            if (saved) return saved;
            var id = 'anon' + Math.floor(Math.random() * 900000 + 100000);
            localStorage.setItem('ov-chat-anon-id', id);
            return id;
        })();
        var isAuthenticated = false;

        function esc(s) {
            return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }
        function timeStr(ts) {
            return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        var chatBase = null;
        function getChatBase() {
            if (!chatBase) chatBase = resolveChatBase();
            return chatBase;
        }

        fetch(getChatBase() + '/api/v1/session', { mode: 'cors', credentials: 'include' })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (d.authenticated && d.user && (d.user.display_name || d.user.username)) {
                    myName = d.user.display_name || d.user.username;
                    isAuthenticated = true;
                }
                updateWho();
            })
            .catch(function () {});

        function updateWho() {
            whoEl.textContent = isAuthenticated ? ('@' + myName) : myName;
        }
        updateWho();


        function render() {
            var atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 60;
            if (!msgs.length) { feed.innerHTML = '<div class="ov-cw-empty">No messages yet.</div>'; return; }
            feed.innerHTML = msgs.map(function (m) {
                var name = (m.metadata && m.metadata.sender_name) || (m.sender_id ? 'anon' + String(m.sender_id).slice(-6) : 'anon');
                var roomLabel = (m.metadata && m.metadata.from_room_title)
                    ? '<span class="ov-cw-msg-room">[' + esc(m.metadata.from_room_title) + ']</span> ' : '';
                return '<div class="ov-cw-msg">' +
                    '<div class="ov-cw-msg-meta">' + roomLabel +
                    '<span class="ov-cw-msg-name">' + esc(name) + '</span>' +
                    '<span class="ov-cw-msg-time">' + timeStr(m.created_at) + '</span>' +
                    '</div><div class="ov-cw-msg-body">' + esc(m.body) + '</div></div>';
            }).join('');
            if (atBottom || lastId === null) feed.scrollTop = feed.scrollHeight;
        }

        function poll() {
            fetch(getChatBase() + '/api/chat/rooms/' + ROOM + '/messages?limit=' + MAX, { mode: 'cors', credentials: 'include' })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    var items = (data.items || []).slice().reverse();
                    if (!items.length && lastId === null) { render(); return; }
                    if (!items.length) return;
                    var newest = items[items.length - 1].id;
                    if (newest !== lastId) {
                        var hadMessages = lastId !== null;
                        msgs = items; lastId = newest;
                        if (!isOpen && hadMessages) bubble.classList.add('has-unread');
                        render();
                    }
                })
                .catch(function () {});
        }

        function startPolling() { if (pollTimer) return; poll(); pollTimer = setInterval(poll, POLL); }

        function open() {
            isOpen = true;
            widget.hidden = false;
            bubble.classList.remove('has-unread');
            startPolling();
            setTimeout(function () { feed.scrollTop = feed.scrollHeight; }, 50);
        }
        function close() { isOpen = false; widget.hidden = true; }

        bubble.addEventListener('click', function () { isOpen ? close() : open(); });
        closeBtn.addEventListener('click', close);
        sendBtn.addEventListener('click', send);
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });

        function send() {
            var text = (input.value || '').trim();
            if (!text) return;
            input.value = '';
            input.disabled = true;
            sendBtn.disabled = true;
            fetch(getChatBase() + '/api/chat/rooms/' + ROOM + '/messages', {
                method: 'POST',
                mode: 'cors',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ body: text, metadata: { sender_name: myName } }),
            })
                .then(function (r) { if (!r.ok) throw new Error('send failed ' + r.status); return poll(); })
                .catch(function () { input.value = text; })
                .finally(function () { input.disabled = false; sendBtn.disabled = false; input.focus(); });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inject);
    } else {
        inject();
    }
})();
