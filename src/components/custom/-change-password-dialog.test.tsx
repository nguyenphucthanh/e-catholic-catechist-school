import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { useMutation } from 'convex/react'
import { ChangePasswordDialog } from './change-password-dialog'
import { useAuth } from '~/lib/auth'

const mockStudent = {
  userDocId: 'student123',
  loginId: 'HS0001',
  memberId: 'HS0001',
  fullName: 'Trần Thị B',
  accountType: 'student' as const,
  role: null,
  mustChangePassword: true,
}

function setupAuth(overrides: Partial<ReturnType<typeof useAuth>> = {}) {
  vi.mocked(useAuth).mockReturnValue({
    login: vi.fn(),
    logout: vi.fn(),
    markPasswordChanged: vi.fn(),
    user: mockStudent,
    ...overrides,
  })
}

describe('ChangePasswordDialog component', () => {
  test('renders dialog content when open', () => {
    setupAuth()
    render(<ChangePasswordDialog open={true} onOpenChange={vi.fn()} />)

    expect(screen.getByText('password.recommend.title')).toBeInTheDocument()
    expect(
      screen.getByText('password.recommend.description'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('password.current')).toBeInTheDocument()
    expect(screen.getByLabelText('password.new')).toBeInTheDocument()
    expect(screen.getByLabelText('password.confirm')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'password.recommend.changeNow' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'password.recommend.remindLater' }),
    ).toBeInTheDocument()
  })

  test('calls onOpenChange(false) when clicking remind later', () => {
    setupAuth()
    const onOpenChangeMock = vi.fn()
    render(<ChangePasswordDialog open={true} onOpenChange={onOpenChangeMock} />)

    fireEvent.click(
      screen.getByRole('button', { name: 'password.recommend.remindLater' }),
    )
    expect(onOpenChangeMock).toHaveBeenCalledWith(false)
  })

  test('submits successfully and calls markPasswordChanged', async () => {
    const markPasswordChangedMock = vi.fn()
    setupAuth({ markPasswordChanged: markPasswordChangedMock })
    const mockChangePw = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useMutation).mockReturnValue(mockChangePw as any)
    const onOpenChangeMock = vi.fn()

    render(<ChangePasswordDialog open={true} onOpenChange={onOpenChangeMock} />)

    fireEvent.change(screen.getByLabelText('password.current'), {
      target: { value: 'oldPass123' },
    })
    fireEvent.change(screen.getByLabelText('password.new'), {
      target: { value: 'newPass1234' },
    })
    fireEvent.change(screen.getByLabelText('password.confirm'), {
      target: { value: 'newPass1234' },
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'password.recommend.changeNow' }),
    )

    await waitFor(() => {
      expect(mockChangePw).toHaveBeenCalledWith({
        loginId: 'HS0001',
        oldPassword: 'oldPass123',
        newPassword: 'newPass1234',
      })
    })

    expect(markPasswordChangedMock).toHaveBeenCalled()
    expect(onOpenChangeMock).toHaveBeenCalledWith(false)
  })

  test('handles mutation failure gracefully', async () => {
    setupAuth()
    const mockChangePw = vi
      .fn()
      .mockRejectedValue(new Error('Wrong old password'))
    vi.mocked(useMutation).mockReturnValue(mockChangePw as any)
    const toastErrorSpy = vi.spyOn(toast, 'error').mockImplementation(() => '')
    const onOpenChangeMock = vi.fn()

    render(<ChangePasswordDialog open={true} onOpenChange={onOpenChangeMock} />)

    fireEvent.change(screen.getByLabelText('password.current'), {
      target: { value: 'wrongPass' },
    })
    fireEvent.change(screen.getByLabelText('password.new'), {
      target: { value: 'newPass1234' },
    })
    fireEvent.change(screen.getByLabelText('password.confirm'), {
      target: { value: 'newPass1234' },
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'password.recommend.changeNow' }),
    )

    await waitFor(() => {
      expect(toastErrorSpy).toHaveBeenCalledWith('Wrong old password')
    })

    expect(onOpenChangeMock).not.toHaveBeenCalledWith(false)
  })

  test('validates form before submitting', async () => {
    setupAuth()
    const mockChangePw = vi.fn()
    vi.mocked(useMutation).mockReturnValue(mockChangePw as any)

    render(<ChangePasswordDialog open={true} onOpenChange={vi.fn()} />)

    fireEvent.click(
      screen.getByRole('button', { name: 'password.recommend.changeNow' }),
    )

    await waitFor(() => {
      expect(screen.getByText('password.current.required')).toBeInTheDocument()
      expect(screen.getByText('password.new.min')).toBeInTheDocument()
    })
    expect(mockChangePw).not.toHaveBeenCalled()
  })
})
