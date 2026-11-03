import { createActor } from 'xstate';
import { describe, expect, it } from 'vitest';
import { TOUR_STOPS, tourMachine } from '../src/journey/tourMachine.js';

function start() {
  return createActor(tourMachine).start();
}

describe('逐穴巡游状态机', () => {
  it('从 idle 开始，前往第一站', () => {
    const actor = start();
    expect(actor.getSnapshot().value).toBe('idle');
    actor.send({ type: 'START' });
    expect(actor.getSnapshot().value).toBe('moving');
    expect(actor.getSnapshot().context.index).toBe(0);
  });

  it('到达后进入停留，再前往下一站', () => {
    const actor = start();
    actor.send({ type: 'START' });
    actor.send({ type: 'ARRIVED' });
    expect(actor.getSnapshot().value).toBe('holding');
    expect(actor.getSnapshot().context.index).toBe(0);
    actor.send({ type: 'SELECT', index: 2 });
    expect(actor.getSnapshot().value).toBe('moving');
    expect(actor.getSnapshot().context.index).toBe(TOUR_STOPS.length - 1);
  });

  it('STOP 能从任意进行态回到 idle', () => {
    const actor = start();
    actor.send({ type: 'START' });
    actor.send({ type: 'STOP' });
    expect(actor.getSnapshot().value).toBe('idle');
    actor.send({ type: 'SELECT', index: 1 });
    actor.send({ type: 'STOP' });
    expect(actor.getSnapshot().value).toBe('idle');
  });
});
