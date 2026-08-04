import { useStore } from '../store'
import type { StampItem } from '../types'

function Card({ item, index }: { item: StampItem; index: number }) {
  const { removeItem, moveItem, setMainId, setEditingId, retryItem, mainId, items } = useStore()
  const isMain = mainId === item.id
  return (
    <div
      data-testid="stamp-card"
      className={`relative rounded-xl border bg-white p-2 shadow-sm ${
        isMain ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-slate-200'
      }`}
    >
      <div className="absolute left-2 top-2 z-10 rounded bg-slate-800/70 px-1.5 py-0.5 text-xs font-bold text-white">
        {String(index + 1).padStart(2, '0')}
      </div>
      {isMain && (
        <div className="absolute right-2 top-2 z-10 rounded bg-emerald-600 px-1.5 py-0.5 text-xs font-bold text-white">
          メイン
        </div>
      )}
      <div className="checkerboard flex aspect-[370/320] items-center justify-center overflow-hidden rounded-lg">
        {item.status === 'done' && item.cutoutUrl ? (
          <img
            src={item.cutoutUrl}
            alt={item.fileName}
            className="max-h-full max-w-full object-contain"
            style={{ padding: '4%' }}
          />
        ) : item.status === 'error' ? (
          <div className="px-3 text-center text-xs text-red-600">
            <p className="font-bold">処理に失敗しました</p>
            <p className="mt-1 break-all">{item.error}</p>
            <button
              className="mt-2 rounded border border-red-300 px-2 py-0.5 font-bold hover:bg-red-50"
              onClick={() => retryItem(item.id)}
            >
              再試行
            </button>
          </div>
        ) : (
          <div className="text-center text-sm text-slate-500">
            <div className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-500" />
            {item.status === 'processing' ? '切り抜き中…' : '待機中'}
          </div>
        )}
      </div>
      <p className="mt-1 truncate text-xs text-slate-500" title={item.fileName}>
        {item.fileName}
      </p>
      <div className="mt-1 flex items-center gap-1">
        <button
          className="rounded border border-slate-300 px-1.5 py-0.5 text-xs hover:bg-slate-100 disabled:opacity-30"
          onClick={() => moveItem(item.id, -1)}
          disabled={index === 0}
          title="前へ"
        >
          ←
        </button>
        <button
          className="rounded border border-slate-300 px-1.5 py-0.5 text-xs hover:bg-slate-100 disabled:opacity-30"
          onClick={() => moveItem(item.id, 1)}
          disabled={index === items.length - 1}
          title="後ろへ"
        >
          →
        </button>
        <button
          data-testid="edit-button"
          className="ml-auto rounded bg-slate-800 px-2 py-0.5 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-30"
          onClick={() => setEditingId(item.id)}
          disabled={item.status !== 'done'}
        >
          編集
        </button>
        <button
          className="rounded border border-emerald-600 px-2 py-0.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-30"
          onClick={() => setMainId(item.id)}
          disabled={item.status !== 'done' || isMain}
        >
          メインに
        </button>
        <button
          className="rounded border border-red-300 px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-50"
          onClick={() => removeItem(item.id)}
          title="削除"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

export function StampGrid() {
  const items = useStore((s) => s.items)
  if (items.length === 0) return null
  return (
    <div
      data-testid="stamp-grid"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
    >
      {items.map((item, i) => (
        <Card key={item.id} item={item} index={i} />
      ))}
    </div>
  )
}
