import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  build: { rollupOptions: { input: { main: path.resolve(__dirname, 'index.html'), app: path.resolve(__dirname, 'app/index.html') } } },
})
