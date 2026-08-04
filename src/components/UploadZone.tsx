import { useCallback, useRef, useState } from 'react'
import { useStore } from '../store'
import { preloadModel } from '../lib/removeBg'

export function UploadZone() {
  const addFiles = useStore((s) => s.addFiles)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const onFiles = useCallback(
    (list: FileList | null) => {
      if (!list?.length) return
      addFiles([...list])
    },
    [addFiles],
  )

  return (
    <div
      data-testid="upload-zone"
      className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer select-none ${
        dragging ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-white hover:bg-slate-50'
      }`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        onFiles(e.dataTransfer.files)
      }}
      onMouseEnter={() => {
        // 触り始めたらモデルを先読みしておく
        void preloadModel().catch(() => {})
      }}
    >
      <p className="text-lg font-bold text-slate-700">写真をドラッグ&ドロップ / タップして選択</p>
      <p className="mt-2 text-sm text-slate-500">
        JPEG・PNG・WebP・HEIC 対応 / 複数枚OK / 画像は端末の外に送信されません
      </p>
      <input
        ref={inputRef}
        data-testid="file-input"
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="hidden"
        onChange={(e) => {
          onFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
