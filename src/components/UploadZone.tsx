import { useCallback, useRef, useState } from 'react'
import { ImageUp } from 'lucide-react'
import { useStore } from '../store'
import { preloadModel } from '../lib/removeBg'
import { cn } from '@/lib/utils'

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
      className={cn(
        'flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors select-none',
        dragging ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-accent/50',
      )}
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
      <ImageUp className="text-muted-foreground size-8" />
      <p className="text-lg font-semibold">写真をドラッグ&ドロップ / タップして選択</p>
      <p className="text-muted-foreground text-sm">
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
