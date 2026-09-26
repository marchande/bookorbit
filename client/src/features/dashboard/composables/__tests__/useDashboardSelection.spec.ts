import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import type { BookCard } from '@bookorbit/types'
import { provideDashboardSelection, useDashboardSelection } from '../useDashboardSelection'
import type { BookSelectionHost } from '@/features/book/composables/useBookSelectionHost'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn<(to: unknown) => void>() }),
}))

vi.mock('@/features/book/composables/useBookNavigation', () => ({
  useBookNavigation: () => ({ setBookContext: vi.fn<(ids: number[], total: number) => void>() }),
}))

vi.mock('@/features/book/composables/useTableViewControls', () => ({
  useTableViewControls: () => ({ tableRef: { value: null } }),
}))

function book(id: number, title = `Book ${id}`): BookCard {
  return { id, title, authors: [] } as unknown as BookCard
}

function setup(shelfContents: BookCard[][]) {
  const shelves = shelfContents.map((books) => ref(books))
  let host!: BookSelectionHost
  let ctx!: NonNullable<ReturnType<typeof useDashboardSelection>>

  const Shelves = defineComponent({
    setup() {
      ctx = useDashboardSelection()!
      shelves.forEach((shelf) => ctx.registerShelf(Symbol('shelf'), shelf))
      return () => h('div')
    },
  })
  const Dashboard = defineComponent({
    setup() {
      host = provideDashboardSelection()
      return () => h(Shelves)
    },
  })
  mount(Dashboard)
  return { shelves, host, ctx }
}

describe('provideDashboardSelection', () => {
  it('combines every shelf into one de-duplicated book list', () => {
    const { host } = setup([
      [book(1), book(2)],
      [book(2), book(3)],
    ])
    expect(host.selectableIds.value).toEqual([1, 2, 3])
  })

  it('keeps picks from other shelves when a whole shelf is selected', () => {
    const { host, ctx, shelves } = setup([
      [book(1), book(2)],
      [book(3), book(4)],
    ])
    host.toggleBook(1)

    ctx.toggleShelf(shelves[1]!.value)
    expect([...host.selectedIds.value].sort()).toEqual([1, 3, 4])
    expect(ctx.isShelfSelected(shelves[1]!.value)).toBe(true)

    ctx.toggleShelf(shelves[1]!.value)
    expect([...host.selectedIds.value]).toEqual([1])
  })

  it('writes bulk updates and deletions back into every shelf showing the book', () => {
    const { host, shelves } = setup([
      [book(1), book(2)],
      [book(2), book(3)],
    ])

    // Same shape the bulk actions produce: an updated card for book 2, book 3 deleted.
    host.books.value = [book(1), book(2, 'Renamed')]

    expect(shelves[0]!.value.map((b) => b.title)).toEqual(['Book 1', 'Renamed'])
    expect(shelves[1]!.value.map((b) => b.title)).toEqual(['Renamed'])
  })
})
