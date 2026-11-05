import 'server-only';

export type Parity = 'EVEN' | 'ODD';
export type HyperFlowMode = 'MATCH9' | 'ALTERNATE' | 'UNDER9' | 'EVEN' | 'ODD' | 'OVER0' | null;

export interface HyperBeenState {
  active: boolean;
  deficit: number;
  nextParity: Parity;
  recoveryStep: number;
  pauseTicksRemaining: number;
  lastTradeMode: 'OVER0' | Parity | null;
}

export interface HyperFlowsState {
  analysisActive: boolean;
  nextDigit: number | null;
  recoveryMode: boolean;
  recoveryContract: Parity | 'OVER0';
  nextParity: Parity;
  consecutiveLosses: number;
  deficit: number;
  recoveryAttempts: number;
  extraProfit: number;
  lastTradeMode: HyperFlowMode;
}

export interface HypercoverState {
  forceNextDirection: boolean;
  contractType: 'DIGITUNDER' | 'DIGITOVER';
  barrier: number;
  lastDirection: 'DIGITUNDER' | 'DIGITOVER' | null;
  lossStreak: number;
  pauseTicksRemaining: number;
}

export interface CloseResult {
  status: 'won' | 'lost' | string;
  profitLoss: number;
  contractType: string;
  barrier?: number | null;
  exitDigit?: number | null;
  exitSpot?: number | string | null;
  exitTick?: number | string | null;
  bot?: string | null;
}

export interface Transition<T> {
  state: T;
  stop: boolean;
  notice: string;
  nextAction: 'ANALYZE' | 'RECOVER' | 'WAIT' | 'STOP';
}

const money = (value: number) => Number((Number.isFinite(value) ? value : 0).toFixed(2));
const EPS = 0.005;

export const initialHyperBeenState = (): HyperBeenState => ({
  active: false, deficit: 0, nextParity: 'EVEN', recoveryStep: 0,
  pauseTicksRemaining: 0, lastTradeMode: null,
});

export const initialHyperFlowsState = (extraProfit = 5): HyperFlowsState => ({
  analysisActive: false, nextDigit: null, recoveryMode: false, recoveryContract: 'EVEN',
  nextParity: 'ODD', consecutiveLosses: 0, deficit: 0, recoveryAttempts: 0,
  extraProfit: Math.max(0, money(extraProfit)), lastTradeMode: null,
});

export const initialHypercoverState = (): HypercoverState => ({
  forceNextDirection: false, contractType: 'DIGITUNDER', barrier: 8,
  lastDirection: null, lossStreak: 0, pauseTicksRemaining: 0,
});

export function resetHyperBeen(state: HyperBeenState): HyperBeenState {
  return { ...initialHyperBeenState() };
}

export function onHyperBeenTick(state: HyperBeenState): Transition<HyperBeenState> {
  if (!state.active || state.pauseTicksRemaining <= 0) {
    return { state, stop: false, notice: '', nextAction: state.active ? 'RECOVER' : 'ANALYZE' };
  }
  const remaining = Math.max(0, state.pauseTicksRemaining - 1);
  const next = remaining === 0
    ? { ...state, pauseTicksRemaining: 0, recoveryStep: 0, nextParity: 'EVEN' as Parity }
    : { ...state, pauseTicksRemaining: remaining };
  return {
    state: next, stop: false,
    notice: remaining === 0 ? 'HyperBeen: pausa de 50 ticks concluída; sequência reiniciada em PAR.' : '',
    nextAction: remaining === 0 ? 'RECOVER' : 'WAIT',
  };
}

