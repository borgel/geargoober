import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { renameSync, existsSync, readFileSync } from 'node:fs';
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

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8'));

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [preact(), viteSingleFile(), renameOutput()],
  build: { outDir: 'dist', emptyOutDir: true, assetsInlineLimit: 100_000_000 },
  server: { watch: { usePolling: true, interval: 300 } },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  },
});
