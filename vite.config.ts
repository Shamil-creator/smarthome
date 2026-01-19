import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        allowedHosts: [
          'a7f09cbdd3d3.ngrok-free.app',
          '.ngrok-free.app',
          '.ngrok.io',
          '.ngrok.app',
          'localhost',
          '127.0.0.1'
        ],
        proxy: {
          '/api': {
            target: 'http://localhost:5001',
            changeOrigin: true,
          }
        }
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      },
      envPrefix: 'VITE_',
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      // Build optimizations
      build: {
        // Enable minification
        minify: 'esbuild',
        // Generate source maps for debugging (remove in production if not needed)
        sourcemap: false,
        // Target modern browsers for smaller bundle size
        target: 'es2020',
        // Chunk splitting strategy
        rollupOptions: {
          output: {
            // Split vendor chunks for better caching
            manualChunks: {
              // React core
              'react-vendor': ['react', 'react-dom', 'react-router-dom'],
              // Chart library (heavy)
              'chart-vendor': ['recharts'],
              // Icons
              'icons-vendor': ['lucide-react'],
            },
            // Optimize chunk names
            chunkFileNames: 'assets/[name]-[hash].js',
            entryFileNames: 'assets/[name]-[hash].js',
            assetFileNames: 'assets/[name]-[hash].[ext]',
          },
        },
        // Increase warning threshold for chunks
        chunkSizeWarningLimit: 500,
      },
      // Optimize dependencies
      optimizeDeps: {
        include: ['react', 'react-dom', 'react-router-dom', 'recharts', 'lucide-react'],
      },
    };
});
