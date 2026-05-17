'use strict';

// ═══════════════════════════════════════════════════════════════
// OpenVibe Tools — Text Processing
// Pure-JS text utilities: word count, case transforms, encode/decode.
// ═══════════════════════════════════════════════════════════════

/**
 * Analyze text and return statistics.
 */
function analyze(text) {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const chars = text.length;
    const charsNoSpaces = text.replace(/\s/g, '').length;
    const avgWordLen = words.length > 0 ? (words.reduce((sum, w) => sum + w.length, 0) / words.length) : 0;
    const readingTimeMin = words.length / 200; // 200 wpm average

    return {
        characters: chars,
        charactersNoSpaces: charsNoSpaces,
        words: words.length,
        sentences: sentences.length,
        paragraphs: paragraphs.length,
        avgWordLength: Math.round(avgWordLen * 10) / 10,
        readingTimeSec: Math.round(readingTimeMin * 60),
        readingTimeMin: Math.round(readingTimeMin * 10) / 10,
        lines: text.split('\n').length,
    };
}

/**
 * Transform text case.
 */
function transformCase(text, mode) {
    switch (mode) {
        case 'upper': return text.toUpperCase();
        case 'lower': return text.toLowerCase();
        case 'title': return text.replace(/\b\w/g, c => c.toUpperCase());
        case 'sentence': return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
        case 'camel': return text.split(/\s+/).map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
        case 'snake': return text.toLowerCase().replace(/\s+/g, '_');
        case 'kebab': return text.toLowerCase().replace(/\s+/g, '-');
        case 'pascal': return text.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
        case 'alternating': return text.split('').map((c, i) => i % 2 === 0 ? c.toLowerCase() : c.toUpperCase()).join('');
        case 'inverse': return text.split('').map(c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()).join('');
        default: throw new Error(`Unknown mode: ${mode}`);
    }
}

/**
 * Encode/decode text.
 */
function encode(text, format, direction = 'encode') {
    switch (format) {
        case 'base64':
            return direction === 'encode' ? Buffer.from(text, 'utf8').toString('base64') : Buffer.from(text, 'base64').toString('utf8');
        case 'url':
            return direction === 'encode' ? encodeURIComponent(text) : decodeURIComponent(text);
        case 'html': {
            if (direction === 'encode') {
                return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            } else {
                return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
            }
        }
        case 'hex':
            return direction === 'encode' ? Buffer.from(text, 'utf8').toString('hex') : Buffer.from(text, 'hex').toString('utf8');
        case 'binary': {
            if (direction === 'encode') {
                return text.split('').map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
            } else {
                return text.split(' ').map(b => String.fromCharCode(parseInt(b, 2))).join('');
            }
        }
        case 'morse': {
            const MORSE = { A:'.-', B:'-...', C:'-.-.', D:'-..', E:'.', F:'..-.', G:'--.', H:'....', I:'..', J:'.---', K:'-.-', L:'.-..', M:'--', N:'-.', O:'---', P:'.--.', Q:'--.-', R:'.-.', S:'...', T:'-', U:'..-', V:'...-', W:'.--', X:'-..-', Y:'-.--', Z:'--..', '1':'.----', '2':'..---', '3':'...--', '4':'....-', '5':'.....', '6':'-....', '7':'--...', '8':'---..', '9':'----.', '0':'-----', ' ': '/' };
            if (direction === 'encode') {
                return text.toUpperCase().split('').map(c => MORSE[c] || '?').join(' ');
            } else {
                const REV = Object.fromEntries(Object.entries(MORSE).map(([k,v]) => [v,k]));
                return text.split(' ').map(t => REV[t] || '?').join('');
            }
        }
        default:
            throw new Error(`Unknown format: ${format}`);
    }
}

/**
 * Find & replace in text.
 */
function findReplace(text, find, replace, options = {}) {
    if (!find) return text;
    if (options.regex) {
        const flags = (options.caseInsensitive ? 'gi' : 'g');
        const re = new RegExp(find, flags);
        return text.replace(re, replace);
    }
    const flags = options.caseInsensitive ? 'gi' : 'g';
    const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(escaped, flags), replace);
}

/**
 * Sort lines.
 */
function sortLines(text, options = {}) {
    const lines = text.split('\n');
    const sorted = lines.sort((a, b) => {
        if (options.numeric) return parseFloat(a) - parseFloat(b);
        return options.caseInsensitive ? a.toLowerCase().localeCompare(b.toLowerCase()) : a.localeCompare(b);
    });
    if (options.reverse) sorted.reverse();
    if (options.unique) {
        const seen = new Set();
        return sorted.filter(l => {
            const k = options.caseInsensitive ? l.toLowerCase() : l;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        }).join('\n');
    }
    return sorted.join('\n');
}

/**
 * Remove duplicate lines.
 */
function dedupe(text, options = {}) {
    const lines = text.split('\n');
    const seen = new Set();
    return lines.filter(l => {
        const k = options.caseInsensitive ? l.toLowerCase() : l;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    }).join('\n');
}

module.exports = { analyze, transformCase, encode, findReplace, sortLines, dedupe };
