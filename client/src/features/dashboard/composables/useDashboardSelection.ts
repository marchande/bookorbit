import { computed, inject, provide, ref, shallowReactive } from 'vue'
import type { InjectionKey, Ref } from 'vue'
import type { BookCard } from '@bookorbit/types'
import { useBookSelectionHost, type BookSelectionHost } from '@/features/book/composables/useBookSelectionHost'

interface DashboardSelectionContext {
  selectionMode: Ref<boolean>
  isSelected: (id: number) => boolean
  handleSelect: (id: number, event: MouseEvent) => void
  /** True when every book in the given shelf is selected. */
  isShelfSelected: (books: BookCard[]) => boolean
  toggleShelf: (books: BookCard[]) => void
  registerShelf: (key: symbol, books: Ref<BookCard[]>) => void
  unregisterShelf: (key: symbol) => void
}

const DASHBOARD_SELECTION_KEY: InjectionKey<DashboardSelectionContext> = Symbol('dashboard-selection')

/**
 * Dashboard-wide select mode. Each shelf loads its own books, so shelves register
 * their book lists here and selection spans every shelf at once. The combined list
 * handed to the bulk-action host is a write-through view: bulk edits and deletes
 * flow back into every shelf that shows the affected book, with no refetch.
 */
export function provideDashboardSelection(): BookSelectionHost {
  const shelves = shallowReactive(new Map<symbol, Ref<BookCard[]>>())
  const selectionMode = ref(false)

  const books = computed<BookCard[]>({
    get() {
      const seen = new Set<number>()
      const all: BookCard[] = []
      for (const shelf of shelves.values()) {
        for (const book of shelf.value) {
          if (seen.has(book.id)) continue
          seen.add(book.id)
          all.push(book)
        }
      }
      return all
    },
    set(next) {
      const byId = new Map(next.map((book) => [book.id, book]))
      for (const shelf of shelves.values()) {
        shelf.value = shelf.value.filter((book) => byId.has(book.id)).map((book) => byId.get(book.id)!)
      }
    },
  })

  const host = useBookSelectionHost({ books, selectionMode })

  function isShelfSelected(shelfBooks: BookCard[]): boolean {
    return shelfBooks.length > 0 && shelfBooks.every((book) => host.selectedIds.value.has(book.id))
  }

  function toggleShelf(shelfBooks: BookCard[]): void {
    const ids = shelfBooks.map((book) => book.id)
    if (isShelfSelected(shelfBooks)) {
      host.deselectAll(ids)
      return
    }
    // selectAll() replaces the selection, so merge to keep picks from other shelves.
    host.selectAll([...new Set([...host.selectedIds.value, ...ids])])
  }

  provide(DASHBOARD_SELECTION_KEY, {
    selectionMode,
    isSelected: host.isSelected,
    handleSelect: host.handleSelect,
    isShelfSelected,
    toggleShelf,
    registerShelf: (key, shelfBooks) => shelves.set(key, shelfBooks),
    unregisterShelf: (key) => shelves.delete(key),
  })

  return host
}

/** Shelves call this; returns null when rendered outside the dashboard. */
export function useDashboardSelection(): DashboardSelectionContext | null {
  return inject(DASHBOARD_SELECTION_KEY, null)
}
