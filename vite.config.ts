import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    __WARREN_SOURCE_COMMIT__: JSON.stringify(
      execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    ),
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  worker: { format: 'es' },
});
