import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@inner/core': r('./packages/core/src/index.ts'),
      '@inner/scene-gen': r('./packages/scene-gen/src/index.ts'),
      '@inner/render': r('./packages/render/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/web/test/**/*.test.ts'],
    environment: 'node',
    reporters: ['default'],
  },
});
