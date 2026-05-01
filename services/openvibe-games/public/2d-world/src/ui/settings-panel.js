function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

const TABS = [
    { id: 'keyboard', label: 'Keyboard' },
    { id: 'mouse', label: 'Mouse' },
    { id: 'hud', label: 'HUD' },
    { id: 'network', label: 'Network' },
    { id: 'advanced', label: 'Advanced' },
];

function attachDrag(root, handle) {
    if (!root || !handle || handle.dataset.dragBound === 'true') return;
    handle.dataset.dragBound = 'true';
    let drag = null;
    handle.addEventListener('pointerdown', (event) => {
        if (event.target && event.target.closest('button, input, select')) return;
        drag = { left: root.offsetLeft, top: root.offsetTop, x: event.clientX, y: event.clientY };
        handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove', (event) => {
        if (!drag) return;
        root.style.left = `${Math.max(16, drag.left + (event.clientX - drag.x))}px`;
        root.style.top = `${Math.max(16, drag.top + (event.clientY - drag.y))}px`;
    });
    const release = () => { drag = null; };
    handle.addEventListener('pointerup', release);
    handle.addEventListener('pointercancel', release);
}

function renderLocalSettingRow(setting) {
    if (setting.type === 'checkbox') {
        return `
            <label class="setting-row">
                <div>
                    <strong>${escapeHtml(setting.label)}</strong>
                    <small>${escapeHtml(setting.description)}</small>
                </div>
                <input type="checkbox" data-setting-key="${escapeHtml(setting.key)}" ${setting.value ? 'checked' : ''} />
            </label>`;
    }
    return `
        <label class="setting-row setting-row--stacked">
            <div>
                <strong>${escapeHtml(setting.label)}</strong>
                <small>${escapeHtml(setting.description)}</small>
            </div>
            <input type="range" data-setting-key="${escapeHtml(setting.key)}" min="${escapeHtml(setting.min)}" max="${escapeHtml(setting.max)}" step="${escapeHtml(setting.step)}" value="${escapeHtml(setting.value)}" />
            <span class="slider-value">${escapeHtml(setting.displayValue)}</span>
        </label>`;
}

export class SettingsPanel {
    constructor(root) {
        this.root = root;
    }

    hide() {
        this.root.classList.add('hidden');
    }

