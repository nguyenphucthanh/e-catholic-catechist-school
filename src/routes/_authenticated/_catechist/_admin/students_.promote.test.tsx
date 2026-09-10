import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { Route } from './students_.promote'
import { useAuth } from '~/lib/auth'

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const PromotePageComponent = (Route as any).options.component

describe('PromoteStudentsPage', () => {
  const mockEnrollMutation = vi.fn().mockResolvedValue({})

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({
      login: vi.fn(),
      logout: vi.fn(),
      user: { userDocId: 'catechist1' } as any,
    })
    vi.mocked(useMutation).mockReturnValue(mockEnrollMutation as any)
  })

  function mockQueries({
    academicYears = [
      { _id: 'year1', name: '2023-2024', isActive: false },
      { _id: 'year2', name: '2024-2025', isActive: true },
    ],
    activeYear = { _id: 'year2', name: '2024-2025', isActive: true },
    sourceClassYears = [{ classYearId: 'cy-source', className: 'Au Nhi 1' }],
    targetClassYears = [{ classYearId: 'cy-target', className: 'Au Nhi 2' }],
    roster = [
      {
        studentClassId: 'sc1',
        studentId: 's1',
        studentCode: 'STD001',
        fullName: 'Nguyen Van An',
        saintName: 'Giuse',
        gender: 'male',
        alreadyEnrolledInTargetYear: false,
        annualResult: {
          _id: 'ar1',
          conductGrade: 'excellent',
          remark: 'Chăm ngoan học giỏi',
          isCompleted: true,
        },
      },
      {
        studentClassId: 'sc2',
        studentId: 's2',
        studentCode: 'STD002',
        fullName: 'Tran Thi Binh',
        saintName: 'Maria',
        gender: 'female',
        alreadyEnrolledInTargetYear: false,
        annualResult: {
          _id: 'ar2',
          conductGrade: 'poor',
          remark: 'Nghỉ nhiều, chưa đạt',
          isCompleted: false,
        },
      },
      {
        studentClassId: 'sc3',
        studentId: 's3',
        studentCode: 'STD003',
        fullName: 'Le Van Cuong',
        saintName: 'Phero',
        gender: 'male',
        alreadyEnrolledInTargetYear: false,
        annualResult: null,
      },
    ],
  }: {
    academicYears?: Array<any>
    activeYear?: any
    sourceClassYears?: Array<any>
    targetClassYears?: Array<any>
    roster?: Array<any>
  } = {}) {
    vi.mocked(useQuery).mockImplementation(((fnRef: any, args: any) => {
      const path = fnRef?.[Symbol.for('functionName')]
      if (path === 'academicYears:list') return academicYears
      if (path === 'academicYears:getActive') return activeYear
      if (path === 'classes:listClassYears') {
        if (args?.academicYearId === 'year1') return sourceClassYears
        if (args?.academicYearId === 'year2') return targetClassYears
        return []
      }
      if (path === 'students:getEligibleForTransfer') {
        if (args === 'skip') return undefined
        return roster
      }
      return undefined
    }) as any)
  }

  test('renders page and prompts to select source class', () => {
    mockQueries()
    render(<PromotePageComponent />)

    expect(screen.getByText('students.promote.title')).toBeInTheDocument()
    expect(
      screen.getByText('students.promote.selectSourceClassPrompt'),
    ).toBeInTheDocument()
  })

  test('displays evaluation badges and remarks under each student row when roster loaded', async () => {
    mockQueries()
    render(<PromotePageComponent />)

    // Select source year
    const selects = screen.getAllByRole('combobox')
    fireEvent.click(selects[0])
    const yearOption = await screen.findByRole('option', { name: '2023-2024' })
    fireEvent.click(yearOption)

    // Select source class
    fireEvent.click(selects[1])
    const classOption = await screen.findByRole('option', { name: 'Au Nhi 1' })
    fireEvent.click(classOption)

    // Verify student names are rendered
    expect(await screen.findByText('Nguyen Van An')).toBeInTheDocument()
    expect(screen.getByText('Tran Thi Binh')).toBeInTheDocument()
    expect(screen.getByText('Le Van Cuong')).toBeInTheDocument()

    // Verify evaluations are rendered under rows
    expect(screen.getByText('students.promote.eval.passed')).toBeInTheDocument()
    expect(screen.getByText('students.promote.eval.failed')).toBeInTheDocument()
    expect(
      screen.getByText('students.promote.eval.notEvaluated'),
    ).toBeInTheDocument()

    // Verify conduct grades and remarks
    expect(
      screen.getByText('evaluations.morality.excellent'),
    ).toBeInTheDocument()
    expect(screen.getByText('evaluations.morality.poor')).toBeInTheDocument()
    expect(screen.getByText('"Chăm ngoan học giỏi"')).toBeInTheDocument()
    expect(screen.getByText('"Nghỉ nhiều, chưa đạt"')).toBeInTheDocument()
  })

  test('selecting only eligible students using selectPassedOnly button', async () => {
    mockQueries()
    render(<PromotePageComponent />)

    const selects = screen.getAllByRole('combobox')
    fireEvent.click(selects[0])
    fireEvent.click(await screen.findByRole('option', { name: '2023-2024' }))

    fireEvent.click(selects[1])
    fireEvent.click(await screen.findByRole('option', { name: 'Au Nhi 1' }))

    await screen.findByText('Nguyen Van An')

    // Click select passed only button
    const selectPassedBtn = screen.getByRole('button', {
      name: /students\.promote\.selectPassedOnly/i,
    })
    fireEvent.click(selectPassedBtn)

    // Verify selected count is 1 (only student s1 completed)
    expect(
      screen.getByText(/students\.promote\.selectedCount/),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('students.promote.warningIncompleteSelected'),
    ).not.toBeInTheDocument()
  })

  test('displays warning when an incomplete student is selected and submits only selected students', async () => {
    mockQueries()
    render(<PromotePageComponent />)

    const selects = screen.getAllByRole('combobox')
    fireEvent.click(selects[0])
    fireEvent.click(await screen.findByRole('option', { name: '2023-2024' }))

    fireEvent.click(selects[1])
    fireEvent.click(await screen.findByRole('option', { name: 'Au Nhi 1' }))

    // Select target class
    fireEvent.click(selects[2])
    fireEvent.click(await screen.findByRole('option', { name: 'Au Nhi 2' }))

    await screen.findByText('Nguyen Van An')

    // Find checkboxes
    const checkboxes = screen.getAllByRole('checkbox')
    // checkboxes[0] is select-all, checkboxes[1] is s1, checkboxes[2] is s2 (failed)
    fireEvent.click(checkboxes[2])

    // Should display warning about incomplete student being selected
    expect(
      screen.getByText('students.promote.warningIncompleteSelected'),
    ).toBeInTheDocument()

    // Submit promotion
    const submitBtn = screen.getByRole('button', {
      name: 'students.promote.submit',
    })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockEnrollMutation).toHaveBeenCalledWith({
        requesterId: 'catechist1',
        studentIds: ['s2'],
        classYearId: 'cy-target',
        isPrimaryClass: true,
        enrolledDate: expect.any(String),
      })
      expect(toast.success).toHaveBeenCalledWith('students.promote.success')
    })
  })
})
