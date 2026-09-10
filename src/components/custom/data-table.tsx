import * as React from 'react'
import {
  createExpandedRowModel,
  createFilteredRowModel,
  createGroupedRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFns,
  flexRender,
  sortFns,
  stockFeatures,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Settings2,
} from 'lucide-react'
import type {
  ColumnDef,
  ColumnFiltersState,
  ColumnVisibilityState,
  GroupingState,
  PaginationState,
  Row,
  RowData,
  RowSelectionState,
  SortingState,
} from '@tanstack/react-table'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'

export const defaultTableFeatures = tableFeatures({
  ...stockFeatures,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  groupedRowModel: createGroupedRowModel(),
  expandedRowModel: createExpandedRowModel(),
  filterFns,
  sortFns,
})

export type DataTableFeatures = typeof defaultTableFeatures

export type TableColumnDef<TData extends RowData, TValue = any> = ColumnDef<
  DataTableFeatures,
  TData,
  TValue
>

export interface DataTableProps<TData extends RowData> {
  columns: Array<ColumnDef<DataTableFeatures, TData, any>>
  data: Array<TData>

  // Controlled States (Optional for URL/Server sync)
  sorting?: SortingState
  onSortingChange?: React.Dispatch<React.SetStateAction<SortingState>>

  columnFilters?: ColumnFiltersState
  onColumnFiltersChange?: React.Dispatch<
    React.SetStateAction<ColumnFiltersState>
  >

  columnVisibility?: ColumnVisibilityState
  onColumnVisibilityChange?: React.Dispatch<
    React.SetStateAction<ColumnVisibilityState>
  >

  grouping?: GroupingState
  onGroupingChange?: React.Dispatch<React.SetStateAction<GroupingState>>

  rowSelection?: RowSelectionState
  onRowSelectionChange?: React.Dispatch<React.SetStateAction<RowSelectionState>>

  pagination?: PaginationState
  onPaginationChange?: React.Dispatch<React.SetStateAction<PaginationState>>
  pageCount?: number // Required for server-side manual pagination

  // Search Filter Options
  searchPlaceholder?: string
  searchColumnKey?: string
  // Disables the built-in client-side search input, e.g. when search is
  // handled server-side instead.
  disableSearch?: boolean

  // Extra filter controls rendered before the search input
  filterExtra?: React.ReactNode

  // Stable row identifier
  getRowId?: (row: TData) => string

  // Dynamic row class name
  getRowClassName?: (row: Row<DataTableFeatures, TData>) => string | undefined

  // Cursor-based backend pagination (e.g. Convex usePaginatedQuery).
  // When set, the table prefetches the next chunk while the user is on
  // the last locally-loaded page, so tanstack's own getCanNextPage()
  // is already correct by the time "Next" is clicked.
  hasMore?: boolean
  onLoadMore?: () => void

  // Renders skeleton rows instead of data, e.g. while the first page of a
  // server-side query is loading.
  isLoading?: boolean

  // Custom text to show when no results are found.
  emptyText?: string

