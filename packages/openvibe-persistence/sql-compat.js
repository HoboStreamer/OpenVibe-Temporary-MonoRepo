'use strict';

const SQLITE_NOW_RE = /STRFTIME\s*\(\s*'%Y-%m-%d %H:%M:%f'\s*,\s*'now'\s*\)/gi;
const SQLITE_RANDOM_HEX_RE = /lower\s*\(\s*hex\s*\(\s*randomblob\s*\(\s*8\s*\)\s*\)\s*\)/gi;
const SQLITE_INTEGER_PK_ALIAS_RE = /(\b["`]?([a-zA-Z_][\w]*)["`]?\b)\s+INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b/gi;
const SQLITE_DATETIME_TYPE_RE = /\bDATETIME\b(?!\s*\()/gi;
const SQLITE_DATETIME_FUNCTION_RE = /\bdatetime\s*\(([^()]*)\)/gi;

function splitFunctionArguments(source) {
    const text = String(source || '');
    const parts = [];
    let current = '';
    let inSingle = false;
    let inDouble = false;
    let depth = 0;

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        const next = text[index + 1];
        current += char;

        if (char === '\\' && (inSingle || inDouble) && next) {
            current += next;
            index += 1;
            continue;
        }

        if (!inDouble && char === '\'') {
            if (inSingle && next === '\'') {
                current += next;
                index += 1;
                continue;
            }
            inSingle = !inSingle;
            continue;
        }
        if (!inSingle && char === '"') {
            inDouble = !inDouble;
            continue;
        }
        if (inSingle || inDouble) continue;

        if (char === '(') {
            depth += 1;
            continue;
        }
        if (char === ')' && depth > 0) {
            depth -= 1;
            continue;
        }
        if (char === ',' && depth === 0) {
            parts.push(current.slice(0, -1).trim());
            current = '';
        }
    }

    const tail = current.trim();
    if (tail) parts.push(tail);
    return parts;
}

function isSqlStringLiteral(value) {
    return /^'(?:[^']|'')*'$/i.test(String(value || '').trim());
}

function isSqlNowLiteral(value) {
    return /^'now'$/i.test(String(value || '').trim());
}

function normalizeDatetimeBase(argument) {
    const value = String(argument || '').trim();
    if (!value) return value;
    if (isSqlNowLiteral(value)) return 'CURRENT_TIMESTAMP';
    if (isSqlStringLiteral(value)) return `(${value})::timestamptz`;
    return value;
}

function translateSqliteDatetimeCall(_match, argsSource) {
    const args = splitFunctionArguments(argsSource);
    if (!args.length) return _match;

    const base = normalizeDatetimeBase(args[0]);
    if (!base) return _match;

    const modifiers = args.slice(1).map((entry) => String(entry || '').trim()).filter(Boolean);
    if (!modifiers.length) return base;

    const intervals = modifiers.map((modifier) => `((${modifier})::interval)`);
    return `(${base} ${intervals.map((interval) => `+ ${interval}`).join(' ')})`;
}

function splitSqlStatements(source) {
    const text = String(source || '');
    const statements = [];
    let current = '';
    let inSingle = false;
    let inDouble = false;

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        const next = text[index + 1];
        current += char;

        if (char === '\\' && (inSingle || inDouble) && next) {
            current += next;
            index += 1;
            continue;
        }

        if (!inDouble && char === '\'') {
            if (inSingle && next === '\'') {
                current += next;
                index += 1;
                continue;
            }
            inSingle = !inSingle;
            continue;
        }
        if (!inSingle && char === '"') {
            inDouble = !inDouble;
            continue;
        }

        if (!inSingle && !inDouble && char === ';') {
            const statement = current.slice(0, -1).trim();
            if (statement) statements.push(statement);
            current = '';
        }
    }

    const tail = current.trim();
    if (tail) statements.push(tail);
    return statements;
}

function replacePositionalParameters(sql) {
    const text = String(sql || '');
    let output = '';
    let inSingle = false;
    let inDouble = false;
    let position = 0;

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        const next = text[index + 1];

        if (char === '\\' && (inSingle || inDouble) && next) {
            output += char + next;
            index += 1;
            continue;
        }

        if (!inDouble && char === '\'') {
            output += char;
            if (inSingle && next === '\'') {
                output += next;
                index += 1;
                continue;
            }
            inSingle = !inSingle;
            continue;
        }
        if (!inSingle && char === '"') {
            output += char;
            inDouble = !inDouble;
            continue;
        }

        if (!inSingle && !inDouble && char === '?') {
            position += 1;
            output += `$${position}`;
            continue;
        }

        output += char;
    }

    return output;
}

function injectRowIdColumn(sql) {
    if (!/^CREATE\s+TABLE\b/i.test(sql)) return sql;
    if (/\browid\b/i.test(sql)) return sql;
    const openIndex = sql.indexOf('(');
    if (openIndex === -1) return sql;
    return `${sql.slice(0, openIndex + 1)}\n    rowid BIGINT GENERATED BY DEFAULT AS IDENTITY UNIQUE,${sql.slice(openIndex + 1)}`;
}

function normalizeSchemaSql(sql) {
    let text = String(sql || '').trim();
    if (!text) return text;
    text = text.replace(SQLITE_INTEGER_PK_ALIAS_RE, (_match, columnExpression, columnName) => {
        const normalizedColumn = columnExpression || columnName || 'id';
        return `${normalizedColumn} BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,\n            rowid BIGINT GENERATED ALWAYS AS (${normalizedColumn}) STORED UNIQUE`;
    });
    text = text.replace(/\bINT\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b/gi, 'BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY');
    text = text.replace(/\bAUTOINCREMENT\b/gi, 'GENERATED BY DEFAULT AS IDENTITY');
    text = text.replace(SQLITE_DATETIME_TYPE_RE, 'TIMESTAMPTZ');
    text = text.replace(/\bBOOLEAN\b/gi, 'INTEGER');
    text = text.replace(/\bALTER\s+TABLE\s+([^\s]+)\s+ADD\s+COLUMN\s+(?!IF\s+NOT\s+EXISTS\b)/gi, 'ALTER TABLE $1 ADD COLUMN IF NOT EXISTS ');
    text = injectRowIdColumn(text);
    return text;
}

function applyFunctionCompat(sql) {
    return String(sql || '')
        .replace(SQLITE_NOW_RE, 'CURRENT_TIMESTAMP')
        .replace(SQLITE_RANDOM_HEX_RE, "substring(md5(random()::text || clock_timestamp()::text) from 1 for 16)")
        .replace(SQLITE_DATETIME_FUNCTION_RE, translateSqliteDatetimeCall);
}

function applyInsertCompat(sql) {
    let text = String(sql || '');
    let appendConflictDoNothing = false;

    if (/^\s*INSERT\s+OR\s+IGNORE\s+INTO\b/i.test(text)) {
        text = text.replace(/^\s*INSERT\s+OR\s+IGNORE\s+INTO\b/i, 'INSERT INTO');
        appendConflictDoNothing = !/\bON\s+CONFLICT\b/i.test(text);
    }

    if (appendConflictDoNothing) {
        if (/\bRETURNING\b/i.test(text)) {
            text = text.replace(/\bRETURNING\b/i, 'ON CONFLICT DO NOTHING RETURNING');
        } else {
            text = `${text} ON CONFLICT DO NOTHING`;
        }
    }

    return text;
}

function translateSqliteToPostgres(sql, options) {
    const opts = Object.assign({ mode: 'all' }, options || {});
    let text = String(sql || '').trim();
    if (!text) return text;
    if (/^\s*PRAGMA\b/i.test(text)) return '';

    text = normalizeSchemaSql(text);
    text = applyFunctionCompat(text);
    text = applyInsertCompat(text);
    text = replacePositionalParameters(text);

    if (opts.mode === 'run' && /^\s*INSERT\b/i.test(text) && !/\bRETURNING\b/i.test(text)) {
        text = `${text} RETURNING *`;
    }

    return text;
}

module.exports = {
    normalizeSchemaSql,
    replacePositionalParameters,
    splitSqlStatements,
    translateSqliteToPostgres,
};
