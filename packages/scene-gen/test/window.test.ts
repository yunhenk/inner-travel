import { describe, expect, it } from 'vitest';
import { WindowTracker, planCorridorWindow } from '../src/index.js';

describe('焦点窗口', () => {
  it('按步长吸附并夹在路线内', () => {
    const w = planCorridorWindow(0.1234, 0.4, 0.04, 0.005);
    expect(w.centerS).toBe(0.125);
    expect(w.s0).toBeCloseTo(0.085, 6);
    expect(w.s1).toBeCloseTo(0.165, 6);
  });

  it('端点不会越界', () => {
    const a = planCorridorWindow(0, 0.2, 0.04);
    expect(a.s0).toBe(0);
    const b = planCorridorWindow(0.2, 0.2, 0.04);
    expect(b.s1).toBe(0.2);
  });

  it('焦点在窗口内不滑动，靠近边缘才换窗口', () => {
    const tracker = new WindowTracker(0.1, 1, 0.04, 0.005, 0.012);
    expect(tracker.update(0.12, 1)).toBeNull();
    const next = tracker.update(0.16, 1);
    expect(next).not.toBeNull();
    expect(next!.centerS).toBe(0.16);
  });
});
