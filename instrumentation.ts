export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NODE_ENV === 'production') {
    const { startTradingWorker } = await import('./worker/runtime-worker');
    startTradingWorker();
  }
}
