import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// @imgly/background-removal のモデル・WASM を同一オリジン (/imgly/) からセルフホストする。
// dev では node_modules から直接サーブされ、build では dist/imgly/ にコピーされる。
// COPY_IMGLY=false でコピーを省略できる(CI などデプロイしないビルド向け)。
//
// 注意: npm 配布の background-removal-data(1.4.x)はライブラリ本体(1.7.x)と形式が
// ずれているため、resources.json をコピー時に変換して本体の期待に合わせている。
//  - チャンクが `hash` キーだが本体は `chunk.name` で URL を組み立てる → name を補完
//  - モデルキーが旧名 /models/small・/models/medium → /models/isnet_* の別名を追加
//  - onnxruntime のファイル群が古い → 本体の実依存 onnxruntime-web@1.21 のファイルを
//    node_modules から配信し、マニフェストにエントリを合成する
const copyImglyAssets = process.env.COPY_IMGLY !== 'false'

const ORT_DIR = 'node_modules/onnxruntime-web/dist'
const ORT_FILES = [
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.jsep.mjs',
  'ort-wasm-simd-threaded.jsep.wasm',
]

interface ManifestEntry {
  chunks: Array<{ hash?: string; name?: string; offsets: number[] }>
  size?: number
  mime?: string
}

const fixResourcesManifest = (content: string) => {
  const manifest = JSON.parse(content) as Record<string, ManifestEntry>

  for (const entry of Object.values(manifest)) {
    for (const chunk of entry.chunks) {
      chunk.name ??= chunk.hash
    }
  }

  // モデルキーの別名(1.7.x のキー名 → 1.4.x の実体)
  const aliases: Record<string, string> = {
    '/models/isnet_quint8': '/models/small',
    '/models/isnet_fp16': '/models/medium',
    '/models/isnet': '/models/medium',
  }
  for (const [alias, source] of Object.entries(aliases)) {
    if (!manifest[alias] && manifest[source]) manifest[alias] = manifest[source]
  }

  // 古い onnxruntime エントリを、実依存バージョンのファイルで置き換える
  for (const key of Object.keys(manifest)) {
    if (key.startsWith('/onnxruntime-web/')) delete manifest[key]
  }
  for (const file of ORT_FILES) {
    const size = fs.statSync(path.join(ORT_DIR, file)).size
    manifest[`/onnxruntime-web/${file}`] = {
      chunks: [{ name: file, offsets: [0, size] }],
      size,
      mime: file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
    }
  }

  return JSON.stringify(manifest)
}

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    ...(copyImglyAssets
      ? [
          viteStaticCopy({
            targets: [
              {
                src: 'node_modules/@imgly/background-removal-data/dist/resources.json',
                dest: 'imgly',
                rename: { stripBase: true },
                transform: { encoding: 'utf8', handler: fixResourcesManifest },
              },
              {
                src: ['node_modules/@imgly/background-removal-data/dist/*', '!**/resources.json'],
                dest: 'imgly',
                rename: { stripBase: true },
              },
              {
                src: ORT_FILES.map((f) => `${ORT_DIR}/${f}`),
                dest: 'imgly',
                rename: { stripBase: true },
              },
            ],
          }),
        ]
      : []),
  ],
})
