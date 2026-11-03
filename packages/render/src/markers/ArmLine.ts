import * as THREE from 'three';
import type { Route } from '@inner/core';

export interface ArmLineView {
  group: THREE.Group;
  setFocus(focusS: number): void;
  dispose(): void;
}

/** 远景的整条经线 + 穴位点：焦点窗口外只保留这一层 */
export function createArmLineView(route: Route, accent: string): ArmLineView {
  const group = new THREE.Group();
  group.name = 'ArmLine';

  const samples = 240;
  const positions: number[] = [];
  for (let i = 0; i < samples; i++) {
    const s = (route.curve.length * i) / (samples - 1);
    const p = route.curve.sampleAt(s);
    positions.push(p[0], p[1], p[2]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: new THREE.Color(accent),
    transparent: true,
    opacity: 0.32,
  });
  const line = new THREE.Line(geometry, material);
  line.renderOrder = 2;
  group.add(line);

  const dotGeometry = new THREE.SphereGeometry(0.0007, 8, 6);
  const dotMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(accent),
    transparent: true,
    opacity: 0.8,
  });
  const dots: Array<{ mesh: THREE.Mesh; s: number }> = [];
  for (const stop of route.stops) {
    const dot = new THREE.Mesh(dotGeometry, dotMaterial);
    dot.position.set(stop.position[0], stop.position[1] + 0.0012, stop.position[2]);
    group.add(dot);
    dots.push({ mesh: dot, s: stop.s });
  }

  return {
    group,
    setFocus(focusS: number) {
      for (const dot of dots) {
        dot.mesh.visible = Math.abs(dot.s - focusS) > 0.045;
      }
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      dotGeometry.dispose();
      dotMaterial.dispose();
    },
  };
}
