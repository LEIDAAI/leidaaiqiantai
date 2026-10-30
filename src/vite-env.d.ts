/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_API_TOKEN: string
  readonly VITE_REPORT_SERVER: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
