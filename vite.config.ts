import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, '.', '');

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,ttf,mp4,webm}'],
          maximumFileSizeToCacheInBytes: 10000000, // 10MB to accommodate larger assets like backgrounds
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365 // <== 365 days
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365 // <== 365 days
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            }
          ]
        },
        manifest: {
          name: 'CoroAI Photobooth',
          short_name: 'Photobooth',
          description: 'AI Photobooth Experience',
          theme_color: '#000000',
          background_color: '#000000',
          display: 'standalone'
        }
      })
    ],
    build: {
      outDir: 'dist',
      target: 'esnext',
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },
    server: {
      port: 3000
    },
    // Define global constants replacement
    // Ini PENTING agar Vercel Env Vars terbaca oleh Client Side code
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(process.env.GEMINI_API_KEY || env.GEMINI_API_KEY),
      'process.env.API_KEY': JSON.stringify(process.env.API_KEY || env.API_KEY),
      'process.env.APPS_SCRIPT_BASE_URL': JSON.stringify(process.env.APPS_SCRIPT_BASE_URL || env.APPS_SCRIPT_BASE_URL),
      // Mencegah crash jika env variable tidak ada
      'process.env': JSON.stringify(env)
    }
  };
});