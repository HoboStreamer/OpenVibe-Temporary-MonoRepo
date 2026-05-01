'use strict';

const vm = require('vm');

function createAddonSandbox({ SV, addon, realm = 'server', print = console.log }) {
    const sandbox = {
        SV,
        hook: SV && SV.hook,
        net: SV && SV.net,
        ents: SV && SV.ents,
        addon,
        realm,
        print: (...args) => print(`[sourcevibe:${addon && addon.id || 'addon'}:${realm}]`, ...args),
        console: {
            log: (...args) => print(`[sourcevibe:${addon && addon.id || 'addon'}:${realm}]`, ...args),
        },
    };
    sandbox.global = sandbox;
    return sandbox;
}

function runScriptInSandbox(code, options = {}) {
    const sandbox = createAddonSandbox(options);
    const context = vm.createContext(sandbox);
    const script = new vm.Script(String(code || ''), {
        filename: options.filename || `${options.addon && options.addon.id || 'addon'}.${options.realm || 'server'}.js`,
    });
    script.runInContext(context, { timeout: Number(options.timeoutMs) || 50 });
    return sandbox;
}

module.exports = {
    createAddonSandbox,
    runScriptInSandbox,
};
