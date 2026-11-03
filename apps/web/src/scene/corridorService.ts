import { buildRoute, hashSeed, type Meridian } from '@inner/core';
import {
  TerrainField,
  buildCorridorData,
  type CorridorBuildOptions,
  type CorridorData,
} from '@inner/scene-gen';
import { readCorridorCache, writeCorridorCache } from './corridorCache.js';
import type { CorridorRequest, CorridorResponse } from './corridorProtocol.js';

interface Pending {
  resolve: (data: CorridorData) => void;
  reject: (error: Error) => void;
  timer: number;
}

const CACHE_VERSION = 3;

/**
 * 地形网格的离线程生成 + IndexedDB 缓存。
 * 主线程仍保留 TerrainField（很便宜），用于相机、标记、气路径与水面高度查询。
 */
export class CorridorService {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private disposed = false;

  constructor() {
    if (typeof Worker === 'undefined') return;
    try {
      this.worker = new Worker(new URL('../workers/scene-gen.worker.ts', import.meta.url), {
        type: 'module',
      });
      this.worker.onmessage = (event: MessageEvent<CorridorResponse>) => this.onMessage(event);
      this.worker.onerror = (event) => this.onError(event);
    } catch {
      this.worker = null;
    }
  }

  async build(
    meridian: Meridian,
    codes: readonly string[],
    options: CorridorBuildOptions,
  ): Promise<CorridorData> {
    const key = this.cacheKey(meridian, codes, options);
    const cached = await readCorridorCache(key);
    if (cached) return cached;

    let data: CorridorData;
    if (this.worker) {
      try {
        data = await this.request(meridian, codes, options);
      } catch {
        data = this.buildOnMain(meridian, codes, options);
      }
    } else {
      data = this.buildOnMain(meridian, codes, options);
    }
    void writeCorridorCache(key, data);
    return data;
  }

  dispose(): void {
    this.disposed = true;
    this.worker?.terminate();
    this.worker = null;
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timer);
      pending.reject(new Error('CorridorService disposed'));
    }
    this.pending.clear();
  }

  private request(
    meridian: Meridian,
    codes: readonly string[],
    options: CorridorBuildOptions,
  ): Promise<CorridorData> {
    const worker = this.worker;
    if (!worker) return Promise.reject(new Error('Worker 不可用'));
    const id = this.nextId++;
    const request: CorridorRequest = { id, meridian, codes, options };
    return new Promise<CorridorData>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error('Worker 超时'));
      }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      worker.postMessage(request);
    });
  }

  private onMessage(event: MessageEvent<CorridorResponse>): void {
    const message = event.data;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    window.clearTimeout(pending.timer);
    if (message.error) pending.reject(new Error(message.error));
    else pending.resolve(message.data as CorridorData);
  }

  private onError(event: ErrorEvent): void {
    this.worker = null;
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timer);
      pending.reject(new Error(event.message || 'Worker 执行失败'));
    }
    this.pending.clear();
  }

  private buildOnMain(
    meridian: Meridian,
    codes: readonly string[],
    options: CorridorBuildOptions,
  ): CorridorData {
    const route = buildRoute(meridian, [...codes]);
    const field = new TerrainField(route, options);
    return buildCorridorData(field, options);
  }

  private cacheKey(
    meridian: Meridian,
    codes: readonly string[],
    options: CorridorBuildOptions,
  ): string {
    const hash = hashSeed(
      `v${CACHE_VERSION}`,
      JSON.stringify(meridian),
      codes.join(','),
      JSON.stringify(options),
    );
    return `corridor:${hash}`;
  }
}
