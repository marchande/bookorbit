import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { useRouter } from 'vue-router'
import type { BookCard } from '@bookorbit/types'
import { useBookTableShell } from './useBookTableShell'
import { useMoveToLibraryTarget } from './useMoveToLibraryTarget'
import { useBulkEditMetadata, type BulkEditFields } from './useBulkEditMetadata'
import { useBookNavigation } from './useBookNavigation'

interface BookSelectionHostOptions {
  /** Every book the view has loaded; select-all and bulk edit operate on these. */
  books: Ref<BookCard[]>
  selectionMode?: Ref<boolean>
  /** Called after an action that changed book data (bulk edit, move) so the view can reload. */
  onBooksChanged?: () => void
}

/**
 * Selection + bulk-action state for views that list books but are not one of the
 * table-capable views (library, collection, smart scope): series detail, author
 * detail, and the dashboard. Pairs with `BookSelectionHost.vue`, which renders the
 * action bar and its dialogs from this state.
 */
export function useBookSelectionHost({ books, selectionMode = ref(false), onBooksChanged }: BookSelectionHostOptions) {
  const router = useRouter()
  const { setBookContext } = useBookNavigation()

  const shell = useBookTableShell({
    books,
    selectionMode,
    onMoveToLibrary: (bookId) => move.openForBook(bookId),
  })

  const move = useMoveToLibraryTarget({
    getSelectionPayload: () => ({ bookIds: [...shell.selectedIds.value] }),
    selectedCount: shell.selectedCount,
  })

  const bulkEdit = useBulkEditMetadata(shell.selectedIds, books)

  const selectableIds = computed(() => books.value.filter((book) => !book.collapsedSeries).map((book) => book.id))
  const allSelected = computed(() => selectableIds.value.length > 0 && selectableIds.value.every((id) => shell.selectedIds.value.has(id)))

  function toggleSelectAll(): void {
    if (allSelected.value) shell.deselectAll(selectableIds.value)
    else shell.selectAll(selectableIds.value)
  }

  function editSelected(): void {
    const count = shell.selectedIds.value.size
    if (count === 0) return
    if (count >= 2) {
      shell.bulkEditOpen.value = true
      return
    }
    const ids = [...shell.selectedIds.value]
    setBookContext(ids, ids.length)
    router.push({ name: 'book-detail', params: { bookId: ids[0] }, query: { tab: 'edit' } })
    shell.exitSelectionMode()
  }

  async function confirmBulkEdit(fields: BulkEditFields): Promise<void> {
    const result = await bulkEdit.submit(fields)
    if (!result) return
    shell.bulkEditOpen.value = false
    onBooksChanged?.()
  }

  function handleBooksMoved(): void {
    shell.exitSelectionMode()
    onBooksChanged?.()
  }

  return {
    ...shell,
    books,
    move,
    bulkEditSubmitting: bulkEdit.submitting,
    bulkEditCount: bulkEdit.selectedCount,
    selectableIds,
    allSelected,
    toggleSelectAll,
    editSelected,
    confirmBulkEdit,
    handleBooksMoved,
  }
}

export type BookSelectionHost = ReturnType<typeof useBookSelectionHost>
