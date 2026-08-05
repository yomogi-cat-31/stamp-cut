import { create } from 'zustand'
import { defaultEdits, SPEC, type StampCount, type StampEdits, type StampItem } from './types'
import { applyMask, blobToImage, canvasToBlob, createCanvas, ctx2d, extractMask, normalizeUpload, urlToImage } from './lib/imageUtils'
import { removeBg } from './lib/removeBg'
import { refineMask, type CutoutMode } from './lib/maskRefine'
import { renderStamp } from './lib/compose'

/** 一覧・プレビュー表示用の最終レンダリング画像を生成する */
async function renderPreviewUrl(cutoutUrl: string, edits: StampEdits): Promise<string> {
  const canvas = await renderStamp(cutoutUrl, edits)
  return URL.createObjectURL(await canvasToBlob(canvas))
}

let seq = 0
const newId = () => `stamp-${++seq}-${performance.now().toFixed(0)}`

/** 再処理用に元ファイルを保持(state 外: シリアライズ不要な生データ) */
const sourceFiles = new Map<string, File>()

interface StoreState {
  items: StampItem[]
  mainId: string | null
  count: StampCount
  editingId: string | null
  processing: boolean
  /** 新規アップロードに適用する背景除去モード */
  cutMode: CutoutMode
  setCutMode: (mode: CutoutMode) => void
  /** 処理済み画像のモードを切り替えて再計算する(ブラシ修正はリセットされる) */
  setItemMode: (id: string, mode: CutoutMode) => Promise<void>
  addFiles: (files: File[]) => void
  removeItem: (id: string) => void
  moveItem: (id: string, dir: -1 | 1) => void
  setMainId: (id: string) => void
  setCount: (count: StampCount) => void
  setEditingId: (id: string | null) => void
  /** エディタ保存: 新しいマスクと編集内容を反映し切り抜きを再合成する */
  saveEdits: (id: string, mask: HTMLCanvasElement | null, edits: StampEdits) => Promise<void>
  retryItem: (id: string) => void
}

/** 直列処理キュー(モデル推論は重いので同時 1 件) */
let queue: Promise<void> = Promise.resolve()

