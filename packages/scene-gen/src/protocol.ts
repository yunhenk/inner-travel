export type BuildStage = 'route' | 'height' | 'hydro' | 'biome' | 'bake';

export interface BuildRequest {
  requestId: string;
  meridianId: string;
  seed: number;
  quality: 'low' | 'mid' | 'high';
  hour: number;
}

export type BuildMessage =
  | { type: 'progress'; requestId: string; stage: BuildStage; progress: number }
  | { type: 'done'; requestId: string; payload: BuildPayload }
  | { type: 'error'; requestId: string; message: string };

/**
 * Worker 回传的裸数据。M0 走主线程同步生成；
 * M1 起把同样结构放进 Worker，用 transferable 传输。
 */
export interface BuildPayload {
  chunks: Array<{
    s0: number;
    s1: number;
    origin: [number, number, number];
    positions: ArrayBuffer;
    normals: ArrayBuffer;
    indices: ArrayBuffer;
  }>;
  flowMap: { width: number; height: number; data: ArrayBuffer };
  contentHash: string;
}
