import { useCallback, useRef, useState } from 'react'
import { ImageUp } from 'lucide-react'
import { useStore } from '../store'
import { preloadModel } from '../lib/removeBg'
import { CUTOUT_MODES, type CutoutMode } from '../lib/maskRefine'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

export function UploadZone() {
  const addFiles = useStore((s) => s.addFiles)
  const cutMode = useStore((s) => s.cutMode)
  const setCutMode = useStore((s) => s.setCutMode)
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
    <div className="space-y-2">
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
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">背景除去:</span>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={cutMode}
        onValueChange={(v) => v && setCutMode(v as CutoutMode)}
      >
        {CUTOUT_MODES.map((m) => (
          <ToggleGroupItem
            key={m.id}
            value={m.id}
            className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground px-3"
          >
            {m.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <span className="text-muted-foreground text-xs">
        {CUTOUT_MODES.find((m) => m.id === cutMode)?.hint}(編集画面で画像ごとに変更できます)
      </span>
    </div>
    </div>
  )
}
