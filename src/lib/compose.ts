import { defaultTransform, SPEC, type StampEdits } from '../types'
import { alphaBBox, canvasToBlob, createCanvas, ctx2d, urlToImage } from './imageUtils'

/** テキストに使えるフォント(OS 標準フォントのスタック) */
export const FONTS = [
  {
    id: 'maru',
    label: '丸ゴシック',
    stack: "'Hiragino Maru Gothic ProN', 'BIZ UDPGothic', 'Meiryo', sans-serif",
  },
  {
    id: 'gothic',
    label: 'ゴシック',
    stack: "'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Meiryo', sans-serif",
  },
  {
    id: 'mincho',
    label: '明朝',
    stack: "'Hiragino Mincho ProN', 'Noto Serif JP', 'MS PMincho', serif",
  },
  {
    id: 'pop',
    label: 'ポップ',
    stack: "'Mochiy Pop One', 'Comic Sans MS', 'Chalkboard SE', cursive",
  },
] as const

export type FontId = (typeof FONTS)[number]['id']

export const DEFAULT_FONT_ID: FontId = 'maru'

export const fontStack = (fontId: string | undefined): string =>
  (FONTS.find((f) => f.id === fontId) ?? FONTS[0]).stack

/** 偶数 px に切り上げる */
const even = (n: number) => {
  const r = Math.round(n)
  return r % 2 === 0 ? r : r + 1
}

/** 被写体の周囲に白フチを付ける(アルファ形状を放射状にスタンプして膨張) */
function drawOutline(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  width: number,
) {
  if (width <= 0) return
  // 白シルエットを作る
  const sil = createCanvas(source.width, source.height)
  const sctx = ctx2d(sil)
  sctx.drawImage(source, 0, 0)
  sctx.globalCompositeOperation = 'source-in'
  sctx.fillStyle = '#ffffff'
  sctx.fillRect(0, 0, sil.width, sil.height)
  const steps = 16
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2
    ctx.drawImage(sil, dx + Math.cos(a) * width, dy + Math.sin(a) * width, dw, dh)
  }
}

function drawTexts(
  ctx: CanvasRenderingContext2D,
  edits: StampEdits,
  w: number,
  h: number,
) {
  for (const t of edits.texts) {
    if (!t.text) continue
    const px = Math.max(6, t.size * h)
    ctx.font = `bold ${px}px ${fontStack(t.fontId)}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const x = t.x * w
    const y = t.y * h
    if (t.strokeColor) {
      ctx.lineJoin = 'round'
      ctx.strokeStyle = t.strokeColor
      ctx.lineWidth = Math.max(2, px * 0.18)
      ctx.strokeText(t.text, x, y)
    }
    ctx.fillStyle = t.color
    ctx.fillText(t.text, x, y)
  }
}

export interface RenderOptions {
  /** 固定サイズ出力(main/tab 用)。未指定なら規格内で可変(スタンプ画像用) */
  fixed?: { w: number; h: number }
  /** テキストを描画するか(tab など小さい出力では省くと潰れない) */
  withTexts?: boolean
}

/**
 * 切り抜き画像+編集内容から出力用キャンバスを組み立てる。
 * - 透明部分をトリムして被写体を規格枠(370×320・余白10px)にフィット
 * - 白フチ・テキストを焼き込み
 * - 出力サイズは偶数 px
 */
export async function renderStamp(
  cutoutUrl: string,
  edits: StampEdits,
  opts: RenderOptions = {},
): Promise<HTMLCanvasElement> {
  const img = await urlToImage(cutoutUrl)
  const src = createCanvas(img.naturalWidth, img.naturalHeight)
  ctx2d(src).drawImage(img, 0, 0)
  const bbox = alphaBBox(src) ?? { x: 0, y: 0, w: src.width, h: src.height }

  // トリム済みコンテンツ
  const content = createCanvas(bbox.w, bbox.h)
  ctx2d(content).drawImage(src, bbox.x, bbox.y, bbox.w, bbox.h, 0, 0, bbox.w, bbox.h)

  const margin = SPEC.stamp.margin
  const outlinePad = edits.outline ? edits.outlineWidth : 0

  let outW: number, outH: number, scale: number
  if (opts.fixed) {
    outW = opts.fixed.w
    outH = opts.fixed.h
    const pad = Math.max(2, Math.round(Math.min(outW, outH) * 0.04)) + outlinePad
    scale = Math.min((outW - pad * 2) / bbox.w, (outH - pad * 2) / bbox.h)
  } else {
    const innerW = SPEC.stamp.maxW - margin * 2 - outlinePad * 2
    const innerH = SPEC.stamp.maxH - margin * 2 - outlinePad * 2
    scale = Math.min(innerW / bbox.w, innerH / bbox.h)
    outW = Math.min(SPEC.stamp.maxW, even(bbox.w * scale + (margin + outlinePad) * 2))
    outH = Math.min(SPEC.stamp.maxH, even(bbox.h * scale + (margin + outlinePad) * 2))
  }

  // ユーザーの配置調整(自動フィットに対する倍率・オフセット)。
  // 拡大やオフセットで枠からはみ出た部分はキャンバス境界で切れる。
  const t = edits.transform ?? defaultTransform()
  const canvas = createCanvas(outW, outH)
  const ctx = ctx2d(canvas)
  const dw = bbox.w * scale * t.scale
  const dh = bbox.h * scale * t.scale
  const dx = (outW - dw) / 2 + t.x * outW
  const dy = (outH - dh) / 2 + t.y * outH
  if (edits.outline) {
    const ow = opts.fixed
      ? Math.max(1, edits.outlineWidth * (outH / SPEC.stamp.maxH))
      : edits.outlineWidth
    drawOutline(ctx, content, dx, dy, dw, dh, ow)
  }
  ctx.drawImage(content, dx, dy, dw, dh)
  if (opts.withTexts !== false) drawTexts(ctx, edits, outW, outH)
  return canvas
}

/** 1MB 制限のチェック(370×320 の PNG では通常超えない) */
export async function renderStampBlob(
  cutoutUrl: string,
  edits: StampEdits,
  opts: RenderOptions = {},
): Promise<Blob> {
  const canvas = await renderStamp(cutoutUrl, edits, opts)
  const blob = await canvasToBlob(canvas)
  if (blob.size > SPEC.maxFileBytes) {
    throw new Error(`PNG が 1MB を超えました (${(blob.size / 1024 / 1024).toFixed(2)}MB)`)
  }
  return blob
}
