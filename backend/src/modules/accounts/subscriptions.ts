import { subscribe } from '../../events/bus';
import { toPaisa } from '../../lib/money';
import { post } from './ledger';

/**
 * Accounts reacts to the operational modules. Each handler runs inside the business transaction,
 * so stock and books can never disagree: if the posting fails, the stock movement rolls back too.
 */

// Goods received: stock at cost, owed to the supplier.
subscribe('goods.received', async (ctx, e) => {
  const v = e.payload.totalCost;
  await post(ctx, {
    dealershipId: e.dealershipId,
    branchId: e.payload.branchId,
    source: 'goods_receipt',
    sourceType: 'goods_receipt',
    sourceId: e.payload.goodsReceiptId,
    memo: `Goods received (GRN ${e.payload.goodsReceiptId})`,
    lines: [
      { role: 'parts_inventory', debit: v },
      { role: 'payables', credit: v, supplierId: e.payload.supplierId },
    ],
  });
});

// Parts issued to / returned from job cards, and posted stock adjustments.
subscribe('stock.moved', async (ctx, e) => {
  const value = toPaisa(e.payload.value);
  if (value === 0n) return;
  const abs = e.payload.value.replace(/^-/, '');
  const into = value > 0n; // stock value came in
  const counter = e.payload.kind === 'adjustment' ? 'stock_adjustments' : 'parts_cost';
  await post(ctx, {
    dealershipId: e.dealershipId,
    branchId: e.payload.branchId,
    source: 'stock',
    sourceType: e.payload.referenceType,
    sourceId: e.payload.referenceId,
    memo: `Stock ${e.payload.kind} (${e.payload.referenceType} ${e.payload.referenceId})`,
    lines: into
      ? [
          { role: 'parts_inventory', debit: abs },
          { role: counter, credit: abs },
        ]
      : [
          { role: counter, debit: abs },
          { role: 'parts_inventory', credit: abs },
        ],
  });
});
