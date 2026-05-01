import { escapeHtml } from './dom.js';

export class SourceMenuDialog {
    constructor(container) {
        this.container = container || document.body;
        this.openState = false;
        this.root = this.container.querySelector('.svui-menu-overlay') || document.createElement('div');
        this.root.className = 'svui-menu-overlay';
        this.root.hidden = true;
        if (!this.root.parentNode) this.container.appendChild(this.root);
    }

    isOpen() {
        return this.openState;
    }

    open(model = {}, handlers = {}) {
        this.render(model, handlers);
        this.openState = true;
        this.root.hidden = false;
    }

    close() {
        this.openState = false;
        this.root.hidden = true;
    }

    toggle(force, model = {}, handlers = {}) {
        const shouldOpen = typeof force === 'boolean' ? force : !this.openState;
        if (shouldOpen) this.open(model, handlers); else this.close();
    }

    render(model = {}, handlers = {}) {
        const actions = Array.isArray(model.actions) ? model.actions : [];
        this.root.innerHTML = `
            <div class="svui-menu-overlay__backdrop" data-action="close"></div>
            <section class="svui-menu-dialog">
                <header class="svui-menu-dialog__header">
                    <div>
                        <span class="svui-menu-dialog__eyebrow">${escapeHtml(model.eyebrow || 'SourceVibe menu')}</span>
                        <h2>${escapeHtml(model.title || 'Pause')}</h2>
                        <p>${escapeHtml(model.description || '')}</p>
                    </div>
                    <button type="button" class="svui-window__close" data-action="close" aria-label="Close menu">×</button>
                </header>
                <div class="svui-menu-dialog__meta">
                    ${model.meta ? `<span class="svui-chip">${escapeHtml(model.meta)}</span>` : ''}
                    ${model.submeta ? `<span class="svui-chip">${escapeHtml(model.submeta)}</span>` : ''}
                </div>
                <div class="svui-menu-dialog__actions">
                    ${actions.map((action) => `
                        <button type="button" class="svui-menu-action ${escapeHtml(action.tone || '')}" data-action="menu-item" data-id="${escapeHtml(action.id || '')}">
                            <strong>${escapeHtml(action.label || action.id || 'Action')}</strong>
                            ${action.description ? `<small>${escapeHtml(action.description)}</small>` : ''}
                        </button>
                    `).join('')}
                </div>
            </section>
        `;
        this.root.querySelectorAll('[data-action="close"]').forEach((element) => {
            element.addEventListener('click', () => {
                this.close();
                if (typeof handlers.onClose === 'function') handlers.onClose();
            });
        });
        this.root.querySelectorAll('[data-action="menu-item"]').forEach((button) => {
            button.addEventListener('click', () => {
                if (typeof handlers.onAction === 'function') handlers.onAction(button.dataset.id || '');
            });
        });
    }
}
