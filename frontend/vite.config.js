import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

import { createRequire } from 'module';

// ── Porte — lette da config/private_iota_conf.js ────────────────
let BACKEND_PORT = 1337;
let FRONTEND_PORT = 5173;
try {
  const require_ = createRequire(import.meta.url);
  const conf = require_('../config/private_iota_conf');
  BACKEND_PORT = conf.PORT || 1337;
  FRONTEND_PORT = conf.FRONTEND_PORT || 5173;
} catch (e) { /* file non ancora creato — usa default */ }

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/__tests__/setup.js',
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.svg', 'icons/*.png'],
      manifest: false, // usa il manifest.json in public/
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\/v1\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 5 },
              networkTimeoutSeconds: 3,
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /\.(?:woff2?|ttf|eot)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'font-cache',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: FRONTEND_PORT,
    proxy: {
      '/api': { target: `http://localhost:${BACKEND_PORT}`, changeOrigin: true },
      '/socket.io': { target: `http://localhost:${BACKEND_PORT}`, ws: true },
    },
  },
  build: {
    outDir: '../.tmp/public',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-dom') || id.includes('react-router') || (id.includes('/react/') && !id.includes('react-i18next'))) {
              return 'vendor-react';
            }
            if (id.includes('@tiptap') || id.includes('prosemirror')) {
              return 'vendor-editor';
            }
            if (id.includes('@iota') || id.includes('@mysten') || id.includes('bcs')) {
              return 'vendor-iota';
            }
            if (id.includes('framer-motion') || id.includes('lucide-react') || id.includes('i18next')) {
              return 'vendor-ui';
            }
          }
        },
      },
    },
  },
});
