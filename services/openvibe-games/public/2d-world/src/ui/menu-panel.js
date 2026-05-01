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
            <div class="sourcevibe-menu">
                <div class="sourcevibe-menu__backdrop"></div>
                <section class="sourcevibe-menu__panel">
                    <div class="sourcevibe-menu__header">
                        <div>
                            <div class="sourcevibe-menu__eyebrow">SourceVibe Engine</div>
                            <h2>${escapeHtml(title || 'Menu')}</h2>
                            <p>${escapeHtml(subtitle || (connected ? 'Pause, browse, or tweak options.' : 'Engine shell offline.'))}</p>
                            ${server ? `<div class="sourcevibe-menu__server">${escapeHtml(server)}</div>` : ''}
                        </div>
                        <button type="button" class="sourcevibe-menu__close" data-action="close-menu" aria-label="Close menu">✕</button>
                    </div>
                    <div class="sourcevibe-menu__body">
                        <nav class="sourcevibe-menu__nav">
                            ${buttons.map((button) => `
                                <button type="button" class="sourcevibe-menu__button" data-menu-action="${escapeHtml(button.id)}">
                                    <span>${escapeHtml(button.label)}</span>
                                    ${button.description ? `<small>${escapeHtml(button.description)}</small>` : ''}
                                </button>
                            `).join('')}
                        </nav>
                        <aside class="sourcevibe-menu__aside">
                            <div class="sourcevibe-menu__card">
                                <div class="sourcevibe-menu__card-label">Status</div>
                                <strong>${connected ? 'Connected' : 'Disconnected'}</strong>
                                <small>${escapeHtml(connected ? 'Gameplay input is suspended while the menu is open.' : 'Use Find Servers or Create Server to jump back in.')}</small>
                            </div>
                            <div class="sourcevibe-menu__card">
                                <div class="sourcevibe-menu__card-label">Style</div>
                                <strong>Source-inspired shell</strong>
                                <small>Grey translucent panels, bevels, and old-school launcher energy. No SaaS cards were harmed in the making of this menu.</small>
                            </div>
                        </aside>
                    </div>
                </section>
            </div>`;

        this.root.querySelector('[data-action="close-menu"]')?.addEventListener('click', () => onClose && onClose());
        this.root.querySelectorAll('[data-menu-action]').forEach((button) => {
            button.addEventListener('click', () => onAction && onAction(button.dataset.menuAction));
        });
    }
}
