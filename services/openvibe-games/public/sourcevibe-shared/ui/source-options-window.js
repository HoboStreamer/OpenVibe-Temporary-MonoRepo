import { escapeHtml, normalizeToken } from './dom.js';

const DEFAULT_TABS = ['Keyboard', 'Mouse', 'Audio', 'Video', 'Voice', 'Multiplayer', 'Advanced'];

function tabId(label) {
    return normalizeToken(label || '').replace(/[^a-z0-9]+/g, '-');
}

function checkbox(name, label, checked, help) {
    return `
        <label class="svui-setting-row svui-setting-row--checkbox">
            <input type="checkbox" data-setting="${escapeHtml(name)}" ${checked ? 'checked' : ''} />
            <span>
                <strong>${escapeHtml(label)}</strong>
                ${help ? `<small>${escapeHtml(help)}</small>` : ''}
            </span>
        </label>
    `;
}

function textInput(kind, name, label, value, help) {
    return `
        <label class="svui-setting-row">
            <span>
                <strong>${escapeHtml(label)}</strong>
                ${help ? `<small>${escapeHtml(help)}</small>` : ''}
            </span>
            <input class="svui-input" data-${escapeHtml(kind)}="${escapeHtml(name)}" value="${escapeHtml(value)}" />
        </label>
    `;
}

function normalizeBindingToken(value) {
    const token = normalizeToken(value || '');
    if (!token) return '';
    if (token === 'spacebar') return 'space';
    if (token === ' ') return 'space';
    return token;
}

function bindingFromEvent(event) {
    if (!event) return '';
    if (event.key === ' ') return 'space';
    return normalizeBindingToken(event.key);
}

function renderBindings(binds = []) {
    return binds.length ? binds.map((entry) => textInput('bind', entry.command, entry.command, entry.key || '', entry.description || '')) .join('') : '<div class="svui-empty">No bindings exposed by this surface.</div>';
}

function renderCvars(cvars = []) {
    return cvars.length ? cvars.map((entry) => textInput('cvar', entry.name, entry.name, entry.value, entry.description || '')) .join('') : '<div class="svui-empty">No replicated cvars surfaced here yet.</div>';
}

