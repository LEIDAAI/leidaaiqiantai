import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 开发代理：报告链接登记/代理接口由本地 web_server.py(8088) 提供；
// 其余业务 API 直连 BASE_URL（与旧版一致，走 CORS）。
export default defineConfig({
  base: './',
  plugins: [vue()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api/report-links': 'http://192.168.1.35:8088',
      '/api/proxy': 'http://192.168.1.35:8088'
    }
  },
  build: {
    chunkSizeWarningLimit: 1500
  }
})
