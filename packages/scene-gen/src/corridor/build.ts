import { smoothstep, type Route, type Vec3 } from '@inner/core';
import { TerrainField, type TerrainOptions } from './field.js';

export interface CorridorBuildOptions extends Partial<TerrainOptions> {
  /** 纵向采样步长（米） */
  ds?: number;
  /** 横向粗网格步长 */
  dtCoarse?: number;
  /** 横向细网格步长（谷底） */
  dtFine?: number;
}

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

export interface WaterData {
  river: MeshData;
  pool: MeshData;
  riverWaterY: number;
  poolWaterY: number;
}

export interface CorridorMeshData {
  field: TerrainField;
  rows: number;
  cols: number;
  tValues: number[];
  sValues: number[];
  terrain: MeshData;
  edge: Float32Array;
  wet: Float32Array;
  concavity: Float32Array;
  bounds: { min: Vec3; max: Vec3 };
  water: WaterData;
  /** 合谷谷底世界坐标 */
  hegu: Vec3;
}

export const DEFAULT_BUILD: Required<
  Pick<CorridorBuildOptions, 'ds' | 'dtCoarse' | 'dtFine'>
> = {
  ds: 0.0005,
  dtCoarse: 0.0012,
  dtFine: 0.0003,
};

export type CorridorData = Omit<CorridorMeshData, 'field'>;

/**
 * 生成手背合谷走廊的网格数据（纯数据，不依赖 three）。
 * 走廊沿经脉曲线展开，横向坐标 t 在手背基面上重新投影，
 * 因此网格天然贴着手背，不会穿出手指。
 */
export function buildCorridor(
  route: Route,
  options: CorridorBuildOptions = {},
): CorridorMeshData {
  const field = new TerrainField(route, options);
  return { field, ...buildCorridorData(field, options) };
}

/**
 * 只生成网格数据，不持有 field。
 * Worker 与主线程共用这一份实现；主线程保留 field 做标记/相机/气路径查询。
 */
export function buildCorridorData(
  field: TerrainField,
  options: CorridorBuildOptions = {},
): CorridorData {
  const { s0, s1, tMin, tMax } = field.domain;
  const ds = options.ds ?? DEFAULT_BUILD.ds;
  const dtCoarse = options.dtCoarse ?? DEFAULT_BUILD.dtCoarse;
  const dtFine = options.dtFine ?? DEFAULT_BUILD.dtFine;

  const rows = Math.max(2, Math.ceil((s1 - s0) / ds) + 1);
  const sValues: number[] = [];
  for (let r = 0; r < rows; r++) {
    sValues.push(s0 + ((s1 - s0) * r) / (rows - 1));
  }

  const tValues = buildTValues(tMin, tMax, -0.0115, 0.0155, dtCoarse, dtFine);
  const cols = tValues.length;

  const count = rows * cols;
  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const wet = new Float32Array(count);
  const edge = new Float32Array(count);
  const heights = new Float32Array(count);

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let r = 0; r < rows; r++) {
    const s = sValues[r]!;
    for (let c = 0; c < cols; c++) {
      const t = tValues[c]!;
      const p = field.pointAt(s, t);
      const i = r * cols + c;
      positions[i * 3] = p[0];
      positions[i * 3 + 1] = p[1];
      positions[i * 3 + 2] = p[2];
      uvs[i * 2] = (s - s0) / Math.max(1e-9, s1 - s0);
      uvs[i * 2 + 1] = (t - tMin) / Math.max(1e-9, tMax - tMin);
      wet[i] = field.wetAt(s, t, p[1]);
      heights[i] = p[1];
      const tNorm = (t - tMin) / Math.max(1e-9, tMax - tMin);
      const sNorm = (s - s0) / Math.max(1e-9, s1 - s0);
      const edgeT = 1 - smooth01(Math.min(tNorm, 1 - tNorm) / 0.1);
      const edgeS = 1 - smooth01(Math.min(sNorm, 1 - sNorm) / 0.04);
      edge[i] = Math.max(edgeT, edgeS);

      minX = Math.min(minX, p[0]);
      minY = Math.min(minY, p[1]);
      minZ = Math.min(minZ, p[2]);
      maxX = Math.max(maxX, p[0]);
      maxY = Math.max(maxY, p[1]);
      maxZ = Math.max(maxZ, p[2]);
    }
  }

  const normals = computeGridNormals(positions, rows, cols);
  const concavity = computeConcavity(heights, rows, cols);
  const indices = buildIndices(rows, cols);

  const terrain: MeshData = { positions, normals, uvs, indices };
  const river = buildRiver(field, sValues[0]!, sValues[sValues.length - 1]!);
  const pool =
    field.domain.s0 <= field.heguS && field.heguS <= field.domain.s1
      ? buildPool(field)
      : emptyMesh();

  return {
    rows,
    cols,
    tValues,
    sValues,
    terrain,
    wet,
    edge,
    concavity,
    bounds: {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
    },
    water: {
      river,
      pool,
      riverWaterY: field.riverWaterY(field.heguS),
      poolWaterY: field.poolWaterY(),
    },
    hegu: field.pointAt(field.heguS, 0),
  };
}

function buildTValues(
  tMin: number,
  tMax: number,
  fineMin: number,
  fineMax: number,
  coarse: number,
  fine: number,
): number[] {
  const values = new Set<number>();
  for (let t = tMin; t <= tMax + 1e-9; t += coarse) values.add(round6(t));
  for (let t = Math.max(tMin, fineMin); t <= Math.min(tMax, fineMax) + 1e-9; t += fine) {
    values.add(round6(t));
  }
  values.add(round6(tMin));
  values.add(round6(tMax));
  return [...values].sort((a, b) => a - b);
}

