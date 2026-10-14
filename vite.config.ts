import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { renameSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Ship as dist/geargoober.html rather than index.html.
function renameOutput(): Plugin {
  return {
    name: 'rename-output',
    apply: 'build',
    closeBundle() {
      const from = resolve(__dirname, 'dist/index.html');
      if (existsSync(from)) renameSync(from, resolve(__dirname, 'dist/geargoober.html'));
    },
  };
}

export default defineConfig({
  plugins: [preact(), viteSingleFile(), renameOutput()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { watch: { usePolling: true, interval: 300 } },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  },
});
