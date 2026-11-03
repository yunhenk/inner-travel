import * as THREE from 'three';
import type { CorridorMeshData } from '@inner/scene-gen';
import { createTerrainMaterial } from './terrainMaterial.js';

export interface TerrainView {
  group: THREE.Group;
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  dispose(): void;
  setFogDensity(value: number): void;
  setInk(enabled: boolean): void;
}

/** 把 scene-gen 的纯数据装配成 three 网格 */
export function createTerrainView(corridor: CorridorMeshData): TerrainView {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(corridor.terrain.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(corridor.terrain.normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(corridor.terrain.uvs, 2));
  geometry.setAttribute('aWet', new THREE.BufferAttribute(corridor.wet, 1));
  geometry.setAttribute('aConcavity', new THREE.BufferAttribute(corridor.concavity, 1));
  geometry.setAttribute('aEdge', new THREE.BufferAttribute(corridor.edge, 1));
  if (corridor.terrain.alpha) {
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(corridor.terrain.alpha, 1));
  } else {
    const ones = new Float32Array(corridor.terrain.positions.length / 3).fill(1);
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(ones, 1));
  }
  geometry.setIndex(new THREE.BufferAttribute(corridor.terrain.indices, 1));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();

  const material = createTerrainMaterial({ palette: corridor.field.palette, fogDensity: 7 });
  material.uniforms.uWaterY!.value = corridor.water.riverWaterY;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.name = 'TerrainCorridor';
  mesh.frustumCulled = false;

  const group = new THREE.Group();
  group.name = 'Terrain';
  group.add(mesh);

  return {
    group,
    mesh,
    material,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
    setFogDensity(value: number) {
      material.uniforms.uFogDensity!.value = value;
    },
    setInk(enabled: boolean) {
      material.uniforms.uInkStrength!.value = enabled ? 0.7 : 0;
      material.uniforms.uInkBoost!.value = enabled ? 1 : 0;
    },
  };
}
