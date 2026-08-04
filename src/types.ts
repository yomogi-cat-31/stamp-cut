/** LINE Creators Market のスタンプ規格値(改定時はここだけ直す) */
export const SPEC = {
  stamp: { maxW: 370, maxH: 320, margin: 10 },
  main: { w: 240, h: 240 },
  tab: { w: 96, h: 74 },
  counts: [8, 16, 24, 32, 40],
  maxFileBytes: 1024 * 1024,
  maxZipBytes: 20 * 1024 * 1024,
} as const

export type StampCount = (typeof SPEC.counts)[number]

export interface TextItem {
  id: string
  text: string
  /** 出力キャンバスに対する相対座標 (0..1, テキスト中心) */
  x: number
  y: number
  /** 出力キャンバス高さに対する相対フォントサイズ (0..1) */
  size: number
  color: string
  /** 縁取り色。null で縁取りなし */
  strokeColor: string | null
  /** フォント ID(src/lib/compose.ts の FONTS を参照) */
  fontId: string
}

/** 被写体の配置調整(自動フィットに対する倍率とオフセット) */
export interface StampTransform {
  /** 拡大率。1 = 自動フィット */
  scale: number
  /** 出力キャンバス幅に対する横オフセット (-0.5..0.5) */
  x: number
  /** 出力キャンバス高さに対する縦オフセット (-0.5..0.5) */
  y: number
}

export interface StampEdits {
  texts: TextItem[]
  /** ステッカー風の白フチ */
  outline: boolean
  /** 白フチの太さ(出力 px) */
  outlineWidth: number
  /** 被写体の配置調整 */
  transform: StampTransform
}

export type StampStatus = 'pending' | 'processing' | 'done' | 'error'

export interface StampItem {
  id: string
  fileName: string
  status: StampStatus
  error?: string
  /** 変換済み元画像 (PNG) の object URL。ブラシの「残す」の復元元 */
  originalUrl?: string
  /** マスク画像 (白=残す/黒=消す) の object URL */
  maskUrl?: string
  /** 切り抜き結果 (original × mask) の object URL */
  cutoutUrl?: string
  /** 編集(配置・白フチ・テキスト)を反映した最終レンダリングの object URL(一覧・プレビュー表示用) */
  renderedUrl?: string
  edits: StampEdits
}

export const defaultTransform = (): StampTransform => ({ scale: 1, x: 0, y: 0 })

export const defaultEdits = (): StampEdits => ({
  texts: [],
  outline: false,
  outlineWidth: 8,
  transform: defaultTransform(),
})
