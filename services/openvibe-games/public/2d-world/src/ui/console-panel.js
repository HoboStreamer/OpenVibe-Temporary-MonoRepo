function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function metric(label, value) {
    return `<div class="console-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function attachDrag(root, handle) {
    if (!root || !handle || handle.dataset.dragBound === 'true') return;
    handle.dataset.dragBound = 'true';
    let drag = null;
    handle.addEventListener('pointerdown', (event) => {
        if (event.target && event.target.closest('button, input')) return;
        drag = {
            left: root.offsetLeft,
            top: root.offsetTop,
            x: event.clientX,
            y: event.clientY,
        };
        handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove', (event) => {
        if (!drag) return;
        root.style.left = `${Math.max(16, drag.left + (event.clientX - drag.x))}px`;
        root.style.top = `${Math.max(16, drag.top + (event.clientY - drag.y))}px`;
    });
    const release = () => {
        drag = null;
    };
    handle.addEventListener('pointerup', release);
    handle.addEventListener('pointercancel', release);
}

export class ConsolePanel {
    constructor(root) {
        this.root = root;
    }

    hide() {
        this.root.classList.add('hidden');
    }

    render({ snapshot, meta, logs, filter = '', command = '', suggestions = [] } = {}, handlers = {}) {
        const self = snapshot && snapshot.self || {};
        const performance = snapshot && snapshot.performance || {};
        const world = snapshot && snapshot.world || {};
        const filteredLogs = (logs || []).filter((entry) => {
            const haystack = `${entry && entry.message || ''} ${entry && entry.level || ''}`.toLowerCase();
            return !filter || haystack.includes(String(filter).toLowerCase());
        }).slice(-200);

        this.root.classList.remove('hidden');
        this.root.classList.add('window-panel', 'window-panel--console');
        if (!this.root.style.left) {
            this.root.style.left = '42px';
            this.root.style.top = '66px';
            this.root.style.width = '820px';
            this.root.style.height = '470px';
        }
        this.root.innerHTML = `
            <div class="window-panel__titlebar" data-drag-handle>
                <div>
                    <strong>SourceVibe Console</strong>
                    <small>Commands, cvars, traces, and a healthy amount of old-school terminal swagger.</small>
                </div>
                <button type="button" class="mini-button" data-action="close-console">Close</button>
            </div>
            <div class="window-panel__toolbar">
                <input type="search" data-console-filter placeholder="Filter log" value="${escapeHtml(filter)}" />
                <button type="button" class="mini-button" data-action="clear-console">Clear log</button>
            </div>
            <div class="console-metrics">
                ${metric('Connection', meta && meta.connectionText || 'offline')}
                ${metric('Zone', world.zone_id || '—')}
                ${metric('Tick', snapshot && snapshot.tick || 0)}
                ${metric('Ping', `${Math.round(meta && meta.pingMs || 0)} ms`)}
                ${metric('Inputs', meta && meta.pendingInputs || 0)}
                ${metric('Snapshots', `${meta && meta.snapshotRate || 0} hz`)}
                ${metric('FPS', meta && meta.fps || 0)}
                ${metric('Visible', performance.entities_visible || 0)}
                ${metric('Correction', `${Math.round(Number(meta && meta.correctionErrorPx || 0) * 10) / 10}px`)}
                ${metric('Interp', `${Math.round(meta && meta.interpolationDelayMs || 0)} ms`)}
                ${metric('Smooth', `${Math.round((Number(meta && meta.selfSmoothing || 0) * 100))}%`)}
                ${metric('Position', `${Math.round(self.x || 0)}, ${Math.round(self.y || 0)}`)}
            </div>
            <div class="console-log">${filteredLogs.length
                ? filteredLogs.map((entry) => `
                    <div class="console-line console-line--${escapeHtml(entry.level || 'info')}">
                        <span class="console-line__time">${escapeHtml(entry.time || '--:--:--')}</span>
                        <span>${escapeHtml(entry.message || '')}</span>
                    </div>`).join('')
                : '<div class="empty">No console output yet.</div>'}</div>
            <div class="console-suggestions">${(suggestions || []).slice(0, 12).map((entry) => `
                <button type="button" class="console-suggestion" data-command-suggestion="${escapeHtml(entry && entry.name || '')}">
                    <strong>${escapeHtml(entry && entry.name || '')}</strong>
                    <small>${escapeHtml(entry && (entry.help || entry.description || entry.source) || 'command')}</small>
                </button>`).join('') || '<div class="empty">Type to see command and cvar suggestions.</div>'}</div>
            <form class="console-command-row" data-console-form>
                <span class="console-command-row__prompt">]</span>
                <input type="text" data-console-command placeholder="Enter a SourceVibe command" value="${escapeHtml(command)}" autocomplete="off" spellcheck="false" />
                <button type="submit" class="mini-button">Run</button>
            </form>`;

        attachDrag(this.root, this.root.querySelector('[data-drag-handle]'));
        const filterInput = this.root.querySelector('[data-console-filter]');
        const commandInput = this.root.querySelector('[data-console-command]');
        filterInput?.addEventListener('input', () => handlers.onSetFilter && handlers.onSetFilter(filterInput.value));
        commandInput?.addEventListener('input', () => handlers.onChangeCommand && handlers.onChangeCommand(commandInput.value));
        commandInput?.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowUp') {
                event.preventDefault();
                handlers.onHistoryUp && handlers.onHistoryUp();
            } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                handlers.onHistoryDown && handlers.onHistoryDown();
            }
        });
        this.root.querySelector('[data-console-form]')?.addEventListener('submit', (event) => {
            event.preventDefault();
            handlers.onRun && handlers.onRun(commandInput && commandInput.value || '');
        });
        this.root.querySelector('[data-action="clear-console"]')?.addEventListener('click', () => handlers.onClear && handlers.onClear());
        this.root.querySelector('[data-action="close-console"]')?.addEventListener('click', () => handlers.onClose && handlers.onClose());
        this.root.querySelectorAll('[data-command-suggestion]').forEach((button) => {
            button.addEventListener('click', () => handlers.onUseSuggestion && handlers.onUseSuggestion(button.dataset.commandSuggestion));
        });
    }
}