export function onHyperBeenClose(state: HyperBeenState, close: CloseResult, extraProfit: number): Transition<HyperBeenState> {
  const type = String(close.contractType || '').toUpperCase();
  const status = String(close.status || '').toLowerCase();
  const pnl = Number(close.profitLoss);
  const resultKnown = (status === 'won' || status === 'lost') && Number.isFinite(pnl);
  if (!resultKnown || ((status === 'won' && pnl < -0.001) || (status === 'lost' && pnl > 0.001))) {
    return { state: { ...state, lastTradeMode: null }, stop: true, notice: 'HyperBeen: resultado oficial ambíguo ou contraditório. Robô parado; a recuperação não avançou.', nextAction: 'STOP' };
  }

  const won = status === 'won';
  const primary = (type === 'DIGITOVER' || type === 'DIGITMATCH') && Number(close.barrier) === 0;
  const recoveryParity: Parity = type === 'DIGITEVEN' ? 'EVEN' : type === 'DIGITODD' ? 'ODD' : state.lastTradeMode === 'ODD' ? 'ODD' : state.lastTradeMode === 'EVEN' ? 'EVEN' : state.nextParity;
  const extra = Math.max(0, money(extraProfit));

  if (primary) {
    if (!won) {
      const deficit = money(Math.max(0, state.deficit) + Math.abs(Math.min(0, pnl)));
      return { state: { ...state, active: true, deficit, nextParity: 'EVEN', recoveryStep: 0, pauseTicksRemaining: 0, lastTradeMode: null }, stop: false, notice: 'HyperBeen: ACIMA 0 perdeu. Recuperação iniciada em PAR; objetivo é défice total + $' + extra.toFixed(2) + '.', nextAction: 'RECOVER' };
    }
    return { state: resetHyperBeen(state), stop: false, notice: 'HyperBeen: ACIMA 0 ganhou. Mantém a estratégia principal.', nextAction: 'ANALYZE' };
  }

  const deficit = money(Math.max(0, state.deficit));
  const target = money(deficit + extra);
  if (won && pnl + EPS >= target) {
    return { state: resetHyperBeen(state), stop: false, notice: 'HyperBeen: recuperação integral concluída. Retoma imediatamente ACIMA 0.', nextAction: 'ANALYZE' };
  }
  if (!won) {
    const nextDeficit = money(deficit + Math.abs(Math.min(0, pnl)));
    const step = Math.max(0, Math.floor(state.recoveryStep));
    if (step >= 3) {
      return {
        state: { ...state, active: true, deficit: nextDeficit, recoveryStep: 4, pauseTicksRemaining: 50, nextParity: 'EVEN', lastTradeMode: null },
        stop: false, notice: 'HyperBeen: PAR → PAR → ÍMPAR → ÍMPAR perdeu. Pausa de 50 ticks; depois reinicia em PAR.', nextAction: 'WAIT',
      };
    }
    const nextParity: Parity = step === 0 ? 'EVEN' : 'ODD';
    return {
      state: { ...state, active: true, deficit: nextDeficit, recoveryStep: step + 1, pauseTicksRemaining: 0, nextParity, lastTradeMode: null },
      stop: false, notice: 'HyperBeen: recuperação perdeu. Próxima operação ' + (nextParity === 'EVEN' ? 'PAR' : 'ÍMPAR') + '; objectivo défice total + $' + extra.toFixed(2) + '.', nextAction: 'RECOVER',
    };
  }
  return {
    state: { ...state, active: true, deficit, nextParity: recoveryParity, lastTradeMode: null },
    stop: false, notice: 'HyperBeen: ganho parcial não reduz o défice. Repetir ' + (recoveryParity === 'EVEN' ? 'PAR' : 'ÍMPAR') + ' com cotação nova.', nextAction: 'RECOVER',
  };
}

function resetHyperFlows(state: HyperFlowsState): HyperFlowsState {
  return { ...state, analysisActive: true, nextDigit: null, recoveryMode: false, recoveryContract: 'EVEN', nextParity: 'EVEN', consecutiveLosses: 0, deficit: 0, recoveryAttempts: 0, lastTradeMode: null };
}

