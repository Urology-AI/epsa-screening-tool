import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 3001,
    host: true,
    fs: {
      allow: [
        resolve(__dirname, '..'),
        resolve(__dirname, '../src'),
      ],
    },
  },
  preview: {
    port: 3002,
    host: true,
  },
  resolve: {
    alias: {
      // @frontend → the screening-tool's src/ which contains epsaEngine, calculatorConfig, etc.
      '@frontend': resolve(__dirname, '../src'),
      '@': resolve(__dirname, 'src'),
    },
  },
})
