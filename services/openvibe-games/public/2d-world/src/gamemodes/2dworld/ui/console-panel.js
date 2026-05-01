function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
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

    render({ snapshot, meta, logs, filter = '', command = '' } = {}, handlers = {}) {
        const self = snapshot && snapshot.self || {};
        const world = snapshot && snapshot.world || {};
        const filteredLogs = (logs || []).filter((entry) => {
            const haystack = `${entry && entry.message || ''} ${entry && entry.level || ''}`.toLowerCase();
            return !filter || haystack.includes(String(filter).toLowerCase());
        }).slice(-240);

        this.root.classList.remove('hidden');
        this.root.classList.add('window-panel', 'window-panel--console', 'legacy-console-panel');
        if (!this.root.style.left) {
            this.root.style.left = '34px';
            this.root.style.top = '58px';
            this.root.style.width = '840px';
            this.root.style.height = '500px';
        }
        this.root.innerHTML = `
            <div class="legacy-console-panel__titlebar" data-drag-handle>
                <div>
                    <strong>SourceVibe Console</strong>
                    <small>${escapeHtml(meta && meta.connectionText || 'offline')} · ${escapeHtml(world.zone_id || '—')} · ${Math.round(meta && meta.pingMs || 0)}ms · ${Math.round(meta && meta.fps || 0)}fps</small>
                </div>
                <div class="legacy-console-panel__actions">
                    <input type="search" data-console-filter placeholder="find in console" value="${escapeHtml(filter)}" />
                    <button type="button" class="mini-button" data-action="clear-console">Clear</button>
                    <button type="button" class="mini-button" data-action="close-console">Close</button>
                </div>
            </div>
            <div class="legacy-console-panel__status">pos ${Math.round(self.x || 0)} ${Math.round(self.y || 0)} · tick ${Math.round(snapshot && snapshot.tick || 0)} · pending ${Math.round(meta && meta.pendingInputs || 0)} · interp ${Math.round(meta && meta.interpolationDelayMs || 0)}ms</div>
            <div class="legacy-console-panel__log">${filteredLogs.length
                ? filteredLogs.map((entry) => `
                    <div class="legacy-console-line legacy-console-line--${escapeHtml(entry.level || 'info')}">
                        <span class="legacy-console-line__time">${escapeHtml(entry.time || '--:--:--')}</span>
                        <span class="legacy-console-line__message">${escapeHtml(entry.message || '')}</span>
                    </div>`).join('')
                : '<div class="empty">No console output yet.</div>'}</div>
            <form class="legacy-console-panel__command" data-console-form>
                <span class="legacy-console-panel__prompt">]</span>
                <input type="text" data-console-command placeholder="enter a command" value="${escapeHtml(command)}" autocomplete="off" spellcheck="false" />
                <button type="submit" class="mini-button mini-button--primary">Run</button>
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
    }
}
