/** 画像読み込み・変換まわりのユーティリティ(すべてブラウザ内で完結) */

export async function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return img
  } finally {
    // decode 済みなので revoke してよい(以降 img.src は参照されない前提で描画に使う)
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

export async function urlToImage(url: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.decoding = 'async'
  img.src = url
  await img.decode()
  return img
}

export function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D コンテキストを取得できませんでした')
  return ctx
}

export function canvasToBlob(c: HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG の生成に失敗しました'))), type)
  })
}

/**
 * アップロード画像を扱いやすい PNG に正規化する。
 * HEIC は heic2any で変換し、長辺 maxSize px に縮小する(推論・編集の負荷対策)。
 */
export async function normalizeUpload(file: File, maxSize = 1200): Promise<Blob> {
  let blob: Blob = file
  const isHeic =
    /image\/hei[cf]/.test(file.type) || /\.hei[cf]$/i.test(file.name)
  if (isHeic) {
    const { default: heic2any } = await import('heic2any')
    const converted = await heic2any({ blob, toType: 'image/png' })
    blob = Array.isArray(converted) ? converted[0] : converted
  }
  const img = await blobToImage(blob)
  const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = createCanvas(img.naturalWidth * scale, img.naturalHeight * scale)
  const ctx = ctx2d(canvas)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvasToBlob(canvas)
}

/** アルファ > 閾値 のバウンディングボックスを返す(全透明なら null) */
export function alphaBBox(
  canvas: HTMLCanvasElement,
  threshold = 8,
): { x: number; y: number; w: number; h: number } | null {
  const { width, height } = canvas
  const data = ctx2d(canvas).getImageData(0, 0, width, height).data
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > threshold) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/** 切り抜き画像のアルファをマスクとして抽出する(白=不透明) */
export function extractMask(cutout: HTMLCanvasElement): HTMLCanvasElement {
  const { width, height } = cutout
  const src = ctx2d(cutout).getImageData(0, 0, width, height)
  const mask = createCanvas(width, height)
  const mctx = ctx2d(mask)
  const out = mctx.createImageData(width, height)
  for (let i = 0; i < width * height; i++) {
    const a = src.data[i * 4 + 3]
    out.data[i * 4] = 255
    out.data[i * 4 + 1] = 255
    out.data[i * 4 + 2] = 255
    out.data[i * 4 + 3] = a
  }
  mctx.putImageData(out, 0, 0)
  return mask
}

/** original × mask を合成して切り抜きを再構成する */
export function applyMask(
  original: CanvasImageSource & { width?: number },
  mask: HTMLCanvasElement,
): HTMLCanvasElement {
  const canvas = createCanvas(mask.width, mask.height)
  const ctx = ctx2d(canvas)
  ctx.drawImage(original, 0, 0, mask.width, mask.height)
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(mask, 0, 0)
  return canvas
}
