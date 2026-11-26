import { defineWebViteConfig } from '@rexezuge/tooling/vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * The SPA build. The plugin list, dev proxy and shell-embedding step come from
 * `@rexezuge/tooling`. `root` and `distIndex` are URL objects so the factory
 * resolves them against this file rather than the package's cwd.
 */
const config = defineWebViteConfig({
  plugins: [react(), tailwindcss()],
  proxy: {
    '/user': { target: 'http://localhost:8787', changeOrigin: true },
  },
  spaShell: {
    path: 'apps/api/src/generated/spa-shell.ts',
    root: new URL('../../', import.meta.url),
    distIndex: new URL('dist/index.html', import.meta.url),
  },
});

export default {
  ...config,
  build: {
    ...config.build,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
  },
};
