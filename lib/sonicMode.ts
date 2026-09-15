export type BotMode = 'POWER' | 'SOROS' | 'SONIC';

export interface BotModeState {
  mode: BotMode;
  iaPower: boolean;
  soros: boolean;
  sonic: boolean;
}

/**
 * Exclusive mode rules used by the dashboard controls.
 * POWER is the normal/default mode.
 * Turning SONIC on always disables POWER and SOROS.
 * Turning POWER on always disables SONIC and enables SOROS according to
 * the existing dashboard rule. Turning POWER off leaves SONIC off unless
 * the user explicitly enables SONIC.
 */
export function resolveBotMode(input: {
  iaPower: boolean;
  sonic: boolean;
}): BotModeState {
  const power = Boolean(input.iaPower);
  const sonic = Boolean(input.sonic);

  if (sonic) {
    return {
      mode: 'SONIC',
      iaPower: false,
      soros: false,
      sonic: true,
    };
  }

  if (power) {
    return {
      mode: 'POWER',
      iaPower: true,
      soros: false,
      sonic: false,
    };
  }

  return {
    mode: 'SOROS',
    iaPower: false,
    soros: true,
    sonic: false,
  };
}

export function persistBotMode(state: BotModeState) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('matos-bot-mode', state.mode);
  localStorage.setItem('matos-ia-power', state.iaPower ? '1' : '0');
  localStorage.setItem('matos-soros', state.soros ? '1' : '0');
  localStorage.setItem('matos-ia-sonic', state.sonic ? '1' : '0');
  window.dispatchEvent(new CustomEvent('matos:bot-mode', { detail: state }));
}
