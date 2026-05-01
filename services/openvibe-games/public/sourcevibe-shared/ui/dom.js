export function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[char] || char));
}

export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function setNodeContent(target, content) {
    if (!target) return;
    if (typeof content === 'string') {
        target.innerHTML = content;
        return;
    }
    const items = Array.isArray(content) ? content : [content];
    const nodes = items
        .filter((item) => item != null)
        .map((item) => (item instanceof Node ? item : document.createTextNode(String(item))));
    target.replaceChildren(...nodes);
}

export function normalizeToken(value) {
    return String(value == null ? '' : value)
        .trim()
        .toLowerCase();
}
