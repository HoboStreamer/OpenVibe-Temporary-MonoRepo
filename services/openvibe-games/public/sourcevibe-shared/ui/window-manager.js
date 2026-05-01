import { clamp, setNodeContent } from './dom.js';

function px(value, fallback) {
    if (value == null || value === '') return fallback;
    return typeof value === 'number' ? `${value}px` : String(value);
}

export class SourceWindowManager {
    constructor({ container = document.body } = {}) {
        this.container = container;
        this.windows = new Map();
        this.zIndex = 2200;
        this.layer = container.querySelector('.svui-window-layer') || document.createElement('div');
        this.layer.className = 'svui-window-layer';
        if (!this.layer.parentNode) container.appendChild(this.layer);
    }

    createWindow(id, options = {}) {
        const key = String(id || `window_${Date.now()}`);
        if (this.windows.has(key)) return this.windows.get(key);
        const record = new ManagedWindow(this, key, options);
        this.windows.set(key, record);
        return record;
    }

    focus(record) {
        const win = typeof record === 'string' ? this.windows.get(record) : record;
        if (!win) return;
        this.zIndex += 1;
        win.element.style.zIndex = String(this.zIndex);
    }

    hasOpenWindows() {
        return Array.from(this.windows.values()).some((record) => record.isOpen());
    }

    closeAll() {
        this.windows.forEach((record) => record.close());
    }
}

class ManagedWindow {
    constructor(manager, id, options = {}) {
        this.manager = manager;
        this.id = id;
        this.options = options;
        this.positioned = false;
        this.element = document.createElement('section');
        this.element.className = 'svui-window';
        this.element.hidden = true;
        this.element.dataset.windowId = id;

        this.titlebar = document.createElement('header');
        this.titlebar.className = 'svui-window__titlebar';

        this.titleText = document.createElement('div');
        this.titleText.className = 'svui-window__title';
        this.titlebar.appendChild(this.titleText);

        this.closeButton = document.createElement('button');
        this.closeButton.type = 'button';
        this.closeButton.className = 'svui-window__close';
        this.closeButton.setAttribute('aria-label', 'Close window');
        this.closeButton.textContent = '×';
        this.titlebar.appendChild(this.closeButton);

        this.bodyEl = document.createElement('div');
        this.bodyEl.className = 'svui-window__body';

        this.footerEl = document.createElement('footer');
        this.footerEl.className = 'svui-window__footer';

        this.element.append(this.titlebar, this.bodyEl, this.footerEl);
        this.manager.layer.appendChild(this.element);

        this.closeButton.addEventListener('click', () => this.close());
        this.element.addEventListener('pointerdown', () => this.focus());
        this._bindDrag();
        this.setFrame(options);
    }

    _bindDrag() {
        let pointerId = null;
        let offsetX = 0;
        let offsetY = 0;
        const onMove = (event) => {
            if (event.pointerId !== pointerId) return;
            const rect = this.element.getBoundingClientRect();
            const nextLeft = clamp(event.clientX - offsetX, 12, Math.max(12, window.innerWidth - rect.width - 12));
            const nextTop = clamp(event.clientY - offsetY, 12, Math.max(12, window.innerHeight - rect.height - 12));
            this.element.style.left = `${nextLeft}px`;
            this.element.style.top = `${nextTop}px`;
            this.positioned = true;
        };
        const onUp = (event) => {
            if (event.pointerId !== pointerId) return;
            pointerId = null;
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
        this.titlebar.addEventListener('pointerdown', (event) => {
            if (event.target === this.closeButton) return;
            if (event.button !== 0) return;
            const rect = this.element.getBoundingClientRect();
            pointerId = event.pointerId;
            offsetX = event.clientX - rect.left;
            offsetY = event.clientY - rect.top;
            this.titlebar.setPointerCapture(event.pointerId);
            this.focus();
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
        });
    }

    center() {
        const rect = this.element.getBoundingClientRect();
        const left = clamp((window.innerWidth - rect.width) / 2, 12, Math.max(12, window.innerWidth - rect.width - 12));
        const top = clamp(72 + (this.manager.windows.size - 1) * 18, 24, Math.max(24, window.innerHeight - rect.height - 12));
        this.element.style.left = `${left}px`;
        this.element.style.top = `${top}px`;
        this.positioned = true;
    }

    setFrame(frame = {}) {
        const title = frame.title || this.options.title || 'Window';
        const subtitle = frame.subtitle || this.options.subtitle || '';
        this.titleText.innerHTML = `<strong>${title}</strong>${subtitle ? `<small>${subtitle}</small>` : ''}`;
        setNodeContent(this.bodyEl, frame.body != null ? frame.body : this.options.body || '');
        setNodeContent(this.footerEl, frame.footer != null ? frame.footer : this.options.footer || '');
        this.element.style.width = px(frame.width != null ? frame.width : this.options.width, 'min(720px, calc(100vw - 24px))');
        this.element.style.height = px(frame.height != null ? frame.height : this.options.height, 'auto');
        if (frame.className || this.options.className) {
            this.element.className = ['svui-window', this.options.className, frame.className].filter(Boolean).join(' ');
        }
        if (!this.positioned && !this.element.hidden) this.center();
    }

    body() {
        return this.bodyEl;
    }

    footer() {
        return this.footerEl;
    }

    isOpen() {
        return !this.element.hidden;
    }

    focus() {
        this.manager.focus(this);
        return this;
    }

    open() {
        this.element.hidden = false;
        this.focus();
        if (!this.positioned) this.center();
        return this;
    }

    close() {
        if (this.element.hidden) return this;
        this.element.hidden = true;
        if (typeof this.options.onClose === 'function') this.options.onClose();
        return this;
    }

    toggle(force) {
        const shouldOpen = typeof force === 'boolean' ? force : this.element.hidden;
        return shouldOpen ? this.open() : this.close();
    }
}
