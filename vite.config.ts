import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    {
      name: 'file-page',
      closeBundle() {
        mkdirSync('dist/file', { recursive: true });
        copyFileSync('dist/index.html', 'dist/file/index.html');
      },
    },
  ],
  define: {
    __WARREN_SOURCE_COMMIT__: JSON.stringify(
      execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    ),
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  worker: { format: 'es' },
});
