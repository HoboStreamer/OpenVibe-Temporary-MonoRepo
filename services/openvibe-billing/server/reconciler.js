'use strict';

function reconcileWalletSnapshots(deps, body) {
    const {
        model,
        requestedByService,
    } = deps;
    const input = body || {};
    const repair = input.repair !== false;
    const limit = Math.min(Math.max(parseInt(input.limit, 10) || 100, 1), 500);
    const wallets = model.listWallets({
        wallet_type: input.wallet_type,
        status: input.status || 'active',
        limit,
    }).filter((wallet) => {
        if (input.owner_type && wallet.owner_type !== input.owner_type) return false;
        if (input.owner_id && String(wallet.owner_id) !== String(input.owner_id)) return false;
        if (input.currency && String(wallet.currency) !== String(input.currency)) return false;
        return true;
    });

    let mismatchCount = 0;
    let repairedCount = 0;
    const mismatches = [];
    for (const wallet of wallets) {
        const snapshot = model.getSnapshot(wallet.id);
        const recomputed = model.recomputeBalanceFromLedger(wallet.id);
        const walletBalance = Number(wallet.balance_minor || 0);
        const snapshotBalance = snapshot ? Number(snapshot.balance_minor || 0) : null;
        const mismatch = walletBalance !== recomputed.balance || (snapshot && snapshotBalance !== recomputed.balance);
        if (!mismatch) continue;
        mismatchCount += 1;
        if (repair) {
            model.setSnapshot(wallet.id, recomputed.balance, recomputed.last_ledger_id);
            repairedCount += 1;
        }
        mismatches.push({
            wallet_id: wallet.id,
            owner_type: wallet.owner_type,
            owner_id: wallet.owner_id,
            currency: wallet.currency,
            wallet_balance_minor: walletBalance,
            snapshot_balance_minor: snapshotBalance,
            recomputed_balance_minor: recomputed.balance,
            last_ledger_id: recomputed.last_ledger_id,
        });
    }

    return {
        ok: true,
        requested_by_service: requestedByService || 'unknown-service',
        repair_applied: repair,
        wallet_count: wallets.length,
        mismatch_count: mismatchCount,
        repaired_count: repairedCount,
        economy: model.getEconomyState(),
        mismatches,
    };
}

module.exports = {
    reconcileWalletSnapshots,
};
