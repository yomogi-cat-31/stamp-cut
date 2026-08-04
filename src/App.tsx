import { UploadZone } from './components/UploadZone'
import { StampGrid } from './components/StampGrid'
import { EditorModal } from './components/EditorModal'
import { ExportPanel } from './components/ExportPanel'
import { ChatPreview } from './components/ChatPreview'
import { useStore } from './store'
import { skipBgRemoval } from './lib/removeBg'

export default function App() {
  const items = useStore((s) => s.items)
  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-4">
          <h1 className="text-xl font-black tracking-tight">
            stamp-cut
            <span className="ml-2 text-sm font-bold text-slate-400">
              写真から LINE スタンプ用アセットを作るツール
            </span>
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        {skipBgRemoval && (
          <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-800">
            デバッグモード: 背景除去をスキップしています(?nobg)
          </p>
        )}
        <UploadZone />
        {items.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm leading-relaxed text-slate-500">
            <p className="font-bold text-slate-600">つかいかた</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>ペットや人物の写真をアップロード(自動で背景を切り抜きます)</li>
              <li>必要なら「編集」でブラシ修正・テキスト・白フチを追加</li>
              <li>個数(8/16/24/32/40)を選んで ZIP をダウンロード</li>
              <li>
                <a
                  className="text-emerald-700 underline"
                  href="https://creator.line.me/ja/"
                  target="_blank"
                  rel="noreferrer"
                >
                  LINE Creators Market
                </a>
                に ZIP の中身をアップロードして申請
              </li>
            </ol>
            <p className="mt-3 text-xs text-slate-400">
              すべての処理はブラウザ内で完結し、写真が外部サーバーに送信されることはありません。
            </p>
          </div>
        )}
        <StampGrid />
        <ChatPreview />
        <ExportPanel />
      </main>

      <EditorModal />
    </div>
  )
}
