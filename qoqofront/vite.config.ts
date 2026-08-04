import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Обновление ставится само: у представителя в поле нет возможности
      // разбираться, почему у него старая версия.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'app-icon.svg'],
      manifest: {
        name: 'QoQo — система учёта продаж',
        short_name: 'QoQo',
        description: 'Приём заявок, маршруты и склад',
        lang: 'ru',
        start_url: '/app',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#00533B',
        background_color: '#00533B',
        icons: [
          { src: '/app-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/app-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Кэшируем только оболочку приложения. Данные держим сами в IndexedDB:
        // так видно, что именно доступно офлайн, и нет сюрпризов с чужими
        // ответами API, попавшими в кэш под другим токеном.
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: '/index.html',
        // Печатные формы и сам API мимо кэша оболочки.
        navigateFallbackDenylist: [/^\/api/, /^\/media/],
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        // В разработке service worker выключен: иначе он кэширует модули Vite
        // и правки перестают доезжать до браузера.
        enabled: false,
      },
    }),
  ],
  server: {
    port: 5173,
    // В разработке /api и /media проксируются на FastAPI, поэтому VITE_API_URL
    // можно не задавать. /media — это загруженные логотип и картинки блоков.
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/media': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
