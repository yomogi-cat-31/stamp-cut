import { useState } from 'react'
import { useStore } from '../store'

/** LINE トーク画面風のプレビュー(白背景・ダーク背景で透過の粗を確認する) */
export function ChatPreview() {
  const allItems = useStore((s) => s.items)
  const items = allItems.filter((i) => i.status === 'done' && i.cutoutUrl)
  const [dark, setDark] = useState(false)
  if (items.length === 0) return null
  const shown = items.slice(0, 4)
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold text-slate-700">トーク画面プレビュー</h2>
        <button
          className="rounded-full border border-slate-300 px-3 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100"
          onClick={() => setDark((d) => !d)}
        >
          {dark ? '☀️ ライト背景' : '🌙 ダーク背景'}
        </button>
      </div>
      <div
        className={`rounded-xl p-4 transition-colors ${dark ? 'bg-[#1b1b23]' : 'bg-[#8cabd8]'}`}
      >
        {shown.map((item, i) => (
          <div key={item.id} className={`mb-3 flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
            <img
              src={item.cutoutUrl}
              alt=""
              className="h-28 w-auto max-w-[45%] object-contain drop-shadow-sm"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
