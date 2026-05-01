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

export class ConsolePanel {
    constructor(root) {
        this.root = root;
    }

    hide() {
        this.root.classList.add('hidden');
    }

    render({ snapshot, meta, logs, onClear } = {}) {
        const self = snapshot && snapshot.self || {};
        const performance = snapshot && snapshot.performance || {};
        const world = snapshot && snapshot.world || {};
        this.root.classList.remove('hidden');
        this.root.innerHTML = `
            <div class="panel-header">Console</div>
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
                ${metric('Interp delay', `${Math.round(meta && meta.interpolationDelayMs || 0)} ms`)}
                ${metric('Smoothing', Math.round((Number(meta && meta.selfSmoothing || 0) * 100)) + '%')}
                ${metric('Position', `${Math.round(self.x || 0)}, ${Math.round(self.y || 0)}`)}
            </div>
            <div class="console-toolbar">
                <span>Runtime trace for prediction, connectivity, and player actions.</span>
                <button type="button" class="mini-button" data-action="clear-console">Clear log</button>
            </div>
            <div class="console-log">${(logs || []).length
                ? logs.map((entry) => `
                    <div class="console-line console-line--${escapeHtml(entry.level || 'info')}">
                        <span class="console-line__time">${escapeHtml(entry.time || '--:--:--')}</span>
                        <span>${escapeHtml(entry.message || '')}</span>
                    </div>`).join('')
                : '<div class="empty">No runtime messages yet.</div>'}</div>`;
        const clearButton = this.root.querySelector('[data-action="clear-console"]');
        if (clearButton) clearButton.onclick = () => onClear && onClear();
    }
}