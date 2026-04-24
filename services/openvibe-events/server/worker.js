'use strict';

// openvibe-events — background dispatcher.
//
// Polls delivery_queue for pending rows, attempts delivery, applies
// exponential backoff on failure, and parks rows in dead_letters once
// max attempts is exceeded. Idempotency is the consumer's responsibility
// (we deliver the same event_id on retry).

const db = require('./db');
const { getEventById, getSubscription } = require('./bus');

function now() { return new Date(); }

class Worker {
    constructor(cfg) {
        this.cfg = cfg;
        this.timer = null;
        this.running = false;
    }

    start() {
        if (this.timer) return;
        this.timer = setInterval(() => this.tick().catch(err => {
            console.error('[Worker] tick failed:', err.message);
        }), this.cfg.dispatchIntervalMs);
        console.log(`[Worker] started, interval=${this.cfg.dispatchIntervalMs}ms maxAttempts=${this.cfg.maxAttempts}`);
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    async tick() {
        if (this.running) return;
        this.running = true;
        try {
            const sql = db.get();
            const rows = sql.prepare(`
                SELECT id, event_id, subscription_id, attempts
                FROM delivery_queue
                WHERE state = 'pending' AND next_attempt_at <= CURRENT_TIMESTAMP
                ORDER BY next_attempt_at ASC
                LIMIT 25
            `).all();

            for (const row of rows) {
                await this.dispatchOne(row);
            }
        } finally {
            this.running = false;
        }
    }

    async dispatchOne(row) {
        const sql = db.get();
        const claim = sql.prepare(
            `UPDATE delivery_queue SET state = 'in_flight', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND state = 'pending'`
        ).run(row.id);
        if (claim.changes === 0) return; // raced with another worker

        const sub = getSubscription(row.subscription_id);
        const evt = getEventById(row.event_id);

        if (!sub || !sub.active) {
            sql.prepare(`UPDATE delivery_queue SET state = 'done', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
                .run('subscription inactive or missing', row.id);
            return;
        }
        if (!evt) {
            sql.prepare(`UPDATE delivery_queue SET state = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
                .run('event missing', row.id);
            return;
        }

        let ok = false, errMsg = null;
        try {
            if (sub.delivery === 'log') {
                console.log(`[Worker] deliver(log) sub=${sub.subscription_id} type=${evt.event_type} event_id=${evt.event_id}`);
                ok = true;
            } else if (sub.delivery === 'http') {
                ok = await this.deliverHttp(sub, evt);
            } else {
                errMsg = `unknown delivery mode: ${sub.delivery}`;
            }
        } catch (err) {
            errMsg = err && err.message || String(err);
        }

        if (ok) {
            sql.prepare(`UPDATE delivery_queue SET state = 'done', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(row.id);
            return;
        }

        const attempts = row.attempts + 1;
        if (attempts >= this.cfg.maxAttempts) {
            sql.prepare(`INSERT INTO dead_letters (event_id, subscription_id, attempts, last_error) VALUES (?, ?, ?, ?)`)
                .run(row.event_id, row.subscription_id, attempts, errMsg || 'unknown error');
            sql.prepare(`UPDATE delivery_queue SET state = 'failed', attempts = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
                .run(attempts, errMsg, row.id);
            console.warn(`[Worker] DLQ event_id=${row.event_id} sub=${row.subscription_id} after ${attempts} attempts: ${errMsg}`);
            return;
        }

        // Exponential backoff: base * 2^attempt with jitter
        const base = this.cfg.retryBaseMs;
        const delayMs = Math.floor(base * Math.pow(2, attempts) * (0.5 + Math.random()));
        const next = new Date(now().getTime() + delayMs).toISOString().replace('T', ' ').slice(0, 19);

        sql.prepare(
            `UPDATE delivery_queue SET state = 'pending', attempts = ?, last_error = ?, next_attempt_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
        ).run(attempts, errMsg, next, row.id);
        console.warn(`[Worker] retry event_id=${row.event_id} sub=${row.subscription_id} attempt=${attempts} delay=${delayMs}ms: ${errMsg}`);
    }

    async deliverHttp(sub, evt) {
        const headers = { 'Content-Type': 'application/json' };
        if (sub.internal_key) headers['X-Internal-Key'] = sub.internal_key;
        const res = await fetch(sub.target_url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ envelope: evt }),
        });
        if (res.ok) return true;
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
}

module.exports = { Worker };
