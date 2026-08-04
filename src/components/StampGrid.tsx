import { ArrowLeft, ArrowRight, Loader2, Pencil, Star, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import type { StampItem } from '../types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

function StampCard({ item, index }: { item: StampItem; index: number }) {
  const { removeItem, moveItem, setMainId, setEditingId, retryItem, mainId, items } = useStore()
  const isMain = mainId === item.id
  return (
    <Card
      data-testid="stamp-card"
      className={cn('relative gap-2 rounded-xl p-2', isMain && 'ring-primary/40 border-primary ring-2')}
    >
      <Badge variant="secondary" className="absolute top-3 left-3 z-10">
        {String(index + 1).padStart(2, '0')}
      </Badge>
      {isMain && (
        <Badge className="absolute top-3 right-3 z-10">
          <Star className="size-3" />
          メイン
        </Badge>
      )}
      <div className="checkerboard flex aspect-[370/320] items-center justify-center overflow-hidden rounded-lg">
        {item.status === 'done' && item.cutoutUrl ? (
          <img
            src={item.renderedUrl ?? item.cutoutUrl}
            alt={item.fileName}
            className="max-h-full max-w-full object-contain"
            style={{ padding: '4%' }}
          />
        ) : item.status === 'error' ? (
          <div className="text-destructive px-3 text-center text-xs">
            <p className="font-bold">処理に失敗しました</p>
            <p className="mt-1 break-all">{item.error}</p>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive mt-2"
              onClick={() => retryItem(item.id)}
            >
              再試行
            </Button>
          </div>
        ) : (
          <div className="text-muted-foreground text-center text-sm">
            <Loader2 className="text-primary mx-auto mb-2 size-6 animate-spin" />
            {item.status === 'processing' ? '切り抜き中…' : '待機中'}
          </div>
        )}
      </div>
      <p className="text-muted-foreground truncate text-xs" title={item.fileName}>
        {item.fileName}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => moveItem(item.id, -1)}
          disabled={index === 0}
          title="前へ"
        >
          <ArrowLeft />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => moveItem(item.id, 1)}
          disabled={index === items.length - 1}
          title="後ろへ"
        >
          <ArrowRight />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          className="text-destructive hover:text-destructive ml-auto"
          onClick={() => removeItem(item.id)}
          title="削除"
        >
          <Trash2 />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <Button
          data-testid="edit-button"
          size="sm"
          variant="secondary"
          onClick={() => setEditingId(item.id)}
          disabled={item.status !== 'done'}
        >
          <Pencil />
          編集
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMainId(item.id)}
          disabled={item.status !== 'done' || isMain}
        >
          メインに
        </Button>
      </div>
    </Card>
  )
}

export function StampGrid() {
  const items = useStore((s) => s.items)
  if (items.length === 0) return null
  return (
    <div data-testid="stamp-grid" className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {items.map((item, i) => (
        <StampCard key={item.id} item={item} index={i} />
      ))}
    </div>
  )
}
