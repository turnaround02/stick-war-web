/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages 项目站点必须用仓库名作为 base，否则资源 404
  base: '/stick-war-web/',
  build: {
    rollupOptions: {
      output: {
        // Phaser 单独分包，避免与游戏代码一起失效缓存
        manualChunks: { phaser: ['phaser'] },
      },
    },
  },
  server: { port: 8080 },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
