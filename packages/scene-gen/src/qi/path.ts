import { cross, normalize, sub, type Vec3 } from '@inner/core';
import type { TerrainField } from '../corridor/field.js';

export interface QiPathOptions {
  /** 路径采样数，贴图宽度 */
  samples?: number;
  /** 相对谷底的抬升（米） */
  lift?: number;
}

/**
 * 气粒子路径：沿走廊谷底中线取样，烘焙成 4 行 RGBA float 纹理。
 *
 * 行 0：世界坐标 position
 * 行 1：法线（≈ +y）
 * 行 2：副法线（横向，T × N）
 * 行 3：s 归一化值（调试/扩展用）
 *
 * 纹理坐标：v = (row + 0.5) / 4。
 */
export interface QiPath {
  width: number;
  data: Float32Array;
  s0: number;
  s1: number;
  /** 合谷在路径上的归一化位置 */
  poolU: number;
}

export function buildQiPath(field: TerrainField, options: QiPathOptions = {}): QiPath {
  const width = Math.max(8, Math.floor(options.samples ?? 512));
  const lift = options.lift ?? 0.0006;
  const { s0, s1, heguS } = field.domain;

  const positions: Vec3[] = [];
  for (let i = 0; i < width; i++) {
    const s = s0 + ((s1 - s0) * i) / (width - 1);
    const p = field.pointAt(s, 0);
    positions.push([p[0], p[1] + lift, p[2]]);
  }

  const data = new Float32Array(width * 4 * 4);
  const up: Vec3 = [0, 1, 0];

  for (let i = 0; i < width; i++) {
    const prev = positions[Math.max(0, i - 1)]!;
    const next = positions[Math.min(width - 1, i + 1)]!;
    const tangent = normalize(sub(next, prev));
    const normal = normalize([
      up[0] - tangent[0] * tangent[1],
      up[1] - tangent[1] * tangent[1],
      up[2] - tangent[2] * tangent[1],
    ]);
    const binormal = normalize(cross(tangent, normal));
    const p = positions[i]!;

    const row = (r: number) => (r * width + i) * 4;
    data.set([p[0], p[1], p[2], 1], row(0));
    data.set([normal[0], normal[1], normal[2], 1], row(1));
    data.set([binormal[0], binormal[1], binormal[2], 1], row(2));
    data.set([i / (width - 1), 0, 0, 1], row(3));
  }

  return {
    width,
    data,
    s0,
    s1,
    poolU: (heguS - s0) / Math.max(1e-9, s1 - s0),
  };
}
