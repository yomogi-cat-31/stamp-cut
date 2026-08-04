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
}

export interface StampEdits {
  texts: TextItem[]
  /** ステッカー風の白フチ */
  outline: boolean
  /** 白フチの太さ(出力 px) */
  outlineWidth: number
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
  edits: StampEdits
}

export const defaultEdits = (): StampEdits => ({
  texts: [],
  outline: false,
  outlineWidth: 8,
})
