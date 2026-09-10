import { describe, expect, test } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DataTable } from './data-table'
import type { TableColumnDef } from './data-table'

interface TestData {
  id: string
  name: string
  role: string
}

const columns: Array<TableColumnDef<TestData>> = [
  {
    accessorKey: 'name',
    header: 'Name',
  },
  {
    accessorKey: 'role',
    header: 'Role',
  },
]

const testData: Array<TestData> = [
  { id: '1', name: 'Alice', role: 'Admin' },
  { id: '2', name: 'Bob', role: 'User' },
  { id: '3', name: 'Charlie', role: 'Guest' },
]

describe('DataTable component', () => {
  test('renders headers and data rows successfully', () => {
    render(<DataTable columns={columns} data={testData} />)

    // Verify headers
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Role')).toBeInTheDocument()

    // Verify rows
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('Charlie')).toBeInTheDocument()
  })

  test('renders skeleton rows instead of data when isLoading is set', () => {
    render(<DataTable columns={columns} data={testData} isLoading />)

    expect(screen.queryByText('Alice')).not.toBeInTheDocument()
    expect(screen.queryByText('No results.')).not.toBeInTheDocument()
    expect(document.querySelectorAll('tbody tr')).toHaveLength(5)
  })

  test('performs column filtering based on search input', () => {
    render(
      <DataTable
        columns={columns}
        data={testData}
        searchColumnKey="name"
        searchPlaceholder="Search name..."
      />,
    )

    const searchInput = screen.getByPlaceholderText('Search name...')
    expect(searchInput).toBeInTheDocument()

    // Filter for "Alice"
    fireEvent.change(searchInput, { target: { value: 'Alice' } })

    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.queryByText('Bob')).not.toBeInTheDocument()
    expect(screen.queryByText('Charlie')).not.toBeInTheDocument()
  })

  test('hides the search input when disableSearch is set', () => {
    render(
      <DataTable
        columns={columns}
        data={testData}
        searchColumnKey="name"
        searchPlaceholder="Search name..."
        disableSearch
      />,
    )

    expect(
      screen.queryByPlaceholderText('Search name...'),
    ).not.toBeInTheDocument()
  })

  test('shows empty state when no results match', () => {
    render(
      <DataTable
        columns={columns}
        data={testData}
        searchColumnKey="name"
        searchPlaceholder="Search name..."
      />,
    )

    const searchInput = screen.getByPlaceholderText('Search name...')
    fireEvent.change(searchInput, { target: { value: 'Zack' } })

    expect(screen.getByText('No results.')).toBeInTheDocument()
  })

  test('renders page size selector with default value of 50', () => {
    render(<DataTable columns={columns} data={testData} />)
    expect(screen.getByText('Show')).toBeInTheDocument()
    expect(screen.getByText('50')).toBeInTheDocument()
  })

  test('toggles column visibility via the Columns dropdown menu', () => {
    render(<DataTable columns={columns} data={testData} />)

    fireEvent.click(screen.getByRole('button', { name: /Columns/i }))

    const nameCheckboxItem = screen.getByRole('menuitemcheckbox', {
      name: 'Name',
    })
    expect(nameCheckboxItem).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(nameCheckboxItem)

    // Column header should disappear once hidden
    expect(
      screen.queryByRole('columnheader', { name: 'Name' }),
    ).not.toBeInTheDocument()
  })

  test('renders function headers in the Columns dropdown menu', () => {
    const fnColumns: Array<TableColumnDef<TestData>> = [
      {
        accessorKey: 'name',
        header: () => 'Custom Name Header',
      },
      {
        accessorKey: 'role',
        header: ({ header }) => `Role: ${header.column.id}`,
      },
      {
        accessorKey: 'id',
      },
    ]
    render(<DataTable columns={fnColumns} data={testData} />)

    fireEvent.click(screen.getByRole('button', { name: /Columns/i }))

    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Custom Name Header' }),
    ).toBeInTheDocument()

    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Role: role' }),
    ).toBeInTheDocument()

    expect(
      screen.getByRole('menuitemcheckbox', { name: 'id' }),
    ).toBeInTheDocument()
  })

  test('changes page size when a new value is selected from the Show dropdown', () => {
    const manyRows: Array<TestData> = Array.from({ length: 120 }, (_, i) => ({
      id: String(i),
      name: `Row ${i}`,
      role: 'User',
    }))
    render(<DataTable columns={columns} data={manyRows} />)

    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByRole('option', { name: '100' }))

    expect(screen.getByText('100')).toBeInTheDocument()
  })

  test('navigates to the next and previous page using pagination buttons', () => {
    const manyRows: Array<TestData> = Array.from({ length: 120 }, (_, i) => ({
      id: String(i),
      name: `Row ${i}`,
      role: 'User',
    }))
    render(<DataTable columns={columns} data={manyRows} />)

    const prevButton = screen.getByRole('button', { name: /Previous/i })
    const nextButton = screen.getByRole('button', { name: /Next/i })

    expect(prevButton).toBeDisabled()
    expect(nextButton).not.toBeDisabled()
    expect(screen.getByText(/Page 1 of/)).toBeInTheDocument()

    fireEvent.click(nextButton)
    expect(screen.getByText(/Page 2 of/)).toBeInTheDocument()
    expect(prevButton).not.toBeDisabled()

    fireEvent.click(prevButton)
    expect(screen.getByText(/Page 1 of/)).toBeInTheDocument()
    expect(prevButton).toBeDisabled()
  })

  test('disables next page button when there is only a single page', () => {
    render(<DataTable columns={columns} data={testData} />)

    const nextButton = screen.getByRole('button', { name: /Next/i })
    expect(nextButton).toBeDisabled()
  })

  test('excludes columns with enableHiding: false from the Columns dropdown menu', () => {
    const colsWithNonHideable: Array<TableColumnDef<TestData>> = [
      {
        accessorKey: 'name',
        header: 'Name',
      },
      {
        id: 'actions',
        header: 'Actions',
        enableHiding: false,
      },
    ]

    render(<DataTable columns={colsWithNonHideable} data={testData} />)

    fireEvent.click(screen.getByRole('button', { name: /Columns/i }))

    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Name' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('menuitemcheckbox', { name: 'Actions' }),
    ).not.toBeInTheDocument()
  })

  test('applies custom row className when getRowClassName is provided', () => {
    render(
      <DataTable
        columns={columns}
        data={testData}
        getRowClassName={(row) =>
          row.original.role === 'Admin' ? 'bg-red-50' : undefined
        }
      />,
    )

    const adminRow = screen.getByText('Alice').closest('tr')
    const userRow = screen.getByText('Bob').closest('tr')

    expect(adminRow).toHaveClass('bg-red-50')
    expect(userRow).not.toHaveClass('bg-red-50')
  })

  test('renders sub-rows when renderSubRow is provided', () => {
    render(
      <DataTable
        columns={columns}
        data={testData}
        renderSubRow={(row) => (
          <div data-testid={`subrow-${row.original.id}`}>
            Details for {row.original.name}
          </div>
        )}
      />,
    )

    expect(screen.getByTestId('subrow-1')).toHaveTextContent(
      'Details for Alice',
    )
    expect(screen.getByTestId('subrow-2')).toHaveTextContent('Details for Bob')
  })
})