    render(model = {}, handlers = {}) {
        const activeTab = model.activeTab || 'keyboard';
        const binds = model.binds || [];
        const cvars = model.cvars || [];
        const settings = model.settings || {};
        const filteredAdvanced = cvars.filter((entry) => !['cl_showpos', 'cl_smooth', 'cl_smoothtime', 'cl_extrapolate', 'cl_extrapolate_amount'].includes(entry.name));
        const localSettingsByTab = {
            hud: [
                {
                    key: 'hudFade',
                    type: 'checkbox',
                    label: 'Fade HUD at rest',
                    description: 'Let the HUD sink into the background when you stop moving.',
                    value: !!settings.hudFade,
                },
                {
                    key: 'showFeed',
                    type: 'checkbox',
                    label: 'Show event feed',
                    description: 'Display the ticker for pickups, crafting, and system events.',
                    value: !!settings.showFeed,
                },
                {
                    key: 'showHotkeys',
                    type: 'checkbox',
                    label: 'Show hotkey legend',
                    description: 'Keep the small helper strip visible at the bottom of the HUD.',
                    value: !!settings.showHotkeys,
                },
            ],
            mouse: [
                {
                    key: 'selfSmoothing',
                    type: 'range',
                    label: 'Self correction smoothing',
                    description: 'Blend out prediction corrections so your player feels less yanky.',
                    min: '0.08',
                    max: '0.55',
                    step: '0.01',
                    value: Number(settings.selfSmoothing || 0.22).toFixed(2),
                    displayValue: `${Math.round(Number(settings.selfSmoothing || 0.22) * 100)}%`,
                },
                {
                    key: 'mouseSensitivity',
                    type: 'range',
                    label: 'Mouse sensitivity',
                    description: 'UI-facing sensitivity multiplier for aim feel and panel drag speed.',
                    min: '0.4',
                    max: '2.5',
                    step: '0.05',
                    value: Number(settings.mouseSensitivity || 1).toFixed(2),
                    displayValue: `${Number(settings.mouseSensitivity || 1).toFixed(2)}x`,
                },
            ],
            network: [
                {
                    key: 'interpolationDelayMs',
                    type: 'range',
                    label: 'Interpolation delay',
                    description: 'Higher values are steadier; lower values are snappier.',
                    min: '40',
                    max: '160',
                    step: '5',
                    value: `${Math.round(settings.interpolationDelayMs || 75)}`,
                    displayValue: `${Math.round(settings.interpolationDelayMs || 75)} ms`,
                },
            ],
        };

        let body = '';
        if (activeTab === 'keyboard') {
            body = `
                <div class="settings-bind-list">
                    ${binds.map((entry) => `
                        <label class="setting-row settings-bind-row">
                            <div>
                                <strong>${escapeHtml(entry.command)}</strong>
                                <small>${escapeHtml(entry.description || entry.help || 'Key binding')}</small>
                            </div>
                            <input type="text" data-bind-command="${escapeHtml(entry.command)}" value="${escapeHtml(entry.key || '')}" maxlength="24" placeholder="unbound" />
                        </label>`).join('') || '<div class="empty">No SourceVibe binds are registered.</div>'}
                </div>`;
        } else if (activeTab === 'mouse') {
            const mouseCvars = cvars.filter((entry) => ['cl_smooth', 'cl_smoothtime'].includes(entry.name));
            body = `
                <div class="settings-grid">${(localSettingsByTab.mouse || []).map(renderLocalSettingRow).join('')}</div>
                <div class="settings-cvar-group">
                    ${mouseCvars.map((entry) => `
                        <label class="setting-row">
                            <div>
                                <strong>${escapeHtml(entry.name)}</strong>
                                <small>${escapeHtml(entry.description || entry.help || 'Client cvar')}</small>
                            </div>
                            <input type="text" data-cvar-name="${escapeHtml(entry.name)}" value="${escapeHtml(entry.value)}" />
                        </label>`).join('')}
                </div>`;
        } else if (activeTab === 'hud') {
            const hudCvars = cvars.filter((entry) => ['cl_showpos'].includes(entry.name));
            body = `
                <div class="settings-grid">${(localSettingsByTab.hud || []).map(renderLocalSettingRow).join('')}</div>
                <div class="settings-cvar-group">
                    ${hudCvars.map((entry) => `
                        <label class="setting-row">
                            <div>
                                <strong>${escapeHtml(entry.name)}</strong>
                                <small>${escapeHtml(entry.description || entry.help || 'HUD cvar')}</small>
                            </div>
                            <input type="text" data-cvar-name="${escapeHtml(entry.name)}" value="${escapeHtml(entry.value)}" />
                        </label>`).join('')}
                </div>`;
        } else if (activeTab === 'network') {
            const netCvars = cvars.filter((entry) => ['cl_extrapolate', 'cl_extrapolate_amount'].includes(entry.name));
            body = `
                <div class="settings-grid">${(localSettingsByTab.network || []).map(renderLocalSettingRow).join('')}</div>
                <div class="settings-cvar-group">
                    ${netCvars.map((entry) => `
                        <label class="setting-row">
                            <div>
                                <strong>${escapeHtml(entry.name)}</strong>
                                <small>${escapeHtml(entry.description || entry.help || 'Prediction cvar')}</small>
                            </div>
                            <input type="text" data-cvar-name="${escapeHtml(entry.name)}" value="${escapeHtml(entry.value)}" />
                        </label>`).join('')}
                </div>`;
        } else {
            body = `
                <div class="settings-cvar-group">
                    ${filteredAdvanced.map((entry) => `
                        <label class="setting-row">
                            <div>
                                <strong>${escapeHtml(entry.name)}</strong>
                                <small>${escapeHtml(entry.description || entry.help || 'Advanced cvar')}</small>
                            </div>
                            <input type="text" data-cvar-name="${escapeHtml(entry.name)}" value="${escapeHtml(entry.value)}" />
                        </label>`).join('') || '<div class="empty">No additional cvars in this build.</div>'}
                </div>`;
        }

        this.root.classList.remove('hidden');
        this.root.classList.add('window-panel', 'window-panel--settings');
        if (!this.root.style.left) {
            this.root.style.left = '120px';
            this.root.style.top = '92px';
            this.root.style.width = '860px';
            this.root.style.height = '540px';
        }
        this.root.innerHTML = `
            <div class="window-panel__titlebar" data-drag-handle>
                <div>
                    <strong>Options</strong>
                    <small>Source-style settings with binds, cvars, and client-side presentation tweaks.</small>
                </div>
                <button type="button" class="mini-button" data-action="close-settings">Close</button>
            </div>
            <div class="settings-layout">
                <aside class="settings-tabs">
                    ${TABS.map((tab) => `<button type="button" class="settings-tab ${tab.id === activeTab ? 'active' : ''}" data-tab-id="${escapeHtml(tab.id)}">${escapeHtml(tab.label)}</button>`).join('')}
                </aside>
                <section class="settings-content">${body}</section>
            </div>
            <div class="window-panel__footer">
                <span>Apply saves browser settings locally and pushes binds/cvars through SourceVibe.</span>
                <div class="window-panel__footer-actions">
                    <button type="button" class="mini-button" data-action="reset-settings">Use defaults</button>
                    <button type="button" class="mini-button" data-action="cancel-settings">Cancel</button>
                    <button type="button" class="mini-button mini-button--primary" data-action="apply-settings">Apply</button>
                </div>
            </div>`;

        attachDrag(this.root, this.root.querySelector('[data-drag-handle]'));
        this.root.querySelectorAll('[data-tab-id]').forEach((button) => {
            button.addEventListener('click', () => handlers.onTabChange && handlers.onTabChange(button.dataset.tabId));
        });
        this.root.querySelectorAll('[data-setting-key]').forEach((input) => {
            const eventName = input.type === 'checkbox' ? 'change' : 'input';
            input.addEventListener(eventName, () => {
                const key = input.dataset.settingKey;
                const value = input.type === 'checkbox' ? !!input.checked : Number(input.value);
                handlers.onSettingChange && handlers.onSettingChange(key, value);
            });
        });
        this.root.querySelectorAll('[data-bind-command]').forEach((input) => {
            input.addEventListener('input', () => handlers.onBindChange && handlers.onBindChange(input.dataset.bindCommand, input.value));
        });
        this.root.querySelectorAll('[data-cvar-name]').forEach((input) => {
            input.addEventListener('input', () => handlers.onCvarChange && handlers.onCvarChange(input.dataset.cvarName, input.value));
        });
        this.root.querySelector('[data-action="apply-settings"]')?.addEventListener('click', () => handlers.onApply && handlers.onApply());
        this.root.querySelector('[data-action="cancel-settings"]')?.addEventListener('click', () => handlers.onCancel && handlers.onCancel());
        this.root.querySelector('[data-action="reset-settings"]')?.addEventListener('click', () => handlers.onReset && handlers.onReset());
        this.root.querySelector('[data-action="close-settings"]')?.addEventListener('click', () => handlers.onClose && handlers.onClose());
    }
}