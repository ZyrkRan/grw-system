"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Plus,
  ArrowRight,
  Trash2,
  Tag,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CategoryDialog } from "@/components/finances/category-dialog"
import { RuleDialog } from "@/components/finances/rule-dialog"
import { SortableCategoryList } from "@/components/finances/sortable-category-list"

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

interface RuleCategory {
  id: number
  name: string
  color: string
}

interface Rule {
  id: number
  pattern: string
  category: RuleCategory
}

export function CategoriesManager() {
  const [categories, setCategories] = useState<Category[]>([])
  const [rules, setRules] = useState<Rule[]>([])
  const [isLoadingCategories, setIsLoadingCategories] = useState(true)
  const [isLoadingRules, setIsLoadingRules] = useState(true)

  // Category dialogs
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | CategoryChild | undefined>(undefined)
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<Category | CategoryChild | null>(null)
  const [isDeletingCategory, setIsDeletingCategory] = useState(false)
  const [deleteCategoryError, setDeleteCategoryError] = useState("")

  // Rule dialogs
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false)
  const [deleteRuleTarget, setDeleteRuleTarget] = useState<Rule | null>(null)
  const [isDeletingRule, setIsDeletingRule] = useState(false)
  const [deleteRuleError, setDeleteRuleError] = useState("")

  const fetchCategories = useCallback(async () => {
    setIsLoadingCategories(true)
    try {
      const res = await fetch("/api/finances/categories")
      const result = await res.json()
      if (result.success) {
        setCategories(result.data)
      }
    } catch (error) {
      console.error("Failed to fetch categories:", error)
    } finally {
      setIsLoadingCategories(false)
    }
  }, [])

  const fetchRules = useCallback(async () => {
    setIsLoadingRules(true)
    try {
      const res = await fetch("/api/finances/categorization-rules")
      const result = await res.json()
      if (result.success) {
        setRules(result.data)
      }
    } catch (error) {
      console.error("Failed to fetch rules:", error)
    } finally {
      setIsLoadingRules(false)
    }
  }, [])

  useEffect(() => {
    fetchCategories()
    fetchRules()
  }, [fetchCategories, fetchRules])

  // Flatten groups for the category dialog's parent selector
  const groups = categories
    .filter((c) => c.isGroup)
    .map((c) => ({ id: c.id, name: c.name, color: c.color }))

  // Flatten all categories for rule dialog
  const allCategories = categories.flatMap((c) => {
    const items = [{ id: c.id, name: c.name, color: c.color }]
    if (c.children) {
      for (const child of c.children) {
        items.push({ id: child.id, name: child.name, color: child.color })
      }
    }
    return items
  })

  function handleAddCategory() {
    setEditingCategory(undefined)
    setCategoryDialogOpen(true)
  }

  function handleEditCategory(category: Category | CategoryChild) {
    setEditingCategory(category)
    setCategoryDialogOpen(true)
  }

  function handleDeleteCategoryClick(category: Category | CategoryChild) {
    setDeleteCategoryTarget(category)
    setDeleteCategoryError("")
  }

  async function handleDeleteCategoryConfirm() {
    if (!deleteCategoryTarget) return
    setIsDeletingCategory(true)
    setDeleteCategoryError("")

    try {
      const res = await fetch(
        `/api/finances/categories/${deleteCategoryTarget.id}`,
        { method: "DELETE" }
      )
      const result = await res.json()

      if (result.success) {
        setDeleteCategoryTarget(null)
        fetchCategories()
      } else {
        setDeleteCategoryError(result.error || "Failed to delete category.")
      }
    } catch {
      setDeleteCategoryError("Failed to delete category. Please try again.")
    } finally {
      setIsDeletingCategory(false)
    }
  }

  function handleAddRule() {
    setRuleDialogOpen(true)
  }

  function handleDeleteRuleClick(rule: Rule) {
    setDeleteRuleTarget(rule)
    setDeleteRuleError("")
  }

  async function handleDeleteRuleConfirm() {
    if (!deleteRuleTarget) return
    setIsDeletingRule(true)
    setDeleteRuleError("")

    try {
      const res = await fetch(
        `/api/finances/categorization-rules/${deleteRuleTarget.id}`,
        { method: "DELETE" }
      )
      const result = await res.json()

      if (result.success) {
        setDeleteRuleTarget(null)
        fetchRules()
      } else {
        setDeleteRuleError(result.error || "Failed to delete rule.")
      }
    } catch {
      setDeleteRuleError("Failed to delete rule. Please try again.")
    } finally {
      setIsDeletingRule(false)
    }
  }

  async function handleReorder(items: { id: number; position: number; parentId: number | null }[]) {
    const res = await fetch("/api/finances/categories/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    })
    const result = await res.json()
    if (!result.success) throw new Error(result.error)
    // Silently refetch without setting isLoadingCategories to avoid unmounting the sortable list
    const refreshRes = await fetch("/api/finances/categories")
    const refreshResult = await refreshRes.json()
    if (refreshResult.success) {
      setCategories(refreshResult.data)
    }
  }

  async function handleColorChange(categoryId: number, color: string) {
    // Optimistic update
    setCategories((prev) =>
      prev.map((c) => {
        if (c.id === categoryId) return { ...c, color }
        return {
          ...c,
          children: c.children.map((ch) =>
            ch.id === categoryId ? { ...ch, color } : ch
          ),
        }
      })
    )

    try {
      const res = await fetch(`/api/finances/categories/${categoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color }),
      })
      const result = await res.json()
      if (!result.success) {
        fetchCategories() // rollback on failure
      }
    } catch {
      fetchCategories() // rollback on failure
    }
  }

  function handleCategorySuccess() {
    fetchCategories()
  }

  function handleRuleSuccess() {
    fetchRules()
  }

  return (
    <div className="space-y-8">
      {/* Categories Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Categories</h2>
          <Button onClick={handleAddCategory}>
            <Plus className="mr-2 size-4" />
            Add Category
          </Button>
        </div>

        {isLoadingCategories ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-md border p-3">
                <Skeleton className="size-4 rounded-full" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-16 ml-auto" />
              </div>
            ))}
          </div>
        ) : categories.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-md border py-12">
            <Tag className="size-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No categories yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create categories to organize your transactions.
            </p>
          </div>
        ) : (
          <SortableCategoryList
            categories={categories}
            onReorder={handleReorder}
            onEdit={handleEditCategory}
            onDelete={handleDeleteCategoryClick}
            onColorChange={handleColorChange}
          />
        )}
      </div>

      <Separator />

      {/* Categorization Rules Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Categorization Rules</h2>
          <Button onClick={handleAddRule}>
            <Plus className="mr-2 size-4" />
            Add Rule
          </Button>
        </div>

        {isLoadingRules ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-md border p-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-4 w-28" />
              </div>
            ))}
          </div>
        ) : rules.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-md border py-12">
            <ArrowRight className="size-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No rules yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create rules to automatically categorize transactions.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center gap-3 rounded-md border p-3 hover:bg-muted/50"
              >
                <code className="rounded bg-muted px-2 py-0.5 text-sm font-mono">
                  {rule.pattern}
                </code>
                <ArrowRight className="size-4 text-muted-foreground shrink-0" />
                <span className="flex items-center gap-2 text-sm">
                  <span
                    className="inline-block size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: rule.category.color }}
                  />
                  {rule.category.name}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto size-7"
                  onClick={() => handleDeleteRuleClick(rule)}
                >
                  <Trash2 className="size-3.5" />
                  <span className="sr-only">Delete rule</span>
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Category Dialog */}
      <CategoryDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        category={editingCategory}
        groups={groups}
        onSuccess={handleCategorySuccess}
      />

      {/* Rule Dialog */}
      <RuleDialog
        open={ruleDialogOpen}
        onOpenChange={setRuleDialogOpen}
        categories={allCategories}
        onSuccess={handleRuleSuccess}
      />

      {/* Delete Category Confirmation */}
      <Dialog
        open={!!deleteCategoryTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteCategoryTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Category</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <strong>{deleteCategoryTarget?.name}</strong>? Transactions using
              this category will become uncategorized. This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          {deleteCategoryError && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {deleteCategoryError}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteCategoryTarget(null)}
              disabled={isDeletingCategory}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteCategoryConfirm}
              disabled={isDeletingCategory}
            >
              {isDeletingCategory ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Rule Confirmation */}
      <Dialog
        open={!!deleteRuleTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteRuleTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Rule</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the rule for pattern{" "}
              <strong>&quot;{deleteRuleTarget?.pattern}&quot;</strong>? This will
              not affect already-categorized transactions.
            </DialogDescription>
          </DialogHeader>
          {deleteRuleError && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {deleteRuleError}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteRuleTarget(null)}
              disabled={isDeletingRule}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteRuleConfirm}
              disabled={isDeletingRule}
            >
              {isDeletingRule ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