export function onHyperFlowsClose(state: HyperFlowsState, close: CloseResult): Transition<HyperFlowsState> {
  const type = String(close.contractType || '').toUpperCase();
  const status = String(close.status || '').toLowerCase();
  const pnl = Number(close.profitLoss);
  const resultKnown = (status === 'won' || status === 'lost') && Number.isFinite(pnl);
  if (!resultKnown || ((status === 'won' && pnl < -0.001) || (status === 'lost' && pnl > 0.001))) {
    return { state: { ...state, lastTradeMode: null }, stop: true, notice: 'HyperFlows: resultado oficial ambíguo ou contraditório. Robô parado.', nextAction: 'STOP' };
  }

  const won = status === 'won';
  const mode = state.lastTradeMode;
  const barrier = Number(close.barrier);
  const modeIsParity = type === 'DIGITEVEN' || type === 'DIGITODD';
  const modeIsOver0 = type === 'DIGITOVER' && barrier === 0;
  const modeIsUnder9 = type === 'DIGITUNDER' && barrier === 9;
  const modeIsMatch9 = type === 'DIGITMATCH' && barrier === 9;
  const modeIsAlt = type === 'DIGITMATCH' && Number.isFinite(barrier) && barrier >= 0 && barrier <= 8;
  const recoveryType: Parity = type === 'DIGITEVEN' ? 'EVEN' : type === 'DIGITODD' ? 'ODD' : state.recoveryContract === 'ODD' ? 'ODD' : 'EVEN';
  const current = { ...state, lastTradeMode: null };

  if (modeIsOver0 || mode === 'OVER0') {
    if (!won) {
      const next = { ...current, deficit: money(current.deficit + Math.abs(Math.min(0, pnl))), recoveryMode: false, recoveryContract: 'OVER0' as const, nextParity: 'EVEN' as Parity, nextDigit: null, analysisActive: false };
      return { state: next, stop: true, notice: 'HyperFlows: a recuperação ACIMA 0 perdeu. Robô parado imediatamente; nenhuma recuperação PAR/ÍMPAR.', nextAction: 'STOP' };
    }
    const required = money(current.deficit + current.extraProfit);
    if (pnl + EPS >= required) return { state: resetHyperFlows(current), stop: false, notice: 'HyperFlows: recuperação ACIMA 0 cobriu o défice + lucro extra. Retoma MATCH 9.', nextAction: 'ANALYZE' };
    return { state: { ...current, recoveryMode: true, recoveryContract: 'EVEN', nextParity: 'EVEN', nextDigit: null, analysisActive: true }, stop: false, notice: 'HyperFlows: ACIMA 0 ganhou, mas não cobriu o objectivo integral. Próxima recuperação PAR.', nextAction: 'RECOVER' };
  }

  if (modeIsUnder9 || mode === 'UNDER9') {
    if (!won) {
      return { state: { ...current, deficit: 0, recoveryMode: false, nextDigit: null, consecutiveLosses: 0, analysisActive: true }, stop: false, notice: 'HyperFlows B9 / UNDER 9 perdeu. Recuperação encerrada; retoma MATCH 9.', nextAction: 'ANALYZE' };
    }
    const remaining = money(Math.max(0, current.deficit - Math.max(0, pnl)));
    return { state: { ...current, deficit: remaining, recoveryMode: remaining > 0.01, nextDigit: null, analysisActive: true }, stop: false, notice: remaining > 0.01 ? 'HyperFlows: UNDER 9 ganhou; défice restante ' + remaining.toFixed(2) + '.' : 'HyperFlows: défice totalmente recuperado; retoma MATCH 9.', nextAction: remaining > 0.01 ? 'RECOVER' : 'ANALYZE' };
  }

  const parityRecovery = modeIsParity || mode === 'EVEN' || mode === 'ODD';
  if (parityRecovery && state.recoveryMode) {
    const parity: Parity = type === 'DIGITODD' ? 'ODD' : type === 'DIGITEVEN' ? 'EVEN' : recoveryType;
    current.recoveryAttempts += 1;
    current.nextDigit = null;
    current.consecutiveLosses = 0;
    current.analysisActive = true;
    if (!won) {
      const nextParity: Parity = parity === 'EVEN' ? 'ODD' : 'EVEN';
      current.deficit = money(current.deficit + Math.abs(Math.min(0, pnl)));
      current.recoveryContract = nextParity;
      current.nextParity = nextParity;
      current.recoveryMode = true;
      return { state: current, stop: false, notice: 'HyperFlows: recuperação ' + parity + ' perdeu. Próxima recuperação ' + nextParity + '; défice ' + current.deficit.toFixed(2) + '.', nextAction: 'RECOVER' };
    }
    const required = money(current.deficit + current.extraProfit);
    if (pnl + EPS >= required) return { state: resetHyperFlows(current), stop: false, notice: 'HyperFlows: recuperação integral concluída; retoma MATCH 9 após novo tick.', nextAction: 'ANALYZE' };
    const nextParity: Parity = parity === 'EVEN' ? 'ODD' : 'EVEN';
    current.recoveryContract = nextParity;
    current.nextParity = nextParity;
    current.recoveryMode = true;
    return { state: current, stop: false, notice: 'HyperFlows: ganho parcial; défice integral mantém-se. Próxima operação ' + nextParity + '.', nextAction: 'RECOVER' };
  }

  if (!won) {
    current.recoveryMode = false;
    current.recoveryAttempts = 0;
    current.deficit = money(current.deficit + Math.abs(Math.min(0, pnl)));
    current.consecutiveLosses = Math.min(5, Math.max(0, current.consecutiveLosses) + 1);
    current.nextDigit = modeIsMatch9 || mode === 'MATCH9' ? 0 : modeIsAlt || mode === 'ALTERNATE' ? null : current.nextDigit;
    if (current.consecutiveLosses >= 5) {
      current.recoveryMode = true;
      current.recoveryContract = 'OVER0';
      current.nextParity = 'EVEN';
      current.nextDigit = null;
      current.analysisActive = true;
      return { state: current, stop: false, notice: 'HyperFlows: 5 perdas consecutivas. Primeira recuperação ACIMA 0.', nextAction: 'RECOVER' };
    }
    return { state: current, stop: false, notice: 'HyperFlows: perda em ' + (mode === 'ALTERNATE' ? 'dígito alternativo' : 'MATCH 9') + '; contagem ' + current.consecutiveLosses + '/5.', nextAction: 'ANALYZE' };
  }

  // Wins on MATCH 9 and alternative digits preserve the accumulated loss count and deficit.
  current.recoveryMode = false;
  current.recoveryAttempts = 0;
  current.nextDigit = null;
  current.analysisActive = true;
  return { state: current, stop: false, notice: 'HyperFlows: vitória normal; mantém contagem ' + current.consecutiveLosses + '/5 e défice ' + current.deficit.toFixed(2) + '.', nextAction: 'ANALYZE' };
}

