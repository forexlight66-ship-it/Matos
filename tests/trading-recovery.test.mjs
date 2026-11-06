import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProfitTableContract } from '../server/trading/contract-normalization.ts';
import {
  initialHyperBeenState,
  onHyperBeenClose,
  onHyperBeenTick,
  initialHyperFlowsState,
  onHyperFlowsClose,
  initialHypercoverState,
  onHypercoverClose,
  onHypercoverTick,
} from '../server/trading/recovery.ts';

test('HyperBeen follows PAR → PAR → ÍMPAR → ÍMPAR and then pauses 50 ticks', () => {
  const primary = onHyperBeenClose(initialHyperBeenState(), {
    status: 'lost', profitLoss: -1, contractType: 'DIGITOVER', barrier: 0,
  }, 5);
  assert.equal(primary.state.active, true);
  assert.equal(primary.state.deficit, 1);

  let state = primary.state;
  const sequence = [];
  for (let index = 0; index < 4; index += 1) {
    const parity = state.nextParity;
    sequence.push(parity);
    state = { ...state, lastTradeMode: parity };
    const result = onHyperBeenClose(state, {
      status: 'lost',
      profitLoss: -0.5,
      contractType: parity === 'EVEN' ? 'DIGITEVEN' : 'DIGITODD',
    }, 5);
    state = result.state;
  }

  assert.deepEqual(sequence, ['EVEN', 'EVEN', 'ODD', 'ODD']);
  assert.equal(state.pauseTicksRemaining, 50);
  assert.equal(state.deficit, 3);

  let transition;
  for (let index = 0; index < 50; index += 1) {
    transition = onHyperBeenTick(state);
    state = transition.state;
  }
  assert.equal(state.pauseTicksRemaining, 0);
  assert.equal(state.recoveryStep, 0);
  assert.equal(state.nextParity, 'EVEN');
  assert.equal(transition?.nextAction, 'RECOVER');
});

test('HyperBeen keeps the full deficit after a partial recovery win and resets only when fully covered', () => {
  const recovery = {
    ...initialHyperBeenState(),
    active: true,
    deficit: 2,
    nextParity: 'EVEN',
    lastTradeMode: 'EVEN',
  };
  const partial = onHyperBeenClose(recovery, {
    status: 'won', profitLoss: 3, contractType: 'DIGITEVEN',
  }, 5);
  assert.equal(partial.state.active, true);
  assert.equal(partial.state.deficit, 2);
  assert.equal(partial.state.nextParity, 'EVEN');

  const complete = onHyperBeenClose({
    ...partial.state,
    lastTradeMode: 'EVEN',
  }, {
    status: 'won', profitLoss: 7, contractType: 'DIGITEVEN',
  }, 5);
  assert.equal(complete.state.active, false);
  assert.equal(complete.state.deficit, 0);
});

test('HyperFlows enters OVER 0 after five losses and stops on an OVER 0 recovery loss', () => {
  const beforeFifthLoss = {
    ...initialHyperFlowsState(5),
    consecutiveLosses: 4,
    deficit: 4,
    lastTradeMode: 'MATCH9',
  };
  const fifthLoss = onHyperFlowsClose(beforeFifthLoss, {
    status: 'lost',
    profitLoss: -1,
    contractType: 'DIGITMATCH',
    barrier: 9,
    alternativeDigit: 8,
  });
  assert.equal(fifthLoss.state.recoveryMode, true);
  assert.equal(fifthLoss.state.recoveryContract, 'OVER0');
  assert.equal(fifthLoss.state.deficit, 5);

  const recoveryLoss = onHyperFlowsClose({
    ...fifthLoss.state,
    lastTradeMode: 'OVER0',
  }, {
    status: 'lost',
    profitLoss: -0.5,
    contractType: 'DIGITOVER',
    barrier: 0,
  });
  assert.equal(recoveryLoss.stop, true);
  assert.equal(recoveryLoss.state.deficit, 5.5);
});

test('Hypercover alternates OVER 1 / UNDER 8 and pauses after three losses', () => {
  let state = initialHypercoverState();
  const first = onHypercoverClose(state, false);
  state = first.state;
  assert.equal(state.contractType, 'DIGITOVER');
  assert.equal(state.barrier, 1);

  const second = onHypercoverClose(state, false);
  state = second.state;
  assert.equal(state.contractType, 'DIGITUNDER');
  assert.equal(state.barrier, 8);

  const third = onHypercoverClose(state, false);
  state = third.state;
  assert.equal(state.contractType, 'DIGITOVER');
  assert.equal(state.barrier, 1);
  assert.equal(state.pauseTicksRemaining, 30);

  let transition;
  for (let index = 0; index < 30; index += 1) {
    transition = onHypercoverTick(state);
    state = transition.state;
  }
  assert.equal(state.pauseTicksRemaining, 0);
  assert.equal(transition?.nextAction, 'RECOVER');
});

test('closed profit_table rows normalize the exact contract id and realised Deriv profit', () => {
  const normalized = normalizeProfitTableContract({
    contract_id: '987654',
    status: 'won',
    buy_price: 0.35,
    sell_price: 1.60,
    profit_loss: 0,
    profit: 1.25,
    payout: 1.60,
    purchase_time: 100,
    sell_time: 101,
    contract_type: 'DIGITOVER',
    barrier: 0,
    exit_spot: '123.450',
    exit_tick: 123.45,
    underlying: 'R_25',
  }, 'R_10');

  assert.equal(normalized?.contract_id, 987654);
  assert.equal(normalized?.profit_loss, 1.25);
  assert.equal(normalized?.symbol, 'R_25');
  assert.equal(normalized?.barrier, 0);
  assert.equal(normalized?.is_sold, true);
});

test('closed profit_table normalization falls back to sell minus buy and rejects non-closed rows', () => {
  const normalized = normalizeProfitTableContract({
    contract_id: 123,
    buy_price: 0.35,
    sell_price: 0,
    purchase_time: 100,
    sell_time: 101,
    contract_type: 'DIGITMATCH',
    barrier: 9,
  }, 'R_25');
  assert.equal(normalized?.profit_loss, -0.35);
  assert.equal(normalized?.status, 'lost');

  assert.equal(normalizeProfitTableContract({ contract_id: 123, buy_price: 0.35, sell_time: 0 }, 'R_25'), null);
  assert.equal(normalizeProfitTableContract({ contract_id: 'not-an-id', sell_time: 101 }, 'R_25'), null);
});
