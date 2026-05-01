function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

export class MenuPanel {
    constructor(root) {
        this.root = root;
    }

    hide() {
        this.root.classList.add('hidden');
    }

    render({ title, subtitle, connected, buttons = [], server = null } = {}, { onAction, onClose } = {}) {
        this.root.classList.remove('hidden');
        this.root.innerHTML = `
            <div class="legacy-main-menu">
                <div class="legacy-main-menu__backdrop"></div>
                <section class="legacy-main-menu__sidebar">
                    <div class="legacy-main-menu__brand">SourceVibe Engine</div>
                    <h2>${escapeHtml(title || '2D World')}</h2>
                    <p>${escapeHtml(subtitle || (connected ? 'Paused on the live server.' : 'Disconnected. Pick your next move.'))}</p>
                    <div class="legacy-main-menu__server">${escapeHtml(server || 'offline')}</div>
                    <nav class="legacy-main-menu__nav">
                        ${buttons.map((button) => `
                            <button type="button" class="legacy-main-menu__button" data-menu-action="${escapeHtml(button.id)}">
                                <span>${escapeHtml(button.label)}</span>
                                ${button.description ? `<small>${escapeHtml(button.description)}</small>` : ''}
                            </button>
                        `).join('')}
                    </nav>
                    <div class="legacy-main-menu__footer">Esc to resume · F1 for options · &#96; for console</div>
                </section>
                <aside class="legacy-main-menu__detail">
                    <div class="legacy-main-menu__panel">
                        <div class="legacy-main-menu__panel-label">Status</div>
                        <strong>${connected ? 'Connected to server' : 'Engine shell idle'}</strong>
                        <small>${escapeHtml(connected ? 'Gameplay input is paused while the menu is open, just like a proper old-school pause shell.' : 'Jump back through Find Servers or Create Server when you want back in.')}</small>
                    </div>
                    <div class="legacy-main-menu__panel">
                        <div class="legacy-main-menu__panel-label">Mode</div>
                        <strong>Classic 2D World</strong>
                        <small>Legacy PNG map styling, sprite-backed items, and a cleaner Counter-Strike-era menu silhouette.</small>
                    </div>
                    <button type="button" class="legacy-main-menu__close" data-action="close-menu">Resume</button>
                </aside>
            </div>`;

        this.root.querySelector('[data-action="close-menu"]')?.addEventListener('click', () => onClose && onClose());
        this.root.querySelectorAll('[data-menu-action]').forEach((button) => {
            button.addEventListener('click', () => onAction && onAction(button.dataset.menuAction));
        });
    }
}
