"use client"

import { useState, useCallback, forwardRef } from "react"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, X, Star, MapPin, Phone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface RouteCustomerData {
  id: number
  position: number
  customer: {
    id: number
    name: string
    phone: string
    address: string
    email: string | null
    isVip: boolean
  }
}

interface RouteCustomerListProps {
  routeId: number
  customers: RouteCustomerData[]
  onReorder: (customers: RouteCustomerData[]) => void
  onRemove: (routeCustomerId: number, customerId: number) => void
}

function SortableCustomerItem({
  item,
  index,
  onRemove,
}: {
  item: RouteCustomerData
  index: number
  onRemove: (routeCustomerId: number, customerId: number) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 rounded-md border p-3 hover:bg-muted/50",
        isDragging && "opacity-50"
      )}
    >
      <button
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{item.customer.name}</span>
          {item.customer.isVip && (
            <Star className="size-3.5 fill-yellow-400 text-yellow-400" />
          )}
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1 truncate">
            <MapPin className="size-3 shrink-0" />
            {item.customer.address}
          </span>
          <span className="flex items-center gap-1 shrink-0">
            <Phone className="size-3" />
            {item.customer.phone}
          </span>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={() => onRemove(item.id, item.customer.id)}
      >
        <X className="size-4" />
        <span className="sr-only">Remove</span>
      </Button>
    </div>
  )
}

const CustomerDragOverlay = forwardRef<HTMLDivElement, { item: RouteCustomerData }>(
  function CustomerDragOverlay({ item }, ref) {
    return (
      <div
        ref={ref}
        className="flex items-center gap-3 rounded-md border bg-background p-3 shadow-lg"
      >
        <GripVertical className="size-4 text-muted-foreground" />
        <span className="font-medium">{item.customer.name}</span>
      </div>
    )
  }
)

export function RouteCustomerList({
  routeId,
  customers,
  onReorder,
  onRemove,
}: RouteCustomerListProps) {
  const [activeId, setActiveId] = useState<number | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const activeItem = activeId
    ? customers.find((c) => c.id === activeId)
    : null

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as number)
  }

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      setActiveId(null)

      if (!over || active.id === over.id) return

      const oldIndex = customers.findIndex((c) => c.id === active.id)
      const newIndex = customers.findIndex((c) => c.id === over.id)

      if (oldIndex === -1 || newIndex === -1) return

      const reordered = arrayMove(customers, oldIndex, newIndex).map(
        (item, idx) => ({ ...item, position: idx })
      )

      // Optimistic update
      onReorder(reordered)

      // Persist to server
      try {
        const res = await fetch(`/api/routes/${routeId}/customers/reorder`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: reordered.map((item) => ({
              id: item.id,
              position: item.position,
            })),
          }),
        })
        const result = await res.json()
        if (!result.success) {
          // Revert on failure
          onReorder(customers)
        }
      } catch {
        onReorder(customers)
      }
    },
    [customers, routeId, onReorder]
  )

  if (customers.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-muted-foreground">
        No customers in this route yet. Click &quot;Add Customer&quot; to get started.
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={customers.map((c) => c.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-1">
          {customers.map((item, index) => (
            <SortableCustomerItem
              key={item.id}
              item={item}
              index={index}
              onRemove={onRemove}
            />
          ))}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {activeItem ? <CustomerDragOverlay item={activeItem} /> : null}
      </DragOverlay>
    </DndContext>
  )
}
