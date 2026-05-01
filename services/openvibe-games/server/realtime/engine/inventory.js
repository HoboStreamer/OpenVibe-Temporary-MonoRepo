'use strict';

// Inventory utilities — slot-based, server-validated. Stack semantics use the
// item catalog `stackable` and `max_stack` fields. Inventory items are
// `{ item_id, quantity, metadata? }` records keyed by item_id (compatible with
// the existing game_inventory PRIMARY KEY (user_id, item_id)).

function findItem(items, itemId) {
    return (items || []).find((entry) => entry && entry.item_id === itemId) || null;
}

function addItem(items, itemId, quantity, catalogEntry) {
    const list = Array.isArray(items) ? items.slice() : [];
    const qty = Math.max(0, Math.floor(Number(quantity) || 0));
    if (!itemId || qty <= 0) return list;
    const stackable = !catalogEntry || catalogEntry.stackable !== 0;
    const maxStack = catalogEntry && Number.isFinite(catalogEntry.max_stack) ? Math.max(1, catalogEntry.max_stack) : 999;

    if (!stackable) {
        for (let i = 0; i < qty; i += 1) list.push({ item_id: itemId, quantity: 1 });
        return list;
    }
    const existing = list.find((entry) => entry.item_id === itemId);
    if (existing) {
        existing.quantity = Math.min(maxStack, existing.quantity + qty);
    } else {
        list.push({ item_id: itemId, quantity: Math.min(maxStack, qty) });
    }
    return list;
}

function removeItem(items, itemId, quantity) {
    const list = Array.isArray(items) ? items.slice() : [];
    const qty = Math.max(0, Math.floor(Number(quantity) || 0));
    if (!itemId || qty <= 0) return { items: list, removed: 0 };
    const idx = list.findIndex((entry) => entry.item_id === itemId);
    if (idx < 0) return { items: list, removed: 0 };
    const have = list[idx].quantity;
    const removed = Math.min(have, qty);
    if (removed >= have) list.splice(idx, 1);
    else list[idx] = Object.assign({}, list[idx], { quantity: have - removed });
    return { items: list, removed };
}

function hasItems(items, requirements) {
    for (const req of requirements || []) {
        const entry = findItem(items, req.item_id);
        if (!entry || entry.quantity < (Number(req.quantity) || 0)) return false;
    }
    return true;
}

function consume(items, requirements) {
    if (!hasItems(items, requirements)) return { ok: false, items };
    let next = Array.isArray(items) ? items.slice() : [];
    for (const req of requirements || []) {
        const result = removeItem(next, req.item_id, req.quantity);
        next = result.items;
    }
    return { ok: true, items: next };
}

function totalSlots(items) {
    return (items || []).filter((entry) => entry && entry.quantity > 0).length;
}

module.exports = { findItem, addItem, removeItem, hasItems, consume, totalSlots };
