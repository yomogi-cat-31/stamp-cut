import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { useStore } from '../store'
import { SPEC, type StampCount } from '../types'
import { downloadBlob, exportZip } from '../lib/exportZip'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

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
      const { blob, fileCount } = await exportZip(targets, mainItem, (d, t) => setProgress([d, t]))
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
    <Card data-testid="export-panel">
      <CardHeader>
        <CardTitle>書き出し</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-muted-foreground text-sm">スタンプ個数:</span>
          <ToggleGroup
            type="single"
            variant="outline"
            value={String(count)}
            onValueChange={(v) => v && setCount(Number(v) as StampCount)}
          >
            {SPEC.counts.map((c) => (
              <ToggleGroupItem
                key={c}
                value={String(c)}
                className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground px-4"
              >
                {c}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="text-sm">
          {shortage > 0 ? (
            <p className="text-amber-700" data-testid="shortage-warning">
              あと {shortage} 枚必要です(現在 {doneItems.length} 枚 / {count} 枚)
            </p>
          ) : doneItems.length > count ? (
            <p className="text-muted-foreground">
              {doneItems.length} 枚中、先頭の {count} 枚を書き出します
            </p>
          ) : (
            <p className="text-primary">{count} 枚そろっています</p>
          )}
          {mainItem && (
            <p className="text-muted-foreground mt-1">
              メイン画像・タブ画像は「{mainItem.fileName}」から自動生成します
            </p>
          )}
        </div>

        {exporting && progress && <Progress value={(progress[0] / progress[1]) * 100} />}

        <Button
          data-testid="export-button"
          size="lg"
          className="w-full"
          disabled={!canExport}
          onClick={onExport}
        >
          {exporting ? (
            <>
              <Loader2 className="animate-spin" />
              {progress ? `生成中… ${progress[0]}/${progress[1]}` : '生成中…'}
            </>
          ) : (
            <>
              <Download />
              ZIP をダウンロード
            </>
          )}
        </Button>

        {error && <p className="text-destructive text-sm">エラー: {error}</p>}
        {doneMsg && (
          <p className="text-primary text-sm" data-testid="export-done">
            {doneMsg}
          </p>
        )}
        <p className="text-muted-foreground text-xs">
          出力仕様: スタンプ {SPEC.stamp.maxW}×{SPEC.stamp.maxH}px 以内(偶数px・透過PNG・1MB以下)/ main{' '}
          {SPEC.main.w}×{SPEC.main.h} / tab {SPEC.tab.w}×{SPEC.tab.h}。
          申請前に第三者の写り込み・ロゴ等が含まれていないか確認してください。
        </p>
      </CardContent>
    </Card>
  )
}
