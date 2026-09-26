<script setup lang="ts">
import { reactive } from 'vue'
import type { BookCard } from '@bookorbit/types'
import SelectionActionBar from '@/components/SelectionActionBar.vue'
import AddToCollectionSheet from '@/features/collection/components/AddToCollectionSheet.vue'
import MoveToLibrarySheet from '@/features/book/components/MoveToLibrarySheet.vue'
import BulkEditMetadataDialog from '@/features/book/components/BulkEditMetadataDialog.vue'
import SendBookDialog from '@/features/email/components/SendBookDialog.vue'
import DeleteBookDialog from '@/features/book/components/DeleteBookDialog.vue'
import BookQuickView from '@/features/book/components/BookQuickView.vue'
import type { BookSelectionHost } from '@/features/book/composables/useBookSelectionHost'

// Renders the selection action bar plus every dialog it can open, driven by the
// state from `useBookSelectionHost`, so views outside the table-capable pages get
// the same bulk actions without re-wiring each dialog by hand.
const props = withDefaults(
  defineProps<{
    host: BookSelectionHost
    // Views that already own single-book quick view / delete dialogs pass false to avoid duplicates.
    includeBookDialogs?: boolean
  }>(),
  { includeBookDialogs: true },
)

// Unwraps the host's refs for template use; writes go back through to those refs.
const h = reactive(props.host)
</script>

<template>
  <BookQuickView
    v-if="includeBookDialogs"
    :book-id="h.quickViewBookId"
    :open="h.quickViewOpen"
    @update:open="h.quickViewOpen = $event"
    @action="h.quickViewBookId !== null && h.handleBookAction({ id: h.quickViewBookId } as BookCard, $event)"
  />

  <SelectionActionBar
    :visible="h.selectionMode"
    :count="h.selectedCount"
    :in-flight="h.inFlight"
    select-all-available
    :all-selected="h.allSelected"
    hide-export-metadata
    @toggle-select-all="h.toggleSelectAll()"
    @send="h.sendBookOpen = true"
    @download="h.handleDownloadFiles"
    @add-to-collection="h.addToCollectionOpen = true"
    @edit="h.editSelected()"
    @edit-individually="h.handleEditIndividually()"
    @refresh-metadata="h.handleBulkRefreshMetadata"
    @re-extract-cover="h.handleBulkReExtractCover"
    @set-status="h.handleBulkSetStatus"
    @set-rating="h.handleBulkSetRating"
    @set-field="h.handleBulkSetField"
    @lock-metadata="h.handleBulkSetMetadataLock"
    @delete="h.handleDeleteSelected"
    @move-to-library="h.move.openForSelection()"
    @exit="h.exitSelectionMode()"
  />

  <AddToCollectionSheet
    :open="h.addToCollectionOpen"
    :selection-payload="{ bookIds: [...h.selectedIds] }"
    :selected-count="h.selectedCount"
    @update:open="h.addToCollectionOpen = $event"
    @done="h.exitSelectionMode()"
  />

  <MoveToLibrarySheet
    :open="h.move.open"
    :selection-payload="h.move.payload"
    :selected-count="h.move.count"
    @update:open="h.move.setOpen($event)"
    @moved="h.handleBooksMoved()"
  />

  <BulkEditMetadataDialog
    :open="h.bulkEditOpen"
    :book-count="h.bulkEditCount"
    :submitting="h.bulkEditSubmitting"
    @update:open="h.bulkEditOpen = $event"
    @confirm="h.confirmBulkEdit"
  />

  <SendBookDialog
    :open="h.sendBookOpen"
    :selection-payload="{ bookIds: [...h.selectedIds] }"
    :selected-count="h.selectedCount"
    @update:open="h.sendBookOpen = $event"
    @sent="h.exitSelectionMode()"
  />

  <DeleteBookDialog
    v-if="includeBookDialogs"
    :open="h.deleteBookId !== null"
    :deleting="h.deletingBook"
    @confirm="h.confirmDelete"
    @cancel="h.cancelDelete"
  />
</template>
