import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

// ルート以外のパスでもアプリを開けるようにする。
//
// X-Server へのデプロイは dist/ の中身をそのまま配置するだけで、SPA 用の URL 書き換え
// （どのパスでも index.html を返す設定）が効いていない。frontend/.htaccess はリポジトリに
// あるが dist/ には入らないためデプロイされず、/guest-register は 404 になっていた。
//
// index.html のアセット参照は絶対パス（/assets/...）なので、同じ内容をサブディレクトリに
// 置けばそのURLでもアプリが起動する。ログイン不要の登録ページ用にコピーを出力する。
// 追加のパスを公開するときは routes に足す。
function copyHtmlForRoutes(routes: string[]): Plugin {
  let outDir = ''
  return {
    name: 'copy-html-for-routes',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      for (const route of routes) {
        const dir = resolve(outDir, route)
        mkdirSync(dir, { recursive: true })
        copyFileSync(resolve(outDir, 'index.html'), resolve(dir, 'index.html'))
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), copyHtmlForRoutes(['guest-register'])],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
