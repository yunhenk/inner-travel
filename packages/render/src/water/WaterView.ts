import * as THREE from 'three';
import type { CorridorMeshData } from '@inner/scene-gen';
import { createWaterMaterial } from './waterMaterial.js';

export interface WaterView {
  group: THREE.Group;
  update(time: number): void;
  setFogDensity(value: number): void;
  dispose(): void;
}

export function createWaterView(corridor: CorridorMeshData): WaterView {
  const palette = corridor.field.palette;
  const uniforms = createWaterMaterial({
    shallow: '#5c7f86',
    deep: '#1d3134',
    sky: '#f0e9d9',
    fog: palette.fog,
    fogDensity: 7,
    opacity: 0.52,
  });

  const group = new THREE.Group();
  group.name = 'Water';

  const river = meshFrom(corridor.water.river, uniforms.material);
  river.name = 'RiverRibbon';
  group.add(river);

  return {
    group,
    update(time: number) {
      uniforms.material.uniforms.uTime!.value = time;
    },
    setFogDensity(value: number) {
      uniforms.setFogDensity(value);
    },
    dispose() {
      for (const child of group.children) {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
        }
      }
      uniforms.material.dispose();
    },
  };
}

function meshFrom(
  data: { positions: Float32Array; normals: Float32Array; uvs: Float32Array; indices: Uint32Array },
  material: THREE.Material,
): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}
