import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { useMutation } from 'convex/react'
import { Route } from './change-password'
import { useAuth } from '~/lib/auth'

const mockUser = {
  _id: 'user123',
  loginId: 'CAT-GLV0001',
  memberId: 'GLV0001',
  fullName: 'Nguyễn Văn A',
  role: 'user',
} as any

function setupAuth(overrides: Partial<ReturnType<typeof useAuth>> = {}) {
  vi.mocked(useAuth).mockReturnValue({
    login: vi.fn(),
    logout: vi.fn(),
    user: mockUser,
    ...overrides,
  })
}

describe('ChangePasswordPage component', () => {
  test('renders input fields and submit button successfully', () => {
    setupAuth()
    const ChangePasswordComponent = (Route as any).options.component
    render(<ChangePasswordComponent />)

    expect(screen.getByLabelText('password.current')).toBeInTheDocument()
    expect(screen.getByLabelText('password.new')).toBeInTheDocument()
    expect(screen.getByLabelText('password.confirm')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'password.submit' }),
    ).toBeInTheDocument()
  })

  test('renders page header title', () => {
    setupAuth()
    const ChangePasswordComponent = (Route as any).options.component
    render(<ChangePasswordComponent />)
    expect(screen.getByText('password.title')).toBeInTheDocument()
  })

  test('submit button starts enabled', () => {
    setupAuth()
    const ChangePasswordComponent = (Route as any).options.component
    render(<ChangePasswordComponent />)
    expect(
      screen.getByRole('button', { name: 'password.submit' }),
    ).not.toBeDisabled()
  })

  test('calls changePasswordMutation when form is submitted with values', async () => {
    setupAuth()
    const mockChangePw = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useMutation).mockReturnValue(mockChangePw as any)

    const ChangePasswordComponent = (Route as any).options.component
    render(<ChangePasswordComponent />)

    fireEvent.change(screen.getByLabelText('password.current'), {
      target: { value: 'oldPass1' },
    })
    fireEvent.change(screen.getByLabelText('password.new'), {
      target: { value: 'newPass2' },
    })
    fireEvent.change(screen.getByLabelText('password.confirm'), {
      target: { value: 'newPass2' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'password.submit' }))

    await waitFor(() => {
      expect(mockChangePw).toHaveBeenCalledWith({
        loginId: 'CAT-GLV0001',
        oldPassword: 'oldPass1',
        newPassword: 'newPass2',
      })
    })
  })

  test('all three input fields are of type password', () => {
    setupAuth()
    const ChangePasswordComponent = (Route as any).options.component
    render(<ChangePasswordComponent />)

    const inputs = screen
      .getAllByDisplayValue('')
      .filter((el) => (el as HTMLInputElement).type === 'password')
    expect(inputs.length).toBeGreaterThanOrEqual(3)
  })

  test('shows required error when currentPassword is submitted empty', async () => {
    setupAuth()
    const ChangePasswordComponent = (Route as any).options.component
    render(<ChangePasswordComponent />)

    fireEvent.click(screen.getByRole('button', { name: 'password.submit' }))

    await waitFor(() => {
      expect(screen.getByText('password.current.required')).toBeInTheDocument()
    })
  })

  test('shows min length error when newPassword is too short on submit', async () => {
    setupAuth()
    const ChangePasswordComponent = (Route as any).options.component
    render(<ChangePasswordComponent />)

    const newPasswordInput = screen.getByLabelText('password.new')
    fireEvent.change(newPasswordInput, { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: 'password.submit' }))

    await waitFor(() => {
      expect(screen.getByText('password.new.min')).toBeInTheDocument()
    })
  })

  test('shows mismatch error when confirmPassword differs from newPassword on submit', async () => {
    setupAuth()
    const ChangePasswordComponent = (Route as any).options.component
    render(<ChangePasswordComponent />)

    fireEvent.change(screen.getByLabelText('password.new'), {
      target: { value: 'newPassword1' },
    })
    const confirmInput = screen.getByLabelText('password.confirm')
    fireEvent.change(confirmInput, { target: { value: 'differentPass' } })
    fireEvent.click(screen.getByRole('button', { name: 'password.submit' }))

    await waitFor(() => {
      expect(screen.getByText('password.confirm.mismatch')).toBeInTheDocument()
    })
  })

  test('does not show mismatch error when confirmPassword matches newPassword', async () => {
    setupAuth()
    const ChangePasswordComponent = (Route as any).options.component
    render(<ChangePasswordComponent />)

    fireEvent.change(screen.getByLabelText('password.current'), {
      target: { value: 'oldPass1' },
    })
    fireEvent.change(screen.getByLabelText('password.new'), {
      target: { value: 'matchingPass1' },
    })
    const confirmInput = screen.getByLabelText('password.confirm')
    fireEvent.change(confirmInput, { target: { value: 'matchingPass1' } })
    fireEvent.click(screen.getByRole('button', { name: 'password.submit' }))

    await waitFor(() => {
      expect(
        screen.queryByText('password.confirm.mismatch'),
      ).not.toBeInTheDocument()
    })
  })

  test('shows toast error with mutation error message when submit rejects', async () => {
    setupAuth()
    const mockChangePw = vi
      .fn()
      .mockRejectedValue(new Error('Invalid current password'))
    vi.mocked(useMutation).mockReturnValue(mockChangePw as any)
    const toastErrorSpy = vi.spyOn(toast, 'error')

    const ChangePasswordComponent = (Route as any).options.component
    render(<ChangePasswordComponent />)

    fireEvent.change(screen.getByLabelText('password.current'), {
      target: { value: 'oldPass1' },
    })
    fireEvent.change(screen.getByLabelText('password.new'), {
      target: { value: 'newPass2' },
    })
    fireEvent.change(screen.getByLabelText('password.confirm'), {
      target: { value: 'newPass2' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'password.submit' }))

    await waitFor(() => {
      expect(toastErrorSpy).toHaveBeenCalledWith('Invalid current password')
    })
  })

  test('shows toast error with stringified value when rejection is not an Error instance', async () => {
    setupAuth()
    const mockChangePw = vi.fn().mockRejectedValue('some string failure')
    vi.mocked(useMutation).mockReturnValue(mockChangePw as any)
    const toastErrorSpy = vi.spyOn(toast, 'error')

    const ChangePasswordComponent = (Route as any).options.component
    render(<ChangePasswordComponent />)

    fireEvent.change(screen.getByLabelText('password.current'), {
      target: { value: 'oldPass1' },
    })
    fireEvent.change(screen.getByLabelText('password.new'), {
      target: { value: 'newPass2' },
    })
    fireEvent.change(screen.getByLabelText('password.confirm'), {
      target: { value: 'newPass2' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'password.submit' }))

    await waitFor(() => {
      expect(toastErrorSpy).toHaveBeenCalledWith('some string failure')
    })
  })

  test('shows all validation errors when submitting with empty/invalid fields without blurring first', async () => {
    setupAuth()
    const mockChangePw = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useMutation).mockReturnValue(mockChangePw as any)

    const ChangePasswordComponent = (Route as any).options.component
    render(<ChangePasswordComponent />)

    fireEvent.change(screen.getByLabelText('password.new'), {
      target: { value: 'short' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'password.submit' }))

    await waitFor(() => {
      expect(screen.getByText('password.current.required')).toBeInTheDocument()
      expect(screen.getByText('password.new.min')).toBeInTheDocument()
    })
    expect(mockChangePw).not.toHaveBeenCalled()
  })

  test('submitting with valid current/new but no confirm shows mismatch error on submit', async () => {
    setupAuth()
    const mockChangePw = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useMutation).mockReturnValue(mockChangePw as any)

    const ChangePasswordComponent = (Route as any).options.component
    render(<ChangePasswordComponent />)

    fireEvent.change(screen.getByLabelText('password.current'), {
      target: { value: 'oldPass1' },
    })
    fireEvent.change(screen.getByLabelText('password.new'), {
      target: { value: 'newPassword1' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'password.submit' }))

    await waitFor(() => {
      expect(screen.getByText('password.confirm.mismatch')).toBeInTheDocument()
    })
    expect(mockChangePw).not.toHaveBeenCalled()
  })

  test('renders force change password alert when user.mustChangePassword is true', () => {
    setupAuth({
      user: { ...mockUser, mustChangePassword: true },
    })
    const ChangePasswordComponent = (Route as any).options.component
    render(<ChangePasswordComponent />)

    expect(screen.getByText('password.force.title')).toBeInTheDocument()
    expect(screen.getByText('password.force.description')).toBeInTheDocument()
  })

  test('calls markPasswordChanged on successful password change', async () => {
    const markPasswordChangedMock = vi.fn()
    setupAuth({ markPasswordChanged: markPasswordChangedMock })
    const mockChangePw = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useMutation).mockReturnValue(mockChangePw as any)

    const ChangePasswordComponent = (Route as any).options.component
    render(<ChangePasswordComponent />)

    fireEvent.change(screen.getByLabelText('password.current'), {
      target: { value: 'oldPass1' },
    })
    fireEvent.change(screen.getByLabelText('password.new'), {
      target: { value: 'newPass2' },
    })
    fireEvent.change(screen.getByLabelText('password.confirm'), {
      target: { value: 'newPass2' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'password.submit' }))

    await waitFor(() => {
      expect(markPasswordChangedMock).toHaveBeenCalled()
    })
  })
})
