'use strict';

function splitArgs(inputString = '') {
    const input = String(inputString || '').trim();
    if (!input) return [];
    const parts = [];
    let current = '';
    let quote = null;
    for (let index = 0; index < input.length; index += 1) {
        const char = input[index];
        if (quote) {
            if (char === quote) {
                quote = null;
                continue;
            }
            if (char === '\\' && index + 1 < input.length) {
                current += input[index + 1];
                index += 1;
                continue;
            }
            current += char;
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            continue;
        }
        if (/\s/.test(char)) {
            if (current) {
                parts.push(current);
                current = '';
            }
            continue;
        }
        current += char;
    }
    if (current) parts.push(current);
    return parts;
}

function createCommandExecutor({ commands, cvars, binds }) {
    return {
        Run(inputString, context = {}) {
            const argv = splitArgs(inputString);
            if (!argv.length) return { ok: false, output: '', code: 'empty' };
            const [head, ...args] = argv;
            const command = commands.Get(head);
            if (command) {
                return command.handler({
                    raw: String(inputString || ''),
                    argv,
                    args,
                    context,
                    commands,
                    cvars,
                    binds,
                });
            }
            const cvar = cvars.Get(head);
            if (cvar) {
                if (!args.length) {
                    return {
                        ok: true,
                        output: `${cvar.name} = ${cvar.value}`,
                        cvar,
                    };
                }
                const updated = cvars.Set(head, args.join(' '));
                return {
                    ok: true,
                    output: `${updated.name} = ${updated.value}`,
                    cvar: updated,
                };
            }
            return {
                ok: false,
                output: `unknown command or cvar: ${head}`,
                code: 'unknown',
            };
        },
        Autocomplete(inputString = '') {
            const prefix = String(inputString || '').trim().toLowerCase();
            const commandNames = commands.Autocomplete(prefix).map((entry) => ({ type: 'command', value: entry.name, description: entry.description }));
            const cvarNames = cvars.Autocomplete(prefix).map((entry) => ({ type: 'cvar', value: entry.name, description: entry.description }));
            return [...commandNames, ...cvarNames].sort((a, b) => a.value.localeCompare(b.value));
        },
        splitArgs,
    };
}

module.exports = {
    createCommandExecutor,
    splitArgs,
};
