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
    // We tried manualChunks to split node_modules into per-library files for
    // better caching, but it broke recharts/radix at runtime: those libs use
    // React internals (PureComponent, etc.) and Vite's per-id splitter put
    // 'react-is'/'scheduler' into the wrong chunk, so the dependent code ran
    // before React was ready and crashed with 'undefined is not an object'.
    // Reverting to default chunking (single vendor bundle) and just bumping
    // the warning threshold — correctness over micro-optimisation.
    chunkSizeWarningLimit: 1500,
  },
})