export class SourceOptionsWindow {
    constructor(manager, handlers = {}) {
        this.handlers = handlers;
        this.model = {};
        this.window = manager.createWindow('source-options', {
            title: 'Options',
            subtitle: 'Shared SourceVibe settings',
            width: 680,
            height: 540,
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
        const tabs = (model.tabs && model.tabs.length ? model.tabs : DEFAULT_TABS).map((label) => ({ label, id: tabId(label) }));
        const activeTab = tabId(model.activeTab || tabs[0].label);
        const settings = model.settings || {};
        const binds = model.binds || [];
        const cvars = model.cvars || [];
        const netCvars = cvars.filter((entry) => /^(cl_|rate|net_graph|sv_)/.test(entry.name || ''));
        const videoCvars = cvars.filter((entry) => /^(cl_show|cl_pdump|cl_prediction)/.test(entry.name || ''));

        let panelContent = '';
        switch (activeTab) {
        case 'keyboard':
            panelContent = `
                <div class="svui-section">
                    <h3>Keyboard bindings</h3>
                    <p>These binds are shared between the launcher and the active gamemode.</p>
                    <div class="svui-setting-list">${renderBindings(binds)}</div>
                </div>
            `;
            break;
        case 'mouse':
            panelContent = `
                <div class="svui-section">
                    <h3>Mouse controls</h3>
                    <div class="svui-setting-list">
                        ${textInput('setting', 'mouseSensitivity', 'Mouse sensitivity', settings.mouseSensitivity ?? 1, 'Client-side pointer sensitivity multiplier.')}
                        ${textInput('cvar', 'cl_smooth', 'Prediction smoothing', cvars.find((entry) => entry.name === 'cl_smooth')?.value ?? 1, 'Enable smooth correction blending.')}
                        ${textInput('cvar', 'cl_smoothtime', 'Smooth time', cvars.find((entry) => entry.name === 'cl_smoothtime')?.value ?? 0.1, 'Seconds spent blending large corrections.')}
                    </div>
                </div>
            `;
            break;
        case 'audio':
            panelContent = `
                <div class="svui-section">
                    <h3>Audio</h3>
                    <p>Audio mix groups move into this shared dialog as the SourceVibe surfaces expose them. For now the launcher keeps the slot warm instead of pretending it exists. Honest UI: the rarest loot drop.</p>
                </div>
            `;
            break;
        case 'video':
            panelContent = `
                <div class="svui-section">
                    <h3>Video & HUD</h3>
                    <div class="svui-setting-list">
                        ${checkbox('hudFade', 'Fade HUD when idle', settings.hudFade !== false, 'Dim the HUD while you are not interacting.')}
                        ${checkbox('showFeed', 'Show event feed', settings.showFeed === true, 'Keep the world event feed visible.')}
                        ${checkbox('showHotkeys', 'Show hotkey legend', settings.showHotkeys === true, 'Display the quick hotkey reminder strip.')}
                        ${renderCvars(videoCvars)}
                    </div>
                </div>
            `;
            break;
        case 'voice':
            panelContent = `
                <div class="svui-section">
                    <h3>Voice</h3>
                    <p>Voice controls land here once the shared OpenVibe voice path is surfaced. Until then this tab documents the contract instead of faking toggles.</p>
                </div>
            `;
            break;
        case 'multiplayer':
            panelContent = `
                <div class="svui-section">
                    <h3>Multiplayer</h3>
                    <div class="svui-setting-list">
                        ${textInput('setting', 'interpolationDelayMs', 'Interpolation delay (ms)', settings.interpolationDelayMs ?? 75, 'Render delay for snapshot interpolation.')}
                        ${textInput('setting', 'selfSmoothing', 'Self smoothing', settings.selfSmoothing ?? 0.22, 'Blend factor for local correction smoothing.')}
                        ${renderCvars(netCvars)}
                    </div>
                </div>
            `;
            break;
        default:
            panelContent = `
                <div class="svui-section">
                    <h3>Advanced</h3>
                    <div class="svui-setting-list">
                        ${renderCvars(cvars)}
                    </div>
                </div>
            `;
            break;
        }

        this.window.setFrame({
            title: model.title || 'Options',
            subtitle: model.subtitle || 'Compact shared Source-style settings',
            body: `
                <div class="svui-options">
                    <div class="svui-tabs">
                        ${tabs.map((tab) => `
                            <button type="button" class="svui-tab ${tab.id === activeTab ? 'active' : ''}" data-action="tab" data-tab="${escapeHtml(tab.id)}">${escapeHtml(tab.label)}</button>
                        `).join('')}
                    </div>
                    <div class="svui-options__panel">${panelContent}</div>
                </div>
            `,
            footer: `
                <div class="svui-window__footer-actions">
                    <button type="button" class="svui-button" data-action="reset">Reset</button>
                    <button type="button" class="svui-button" data-action="cancel">Cancel</button>
                    <button type="button" class="svui-button svui-button--primary" data-action="apply">Apply</button>
                </div>
            `,
        });

        const root = this.window.element;
        root.querySelectorAll('[data-action="tab"]').forEach((button) => {
            button.addEventListener('click', () => {
                if (typeof this.handlers.onTabChange === 'function') this.handlers.onTabChange(button.dataset.tab || 'keyboard');
            });
        });
        root.querySelectorAll('[data-setting]').forEach((input) => {
            const handler = () => {
                const key = input.dataset.setting;
                const value = input.type === 'checkbox' ? input.checked : input.value;
                if (typeof this.handlers.onSettingChange === 'function') this.handlers.onSettingChange(key, value);
            };
            input.addEventListener(input.type === 'checkbox' ? 'change' : 'input', handler);
        });
        root.querySelectorAll('[data-bind]').forEach((input) => {
            input.addEventListener('input', () => {
                if (typeof this.handlers.onBindChange === 'function') this.handlers.onBindChange(input.dataset.bind, input.value);
            });
            input.addEventListener('focus', () => {
                input.select();
            });
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Tab') return;
                event.preventDefault();
                const token = bindingFromEvent(event);
                if (!token) return;
                input.value = token;
                if (typeof this.handlers.onBindChange === 'function') this.handlers.onBindChange(input.dataset.bind, token);
            });
        });
        root.querySelectorAll('[data-cvar]').forEach((input) => {
            input.addEventListener('input', () => {
                if (typeof this.handlers.onCvarChange === 'function') this.handlers.onCvarChange(input.dataset.cvar, input.value);
            });
        });
        root.querySelector('[data-action="apply"]')?.addEventListener('click', () => this.handlers.onApply && this.handlers.onApply());
        root.querySelector('[data-action="reset"]')?.addEventListener('click', () => this.handlers.onReset && this.handlers.onReset());
        root.querySelector('[data-action="cancel"]')?.addEventListener('click', () => this.handlers.onCancel && this.handlers.onCancel());
    }
}
