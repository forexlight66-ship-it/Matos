import test from 'node:test';
import assert from 'node:assert/strict';
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
