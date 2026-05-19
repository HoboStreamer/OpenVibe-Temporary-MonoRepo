'use strict';

function isAnonymousUser(user) {
    return !!(user && (
        user.anonymous === true
        || user.actor_type === 'anon'
        || String(user.id || user.sub || '').startsWith('anon:')
    ));
}

function secureCookies(baseUrl) {
    return /^https:/i.test(String(baseUrl || ''));
}

function resolveSessionUser(reqOrState) {
    if (!reqOrState || !reqOrState.user) return null;
    return reqOrState.user;
}

function buildSessionResponse(reqOrState, extras) {
    const user = resolveSessionUser(reqOrState);
    const anonymous = isAnonymousUser(user);
    return Object.assign({
        authenticated: !!user && !anonymous,
        anonymous,
        user: user || null,
    }, extras || {});
}

function normalizeReturnTo(value, baseUrl, fallbackPath) {
    const fallback = String(fallbackPath || '/');
    try {
        const base = new URL(String(baseUrl || 'http://127.0.0.1'));
        const raw = String(value || '').trim();
        if (!raw) return new URL(fallback, base).toString();
        const target = raw.startsWith('/')
            ? new URL(raw, base)
            : new URL(raw);
        if (target.origin !== base.origin) {
            return new URL(fallback, base).toString();
        }
        return target.toString();
    } catch {
        try {
            return new URL(String(fallback || '/'), String(baseUrl || 'http://127.0.0.1')).toString();
        } catch {
            return '/';
        }
    }
}

function cookieOptions(baseUrl, user) {
    const options = {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
    };
    if (secureCookies(baseUrl)) options.secure = true;
    const expMs = Number(user && user.exp) * 1000;
    if (Number.isFinite(expMs)) {
        const maxAge = expMs - Date.now();
        if (maxAge > 0) options.maxAge = maxAge;
    }
    return options;
}

function setSessionCookie(res, token, baseUrl, user) {
    const options = cookieOptions(baseUrl, user);
    res.cookie('openvibe_token', String(token || ''), options);
}

function clearSessionCookies(res, baseUrl) {
    const options = {
        sameSite: 'lax',
        path: '/',
    };
    if (secureCookies(baseUrl)) options.secure = true;
    res.clearCookie('openvibe_token', options);
    res.clearCookie('token', options);
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildCallbackPage({ serviceName, returnTo, callbackPath }) {
    const label = escapeHtml(serviceName || 'OpenVibe');
    const target = escapeHtml(returnTo || '/');
    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>${label} sign-in</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>
        :root {
            color-scheme: dark;
            --bg: #050916;
            --panel: rgba(15, 23, 42, 0.94);
            --border: rgba(255, 255, 255, 0.1);
            --text: #eef4ff;
            --muted: #9fb0d1;
            --accent: #22d3ee;
            --accent2: #8b5cf6;
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 1.2rem;
            font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background:
                radial-gradient(circle at top left, rgba(139, 92, 246, 0.2), transparent 34%),
                radial-gradient(circle at 80% 10%, rgba(34, 211, 238, 0.16), transparent 26%),
                linear-gradient(180deg, #020617 0%, #050916 100%);
            color: var(--text);
        }
        .card {
            width: min(30rem, 100%);
            padding: 1.35rem;
            border-radius: 1.5rem;
            border: 1px solid var(--border);
            background: var(--panel);
            box-shadow: 0 24px 80px rgba(2, 8, 23, 0.42);
        }
        h1 { margin: 0 0 0.75rem; font-size: 1.5rem; letter-spacing: -0.03em; }
        p { margin: 0.6rem 0 0; color: var(--muted); line-height: 1.6; }
        code {
            display: inline-block;
            margin-top: 0.4rem;
            padding: 0.2rem 0.45rem;
            border-radius: 999px;
            border: 1px solid var(--border);
            background: rgba(255, 255, 255, 0.06);
        }
        .status {
            display: inline-flex;
            align-items: center;
            gap: 0.55rem;
            padding: 0.45rem 0.7rem;
            border-radius: 999px;
            font-size: 0.78rem;
            text-transform: uppercase;
            letter-spacing: 0.14em;
            font-weight: 800;
            background: rgba(34, 211, 238, 0.12);
            border: 1px solid rgba(34, 211, 238, 0.24);
            color: #d8fbff;
        }
        .status.error {
            background: rgba(251, 113, 133, 0.12);
            border-color: rgba(251, 113, 133, 0.24);
            color: #ffd7e1;
        }
        .button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            margin-top: 1rem;
            min-height: 2.8rem;
            padding: 0.7rem 1rem;
            border-radius: 999px;
            border: 1px solid transparent;
            background: linear-gradient(135deg, var(--accent2), var(--accent));
            color: white;
            font-weight: 700;
            text-decoration: none;
        }
    </style>
</head>
<body>
    <main class="card">
        <div class="status" data-auth-status>Finalizing sign-in</div>
        <h1>Wiring your ${label} session</h1>
        <p data-auth-message>We received the OpenVibe bridge hand-off and are setting a local session cookie now. Hang tight — this should only take a moment.</p>
        <p>Return target: <code>${target}</code></p>
        <noscript>
            <p>This step needs JavaScript to finish because the bearer token arrives in the URL hash.</p>
            <a class="button" href="${target}">Continue</a>
        </noscript>
    </main>
    <script>
        (function () {
            const status = document.querySelector('[data-auth-status]');
            const message = document.querySelector('[data-auth-message]');
            const returnTo = ${JSON.stringify(returnTo || '/')};
            const hash = String(window.location.hash || '').replace(/^#/, '');
            const params = new URLSearchParams(hash);
            const token = params.get('openvibe_token');

            function fail(text) {
                if (status) {
                    status.textContent = 'Sign-in failed';
                    status.classList.add('error');
                }
                if (message) message.textContent = text;
            }

            if (!token) {
                fail('No OpenVibe bridge token was present in the callback URL. Please try signing in again.');
                return;
            }

            fetch(${JSON.stringify(callbackPath || '/auth/callback')}, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ token: token, return_to: returnTo })
            }).then(async function (response) {
                const text = await response.text();
                let body = null;
                try {
                    body = text ? JSON.parse(text) : null;
                } catch {
                    body = { error: text || response.statusText };
                }
                if (!response.ok) {
                    throw new Error(body && body.error ? body.error : 'Failed to finalize local session');
                }
                window.location.replace(body && body.return_to ? body.return_to : returnTo);
            }).catch(function (error) {
                fail(error && error.message ? error.message : 'Failed to finalize local session');
            });
        }());
    </script>
</body>
</html>`;
}

module.exports = {
    buildCallbackPage,
    buildSessionResponse,
    clearSessionCookies,
    isAnonymousUser,
    normalizeReturnTo,
    setSessionCookie,
};
