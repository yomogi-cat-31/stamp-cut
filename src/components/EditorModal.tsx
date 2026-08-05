import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Brush, Eraser, Plus, RotateCcw, Trash2, Type } from 'lucide-react'
import { useStore } from '../store'
import { defaultEdits, defaultTransform, type StampEdits, type TextItem } from '../types'
import { applyMask, createCanvas, ctx2d, urlToImage } from '../lib/imageUtils'
import { DEFAULT_FONT_ID, FONTS, fontStack, renderStamp } from '../lib/compose'
import { CUTOUT_MODES, type CutoutMode } from '../lib/maskRefine'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

type Tool = 'erase' | 'restore' | 'text'

let textSeq = 0

/**
 * 個別編集モーダル。
 * - ブラシで「消す」(destination-out) /「残す」(元画像から復元)
 * - テキストの追加・ドラッグ配置・フォント選択
 * - 白フチのオン/オフ
 * - 書き出しプレビュー上で被写体の拡大・縮小・移動(配置調整)
 */
export function EditorModal() {
  const { items, editingId, setEditingId, saveEdits, setItemMode } = useStore()
  const item = items.find((i) => i.id === editingId)
  const [modeChanging, setModeChanging] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const [tool, setTool] = useState<Tool>('erase')
  const [brushSize, setBrushSize] = useState(24)
  const [edits, setEdits] = useState<StampEdits>(defaultEdits())
  const [maskDirty, setMaskDirty] = useState(false)
  const [maskVersion, setMaskVersion] = useState(0)
  const [saving, setSaving] = useState(false)
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)

  // オフスクリーン: 元画像とマスク(実寸)
  const originalRef = useRef<HTMLImageElement | null>(null)
  const maskRef = useRef<HTMLCanvasElement | null>(null)
  const [ready, setReady] = useState(false)

  const selectedText = useMemo(
    () => edits.texts.find((t) => t.id === selectedTextId) ?? null,
    [edits.texts, selectedTextId],
  )

  // モーダルを開いたときに元画像・マスクを読み込む
  useEffect(() => {
    setReady(false)
    setMaskDirty(false)
    setMaskVersion(0)
    setSelectedTextId(null)
    if (!item?.originalUrl || !item.maskUrl) return
    let cancelled = false
    ;(async () => {
      const [orig, maskImg] = await Promise.all([
        urlToImage(item.originalUrl!),
        urlToImage(item.maskUrl!),
      ])
      if (cancelled) return
      originalRef.current = orig
      const mask = createCanvas(orig.naturalWidth, orig.naturalHeight)
      ctx2d(mask).drawImage(maskImg, 0, 0, mask.width, mask.height)
      maskRef.current = mask
      const initial = structuredClone(item.edits)
      initial.transform ??= defaultTransform()
      setEdits(initial)
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [item?.id, item?.originalUrl, item?.maskUrl, item?.edits])

  // メインキャンバス再描画(マスク編集・テキスト配置用)
  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const orig = originalRef.current
    const mask = maskRef.current
    if (!canvas || !orig || !mask) return
    const ctx = ctx2d(canvas)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const cutout = applyMask(orig, mask)
    ctx.drawImage(cutout, 0, 0, canvas.width, canvas.height)
    for (const t of edits.texts) {
      if (!t.text) continue
      const px = Math.max(6, t.size * canvas.height)
      ctx.font = `bold ${px}px ${fontStack(t.fontId)}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      if (t.strokeColor) {
        ctx.lineJoin = 'round'
        ctx.strokeStyle = t.strokeColor
        ctx.lineWidth = Math.max(2, px * 0.18)
        ctx.strokeText(t.text, t.x * canvas.width, t.y * canvas.height)
      }
      ctx.fillStyle = t.color
      ctx.fillText(t.text, t.x * canvas.width, t.y * canvas.height)
      if (t.id === selectedTextId) {
        const w = ctx.measureText(t.text).width
        ctx.strokeStyle = '#10b981'
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 3])
        ctx.strokeRect(t.x * canvas.width - w / 2 - 4, t.y * canvas.height - px / 2 - 4, w + 8, px + 8)
        ctx.setLineDash([])
      }
    }
  }, [edits.texts, selectedTextId])

  // キャンバス初期化(フィットサイズ)
  useEffect(() => {
    if (!ready) return
    const canvas = canvasRef.current
    const orig = originalRef.current
    if (!canvas || !orig) return
    const maxW = Math.min(520, window.innerWidth - 96)
    const maxH = Math.min(380, window.innerHeight * 0.42)
    const scale = Math.min(maxW / orig.naturalWidth, maxH / orig.naturalHeight)
    canvas.width = Math.round(orig.naturalWidth * scale)
    canvas.height = Math.round(orig.naturalHeight * scale)
    redraw()
  }, [ready, redraw])

  useEffect(() => {
    redraw()
  }, [redraw])

  // 書き出しプレビュー(配置調整の結果確認用)。編集内容の変化にデバウンスで追従する
  useEffect(() => {
    if (!ready) return
    const timer = setTimeout(async () => {
      const orig = originalRef.current
      const mask = maskRef.current
      const preview = previewRef.current
      if (!orig || !mask || !preview) return
      const cutout = applyMask(orig, mask)
      const rendered = await renderStamp(cutout.toDataURL(), edits)
      const box = 176 // プレビュー枠(370×320 の約 1/2)
      const s = Math.min(box / 370, box / 320)
      preview.width = Math.round(370 * s)
      preview.height = Math.round(320 * s)
      const ctx = ctx2d(preview)
      ctx.clearRect(0, 0, preview.width, preview.height)
      // 規格の最大枠に対する実出力サイズを中央に描く
      const dw = rendered.width * s
      const dh = rendered.height * s
      ctx.drawImage(rendered, (preview.width - dw) / 2, (preview.height - dh) / 2, dw, dh)
    }, 150)
    return () => clearTimeout(timer)
  }, [ready, edits, maskVersion])

  // ポインタ操作(ブラシ / テキストドラッグ)
  const dragState = useRef<{ mode: 'brush' | 'dragText'; textId?: string } | null>(null)

  const canvasPos = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  const applyBrush = (x: number, y: number) => {
    const canvas = canvasRef.current
    const mask = maskRef.current
    if (!canvas || !mask) return
    const scale = mask.width / canvas.width
    const mctx = ctx2d(mask)
    mctx.save()
    mctx.beginPath()
    mctx.arc(x * scale, y * scale, brushSize * scale, 0, Math.PI * 2)
    if (tool === 'erase') {
      mctx.globalCompositeOperation = 'destination-out'
      mctx.fillStyle = '#000'
    } else {
      mctx.globalCompositeOperation = 'source-over'
      mctx.fillStyle = '#fff'
    }
    mctx.fill()
    mctx.restore()
    setMaskDirty(true)
    redraw()
  }

  const hitText = (x: number, y: number): TextItem | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const ctx = ctx2d(canvas)
    for (let i = edits.texts.length - 1; i >= 0; i--) {
      const t = edits.texts[i]
      const px = Math.max(6, t.size * canvas.height)
      ctx.font = `bold ${px}px ${fontStack(t.fontId)}`
      const w = ctx.measureText(t.text || 'あ').width
      const cx = t.x * canvas.width
      const cy = t.y * canvas.height
      if (Math.abs(x - cx) <= w / 2 + 8 && Math.abs(y - cy) <= px / 2 + 8) return t
    }
    return null
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!ready) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const { x, y } = canvasPos(e)
    const t = hitText(x, y)
    if (t && (tool === 'text' || e.shiftKey)) {
      setSelectedTextId(t.id)
      dragState.current = { mode: 'dragText', textId: t.id }
      return
    }
    if (tool === 'text') {
      setSelectedTextId(null)
      return
    }
    dragState.current = { mode: 'brush' }
    applyBrush(x, y)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const st = dragState.current
    if (!st) return
    const { x, y } = canvasPos(e)
    if (st.mode === 'brush') {
      applyBrush(x, y)
    } else if (st.textId) {
      const canvas = canvasRef.current!
      setEdits((ed) => ({
        ...ed,
        texts: ed.texts.map((t) =>
          t.id === st.textId
            ? {
                ...t,
                x: Math.min(1, Math.max(0, x / canvas.width)),
                y: Math.min(1, Math.max(0, y / canvas.height)),
              }
            : t,
        ),
      }))
    }
  }

  const onPointerUp = () => {
    if (dragState.current?.mode === 'brush') setMaskVersion((v) => v + 1)
    dragState.current = null
  }

  // 書き出しプレビュー上のドラッグで被写体を移動する
  const previewDrag = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null)

  const onPreviewPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    previewDrag.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: edits.transform.x,
      baseY: edits.transform.y,
    }
  }

  const onPreviewPointerMove = (e: React.PointerEvent) => {
    const st = previewDrag.current
    const preview = previewRef.current
    if (!st || !preview) return
    const rect = preview.getBoundingClientRect()
    const dx = (e.clientX - st.startX) / rect.width
    const dy = (e.clientY - st.startY) / rect.height
    setEdits((ed) => ({
      ...ed,
      transform: {
        ...ed.transform,
        x: Math.min(0.5, Math.max(-0.5, st.baseX + dx)),
        y: Math.min(0.5, Math.max(-0.5, st.baseY + dy)),
      },
    }))
  }

  const onPreviewPointerUp = () => {
    previewDrag.current = null
  }

  const addText = () => {
    const t: TextItem = {
      id: `text-${++textSeq}`,
      text: 'テキスト',
      x: 0.5,
      y: 0.85,
      size: 0.14,
      color: '#1f2937',
      strokeColor: '#ffffff',
      fontId: DEFAULT_FONT_ID,
    }
    setEdits((ed) => ({ ...ed, texts: [...ed.texts, t] }))
    setSelectedTextId(t.id)
    setTool('text')
  }

  const updateSelectedText = (patch: Partial<TextItem>) => {
    if (!selectedTextId) return
    setEdits((ed) => ({
      ...ed,
      texts: ed.texts.map((t) => (t.id === selectedTextId ? { ...t, ...patch } : t)),
    }))
  }

  const removeSelectedText = () => {
    if (!selectedTextId) return
    setEdits((ed) => ({ ...ed, texts: ed.texts.filter((t) => t.id !== selectedTextId) }))
    setSelectedTextId(null)
  }

  const setTransform = (patch: Partial<StampEdits['transform']>) =>
    setEdits((ed) => ({ ...ed, transform: { ...ed.transform, ...patch } }))

  const onSave = async () => {
    if (!item) return
    setSaving(true)
    try {
      await saveEdits(item.id, maskDirty ? maskRef.current : null, edits)
      setEditingId(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && setEditingId(null)}>
      <DialogContent
        data-testid="editor-modal"
        className="max-h-[92vh] overflow-y-auto sm:max-w-3xl"
      >
        <DialogHeader>
          <DialogTitle>編集: {item?.fileName}</DialogTitle>
        </DialogHeader>

        {/* 背景除去モード */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">背景除去:</span>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={item?.mode}
            disabled={modeChanging}
            onValueChange={async (v) => {
              if (!v || !item || v === item.mode) return
              setModeChanging(true)
              try {
                await setItemMode(item.id, v as CutoutMode)
              } finally {
                setModeChanging(false)
              }
            }}
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
            {modeChanging ? '再計算中…' : '切り替えるとブラシ修正はリセットされます'}
          </span>
        </div>

        {/* ツールバー */}
        <div className="flex flex-wrap items-center gap-3">
          <ToggleGroup
            type="single"
            variant="outline"
            value={tool}
            onValueChange={(v) => v && setTool(v as Tool)}
          >
            <ToggleGroupItem value="erase" className="px-3">
              <Eraser />
              消す
            </ToggleGroupItem>
            <ToggleGroupItem value="restore" className="px-3">
              <Brush />
              残す
            </ToggleGroupItem>
            <ToggleGroupItem value="text" className="px-3">
              <Type />
              テキスト
            </ToggleGroupItem>
          </ToggleGroup>
          {tool !== 'text' && (
            <Label className="text-muted-foreground w-40 gap-2">
              ブラシ
              <Slider
                min={6}
                max={80}
                value={[brushSize]}
                onValueChange={([v]) => setBrushSize(v)}
              />
            </Label>
          )}
          <Label className="text-muted-foreground ml-auto gap-1.5">
            <Checkbox
              checked={edits.outline}
              onCheckedChange={(c) => setEdits((ed) => ({ ...ed, outline: c === true }))}
            />
            白フチ
          </Label>
          {edits.outline && (
            <Slider
              className="w-28"
              min={2}
              max={16}
              value={[edits.outlineWidth]}
              onValueChange={([v]) => setEdits((ed) => ({ ...ed, outlineWidth: v }))}
            />
          )}
        </div>

        <div className="flex flex-wrap items-start justify-center gap-4">
          {/* メインキャンバス(マスク編集・テキスト配置) */}
          <div className="checkerboard rounded-lg" style={{ touchAction: 'none' }}>
            {ready ? (
              <canvas
                ref={canvasRef}
                className="block cursor-crosshair rounded-lg"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
            ) : (
              <div className="text-muted-foreground flex h-64 w-96 max-w-full items-center justify-center text-sm">
                読み込み中…
              </div>
            )}
          </div>

          {/* 配置調整(書き出しプレビュー) */}
          <div className="w-48 shrink-0 space-y-2" data-testid="transform-panel">
            <p className="text-xs font-semibold">書き出しプレビュー / 配置調整</p>
            <div
              className="checkerboard rounded-lg border"
              style={{ touchAction: 'none', width: 176 + 2, height: Math.round((320 / 370) * 176) + 2 }}
            >
              <canvas
                ref={previewRef}
                className="block cursor-move"
                onPointerDown={onPreviewPointerDown}
                onPointerMove={onPreviewPointerMove}
                onPointerUp={onPreviewPointerUp}
                onPointerCancel={onPreviewPointerUp}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">
                拡大・縮小 ({Math.round(edits.transform.scale * 100)}%)
              </Label>
              <Slider
                data-testid="transform-scale"
                min={0.3}
                max={2}
                step={0.05}
                value={[edits.transform.scale]}
                onValueChange={([v]) => setTransform({ scale: v })}
              />
            </div>
            <p className="text-muted-foreground text-xs">プレビューをドラッグで移動</p>
            <Button variant="outline" size="sm" onClick={() => setTransform(defaultTransform())}>
              <RotateCcw />
              配置をリセット
            </Button>
            {edits.outline && (
              <p className="text-muted-foreground text-xs">
                白フチはこのプレビューと書き出しに反映されます
              </p>
            )}
          </div>
        </div>

        {/* テキスト編集パネル */}
        <div className="bg-muted/50 space-y-2 rounded-xl border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={addText}>
              <Plus />
              テキスト追加
            </Button>
            {selectedText && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={removeSelectedText}
              >
                <Trash2 />
                選択中のテキストを削除
              </Button>
            )}
            <span className="text-muted-foreground text-xs">テキストはドラッグで移動できます</span>
          </div>
          {selectedText && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Input
                className="w-40"
                value={selectedText.text}
                onChange={(e) => updateSelectedText({ text: e.target.value })}
                placeholder="テキスト"
              />
              <Label className="text-muted-foreground gap-1">
                フォント
                <Select
                  value={selectedText.fontId}
                  onValueChange={(v) => updateSelectedText({ fontId: v })}
                >
                  <SelectTrigger data-testid="font-select" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FONTS.map((f) => (
                      <SelectItem key={f.id} value={f.id} style={{ fontFamily: f.stack }}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Label>
              <Label className="text-muted-foreground w-36 gap-1 whitespace-nowrap">
                サイズ
                <Slider
                  min={0.05}
                  max={0.35}
                  step={0.01}
                  value={[selectedText.size]}
                  onValueChange={([v]) => updateSelectedText({ size: v })}
                />
              </Label>
              <Label className="text-muted-foreground gap-1">
                色
                <input
                  type="color"
                  className="border-input size-8 cursor-pointer rounded-md border"
                  value={selectedText.color}
                  onChange={(e) => updateSelectedText({ color: e.target.value })}
                />
              </Label>
              <Label className="text-muted-foreground gap-1.5">
                <Checkbox
                  checked={selectedText.strokeColor !== null}
                  onCheckedChange={(c) =>
                    updateSelectedText({ strokeColor: c === true ? '#ffffff' : null })
                  }
                />
                縁取り
              </Label>
              {selectedText.strokeColor !== null && (
                <input
                  type="color"
                  className="border-input size-8 cursor-pointer rounded-md border"
                  value={selectedText.strokeColor}
                  onChange={(e) => updateSelectedText({ strokeColor: e.target.value })}
                />
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setEditingId(null)}>
            キャンセル
          </Button>
          <Button data-testid="editor-save" onClick={onSave} disabled={saving || !ready}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
