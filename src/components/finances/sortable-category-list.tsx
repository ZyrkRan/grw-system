"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import {
  SortableCategoryItem,
  CategoryDragOverlay,
} from "@/components/finances/sortable-category-item"

interface CategoryChild {
  id: number
  name: string
  color: string
  isDefault: boolean
  isGroup: boolean
  parentId: number | null
  _count: { transactions: number }
}

interface Category {
  id: number
  name: string
  slug: string
  color: string
  isDefault: boolean
  position: number
  parentId: number | null
  isGroup: boolean
  _count: { transactions: number }
  children: CategoryChild[]
}

interface ReorderItem {
  id: number
  position: number
  parentId: number | null
}

interface SortableCategoryListProps {
  categories: Category[]
  onReorder: (items: ReorderItem[]) => Promise<void>
  onEdit: (category: Category | CategoryChild) => void
  onDelete: (category: Category | CategoryChild) => void
  onColorChange: (categoryId: number, color: string) => void
}

export function SortableCategoryList({
  categories,
  onReorder,
  onEdit,
  onDelete,
  onColorChange,
}: SortableCategoryListProps) {
  const [localCategories, setLocalCategories] = useState<Category[]>(categories)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [overGroupId, setOverGroupId] = useState<number | null>(null)
  const overGroupIdRef = useRef<number | null>(null)
  const isReorderingRef = useRef(false)

  // Sync local state when categories prop changes (but not during active reorder)
  useEffect(() => {
    if (!isReorderingRef.current) {
      setLocalCategories(categories)
    }
  }, [categories])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const activeItem = activeId
    ? localCategories.find((c) => c.id === activeId) ??
      localCategories
        .flatMap((c) => c.children)
        .find((c) => c.id === activeId)
    : null

  // Build separate lists for each sorting context
  const topLevelIds = localCategories.map((c) => c.id)

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as number)
  }

  function setOverGroup(id: number | null) {
    setOverGroupId(id)
    overGroupIdRef.current = id
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) {
      setOverGroup(null)
      return
    }

    const activeItemId = active.id as number
    const overItemId = over.id as number

    // Find the item being dragged
    const draggedItem =
      localCategories.find((c) => c.id === activeItemId) ??
      localCategories.flatMap((c) => c.children).find((c) => c.id === activeItemId)

    // Don't allow groups to nest
    if (draggedItem && "isGroup" in draggedItem && draggedItem.isGroup) {
      setOverGroup(null)
      return
    }

    // Check if hovering over a group
    const overCategory = localCategories.find((c) => c.id === overItemId)
    if (overCategory?.isGroup && overCategory.id !== activeItemId) {
      // Use collision rect to detect middle-zone
      const overRect = over.rect
      if (overRect && event.active.rect.current.translated) {
        const dragY = event.active.rect.current.translated.top + event.active.rect.current.translated.height / 2
        const overTop = overRect.top
        const overHeight = overRect.height
        const topZone = overTop + overHeight * 0.3
        const bottomZone = overTop + overHeight * 0.7

        if (dragY > topZone && dragY < bottomZone) {
          setOverGroup(overCategory.id)
          return
        }
      }
    }

    setOverGroup(null)
  }

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      setActiveId(null)

      // Read from ref to avoid stale closure
      const currentOverGroupId = overGroupIdRef.current
      setOverGroup(null)

      if (!over) return

      const activeItemId = active.id as number
      const overItemId = over.id as number

      if (activeItemId === overItemId && !currentOverGroupId) return

      // Find dragged item info
      const isTopLevel = localCategories.some((c) => c.id === activeItemId)
      const parentCategory = localCategories.find((c) =>
        c.children.some((ch) => ch.id === activeItemId)
      )
      const draggedItem = isTopLevel
        ? localCategories.find((c) => c.id === activeItemId)!
        : parentCategory?.children.find((c) => c.id === activeItemId)

      if (!draggedItem) return

      // Don't allow groups to nest into groups
      if ("isGroup" in draggedItem && draggedItem.isGroup && currentOverGroupId) return

      // Mark that we're reordering to prevent sync during API call
      isReorderingRef.current = true

      // Snapshot for rollback
      const snapshot = [...localCategories]

      let newCategories = [...localCategories.map((c) => ({
        ...c,
        children: [...c.children],
      }))]

      if (currentOverGroupId) {
        // --- Nesting into a group ---
        const targetGroup = newCategories.find((c) => c.id === currentOverGroupId)
        if (!targetGroup) return

        // Remove from current location
        if (isTopLevel) {
          newCategories = newCategories.filter((c) => c.id !== activeItemId)
        } else if (parentCategory) {
          const parentInNew = newCategories.find((c) => c.id === parentCategory.id)
          if (parentInNew) {
            parentInNew.children = parentInNew.children.filter((c) => c.id !== activeItemId)
          }
        }

        // Add to target group's children
        const targetInNew = newCategories.find((c) => c.id === currentOverGroupId)
        if (targetInNew) {
          targetInNew.children.push({
            id: draggedItem.id,
            name: draggedItem.name,
            color: draggedItem.color,
            isDefault: draggedItem.isDefault,
            isGroup: draggedItem.isGroup,
            parentId: currentOverGroupId,
            _count: draggedItem._count,
          })
        }
      } else if (isTopLevel) {
        // --- Reorder at top level ---
        const oldIndex = newCategories.findIndex((c) => c.id === activeItemId)
        // Determine target position — over could be a child
        let newIndex = newCategories.findIndex((c) => c.id === overItemId)
        if (newIndex === -1) {
          // Over item is a child — find its parent
          const overParent = newCategories.find((c) =>
            c.children.some((ch) => ch.id === overItemId)
          )
          if (overParent) {
            newIndex = newCategories.findIndex((c) => c.id === overParent.id)
          }
        }
        if (oldIndex !== -1 && newIndex !== -1) {
          newCategories = arrayMove(newCategories, oldIndex, newIndex)
        }
      } else if (parentCategory) {
        // --- Reorder within a group or move out ---
        const overIsTopLevel = newCategories.some((c) => c.id === overItemId)
        const overParent = newCategories.find((c) =>
          c.children.some((ch) => ch.id === overItemId)
        )

        if (overIsTopLevel && !currentOverGroupId) {
          // Drag child out to top level
          const parentInNew = newCategories.find((c) => c.id === parentCategory.id)
          if (parentInNew) {
            parentInNew.children = parentInNew.children.filter((c) => c.id !== activeItemId)
          }
          const insertIndex = newCategories.findIndex((c) => c.id === overItemId)
          const asTopLevel: Category = {
            ...draggedItem,
            slug: "slug" in draggedItem ? (draggedItem as Category).slug : draggedItem.name.toLowerCase().replace(/\s+/g, "-"),
            position: 0,
            parentId: null,
            children: [],
          }
          newCategories.splice(insertIndex, 0, asTopLevel)
        } else if (overParent && overParent.id === parentCategory.id) {
          // Reorder within same group
          const parentInNew = newCategories.find((c) => c.id === parentCategory.id)
          if (parentInNew) {
            const oldIdx = parentInNew.children.findIndex((c) => c.id === activeItemId)
            const newIdx = parentInNew.children.findIndex((c) => c.id === overItemId)
            if (oldIdx !== -1 && newIdx !== -1) {
              parentInNew.children = arrayMove(parentInNew.children, oldIdx, newIdx)
            }
          }
        } else if (overParent && overParent.id !== parentCategory.id) {
          // Move between groups
          const sourceInNew = newCategories.find((c) => c.id === parentCategory.id)
          const targetInNew = newCategories.find((c) => c.id === overParent.id)
          if (sourceInNew && targetInNew) {
            sourceInNew.children = sourceInNew.children.filter((c) => c.id !== activeItemId)
            const insertIdx = targetInNew.children.findIndex((c) => c.id === overItemId)
            targetInNew.children.splice(insertIdx, 0, {
              ...draggedItem,
              parentId: overParent.id,
            })
          }
        }
      }

      // Apply optimistic update
      setLocalCategories(newCategories)

      // Build payload
      const payload: ReorderItem[] = []
      newCategories.forEach((cat, idx) => {
        payload.push({ id: cat.id, position: idx, parentId: cat.parentId })
        cat.children.forEach((child, childIdx) => {
          payload.push({ id: child.id, position: childIdx, parentId: cat.id })
        })
      })

      try {
        await onReorder(payload)
        // Success — allow next sync to update from server
        isReorderingRef.current = false
      } catch {
        // Rollback on failure
        setLocalCategories(snapshot)
        isReorderingRef.current = false
      }
    },
    [localCategories, onReorder]
  )

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={topLevelIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-1">
          {localCategories.map((category) => (
            <SortableCategoryItem
              key={category.id}
              category={category}
              isOverGroup={overGroupId === category.id}
              onEdit={onEdit}
              onDelete={onDelete}
              onColorChange={onColorChange}
            >
              {category.isGroup && category.children.length > 0 && (
                <SortableContext
                  items={category.children.map((ch) => ch.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {category.children.map((child) => (
                    <SortableCategoryItem
                      key={child.id}
                      category={child}
                      isChild
                      parentColor={category.color}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onColorChange={onColorChange}
                    />
                  ))}
                </SortableContext>
              )}
            </SortableCategoryItem>
          ))}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {activeItem ? <CategoryDragOverlay category={activeItem} /> : null}
      </DragOverlay>
    </DndContext>
  )
}
