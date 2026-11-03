import * as THREE from 'three';
import { resolveAnchor, type Acupoint } from '@inner/core';

export interface BodyAnchorView {
  group: THREE.Group;
  setVisible(visible: boolean): void;
  setActive(code: string): void;
  dispose(): void;
}

/** 20 穴在程序化身体上的示意锚点：点 + 经线 + 穴码标签 */
export function createBodyAnchorView(points: readonly Acupoint[], accent: string): BodyAnchorView {
  const group = new THREE.Group();
  group.name = 'BodyAnchors';
  group.visible = false;

  const dotGeometry = new THREE.SphereGeometry(0.0028, 10, 8);
  const dotMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(accent),
    transparent: true,
    opacity: 0.95,
    depthTest: false,
  });
  const linePositions: number[] = [];
  const dots = new Map<string, THREE.Mesh>();
  const labels = new Set(['LI1', 'LI3', 'LI4', 'LI5', 'LI11', 'LI15', 'LI20']);
  const textures: THREE.Texture[] = [];
  const labelMaterials: THREE.SpriteMaterial[] = [];

  for (const point of points) {
    const world = resolveAnchor(point);
    const position = new THREE.Vector3(world[0], world[1] + 0.0018, world[2]);

    const dot = new THREE.Mesh(dotGeometry, dotMaterial);
    dot.position.copy(position);
    dot.renderOrder = 2;
    group.add(dot);
    dots.set(point.code, dot);
    linePositions.push(position.x, position.y, position.z);

    if (labels.has(point.code)) {
      const label = createCodeLabel(point.code);
      label.sprite.position.copy(position).add(new THREE.Vector3(0, 0.009, 0));
      group.add(label.sprite);
      textures.push(label.texture);
      labelMaterials.push(label.material);
    }
  }

  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
  const lineMaterial = new THREE.LineBasicMaterial({
    color: new THREE.Color(accent),
    transparent: true,
    opacity: 0.36,
    depthTest: false,
  });
  const line = new THREE.Line(lineGeometry, lineMaterial);
  line.renderOrder = 1;
  group.add(line);

  return {
    group,
    setVisible(visible: boolean) {
      group.visible = visible;
    },
    setActive(code: string) {
      for (const [key, dot] of dots) {
        const active = key === code;
        dot.scale.setScalar(active ? 1.9 : 1);
      }
    },
    dispose() {
      dotGeometry.dispose();
      dotMaterial.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
      for (const texture of textures) texture.dispose();
      for (const material of labelMaterials) material.dispose();
    },
  };
}

function createCodeLabel(code: string): {
  sprite: THREE.Sprite;
  texture: THREE.Texture;
  material: THREE.SpriteMaterial;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '600 30px "Songti SC", "STSong", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(45, 36, 26, 0.9)';
    ctx.fillText(code, canvas.width / 2, canvas.height / 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.028, 0.014, 1);
  sprite.renderOrder = 6;
  return { sprite, texture, material };
}
