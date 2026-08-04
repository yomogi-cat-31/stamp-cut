import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { defaultEdits, defaultTransform, type StampEdits, type TextItem } from '../types'
import { applyMask, createCanvas, ctx2d, urlToImage } from '../lib/imageUtils'
import { DEFAULT_FONT_ID, FONTS, fontStack, renderStamp } from '../lib/compose'

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
  const { items, editingId, setEditingId, saveEdits } = useStore()
  const item = items.find((i) => i.id === editingId)

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
    const maxW = Math.min(560, window.innerWidth - 64)
    const maxH = Math.min(380, window.innerHeight * 0.45)
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
            ? { ...t, x: Math.min(1, Math.max(0, x / canvas.width)), y: Math.min(1, Math.max(0, y / canvas.height)) }
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

  if (!item) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" data-testid="editor-modal">
      <div className="flex max-h-full w-full max-w-3xl flex-col overflow-y-auto rounded-2xl bg-white p-4 shadow-xl">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold text-slate-700">編集: {item.fileName}</h2>
          <button
            className="rounded px-2 py-1 text-slate-400 hover:bg-slate-100"
            onClick={() => setEditingId(null)}
            title="閉じる"
          >
            ×
          </button>
        </div>

        {/* ツールバー */}
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
          {(
            [
              ['erase', '消す'],
              ['restore', '残す(復元)'],
              ['text', 'テキスト'],
            ] as [Tool, string][]
          ).map(([t, label]) => (
            <button
              key={t}
              className={`rounded-full px-3 py-1 font-bold transition-colors ${
                tool === t ? 'bg-slate-800 text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-100'
              }`}
              onClick={() => setTool(t)}
            >
              {label}
            </button>
          ))}
          {tool !== 'text' && (
            <label className="ml-2 flex items-center gap-2 text-slate-600">
              ブラシ
              <input
                type="range"
                min={6}
                max={80}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
              />
            </label>
          )}
          <label className="ml-auto flex items-center gap-1.5 text-slate-600">
            <input
              type="checkbox"
              checked={edits.outline}
              onChange={(e) => setEdits((ed) => ({ ...ed, outline: e.target.checked }))}
            />
            白フチ
          </label>
          {edits.outline && (
            <input
              type="range"
              min={2}
              max={16}
              value={edits.outlineWidth}
              onChange={(e) => setEdits((ed) => ({ ...ed, outlineWidth: Number(e.target.value) }))}
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
              <div className="flex h-64 w-96 max-w-full items-center justify-center text-sm text-slate-500">
                読み込み中…
              </div>
            )}
          </div>

          {/* 配置調整(書き出しプレビュー) */}
          <div className="w-48 shrink-0" data-testid="transform-panel">
            <p className="mb-1 text-xs font-bold text-slate-600">書き出しプレビュー / 配置調整</p>
            <div
              className="checkerboard rounded-lg border border-slate-200"
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
            <label className="mt-2 block text-xs text-slate-600">
              拡大・縮小 ({Math.round(edits.transform.scale * 100)}%)
              <input
                data-testid="transform-scale"
                type="range"
                min={0.3}
                max={2}
                step={0.05}
                value={edits.transform.scale}
                onChange={(e) => setTransform({ scale: Number(e.target.value) })}
                className="w-full"
              />
            </label>
            <p className="mt-1 text-xs text-slate-400">プレビューをドラッグで移動</p>
            <button
              className="mt-1 rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
              onClick={() => setTransform(defaultTransform())}
            >
              配置をリセット
            </button>
            {edits.outline && (
              <p className="mt-2 text-xs text-slate-400">白フチはこのプレビューと書き出しに反映されます</p>
            )}
          </div>
        </div>

        {/* テキスト編集パネル */}
        <div className="mt-3 rounded-xl bg-slate-50 p-3">
          <div className="flex items-center gap-2">
            <button
              className="rounded bg-slate-800 px-3 py-1 text-sm font-bold text-white hover:bg-slate-700"
              onClick={addText}
            >
              + テキスト追加
            </button>
            {selectedText && (
              <button
                className="rounded border border-red-300 px-2 py-1 text-sm text-red-600 hover:bg-red-50"
                onClick={removeSelectedText}
              >
                選択中のテキストを削除
              </button>
            )}
            <span className="text-xs text-slate-400">テキストはドラッグで移動できます</span>
          </div>
          {selectedText && (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              <input
                className="w-40 rounded border border-slate-300 px-2 py-1"
                value={selectedText.text}
                onChange={(e) => updateSelectedText({ text: e.target.value })}
                placeholder="テキスト"
              />
              <label className="flex items-center gap-1 text-slate-600">
                フォント
                <select
                  data-testid="font-select"
                  className="rounded border border-slate-300 px-2 py-1"
                  value={selectedText.fontId}
                  onChange={(e) => updateSelectedText({ fontId: e.target.value })}
                >
                  {FONTS.map((f) => (
                    <option key={f.id} value={f.id} style={{ fontFamily: f.stack }}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1 text-slate-600">
                サイズ
                <input
                  type="range"
                  min={0.05}
                  max={0.35}
                  step={0.01}
                  value={selectedText.size}
                  onChange={(e) => updateSelectedText({ size: Number(e.target.value) })}
                />
              </label>
              <label className="flex items-center gap-1 text-slate-600">
                色
                <input
                  type="color"
                  value={selectedText.color}
                  onChange={(e) => updateSelectedText({ color: e.target.value })}
                />
              </label>
              <label className="flex items-center gap-1 text-slate-600">
                <input
                  type="checkbox"
                  checked={selectedText.strokeColor !== null}
                  onChange={(e) =>
                    updateSelectedText({ strokeColor: e.target.checked ? '#ffffff' : null })
                  }
                />
                縁取り
              </label>
              {selectedText.strokeColor !== null && (
                <input
                  type="color"
                  value={selectedText.strokeColor}
                  onChange={(e) => updateSelectedText({ strokeColor: e.target.value })}
                />
              )}
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            className="rounded-xl border border-slate-300 px-4 py-2 font-bold text-slate-600 hover:bg-slate-100"
            onClick={() => setEditingId(null)}
          >
            キャンセル
          </button>
          <button
            data-testid="editor-save"
            className="rounded-xl bg-emerald-600 px-6 py-2 font-bold text-white hover:bg-emerald-500 disabled:bg-slate-300"
            onClick={onSave}
            disabled={saving || !ready}
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
