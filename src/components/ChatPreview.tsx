import { useState } from 'react'
import { useStore } from '../store'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

/** LINE トーク画面風のプレビュー(白背景・ダーク背景で透過の粗を確認する) */
export function ChatPreview() {
  const allItems = useStore((s) => s.items)
  const items = allItems.filter((i) => i.status === 'done' && i.cutoutUrl)
  const [dark, setDark] = useState(false)
  if (items.length === 0) return null
  const shown = items.slice(0, 4)
  return (
    <Card>
      <CardHeader>
        <CardTitle>トーク画面プレビュー</CardTitle>
        <CardAction>
          <Label className="text-muted-foreground gap-2 text-xs">
            ダーク背景
            <Switch checked={dark} onCheckedChange={setDark} />
          </Label>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className={cn('rounded-xl p-4 transition-colors', dark ? 'bg-[#1b1b23]' : 'bg-[#8cabd8]')}>
          {shown.map((item, i) => (
            <div key={item.id} className={cn('mb-3 flex', i % 2 === 0 ? 'justify-end' : 'justify-start')}>
              <img
                src={item.renderedUrl ?? item.cutoutUrl}
                alt=""
                className="h-28 w-auto max-w-[45%] object-contain drop-shadow-sm"
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
