import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Tauri 会固定连 1420，端口被占用时直接报错而不是悄悄换端口。
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    // Vite 8 默认用 Oxc 压缩；显式指定 esbuild 需要额外安装 esbuild。
    target: 'chrome105',
    sourcemap: false,
  },
})
