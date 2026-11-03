import { planCorridorWindow, type CorridorWindow } from './window.js';

export interface CorridorTile extends CorridorWindow {
  key: string;
}

export interface TilePlan {
  active: CorridorTile;
  added: CorridorTile[];
  evicted: CorridorTile[];
}

/**
 * 站点/窗口的 LRU 管理：只负责 tile 身份、预热顺序与驱逐；
 * 真正的网格仍由 CorridorService（Worker + IndexedDB）生成。
 */
export class TileManager {
  private readonly tiles = new Map<string, { tile: CorridorTile; lastUsed: number }>();
  private clock = 0;

  constructor(
    private readonly routeLength: number,
    private readonly half = 0.05,
    private readonly step = 0.005,
    private readonly maxTiles = 12,
  ) {}

  get size(): number {
    return this.tiles.size;
  }

  /** 当前焦点窗口，以及需要新预热的左右邻接窗口 */
  focus(focusS: number): TilePlan {
    const active = this.tileFor(focusS);
    const added: CorridorTile[] = [];
    if (!this.tiles.has(active.key)) {
      this.tiles.set(active.key, { tile: active, lastUsed: this.clock++ });
      added.push(active);
    } else {
      this.touch(active.key);
    }

    for (const delta of [-this.half * 1.9, this.half * 1.9]) {
      const neighbor = this.tileFor(focusS + delta);
      if (this.tiles.has(neighbor.key)) {
        this.touch(neighbor.key);
        continue;
      }
      this.tiles.set(neighbor.key, { tile: neighbor, lastUsed: this.clock++ });
      added.push(neighbor);
    }

    const evicted = this.evict(active.key);
    return { active, added, evicted };
  }

  touch(key: string): void {
    const entry = this.tiles.get(key);
    if (entry) entry.lastUsed = this.clock++;
  }

  get(key: string): CorridorTile | undefined {
    return this.tiles.get(key)?.tile;
  }

  private tileFor(centerS: number): CorridorTile {
    const window = planCorridorWindow(centerS, this.routeLength, this.half, this.step);
    return { ...window, key: `${window.s0.toFixed(3)}:${window.s1.toFixed(3)}` };
  }

  private evict(activeKey: string): CorridorTile[] {
    const evicted: CorridorTile[] = [];
    while (this.tiles.size > this.maxTiles) {
      let oldestKey: string | null = null;
      let oldest = Infinity;
      for (const [key, entry] of this.tiles) {
        if (key === activeKey) continue;
        if (entry.lastUsed < oldest) {
          oldest = entry.lastUsed;
          oldestKey = key;
        }
      }
      if (!oldestKey) break;
      const entry = this.tiles.get(oldestKey);
      if (entry) evicted.push(entry.tile);
      this.tiles.delete(oldestKey);
    }
    return evicted;
  }
}
