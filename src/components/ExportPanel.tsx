import { useState } from 'react'
import { useStore } from '../store'
import { SPEC, type StampCount } from '../types'
import { downloadBlob, exportZip } from '../lib/exportZip'

export function ExportPanel() {
  const { items, count, setCount, mainId } = useStore()
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState<[number, number] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [doneMsg, setDoneMsg] = useState<string | null>(null)

  if (items.length === 0) return null

  const doneItems = items.filter((i) => i.status === 'done')
  const mainItem = doneItems.find((i) => i.id === mainId) ?? doneItems[0]
  const shortage = count - doneItems.length
  const canExport = shortage <= 0 && !!mainItem && !exporting

  const onExport = async () => {
    setError(null)
    setDoneMsg(null)
    setExporting(true)
    try {
      const targets = doneItems.slice(0, count)
      const { blob, fileCount } = await exportZip(targets, mainItem, (d, t) =>
        setProgress([d, t]),
      )
      downloadBlob(blob, 'line-stamps.zip')
      setDoneMsg(
        `${fileCount} ファイル(スタンプ ${count} + main + tab)を line-stamps.zip として保存しました`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setExporting(false)
      setProgress(null)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="export-panel">
      <h2 className="font-bold text-slate-700">書き出し</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-600">スタンプ個数:</span>
        {SPEC.counts.map((c) => (
          <button
            key={c}
            className={`rounded-full px-3 py-1 text-sm font-bold transition-colors ${
              count === c
                ? 'bg-emerald-600 text-white'
                : 'border border-slate-300 text-slate-600 hover:bg-slate-100'
            }`}
            onClick={() => setCount(c as StampCount)}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="mt-3 text-sm">
        {shortage > 0 ? (
          <p className="text-amber-700" data-testid="shortage-warning">
            あと {shortage} 枚必要です(現在 {doneItems.length} 枚 / {count} 枚)
          </p>
        ) : doneItems.length > count ? (
          <p className="text-slate-500">
            {doneItems.length} 枚中、先頭の {count} 枚を書き出します
          </p>
        ) : (
          <p className="text-emerald-700">{count} 枚そろっています</p>
        )}
        {mainItem && (
          <p className="mt-1 text-slate-500">
            メイン画像・タブ画像は「{mainItem.fileName}」から自動生成します
          </p>
        )}
      </div>

      <button
        data-testid="export-button"
        className="mt-4 w-full rounded-xl bg-emerald-600 py-3 font-bold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300"
        disabled={!canExport}
        onClick={onExport}
      >
        {exporting
          ? progress
            ? `生成中… ${progress[0]}/${progress[1]}`
            : '生成中…'
          : 'ZIP をダウンロード'}
      </button>

      {error && <p className="mt-2 text-sm text-red-600">エラー: {error}</p>}
      {doneMsg && (
        <p className="mt-2 text-sm text-emerald-700" data-testid="export-done">
          {doneMsg}
        </p>
      )}
      <p className="mt-3 text-xs text-slate-400">
        出力仕様: スタンプ {SPEC.stamp.maxW}×{SPEC.stamp.maxH}px 以内(偶数px・透過PNG・1MB以下)/ main{' '}
        {SPEC.main.w}×{SPEC.main.h} / tab {SPEC.tab.w}×{SPEC.tab.h}。
        申請前に第三者の写り込み・ロゴ等が含まれていないか確認してください。
      </p>
    </div>
  )
}
