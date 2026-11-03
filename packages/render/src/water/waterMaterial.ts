import * as THREE from 'three';

const vertexShader = /* glsl */ `
  varying vec3 vWorld;
  varying vec2 vUv;
  varying vec3 vNormalW;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uSky;
  uniform vec3 uFog;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uOpacity;
  uniform float uFogDensity;
  uniform float uTime;
  uniform float uTide;
  uniform vec3 uRipplePos;
  uniform float uRippleStrength;
  uniform float uRippleTime;

  varying vec3 vWorld;
  varying vec2 vUv;
  varying vec3 vNormalW;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float ripple =
      sin(vWorld.x * 2600.0 + uTime * (0.9 + uTide)) *
      cos(vWorld.z * 3100.0 - uTime * 0.7);
    vec3 n = normalize(vec3(ripple * 0.06, 1.0, ripple * 0.05));

    float rd = length(vWorld.xz - uRipplePos.xz);
    float rippleWave =
      sin(rd * 1900.0 - uRippleTime * 5.5) *
      exp(-rd * 150.0) *
      uRippleStrength;
    n = normalize(n + vec3(rippleWave * 0.055, 0.0, rippleWave * 0.04));

    float flowLine = 0.5 + 0.5 * sin(vUv.x * 260.0 + uTime * 1.2 + vUv.y * 6.0);
    float fresnel = pow(1.0 - max(dot(viewDir, n), 0.0), 4.0);
    vec3 col = mix(uDeep, uShallow, 0.5 + 0.3 * fresnel + 0.06 * flowLine);
    col = mix(col, uSky, fresnel * 0.16);

    vec3 L = normalize(uSunDir);
    vec3 halfDir = normalize(L + viewDir);
    float spec = pow(max(dot(n, halfDir), 0.0), 120.0);
    col += uSunColor * spec * 0.32;
    col += uSky * max(rippleWave, 0.0) * 0.16;


    float dist = length(cameraPosition - vWorld);
    float fog = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
    col = mix(col, uFog, clamp(fog, 0.0, 0.9));

    float edgeFade = smoothstep(0.0, 0.14, min(vUv.y, 1.0 - vUv.y));
    float endFade = smoothstep(0.0, 0.07, vUv.x) * smoothstep(1.0, 0.93, vUv.x);
    gl_FragColor = vec4(col, uOpacity * (0.55 + 0.45 * edgeFade) * endFade);
    #include <colorspace_fragment>
  }
`;

export interface WaterUniforms {
  material: THREE.ShaderMaterial;
  setFogDensity(value: number): void;
  setTide(value: number): void;
  setRipple(point: THREE.Vector3 | null, strength: number, time: number): void;
}

export function createWaterMaterial(options: {
  shallow: string;
  deep: string;
  sky: string;
  fog: string;
  fogDensity: number;
  opacity?: number;
}): WaterUniforms {
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uShallow: { value: new THREE.Color(options.shallow) },
      uDeep: { value: new THREE.Color(options.deep) },
      uSky: { value: new THREE.Color(options.sky) },
      uFog: { value: new THREE.Color(options.fog) },
      uSunDir: { value: new THREE.Vector3(-0.45, 0.82, 0.35).normalize() },
      uSunColor: { value: new THREE.Color('#fff0d0') },
      uOpacity: { value: options.opacity ?? 0.72 },
      uFogDensity: { value: options.fogDensity },
      uTime: { value: 0 },
      uTide: { value: 0.55 },
      uRipplePos: { value: new THREE.Vector3() },
      uRippleStrength: { value: 0 },
      uRippleTime: { value: 0 },
    },
  });
  return {
    material,
    setFogDensity(value: number) {
      material.uniforms.uFogDensity!.value = value;
    },
    setTide(value: number) {
      material.uniforms.uTide!.value = value;
    },
    setRipple(point: THREE.Vector3 | null, strength: number, time: number) {
      if (point) material.uniforms.uRipplePos!.value.copy(point);
      material.uniforms.uRippleStrength!.value = strength;
      material.uniforms.uRippleTime!.value = time;
    },
  };
}
