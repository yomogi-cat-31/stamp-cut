import JSZip from 'jszip'
import { SPEC, type StampItem } from '../types'
import { renderStampBlob } from './compose'

export interface ExportResult {
  blob: Blob
  fileCount: number
}

/**
 * LINE Creators Market の申請規則どおりの ZIP を生成する。
 *   main.png / tab.png / 01.png 〜 NN.png
 */
export async function exportZip(
  items: StampItem[],
  mainItem: StampItem,
  onProgress?: (done: number, total: number) => void,
): Promise<ExportResult> {
  const zip = new JSZip()
  const total = items.length + 2
  let done = 0
  const tick = () => onProgress?.(++done, total)

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (!item.cutoutUrl) throw new Error(`${item.fileName} の処理が完了していません`)
    const blob = await renderStampBlob(item.cutoutUrl, item.edits)
    zip.file(`${String(i + 1).padStart(2, '0')}.png`, blob)
    tick()
  }

  if (!mainItem.cutoutUrl) throw new Error('メイン画像の処理が完了していません')
  zip.file(
    'main.png',
    await renderStampBlob(mainItem.cutoutUrl, mainItem.edits, { fixed: SPEC.main }),
  )
  tick()
  zip.file(
    'tab.png',
    await renderStampBlob(mainItem.cutoutUrl, mainItem.edits, {
      fixed: SPEC.tab,
      withTexts: false,
    }),
  )
  tick()

  const blob = await zip.generateAsync({ type: 'blob' })
  if (blob.size > SPEC.maxZipBytes) {
    throw new Error(`ZIP が 20MB を超えました (${(blob.size / 1024 / 1024).toFixed(1)}MB)`)
  }
  return { blob, fileCount: items.length + 2 }
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
