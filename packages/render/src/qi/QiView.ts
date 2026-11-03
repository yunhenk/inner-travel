import * as THREE from 'three';
import { mulberry32 } from '@inner/core';
import { buildQiPath, type TerrainField } from '@inner/scene-gen';

export interface QiView {
  group: THREE.Group;
  update(time: number, tide: number, opacity: number): void;
  setPixelScale(value: number): void;
  dispose(): void;
}

const vertexShader = /* glsl */ `
  attribute float aPhase;
  attribute float aSeed;
  attribute float aSpeed;
  attribute float aSize;

  uniform sampler2D uCurve;
  uniform float uTime;
  uniform float uTide;
  uniform float uSize;
  uniform float uPixelScale;
  uniform float uSpeed;
  uniform float uPoolU;

  varying float vAlpha;
  varying float vPool;

  void main() {
    float u = fract(aPhase + uTime * aSpeed * uSpeed * (0.55 + 0.45 * uTide));

    vec3 p = texture2D(uCurve, vec2(u, 0.125)).xyz;
    vec3 n = texture2D(uCurve, vec2(u, 0.375)).xyz;
    vec3 b = texture2D(uCurve, vec2(u, 0.625)).xyz;

    float pool = exp(-pow((u - uPoolU) / 0.075, 2.0));
    float edge = smoothstep(0.0, 0.1, u) * smoothstep(1.0, 0.88, u);
    float swirl = sin(u * 42.0 + aSeed * 6.2831) * (0.0003 + 0.0012 * pool);

    p += b * swirl;
    p += n * (0.00022 + 0.00055 * (0.5 + 0.5 * sin(u * 23.0 + aSeed * 12.0)));

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = min(18.0, aSize * uSize * uPixelScale / max(0.004, -mv.z));
    gl_Position = projectionMatrix * mv;

    vAlpha = edge * (0.55 + 0.45 * sin(u * 60.0 + aSeed * 40.0)) * (0.7 + 0.3 * uTide);
    vPool = pool;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform vec3 uColor;
  uniform float uOpacity;

  varying float vAlpha;
  varying float vPool;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    a *= a * vAlpha;

    vec3 col = uColor * (0.75 + 0.6 * vPool);
    gl_FragColor = vec4(col, a * uOpacity);
    #include <colorspace_fragment>
  }
`;

/**
 * 沿谷道流动的气粒子。位置来自 scene-gen 烘焙的曲线纹理，
 * 顶点只做相位采样与横向回旋，不在 CPU 上积分。
 */
export function createQiView(field: TerrainField): QiView {
  const path = buildQiPath(field);
  const texture = new THREE.DataTexture(
    path.data,
    path.width,
    4,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  const count = 3000;
  const rng = mulberry32(0x9e3779b9);
  const phases = new Float32Array(count);
  const seeds = new Float32Array(count);
  const speeds = new Float32Array(count);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    phases[i] = rng();
    seeds[i] = rng();
    speeds[i] = 0.65 + rng() * 0.7;
    sizes[i] = 0.55 + rng() * 0.9;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uCurve: { value: texture },
      uTime: { value: 0 },
      uTide: { value: 0.62 },
      uSize: { value: 0.00011 },
      uPixelScale: { value: 800 },
      uSpeed: { value: 0.045 },
      uPoolU: { value: path.poolU },
      uColor: { value: new THREE.Color(field.palette.glow) },
      uOpacity: { value: 0.6 },
    },
  });

  const points = new THREE.Points(geometry, material);
  points.name = 'QiParticles';
  points.frustumCulled = false;
  points.renderOrder = 6;

  const group = new THREE.Group();
  group.name = 'Qi';
  group.add(points);

  return {
    group,
    update(time: number, tide: number, opacity: number) {
      material.uniforms.uTime!.value = time;
      material.uniforms.uTide!.value = tide;
      material.uniforms.uOpacity!.value = opacity;
    },
    setPixelScale(value: number) {
      material.uniforms.uPixelScale!.value = value;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