  // Optional sub-row renderer under each row
  renderSubRow?: (row: Row<DataTableFeatures, TData>) => React.ReactNode
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  sorting: controlledSorting,
  onSortingChange,
  columnFilters: controlledColumnFilters,
  onColumnFiltersChange,
  columnVisibility: controlledColumnVisibility,
  onColumnVisibilityChange,
  grouping: controlledGrouping,
  onGroupingChange,
  rowSelection: controlledRowSelection,
  onRowSelectionChange,
  pagination: controlledPagination,
  onPaginationChange,
  pageCount,
  searchPlaceholder = 'Filter...',
  searchColumnKey,
  disableSearch = false,
  filterExtra,
  getRowId,
  getRowClassName,
  hasMore = false,
  onLoadMore,
  isLoading = false,
  emptyText,
  renderSubRow,
}: DataTableProps<TData>) {
  // Local state fallbacks if properties are not controlled
  const [localSorting, setLocalSorting] = React.useState<SortingState>([])
  const [localColumnFilters, setLocalColumnFilters] =
    React.useState<ColumnFiltersState>([])
  const [localColumnVisibility, setLocalColumnVisibility] =
    React.useState<ColumnVisibilityState>({})
  const [localGrouping, setLocalGrouping] = React.useState<GroupingState>([])
  const [localRowSelection, setLocalRowSelection] =
    React.useState<RowSelectionState>({})
  const [localPagination, setLocalPagination] = React.useState<PaginationState>(
    {
      pageIndex: 0,
      pageSize: 50,
    },
  )

  // Resolve state values and dispatch setters
  const sorting = controlledSorting ?? localSorting
  const setSorting = onSortingChange ?? setLocalSorting

  const columnFilters = controlledColumnFilters ?? localColumnFilters
  const setColumnFilters = onColumnFiltersChange ?? setLocalColumnFilters

  const columnVisibility = controlledColumnVisibility ?? localColumnVisibility
  const setColumnVisibility =
    onColumnVisibilityChange ?? setLocalColumnVisibility

  const grouping = controlledGrouping ?? localGrouping
  const setGrouping = onGroupingChange ?? setLocalGrouping

  const rowSelection = controlledRowSelection ?? localRowSelection
  const setRowSelection = onRowSelectionChange ?? setLocalRowSelection

  const pagination = controlledPagination ?? localPagination
  const setPagination = onPaginationChange ?? setLocalPagination

  // Initialize Headless TanStack Table
  const table = useTable({
    features: defaultTableFeatures,
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      grouping,
      rowSelection,
      pagination,
    },
    // Bind state setters
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGroupingChange: setGrouping,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,

    getRowId,

    // Callers that lift pagination state (e.g. to sync backend page size)
    // handle their own resets; tanstack's built-in auto-reset would otherwise
    // fire a setPagination through the controlled callback on mount/data
    // changes, causing an extra unwanted parent re-render.
    autoResetPageIndex: false,

    // Handle server-side controlled mode overrides
    pageCount: pageCount,
    manualPagination: pageCount !== undefined,
    manualSorting: pageCount !== undefined,
    manualFiltering: pageCount !== undefined,
  })

  // Prefetch the next cursor-paginated chunk while the user is on the
  // last locally-loaded page, so tanstack's own getCanNextPage() is
  // already true by the time they click "Next" — no extra state needed.
  const { pageIndex, pageSize } = pagination
  React.useEffect(() => {
    if (!hasMore) return
    const onLastLoadedPage = (pageIndex + 1) * pageSize >= data.length
    if (onLastLoadedPage) onLoadMore?.()
  }, [hasMore, pageIndex, pageSize, data.length, onLoadMore])

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Top Filter Controls */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2 grow">
          {!disableSearch && searchColumnKey && (
            <Input
              placeholder={searchPlaceholder}
              value={
                (table.getColumn(searchColumnKey)?.getFilterValue() as
                  string | undefined) ?? ''
              }
              onChange={(event) =>
                table
                  .getColumn(searchColumnKey)
                  ?.setFilterValue(event.target.value)
              }
              className="max-w-xs"
            />
          )}
          {filterExtra}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className="ml-auto flex gap-2"
              >
                <Settings2 className="size-4" />
                Columns
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-48">
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => {
                const headerObj = table
                  .getFlatHeaders()
                  .find((h) => h.column.id === column.id)
                const headerContext = headerObj
                  ? headerObj.getContext()
                  : ({
                      column,
                      header: { column, id: column.id } as any,
                      table,
                    } as any)

                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) =>
                      column.toggleVisibility(!!value)
                    }
                  >
                    {typeof column.columnDef.header === 'string' ||
                    typeof column.columnDef.header === 'function'
                      ? flexRender(column.columnDef.header, headerContext)
                      : column.id}
                  </DropdownMenuCheckboxItem>
                )
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Accessible Table Container */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const sortDirection = header.column.getIsSorted()
                  return (
                    <TableHead key={header.id} colSpan={header.colSpan}>
                      {header.isPlaceholder ? null : canSort ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={header.column.getToggleSortingHandler()}
                          className="p-0 h-auto font-medium flex items-center gap-2"
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {sortDirection === 'asc' ? (
                            <ArrowUp className="size-4" />
                          ) : sortDirection === 'desc' ? (
                            <ArrowDown className="size-4" />
                          ) : (
                            <ArrowUpDown className="size-4 opacity-50" />
                          )}
                        </Button>
                      ) : (
                        flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  {columns.map((_col, colIndex) => (
                    <TableCell key={colIndex}>
                      <div className="h-5 w-full max-w-40 animate-pulse rounded-md bg-muted" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <React.Fragment key={row.id}>
                  <TableRow
                    data-state={row.getIsSelected() && 'selected'}
                    className={getRowClassName?.(row)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {cell.getIsGrouped() ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={row.getToggleExpandedHandler()}
                              className="p-0 h-auto font-bold flex items-center gap-2"
                            >
                              {row.getIsExpanded() ? (
                                <ChevronDown className="size-4" />
                              ) : (
                                <ChevronRight className="size-4" />
                              )}
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext(),
                              )}
                              <span>({row.subRows.length})</span>
                            </Button>
                          </>
                        ) : cell.getIsAggregated() ? (
                          flexRender(
                            cell.column.columnDef.aggregatedCell ??
                              cell.column.columnDef.cell,
                            cell.getContext(),
                          )
                        ) : cell.getIsPlaceholder() ? null : (
                          flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                  {renderSubRow && (
                    <TableRow
                      key={`${row.id}-subrow`}
                      className="bg-muted/20 hover:bg-muted/30 border-b"
                    >
                      <TableCell
                        colSpan={row.getVisibleCells().length}
                        className="py-2.5 px-4"
                      >
                        {renderSubRow(row)}
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  {emptyText ?? 'No results.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Bottom Selection Count & Pagination Controls */}
      <div className="flex flex-col lg:flex-row gap-4 items-center justify-between text-sm text-muted-foreground">
        <div className="flex-1">
          {table.getFilteredSelectedRowModel().rows.length} of{' '}
          {table.getFilteredRowModel().rows.length} row(s) selected.
        </div>
        <div className="flex flex-col lg:flex-row items-center gap-4">
          <div className="flex items-center gap-2">
            <span>Show</span>
            <Select
              value={table.state.pagination.pageSize.toString()}
              onValueChange={(value) => table.setPageSize(Number(value))}
            >
              <SelectTrigger className="w-16">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[50, 100, 150, 200].map((size) => (
                  <SelectItem key={size} value={size.toString()}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="flex gap-1"
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <div className="flex items-center gap-1 font-medium text-foreground px-2">
              Page {table.state.pagination.pageIndex + 1} of{' '}
              {table.getPageCount() || 1}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="flex gap-1"
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
