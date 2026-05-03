import { escapeHtml, normalizeToken } from './dom.js';

function normalizeLog(entry = {}) {
    return {
        at: entry.at || entry.time || '',
        origin: entry.origin || entry.source || 'system',
        level: entry.level || 'info',
        message: entry.message != null ? entry.message : entry.output != null ? entry.output : '',
    };
}

export class SourceConsoleWindow {
    constructor(manager, handlers = {}) {
        this.handlers = handlers;
        this.model = {};
        this.window = manager.createWindow('source-console', {
            title: 'Developer Console',
            subtitle: 'SourceVibe Engine',
            width: 620,
            height: 420,
            onClose: () => this.handlers.onClose && this.handlers.onClose(),
        });
    }

    isOpen() {
        return this.window.isOpen();
    }

    open(model = this.model) {
        this.model = model || {};
        this.window.open();
        this.render();
    }

    close() {
        this.window.close();
    }

    toggle(force, model = this.model) {
        if (typeof force === 'boolean') {
            if (force) this.open(model); else this.close();
            return;
        }
        if (this.isOpen()) this.close(); else this.open(model);
    }

    update(model = this.model) {
        this.model = model || {};
        if (this.isOpen()) this.render();
    }

    render() {
        const model = this.model || {};
        const filter = normalizeToken(model.filter || '');
        const logs = (model.logs || []).map(normalizeLog).filter((entry) => {
            if (!filter) return true;
            return `${entry.at} ${entry.origin} ${entry.message}`.toLowerCase().includes(filter);
        });
        const suggestions = (model.suggestions || []).slice(0, 10);
        this.window.setFrame({
            title: model.title || 'Developer Console',
            subtitle: model.subtitle || 'Shared SourceVibe command surface',
            body: `
                <div class="svui-console">
                    <div class="svui-console__toolbar">
                        <div class="svui-console__toolbar-group">
                            <span class="svui-console__eyebrow">scrollback</span>
                            <input data-role="filter" class="svui-input svui-console__filter" value="${escapeHtml(model.filter || '')}" placeholder="filter log" />
                        </div>
                        <div class="svui-console__toolbar-actions">
                            <button type="button" class="svui-button" data-action="clear">Clear</button>
                        </div>
                    </div>
                    <div class="svui-console__log">
                        ${logs.length ? logs.map((entry) => `
                            <div class="svui-console__entry ${escapeHtml(entry.level)}">
                                <div class="svui-console__meta">${escapeHtml(entry.at || 'now')} · ${escapeHtml(entry.origin)}</div>
                                <div>${escapeHtml(entry.message)}</div>
                            </div>
                        `).join('') : '<div class="svui-empty">Console ready. Try <strong>help</strong>, <strong>status</strong>, or <strong>gamemode_list</strong>.</div>'}
                    </div>
                    <div class="svui-console__suggestions">
                        ${suggestions.map((entry) => `
                            <button type="button" class="svui-chip" data-action="suggestion" data-value="${escapeHtml(entry.name || '')}">
                                <strong>${escapeHtml(entry.name || '')}</strong>
                                <small>${escapeHtml(entry.description || entry.source || 'suggestion')}</small>
                            </button>
                        `).join('')}
                    </div>
                    <form data-role="command-form" class="svui-console__prompt">
                        <span class="svui-console__prompt-glyph">]</span>
                        <input data-role="command" class="svui-input svui-console__command" value="${escapeHtml(model.command || '')}" placeholder="help" autocomplete="off" />
                        <button class="svui-button svui-button--primary" type="submit">Enter</button>
                    </form>
                </div>
            `,
        });

        const root = this.window.body();
        const filterInput = root.querySelector('[data-role="filter"]');
        const commandInput = root.querySelector('[data-role="command"]');
        const form = root.querySelector('[data-role="command-form"]');
        const clearButton = root.querySelector('[data-action="clear"]');

        filterInput?.addEventListener('input', (event) => {
            if (typeof this.handlers.onSetFilter === 'function') this.handlers.onSetFilter(event.target.value);
        });
        clearButton?.addEventListener('click', () => {
            if (typeof this.handlers.onClear === 'function') this.handlers.onClear();
        });
        root.querySelectorAll('[data-action="suggestion"]').forEach((button) => {
            button.addEventListener('click', () => {
                if (typeof this.handlers.onUseSuggestion === 'function') this.handlers.onUseSuggestion(button.dataset.value || '');
            });
        });
        form?.addEventListener('submit', (event) => {
            event.preventDefault();
            if (typeof this.handlers.onRun === 'function') this.handlers.onRun(commandInput.value || '');
        });
        commandInput?.addEventListener('input', (event) => {
            if (typeof this.handlers.onChangeCommand === 'function') this.handlers.onChangeCommand(event.target.value);
        });
        commandInput?.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowUp') {
                event.preventDefault();
                if (typeof this.handlers.onHistoryUp === 'function') this.handlers.onHistoryUp();
            }
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                if (typeof this.handlers.onHistoryDown === 'function') this.handlers.onHistoryDown();
            }
            if (event.key === 'Tab' && suggestions.length) {
                event.preventDefault();
                if (typeof this.handlers.onUseSuggestion === 'function') this.handlers.onUseSuggestion(suggestions[0].name || '');
            }
        });
        commandInput?.focus({ preventScroll: true });
        if (commandInput) commandInput.selectionStart = commandInput.selectionEnd = commandInput.value.length;
    }
}
