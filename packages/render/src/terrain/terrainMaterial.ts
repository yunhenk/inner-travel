import * as THREE from 'three';
import type { TerrainPalette } from '@inner/scene-gen';

export interface TerrainMaterialOptions {
  palette: TerrainPalette;
  fogDensity: number;
}

const vertexShader = /* glsl */ `
  attribute float aWet;
  attribute float aConcavity;
  attribute float aEdge;
  attribute float aAlpha;
  attribute float aAnatomy;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec2 vUv;
  varying float vWet;
  varying float vConcavity;
  varying float vEdge;
  varying float vAlpha;
  varying float vAnatomy;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vUv = uv;
    vWet = aWet;
    vConcavity = aConcavity;
    vEdge = aEdge;
    vAlpha = aAlpha;
    vAnatomy = aAnatomy;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform vec3 uSoil;
  uniform vec3 uMoss;
  uniform vec3 uRock;
  uniform vec3 uWet;
  uniform vec3 uInk;
  uniform vec3 uFog;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uFogDensity;
  uniform float uInkStrength;
  uniform float uInkBoost;
  uniform float uAnatomy;
  uniform vec3 uMuscle;
  uniform vec3 uFascia;
  uniform float uTime;
  uniform float uWaterY;
  uniform vec3 uSkin;

  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec2 vUv;
  varying float vWet;
  varying float vConcavity;
  varying float vEdge;
  varying float vAlpha;
  varying float vAnatomy;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * vnoise(p);
      p *= 2.07;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 n = normalize(vNormalW);
    vec3 viewDir = normalize(cameraPosition - vWorld);

    // 高频法线扰动：让岩面在微距下有颗粒与擦痕
    float e = 0.00016;
    vec2 p = vWorld.xz * 2800.0;
    float b0 = fbm(p);
    float bx = fbm(p + vec2(e * 2800.0, 0.0));
    float bz = fbm(p + vec2(0.0, e * 2800.0));
    n = normalize(n + vec3(-(bx - b0), 0.0, -(bz - b0)) * 2.2);

    float slope = 1.0 - clamp(n.y, 0.0, 1.0);
    float mottle = fbm(vWorld.xz * 320.0);
    float fine = fbm(vWorld.xz * 1100.0);

    vec3 moss = mix(uMoss * 0.78, uMoss * 1.14, mottle);
    vec3 soil = mix(uSoil * 0.86, uSoil * 1.1, fine);
    vec3 col = mix(soil, moss, smoothstep(0.35, 0.85, mottle * 0.5 + n.y * 0.5));
    col = mix(col, uRock, smoothstep(0.26, 0.62, slope));
    col = mix(col, uRock * 1.08, smoothstep(0.55, 0.9, fine) * 0.18);

    // 岩层
    float strata = smoothstep(0.36, 0.5, abs(fract(vWorld.y * 1400.0 + mottle * 1.6) - 0.5));
    col = mix(col, uRock * 0.92, strata * 0.16);

    // 水线附近的湿岩
    float nearWater = smoothstep(0.0032, 0.0004, max(vWorld.y - uWaterY, 0.0));
    col = mix(col, uWet, max(vWet, nearWater) * 0.85);

    // 边缘化入皮肤（双象过渡）
    col = mix(col, uSkin, smoothstep(0.55, 0.97, vEdge));

    // 积墨 + 山脊/陡坡的淡墨线
    float rim = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 3.0);
    // 解剖层：肌腹赭红、筋膜牙白；关闭时 uAnatomy=0
    float muscleMask = smoothstep(0.00005, 0.00055, vAnatomy);
    float fasciaMask = smoothstep(0.00005, 0.0004, -vAnatomy);
    col = mix(col, uMuscle, muscleMask * uAnatomy * 0.5);
    col = mix(col, uFascia, fasciaMask * uAnatomy * 0.35);

    float hatch =
      smoothstep(0.58, 0.92, slope) *
      smoothstep(0.42, 0.78, fbm(vWorld.xz * 520.0 + vWorld.y * 700.0));
    col = mix(col, uInk, uInkBoost * (rim * 0.2 + hatch * 0.14));
    col = mix(
      col,
      uInk,
      uInkBoost * uInkStrength * smoothstep(0.04, 0.7, vConcavity) * 0.62
    );
    col *= 1.0 - 0.2 * smoothstep(0.35, 1.0, vConcavity);

    vec3 L = normalize(uSunDir);
    float ndl = max(dot(n, L), 0.0);
    float hemi = 0.45 + 0.55 * clamp(n.y, 0.0, 1.0);
    vec3 lit = col * (vec3(0.3, 0.33, 0.37) * hemi + uSunColor * ndl * 1.32);

    vec3 halfDir = normalize(L + viewDir);
    float spec = pow(max(dot(n, halfDir), 0.0), 42.0) * smoothstep(0.15, 1.0, vWet);
    lit += uSunColor * spec * 0.06;

    // 纸纹（只作用于地形，不碰标签与 UI）
    float paper = hash21(gl_FragCoord.xy * 0.73) - 0.5;
    lit *= 1.0 + paper * 0.03;

    // 谷底薄雾
    float valleyMist = smoothstep(uWaterY + 0.004, uWaterY - 0.0015, vWorld.y) * 0.26;

    float dist = length(cameraPosition - vWorld);
    float fog = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
    fog = clamp(fog + valleyMist * (1.0 - fog), 0.0, 0.94);
    lit = mix(lit, uFog, fog);

    gl_FragColor = vec4(lit, vAlpha);
    #include <colorspace_fragment>
  }
`;
export function createTerrainMaterial(options: TerrainMaterialOptions): THREE.ShaderMaterial {
  const { palette, fogDensity } = options;
  return new THREE.ShaderMaterial({
    transparent: true,
    vertexShader,
    fragmentShader,
    uniforms: {
      uSoil: { value: new THREE.Color(palette.soil) },
      uMoss: { value: new THREE.Color(palette.moss) },
      uRock: { value: new THREE.Color(palette.rock) },
      uWet: { value: new THREE.Color(palette.wet) },
      uInk: { value: new THREE.Color(palette.ink) },
      uFog: { value: new THREE.Color(palette.fog) },
      uSunColor: { value: new THREE.Color('#fff2d8') },
      uSunDir: { value: new THREE.Vector3(-0.45, 0.82, 0.35).normalize() },
      uFogDensity: { value: fogDensity },
      uInkStrength: { value: 0.7 },
      uInkBoost: { value: 1 },
      uAnatomy: { value: 0 },
      uMuscle: { value: new THREE.Color('#8f4c3e') },
      uFascia: { value: new THREE.Color('#e9dfca') },
      uWaterY: { value: 0 },
      uSkin: { value: new THREE.Color('#d9b49c') },
      uTime: { value: 0 },
    },
  });
}
