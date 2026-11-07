export type NormalizedTickHistory = {
  prices: number[];
  lastEpoch: number | null;
};

/**
 * Deriv ticks_history returns parallel prices/times arrays. Preserve the latest
 * epoch as well as the prices so the first ticks subscription snapshot cannot
 * be counted twice as a new live tick after a fresh runtime starts.
 */
export function normalizeTickHistory(history: unknown): NormalizedTickHistory {
  const value = history && typeof history === 'object'
    ? history as { prices?: unknown; times?: unknown }
    : {};
  const prices = Array.isArray(value.prices)
    ? value.prices.map(Number).filter(Number.isFinite)
    : [];
  const times = Array.isArray(value.times)
    ? value.times.map(Number).filter(item => Number.isSafeInteger(item) && item > 0)
    : [];
  return {
    prices,
    lastEpoch: times.length ? times[times.length - 1] : null,
  };
}