function smooth01(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

function round6(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

function buildIndices(rows: number, cols: number): Uint32Array {
  const indices: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = (r + 1) * cols + c;
      const d = r * cols + c + 1;
      const e = (r + 1) * cols + c + 1;
      indices.push(a, d, b, d, e, b);
    }
  }
  return new Uint32Array(indices);
}

function computeGridNormals(
  positions: Float32Array,
  rows: number,
  cols: number,
): Float32Array {
  const normals = new Float32Array(positions.length);
  const at = (r: number, c: number): Vec3 => {
    const i = (r * cols + c) * 3;
    return [positions[i]!, positions[i + 1]!, positions[i + 2]!];
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const r0 = Math.max(0, r - 1);
      const r1 = Math.min(rows - 1, r + 1);
      const c0 = Math.max(0, c - 1);
      const c1 = Math.min(cols - 1, c + 1);
      const du = sub(at(r1, c), at(r0, c));
      const dv = sub(at(r, c1), at(r, c0));
      const n = normalize(cross(dv, du));
      // 高度场应朝上；前臂段的 x/z 方向与手背相反，需要翻转
      const sign = n[1] < 0 ? -1 : 1;
      const i = (r * cols + c) * 3;
      normals[i] = n[0] * sign;
      normals[i + 1] = n[1] * sign;
      normals[i + 2] = n[2] * sign;
    }
  }
  return normals;
}

function computeConcavity(heights: Float32Array, rows: number, cols: number): Float32Array {
  const out = new Float32Array(heights.length);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 0 || c === 0 || r === rows - 1 || c === cols - 1) continue;
      const i = r * cols + c;
      const avg =
        (heights[i - 1]! + heights[i + 1]! + heights[i - cols]! + heights[i + cols]!) * 0.25;
      out[i] = Math.max(0, Math.min(1, (avg - heights[i]!) / 0.00075));
    }
  }
  return out;
}

function buildRiver(field: TerrainField, s0: number, s1: number): MeshData {
  const start = s0 + 0.006;
  const end = s1 - 0.006;
  const rows = Math.max(2, Math.ceil((end - start) / 0.0012) + 1);
  const cols = 9;
  const positions = new Float32Array(rows * cols * 3);
  const uvs = new Float32Array(rows * cols * 2);
  const normals = new Float32Array(rows * cols * 3);

  for (let r = 0; r < rows; r++) {
    const s = start + ((end - start) * r) / (rows - 1);
    const span = field.wettedSpan(s);
    // 走廊端头地形会摊平，湿边可能突然变宽；夹住并收口，避免出现悬空水膜
    const taper =
      smoothstep(s0 + 0.006, s0 + 0.018, s) * smoothstep(s1 - 0.006, s1 - 0.018, s);
    const maxHalf = Math.max(0.001, field.paramsAt(s).poolSigmaT * 0.45);
    const left = Math.max(span.left, -maxHalf) * taper;
    const right = Math.min(span.right, maxHalf) * taper;
    for (let c = 0; c < cols; c++) {
      const t = left + ((right - left) * c) / (cols - 1);
      const p = field.waterPointAt(s, t);
      const n = field.normalAt(s, t);
      const i = r * cols + c;
      positions[i * 3] = p[0];
      positions[i * 3 + 1] = p[1];
      positions[i * 3 + 2] = p[2];
      normals[i * 3] = n[0];
      normals[i * 3 + 1] = n[1];
      normals[i * 3 + 2] = n[2];
      uvs[i * 2] = r / (rows - 1);
      uvs[i * 2 + 1] = c / (cols - 1);
    }
  }

  return { positions, normals, uvs, indices: buildIndices(rows, cols) };
}

function buildPool(field: TerrainField): MeshData {
  const rings = 16;
  const segments = 48;
  const rs = 0.0058;
  const rt = 0.0038;
  const positions: number[] = [];
  const uvs: number[] = [];
  const normals: number[] = [];

  positions.push(0, 0, 0);
  uvs.push(0.5, 0.5);
  normals.push(0, 1, 0);
  const center = field.waterPointAt(field.heguS, 0);

  for (let ring = 1; ring <= rings; ring++) {
    const rr = ring / rings;
    for (let seg = 0; seg < segments; seg++) {
      const a = (seg / segments) * Math.PI * 2;
      const s = field.heguS + Math.cos(a) * rs * rr;
      const t = Math.sin(a) * rt * rr;
      const p = field.waterPointAt(s, t);
      const n = field.normalAt(s, t);
      positions.push(p[0], p[1], p[2]);
      uvs.push(0.5 + 0.5 * Math.cos(a) * rr, 0.5 + 0.5 * Math.sin(a) * rr);
      normals.push(n[0], n[1], n[2]);
    }
  }

  const indices: number[] = [];
  const vert = (ring: number, seg: number) => 1 + (ring - 1) * segments + (seg % segments);
  for (let seg = 0; seg < segments; seg++) {
    indices.push(0, vert(1, seg + 1), vert(1, seg));
  }
  for (let ring = 1; ring < rings; ring++) {
    for (let seg = 0; seg < segments; seg++) {
      const a = vert(ring, seg);
      const b = vert(ring, seg + 1);
      const c = vert(ring + 1, seg);
      const d = vert(ring + 1, seg + 1);
      indices.push(a, b, c, b, d, c);
    }
  }

  positions[0] = center[0];
  positions[1] = center[1];
  positions[2] = center[2];

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

function emptyMesh(): MeshData {
  return {
    positions: new Float32Array(),
    normals: new Float32Array(),
    uvs: new Float32Array(),
    indices: new Uint32Array(),
  };
}
