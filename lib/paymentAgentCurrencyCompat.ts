export function isPaymentAgentCurrencyAllowed(currency?: string | null): boolean { const c=String(currency||'').trim().toUpperCase(); return c==='MZN'||c==='ZAR'; }
