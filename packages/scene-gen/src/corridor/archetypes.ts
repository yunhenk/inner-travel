/**
 * 六个场景原型。参数是相对「谷」基准的倍率/绝对值，
 * 在 TerrainField 里参与高度、河道与汇水潭的计算。
 */
export type ArchetypeId = 'valley' | 'stream' | 'gorge' | 'pool' | 'well' | 'pass';
export type ArchetypeChoice = ArchetypeId | 'auto';

export interface ArchetypeParams {
  /** 谷深倍率（基准 3mm） */
  valleyAmp: number;
  /** 两脊距离（米） */
  ridgeOffset: number;
  /** 谷底横向宽度（米） */
  sigmaC: number;
  /** 山脊横向宽度（米） */
  sigmaR: number;
  /** 山脊相对谷底的增益 */
  ridgeGain: number;
  /** 河道宽度倍率 */
  riverWidth: number;
  /** 河道下切倍率 */
  riverDepth: number;
  /** 河道水面相对谷底的抬升（米） */
  waterLevel: number;
  /** 汇水潭深度倍率 */
  poolDepth: number;
  /** 潭沿经向半径（米） */
  poolSigmaS: number;
  /** 潭沿横向半径（米） */
  poolSigmaT: number;
  /** 潭面相对潭心的抬升（米） */
  poolLevel: number;
  /** 细节倍率 */
  detail: number;
  /** 次级山肩倍率 */
  secondary: number;
}

export const ARCHETYPES: Record<ArchetypeId, ArchetypeParams> = {
  valley: {
    valleyAmp: 1,
    ridgeOffset: 0.0078,
    sigmaC: 0.0034,
    sigmaR: 0.0019,
    ridgeGain: 0.64,
    riverWidth: 1,
    riverDepth: 1,
    waterLevel: 0.00018,
    poolDepth: 1,
    poolSigmaS: 0.0055,
    poolSigmaT: 0.0034,
    poolLevel: 0.00055,
    detail: 1,
    secondary: 1,
  },
  stream: {
    valleyAmp: 0.6,
    ridgeOffset: 0.0105,
    sigmaC: 0.0058,
    sigmaR: 0.0024,
    ridgeGain: 0.42,
    riverWidth: 0.9,
    riverDepth: 1.3,
    waterLevel: 0.00012,
    poolDepth: 0.3,
    poolSigmaS: 0.0032,
    poolSigmaT: 0.002,
    poolLevel: 0.0001,
    detail: 1.3,
    secondary: 0.7,
  },
  gorge: {
    valleyAmp: 1.35,
    ridgeOffset: 0.0052,
    sigmaC: 0.0026,
    sigmaR: 0.0014,
    ridgeGain: 0.78,
    riverWidth: 0.65,
    riverDepth: 1.4,
    waterLevel: 0.00022,
    poolDepth: 0.6,
    poolSigmaS: 0.0045,
    poolSigmaT: 0.0028,
    poolLevel: 0.00045,
    detail: 1.1,
    secondary: 1.2,
  },
  pool: {
    valleyAmp: 0.6,
    ridgeOffset: 0.011,
    sigmaC: 0.0055,
    sigmaR: 0.0026,
    ridgeGain: 0.4,
    riverWidth: 1.7,
    riverDepth: 0.6,
    waterLevel: 0.0002,
    poolDepth: 2.6,
    poolSigmaS: 0.009,
    poolSigmaT: 0.0065,
    poolLevel: 0.0007,
    detail: 0.9,
    secondary: 0.6,
  },
  well: {
    valleyAmp: 0.5,
    ridgeOffset: 0.006,
    sigmaC: 0.003,
    sigmaR: 0.002,
    ridgeGain: 0.5,
    riverWidth: 0.5,
    riverDepth: 0.8,
    waterLevel: 0.00012,
    poolDepth: 3.2,
    poolSigmaS: 0.004,
    poolSigmaT: 0.003,
    poolLevel: 0.0006,
    detail: 1,
    secondary: 0.5,
  },
  pass: {
    valleyAmp: 1.2,
    ridgeOffset: 0.0045,
    sigmaC: 0.0024,
    sigmaR: 0.0014,
    ridgeGain: 0.85,
    riverWidth: 0.7,
    riverDepth: 1.5,
    waterLevel: 0.0002,
    poolDepth: 0.4,
    poolSigmaS: 0.004,
    poolSigmaT: 0.0026,
    poolLevel: 0.0003,
    detail: 1.15,
    secondary: 1.3,
  },
};

export const ARCHETYPE_OPTIONS: ReadonlyArray<{ id: ArchetypeChoice; label: string }> = [
  { id: 'auto', label: '随经' },
  { id: 'valley', label: '谷' },
  { id: 'stream', label: '溪' },
  { id: 'gorge', label: '峡' },
  { id: 'pool', label: '池' },
  { id: 'well', label: '井' },
  { id: 'pass', label: '关' },
];

/** 沿经自动混合：三间→溪，合谷→谷，阳溪→峡 */
export function autoParamsAt(s: number, s3: number, s4: number, s5: number): ArchetypeParams {
  const band = 0.022;
  const w3 = Math.exp(-(((s - s3) / band) ** 2));
  const w4 = Math.exp(-(((s - s4) / band) ** 2));
  const w5 = Math.exp(-(((s - s5) / band) ** 2));
  const total = w3 + w4 + w5;
  if (total < 1e-9) return ARCHETYPES.valley;

  const a = w3 / total;
  const b = w4 / total;
  const c = w5 / total;
  return blend(ARCHETYPES.stream, ARCHETYPES.valley, ARCHETYPES.gorge, a, b, c);
}

function blend(
  a: ArchetypeParams,
  b: ArchetypeParams,
  c: ArchetypeParams,
  wa: number,
  wb: number,
  wc: number,
): ArchetypeParams {
  const mix = (key: keyof ArchetypeParams) =>
    a[key] * wa + b[key] * wb + c[key] * wc;
  return {
    valleyAmp: mix('valleyAmp'),
    ridgeOffset: mix('ridgeOffset'),
    sigmaC: mix('sigmaC'),
    sigmaR: mix('sigmaR'),
    ridgeGain: mix('ridgeGain'),
    riverWidth: mix('riverWidth'),
    riverDepth: mix('riverDepth'),
    waterLevel: mix('waterLevel'),
    poolDepth: mix('poolDepth'),
    poolSigmaS: mix('poolSigmaS'),
    poolSigmaT: mix('poolSigmaT'),
    poolLevel: mix('poolLevel'),
    detail: mix('detail'),
    secondary: mix('secondary'),
  };
}
