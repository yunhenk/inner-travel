import * as THREE from 'three';

export interface PressView {
  group: THREE.Group;
  update(point: THREE.Vector3 | null, normal: THREE.Vector3 | null, strength: number, time: number): void;
  dispose(): void;
}

/**
 * 候气时贴在地面上的两圈涟漪。
 * 只负责视觉；吸附强度由 SceneHost 传给气粒子与水面。
 */
export function createPressView(color: string): PressView {
  const group = new THREE.Group();
  group.name = 'Press';
  group.visible = false;

  const makeRing = (radius: number, opacity: number) => {
    const geometry = new THREE.TorusGeometry(radius, Math.max(0.000035, radius * 0.04), 6, 48);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    group.add(mesh);
    return { mesh, material, baseOpacity: opacity, geometry };
  };

  const inner = makeRing(0.0009, 0.4);
  const outer = makeRing(0.0016, 0.2);

  return {
    group,
    update(
      point: THREE.Vector3 | null,
      normal: THREE.Vector3 | null,
      strength: number,
      time: number,
    ) {
      const active = !!point && strength > 0.01;
      group.visible = active;
      if (!active || !point) return;

      group.position.set(point.x, point.y + 0.0004, point.z);
      if (normal) {
        group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      } else {
        group.quaternion.identity();
      }
      inner.material.opacity = strength * inner.baseOpacity;
      outer.material.opacity = strength * outer.baseOpacity;
      const pulse = 1 + 0.16 * Math.sin(time * 4.2);
      inner.mesh.scale.setScalar(pulse);
      outer.mesh.scale.setScalar(1.25 + 0.2 * Math.sin(time * 2.4 + 0.8));
    },
    dispose() {
      inner.geometry.dispose();
      outer.geometry.dispose();
      inner.material.dispose();
      outer.material.dispose();
    },
  };
}
