import { describe, expect, it } from 'vitest';
import { TileManager } from '../src/index.js';

describe('tile LRU', () => {
  it('首次聚焦会创建当前与左右邻接 tile', () => {
    const manager = new TileManager(1, 0.05, 0.005, 12);
    const plan = manager.focus(0.2);
    expect(plan.active.centerS).toBe(0.2);
    expect(plan.added.length).toBeGreaterThanOrEqual(2);
    expect(manager.size).toBe(3);
  });

  it('重复聚焦同一处不再新增', () => {
    const manager = new TileManager(1);
    manager.focus(0.2);
    const again = manager.focus(0.201);
    expect(again.added).toHaveLength(0);
  });

  it('超过上限会驱逐最久未使用的非当前 tile', () => {
    const manager = new TileManager(2, 0.05, 0.005, 4);
    manager.focus(0.2);
    manager.focus(0.4);
    manager.focus(0.8);
    expect(manager.size).toBeLessThanOrEqual(4);
  });
});
