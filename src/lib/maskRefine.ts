import { createCanvas, ctx2d } from './imageUtils'

/**
 * 背景除去の後処理モード。
 * - soft   (標準)   : モデルの出力そのまま。髪・毛のグラデーションが自然に残る
 * - strict (しっかり): アルファを二極化し、被写体から離れた小さな「浮き」を除去する。
 *                      背景の残りを許さない代わりに、細い毛などは落ちやすい
 */
export type CutoutMode = 'soft' | 'strict'

export const CUTOUT_MODES: { id: CutoutMode; label: string; hint: string }[] = [
  { id: 'soft', label: '標準', hint: '毛のふちが自然。うっすら背景が残ることがある' },
  { id: 'strict', label: 'しっかり', hint: '被写体以外の背景の残りを強めに除去' },
]

const ALPHA_LO = 90 // これ以下のアルファは背景とみなして落とす
const ALPHA_HI = 170 // これ以上のアルファは完全不透明に引き上げる
const BIN_THRESHOLD = 128
const MIN_COMPONENT_RATIO = 0.03 // 最大成分に対しこの比率未満の浮きは除去
const MIN_COMPONENT_AREA = 64
const KEEP_DILATE_PX = 2 // 残す成分の周囲に許すアンチエイリアス縁の幅

/** マスク(白+アルファ)に後処理を適用して返す。soft はそのまま */
export function refineMask(src: HTMLCanvasElement, mode: CutoutMode): HTMLCanvasElement {
  if (mode === 'soft') return src
  const w = src.width
  const h = src.height
  const n = w * h
  const srcData = ctx2d(src).getImageData(0, 0, w, h)

  // 1. アルファの二極化(急峻なカーブ)
  const alpha = new Uint8ClampedArray(n)
  for (let i = 0; i < n; i++) {
    const v = srcData.data[i * 4 + 3]
    alpha[i] = v <= ALPHA_LO ? 0 : v >= ALPHA_HI ? 255 : Math.round(((v - ALPHA_LO) / (ALPHA_HI - ALPHA_LO)) * 255)
  }

  // 2. 連結成分分析: 最大成分に比べて小さい「浮き」を背景の残りとみなして除去
  const label = new Int32Array(n).fill(-1)
  const areas: number[] = []
  const stack: number[] = []
  for (let start = 0; start < n; start++) {
    if (alpha[start] <= BIN_THRESHOLD || label[start] !== -1) continue
    const id = areas.length
    let area = 0
    stack.push(start)
    label[start] = id
    while (stack.length) {
      const p = stack.pop()!
      area++
      const px = p % w
      const py = (p / w) | 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = px + dx
          const ny = py + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const q = ny * w + nx
          if (alpha[q] > BIN_THRESHOLD && label[q] === -1) {
            label[q] = id
            stack.push(q)
          }
        }
      }
    }
    areas.push(area)
  }
  const largest = Math.max(0, ...areas)
  const minArea = Math.max(MIN_COMPONENT_AREA, largest * MIN_COMPONENT_RATIO)
  const kept = areas.map((a) => a >= minArea)

  // 残す成分のマップを数 px 膨張させ、その外側のアルファ(縁の名残・浮きのフリンジ)を消す
  let keep = new Uint8Array(n)
  for (let i = 0; i < n; i++) keep[i] = label[i] >= 0 && kept[label[i]] ? 1 : 0
  for (let iter = 0; iter < KEEP_DILATE_PX; iter++) {
    const next = new Uint8Array(keep)
    for (let p = 0; p < n; p++) {
      if (keep[p]) continue
      const px = p % w
      const py = (p / w) | 0
      if (
        (px > 0 && keep[p - 1]) ||
        (px < w - 1 && keep[p + 1]) ||
        (py > 0 && keep[p - w]) ||
        (py < h - 1 && keep[p + w])
      ) {
        next[p] = 1
      }
    }
    keep = next
  }
  for (let i = 0; i < n; i++) {
    if (!keep[i]) alpha[i] = 0
  }

  // 3. 書き戻し + エッジのスムージング(二極化のジャギー緩和)
  const tmp = createCanvas(w, h)
  const tctx = ctx2d(tmp)
  const out = tctx.createImageData(w, h)
  for (let i = 0; i < n; i++) {
    out.data[i * 4] = 255
    out.data[i * 4 + 1] = 255
    out.data[i * 4 + 2] = 255
    out.data[i * 4 + 3] = alpha[i]
  }
  tctx.putImageData(out, 0, 0)
  const result = createCanvas(w, h)
  const rctx = ctx2d(result)
  rctx.filter = 'blur(0.5px)'
  rctx.drawImage(tmp, 0, 0)
  rctx.filter = 'none'
  return result
}
