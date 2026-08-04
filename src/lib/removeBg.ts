import { removeBackground, preload, type Config } from '@imgly/background-removal'

/**
 * 背景除去はブラウザ内推論で行う(要件: 画像を外部に送信しない)。
 * モデル・WASM は /imgly/ から同一オリジン配信(vite.config.ts 参照)。
 *
 * デバッグ用 URL パラメータ:
 *   ?nobg        推論をスキップし元画像をそのまま使う(E2E テスト・低速端末での確認用)
 *   ?model=small 小型モデルを使う(既定は medium)
 */
const params = new URLSearchParams(location.search)

export const skipBgRemoval = params.has('nobg')

const config: Config = {
  publicPath: new URL('/imgly/', location.origin).toString(),
  model: params.get('model') === 'small' ? 'isnet_quint8' : 'isnet_fp16',
}

let preloaded: Promise<void> | null = null

/** モデルの事前ダウンロード(初回アップロード前に呼ぶと体感が良くなる) */
export function preloadModel(): Promise<void> {
  if (skipBgRemoval) return Promise.resolve()
  preloaded ??= preload(config).catch((e) => {
    preloaded = null
    throw e
  })
  return preloaded
}

/** 背景を除去した PNG Blob を返す */
export async function removeBg(blob: Blob): Promise<Blob> {
  if (skipBgRemoval) return blob
  await preloadModel()
  return removeBackground(blob, config)
}
