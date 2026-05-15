import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id: string) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  plugins: [figmaAssetResolver(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/app'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4010',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Split heavy vendor libs into their own chunks so:
    //   - First load only pulls react + the small app shell
    //   - Recharts (Analytics), Radix (modals) live in separate files and
    //     come down lazily as users navigate
    //   - Browser caches each chunk separately — editing one component
    //     doesn't invalidate the react-vendor chunk
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('node_modules/recharts'))        return 'vendor-charts';
          if (id.includes('node_modules/@radix-ui'))       return 'vendor-radix';
          if (id.includes('node_modules/lucide-react'))    return 'vendor-lucide';
          if (id.includes('node_modules/react-dom') ||
              /node_modules\/react\//.test(id))            return 'vendor-react';
          // Everything else from node_modules into one shared chunk.
          return 'vendor';
        },
      },
    },
    // Raise the warning threshold to 800kB — legitimately big chunks like
    // recharts hover around that, no point in alerting every build.
    chunkSizeWarningLimit: 800,
  },
})
