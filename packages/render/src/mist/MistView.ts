import * as THREE from 'three';
import type { TerrainField } from '@inner/scene-gen';

export interface MistView {
  group: THREE.Group;
  update(time: number): void;
  dispose(): void;
}

/** 谷口与潭面上的几片雾气；用贴图 sprite，不引入体积雾成本 */
export function createMistView(field: TerrainField): MistView {
  const group = new THREE.Group();
  group.name = 'Mist';
  const texture = makeMistTexture();
  const sprites: Array<{ sprite: THREE.Sprite; baseX: number; baseY: number; phase: number; drift: number }> = [];
  const { s0, s1, heguS } = field.domain;

  for (let i = 0; i < 5; i++) {
    const s = s0 + ((s1 - s0) * (i + 0.5)) / 5;
    const t = (i % 2 === 0 ? -1 : 1) * (0.004 + (i % 3) * 0.0015);
    const p = field.pointAt(s, t);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.06 + (i % 3) * 0.015,
      depthWrite: false,
      color: new THREE.Color('#f4efe3'),
    });
    const sprite = new THREE.Sprite(material);
    const scale = 0.006 + (i % 3) * 0.002;
    sprite.scale.set(scale, scale * 0.4, 1);
    sprite.position.set(p[0], p[1] + 0.0035 + (i % 3) * 0.001, p[2]);
    group.add(sprite);
    sprites.push({
      sprite,
      baseX: p[0],
      baseY: sprite.position.y,
      phase: i * 1.7,
      drift: 0.0006 + (i % 3) * 0.00025,
    });
  }

  // 窗口两端的雾帘：用几何 skirt 把切边收进雾里
  for (const edgeS of [s0 + 0.003, s1 - 0.003]) {
    group.add(createEdgeCurtain(field, edgeS));
  }

  // 窗口两端各加一片横向雾，遮住 tile 切边
  for (const edgeS of [s0 + 0.004, s1 - 0.004]) {
    const p = field.pointAt(edgeS, 0);
    const n = field.normalAt(edgeS, 0);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      color: new THREE.Color('#f4efe3'),
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.02, 0.006, 1);
    sprite.position.set(p[0] + n[0] * 0.005, p[1] + n[1] * 0.005, p[2] + n[2] * 0.005);
    group.add(sprite);
    sprites.push({
      sprite,
      baseX: sprite.position.x,
      baseY: sprite.position.y,
      phase: edgeS * 100,
      drift: 0.0003,
    });
  }

  // 潭面上额外一片更低的雾
  const pool = field.pointAt(heguS, 0);
  const poolSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      color: new THREE.Color('#f6f1e6'),
    }),
  );
  poolSprite.scale.set(0.008, 0.003, 1);
  poolSprite.position.set(pool[0], pool[1] + 0.0012, pool[2]);
  group.add(poolSprite);
  sprites.push({ sprite: poolSprite, baseX: pool[0], baseY: poolSprite.position.y, phase: 0.6, drift: 0.0004 });

  return {
    group,
    update(time: number) {
      for (const item of sprites) {
        item.sprite.position.x =
          item.baseX + Math.sin(time * 0.22 + item.phase) * item.drift;
        item.sprite.position.y =
          item.baseY + Math.sin(time * 0.35 + item.phase * 2) * 0.00012;
      }
    },
    dispose() {
      texture.dispose();
      for (const item of sprites) item.sprite.material.dispose();
    },
  };
}

function makeMistTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createEdgeCurtain(field: TerrainField, s: number): THREE.Mesh {
  const segments = 20;
  const height = 0.02;
  const positions: number[] = [];
  const alphas: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = field.domain.tMin + ((field.domain.tMax - field.domain.tMin) * i) / segments;
    const p = field.pointAt(s, t);
    const n = field.normalAt(s, t);
    positions.push(p[0], p[1], p[2]);
    alphas.push(0.42);
    positions.push(p[0] + n[0] * height, p[1] + n[1] * height, p[2] + n[2] * height);
    alphas.push(0);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aAlpha', new THREE.Float32BufferAttribute(alphas, 1));
  geometry.setIndex(indices);

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color('#ece5d4') } },
    vertexShader: `
      attribute float aAlpha;
      varying float vAlpha;
      void main() {
        vAlpha = aAlpha;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        gl_FragColor = vec4(uColor, vAlpha);
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 4;
  return mesh;
}