export function onHypercoverClose(state: HypercoverState, won: boolean): Transition<HypercoverState> {
  if (won) {
    return { state: { ...state, lossStreak: 0, forceNextDirection: false }, stop: false, notice: 'Hypercover: vitória; sequência de perdas reiniciada.', nextAction: 'ANALYZE' };
  }
  const direction = state.contractType === 'DIGITOVER' ? 'DIGITOVER' : 'DIGITUNDER';
  const nextDirection = direction === 'DIGITOVER' ? 'DIGITUNDER' : 'DIGITOVER';
  const nextBarrier = nextDirection === 'DIGITOVER' ? 1 : 8;
  const streak = state.lossStreak + 1;
  const pause = streak >= 3;
  return {
    state: { ...state, forceNextDirection: true, contractType: nextDirection, barrier: nextBarrier, lastDirection: direction, lossStreak: pause ? 0 : streak, pauseTicksRemaining: pause ? 30 : state.pauseTicksRemaining },
    stop: false,
    notice: pause ? 'Hypercover: 3 perdas consecutivas. Pausa de 30 ticks; depois retoma ' + (nextDirection === 'DIGITOVER' ? 'OVER 1' : 'UNDER 8') + '.' : 'Hypercover: próxima direcção obrigatória ' + (nextDirection === 'DIGITOVER' ? 'OVER 1' : 'UNDER 8') + '.',
    nextAction: pause ? 'WAIT' : 'RECOVER',
  };
}

export function onHypercoverTick(state: HypercoverState): Transition<HypercoverState> {
  if (state.pauseTicksRemaining <= 0) return { state, stop: false, notice: '', nextAction: state.forceNextDirection ? 'RECOVER' : 'ANALYZE' };
  const remaining = Math.max(0, state.pauseTicksRemaining - 1);
  return { state: { ...state, pauseTicksRemaining: remaining }, stop: false, notice: remaining === 0 ? 'Hypercover: pausa de 30 ticks concluída.' : '', nextAction: remaining === 0 ? 'RECOVER' : 'WAIT' };
}
