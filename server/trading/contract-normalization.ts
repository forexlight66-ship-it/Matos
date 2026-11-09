import 'server-only';
import type { DerivContractUpdate } from '../../worker/deriv-gateway';

const finiteNumber = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

/** Normalize one exact, closed Deriv profit_table row for runtime reconciliation. */
export function normalizeProfitTableContract(raw: any, fallbackSymbol: string): DerivContractUpdate | null {
  const contractId = Number(raw?.contract_id);
  const sellTime = Number(raw?.sell_time);
  if (!Number.isSafeInteger(contractId) || contractId <= 0 || !Number.isFinite(sellTime) || sellTime <= 0) return null;

  const buyPrice = finiteNumber(raw?.buy_price, 0);
  const sellPrice = raw?.sell_price == null ? null : finiteNumber(raw.sell_price, Number.NaN);
  const explicitProfitLoss = Number(raw?.profit_loss);
  const apiProfit = Number(raw?.profit);
  const profitLoss = Number.isFinite(explicitProfitLoss) && Math.abs(explicitProfitLoss) > 0.000001
    ? explicitProfitLoss
    : Number.isFinite(apiProfit) && Math.abs(apiProfit) > 0.000001
      ? apiProfit
      : sellPrice !== null && Number.isFinite(sellPrice)
        ? Number((sellPrice - buyPrice).toFixed(2))
        : Number.isFinite(explicitProfitLoss) ? explicitProfitLoss : 0;

  let status = String(raw?.status || '').toLowerCase();
  if (!['won', 'lost', 'sold', 'expired', 'closed'].includes(status)) {
    status = profitLoss > 0 ? 'won' : profitLoss < 0 ? 'lost' : 'sold';
  }

  const barrier = raw?.barrier == null ? null : Number(raw.barrier);
  return {
    contract_id: contractId,
    buy_price: buyPrice,
    sell_price: sellPrice !== null && Number.isFinite(sellPrice) ? sellPrice : null,
    payout: finiteNumber(raw?.payout, 0),
    purchase_time: finiteNumber(raw?.purchase_time ?? raw?.date_start, 0),
    sell_time: sellTime,
    contract_type: String(raw?.contract_type || ''),
    status,
    profit_loss: profitLoss,
    exit_tick: raw?.exit_tick ?? null,
    exit_spot: raw?.exit_spot ?? null,
    barrier: barrier !== null && Number.isFinite(barrier) ? barrier : null,
    symbol: String(raw?.symbol || raw?.underlying_symbol || raw?.underlying || fallbackSymbol),
    is_sold: true,
  };
}


/** Read the realised amount from the live Deriv contract payload. The current
 * proposal_open_contract response uses `profit`; older payloads may only
 * expose `profit_loss`. Preserve a legitimate zero instead of falling through.
 */
export function realizedProfitLoss(contract: { profit?: unknown; profit_loss?: unknown }): number {
  for (const raw of [contract.profit, contract.profit_loss]) {
    if (raw === null || raw === undefined || raw === '') continue;
    const amount = Number(raw);
    if (Number.isFinite(amount)) return amount;
  }
  throw new Error('Deriv contract does not contain a finite realised profit value.');
}

/** Add one confirmed contract result to the runtime total using the same
 * authoritative value used for the trade record and recovery state.
 */
export function accumulateRealizedProfitLoss(
  current: unknown,
  contract: { profit?: unknown; profit_loss?: unknown },
): number {
  const currentValue = Number(current);
  const base = Number.isFinite(currentValue) ? currentValue : 0;
  const total = base + realizedProfitLoss(contract);
  if (!Number.isFinite(total)) throw new Error('Runtime profit/loss total is not finite.');
  return Number(total.toFixed(8));
}