export const useStore = create<StoreState>((set, get) => {
  const update = (id: string, patch: Partial<StampItem>) =>
    set((s) => ({ items: s.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) }))

  const enqueueProcess = (id: string, file: Blob) => {
    queue = queue
      .then(async () => {
        if (!get().items.some((it) => it.id === id)) return // 削除済み
        update(id, { status: 'processing' })
        set({ processing: true })
        const normalized = await normalizeUpload(file as File)
        const originalUrl = URL.createObjectURL(normalized)
        const cutoutBlob = await removeBg(normalized)
        // 切り抜き結果を元画像と同サイズに揃え、マスクを抽出しておく
        const img = await blobToImage(cutoutBlob)
        const orig = await urlToImage(originalUrl)
        const modelOut = createCanvas(orig.naturalWidth, orig.naturalHeight)
        ctx2d(modelOut).drawImage(img, 0, 0, modelOut.width, modelOut.height)
        const rawMask = extractMask(modelOut)
        const mode = get().items.find((it) => it.id === id)?.mode ?? get().cutMode
        const mask = refineMask(rawMask, mode)
        const cutout = applyMask(orig, mask)
        const [cutoutPng, maskPng, rawMaskPng] = await Promise.all([
          canvasToBlob(cutout),
          canvasToBlob(mask),
          canvasToBlob(rawMask),
        ])
        const cutoutUrl = URL.createObjectURL(cutoutPng)
        const item = get().items.find((it) => it.id === id)
        const renderedUrl = await renderPreviewUrl(cutoutUrl, item?.edits ?? defaultEdits())
        update(id, {
          status: 'done',
          originalUrl,
          cutoutUrl,
          renderedUrl,
          maskUrl: URL.createObjectURL(maskPng),
          rawMaskUrl: URL.createObjectURL(rawMaskPng),
        })
        set((s) => ({ mainId: s.mainId ?? id }))
      })
      .catch((e: unknown) => {
        console.error(e)
        update(id, { status: 'error', error: e instanceof Error ? e.message : String(e) })
      })
      .finally(() => {
        const anyProcessing = get().items.some((it) => it.status === 'processing' || it.status === 'pending')
        if (!anyProcessing) set({ processing: false })
      })
  }

  return {
    items: [],
    mainId: null,
    count: SPEC.counts[1], // 16
    editingId: null,
    processing: false,
    cutMode: 'strict',

    setCutMode: (mode) => set({ cutMode: mode }),

    setItemMode: async (id, mode) => {
      const item = get().items.find((it) => it.id === id)
      if (!item || item.mode === mode || !item.rawMaskUrl || !item.originalUrl) return
      const [rawImg, orig] = await Promise.all([
        urlToImage(item.rawMaskUrl),
        urlToImage(item.originalUrl),
      ])
      const rawMask = createCanvas(rawImg.naturalWidth, rawImg.naturalHeight)
      ctx2d(rawMask).drawImage(rawImg, 0, 0)
      const mask = refineMask(rawMask, mode)
      const cutout = applyMask(orig, mask)
      const [cutoutPng, maskPng] = await Promise.all([canvasToBlob(cutout), canvasToBlob(mask)])
      for (const url of [item.cutoutUrl, item.maskUrl, item.renderedUrl]) {
        if (url) URL.revokeObjectURL(url)
      }
      const cutoutUrl = URL.createObjectURL(cutoutPng)
      const renderedUrl = await renderPreviewUrl(cutoutUrl, item.edits)
      update(id, { mode, cutoutUrl, maskUrl: URL.createObjectURL(maskPng), renderedUrl })
    },

    addFiles: (files) => {
      const accepted = files.filter(
        (f) => /^image\//.test(f.type) || /\.(hei[cf]|png|jpe?g|webp)$/i.test(f.name),
      )
      const newItems: StampItem[] = accepted.map((f) => ({
        id: newId(),
        fileName: f.name,
        status: 'pending',
        mode: get().cutMode,
        edits: defaultEdits(),
      }))
      set((s) => ({ items: [...s.items, ...newItems] }))
      newItems.forEach((it, i) => {
        sourceFiles.set(it.id, accepted[i])
        enqueueProcess(it.id, accepted[i])
      })
    },

    removeItem: (id) => {
      sourceFiles.delete(id)
      set((s) => {
        const items = s.items.filter((it) => it.id !== id)
        return {
          items,
          mainId: s.mainId === id ? (items.find((i) => i.status === 'done')?.id ?? null) : s.mainId,
          editingId: s.editingId === id ? null : s.editingId,
        }
      })
    },

    moveItem: (id, dir) =>
      set((s) => {
        const i = s.items.findIndex((it) => it.id === id)
        const j = i + dir
        if (i < 0 || j < 0 || j >= s.items.length) return s
        const items = [...s.items]
        ;[items[i], items[j]] = [items[j], items[i]]
        return { items }
      }),

    setMainId: (id) => set({ mainId: id }),
    setCount: (count) => set({ count }),
    setEditingId: (id) => set({ editingId: id }),

    saveEdits: async (id, mask, edits) => {
      const item = get().items.find((it) => it.id === id)
      if (!item) return
      let cutoutUrl = item.cutoutUrl
      if (mask && item.originalUrl) {
        const orig = await urlToImage(item.originalUrl)
        const cutout = applyMask(orig, mask)
        const [cutoutPng, maskPng] = await Promise.all([canvasToBlob(cutout), canvasToBlob(mask)])
        if (item.cutoutUrl) URL.revokeObjectURL(item.cutoutUrl)
        if (item.maskUrl) URL.revokeObjectURL(item.maskUrl)
        cutoutUrl = URL.createObjectURL(cutoutPng)
        update(id, { cutoutUrl, maskUrl: URL.createObjectURL(maskPng) })
      }
      if (item.renderedUrl) URL.revokeObjectURL(item.renderedUrl)
      const renderedUrl = cutoutUrl ? await renderPreviewUrl(cutoutUrl, edits) : undefined
      update(id, { edits, renderedUrl })
    },

    retryItem: (id) => {
      const file = sourceFiles.get(id)
      if (!file) {
        get().removeItem(id)
        return
      }
      update(id, { status: 'pending', error: undefined })
      enqueueProcess(id, file)
    },
  }
})
