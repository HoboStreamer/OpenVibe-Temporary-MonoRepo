function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

export class SettingsPanel {
    constructor(root) {
        this.root = root;
    }

    hide() {
        this.root.classList.add('hidden');
    }

    render(settings, { onChange, onReset } = {}) {
        const next = settings || {};
        this.root.classList.remove('hidden');
        this.root.innerHTML = `
            <div class="panel-header">Settings</div>
            <div class="settings-grid">
                <label class="setting-row">
                    <div>
                        <strong>Fade HUD at rest</strong>
                        <small>Let the HUD sink into the background when you stop moving.</small>
                    </div>
                    <input type="checkbox" data-key="hudFade" ${next.hudFade ? 'checked' : ''} />
                </label>
                <label class="setting-row">
                    <div>
                        <strong>Show HUD feed</strong>
                        <small>Keep the tiny event ticker visible in the main HUD.</small>
                    </div>
                    <input type="checkbox" data-key="showFeed" ${next.showFeed ? 'checked' : ''} />
                </label>
                <label class="setting-row">
                    <div>
                        <strong>Show hotkey strip</strong>
                        <small>Display the panel shortcut legend near the bottom edge.</small>
                    </div>
                    <input type="checkbox" data-key="showHotkeys" ${next.showHotkeys ? 'checked' : ''} />
                </label>
                <label class="setting-row setting-row--stacked">
                    <div>
                        <strong>Interpolation delay</strong>
                        <small>Higher values are steadier; lower values are snappier.</small>
                    </div>
                    <input type="range" data-key="interpolationDelayMs" min="40" max="160" step="5" value="${Math.round(next.interpolationDelayMs || 75)}" />
                    <span class="slider-value">${escapeHtml(Math.round(next.interpolationDelayMs || 75))} ms</span>
                </label>
                <label class="setting-row setting-row--stacked">
                    <div>
                        <strong>Self correction smoothing</strong>
                        <small>Blend out prediction corrections so your player feels less yanky.</small>
                    </div>
                    <input type="range" data-key="selfSmoothing" min="0.08" max="0.55" step="0.01" value="${Number(next.selfSmoothing || 0.22).toFixed(2)}" />
                    <span class="slider-value">${escapeHtml(Math.round((Number(next.selfSmoothing || 0.22)) * 100))}%</span>
                </label>
            </div>
            <div class="console-toolbar">
                <span>Changes save locally for this browser.</span>
                <button type="button" class="mini-button" data-action="reset-settings">Reset defaults</button>
            </div>`;

        this.root.querySelectorAll('[data-key]').forEach((input) => {
            const eventName = input.type === 'checkbox' ? 'change' : 'input';
            input.addEventListener(eventName, () => {
                const key = input.dataset.key;
                const value = input.type === 'checkbox' ? !!input.checked : Number(input.value);
                if (onChange) onChange(Object.assign({}, next, { [key]: value }));
            });
        });
        const resetButton = this.root.querySelector('[data-action="reset-settings"]');
        if (resetButton) resetButton.onclick = () => onReset && onReset();
    }
}