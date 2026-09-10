import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useLocation, useMatches, useNavigate } from '@tanstack/react-router'
import { Route } from './_authenticated'
import { useAuth } from '~/lib/auth'

// Mock the AppSidebar component to keep tests focused and avoid icon complexity
vi.mock('~/components/app-sidebar', () => ({
  AppSidebar: ({ user, onLogout }: any) => (
    <div data-testid="app-sidebar">
      <span>{user.fullName}</span>
      <button onClick={onLogout}>LogoutButton</button>
    </div>
  ),
}))

vi.mock('~/components/custom/change-password-dialog', () => ({
  ChangePasswordDialog: ({ open }: any) =>
    open ? <div data-testid="change-password-dialog" /> : null,
}))

describe('AuthenticatedLayout component', () => {
  test('redirects to login when user is unauthenticated', () => {
    const navigateMock = vi.fn()
    vi.mocked(useNavigate).mockReturnValue(navigateMock)
    vi.mocked(useAuth).mockReturnValue({
      login: vi.fn(),
      logout: vi.fn(),
      user: null,
    })

    const LayoutComponent = (Route as any).options.component
    const { container } = render(<LayoutComponent />)

    expect(navigateMock).toHaveBeenCalledWith({ to: '/login', replace: true })
    expect(container).toBeEmptyDOMElement()
  })

  test('renders layout with sidebar, outlet, and breadcrumbs when authenticated', () => {
    const mockUser = {
      _id: 'user123',
      memberId: 'GLV0001',
      fullName: 'Nguyễn Văn A',
      role: 'user',
    } as any

    vi.mocked(useAuth).mockReturnValue({
      login: vi.fn(),
      logout: vi.fn(),
      user: mockUser,
    })

    vi.mocked(useMatches).mockReturnValue([
      { pathname: '/profile', staticData: { crumb: 'nav.profile' } },
    ] as any)

    const LayoutComponent = (Route as any).options.component
    render(<LayoutComponent />)

    expect(screen.getByTestId('app-sidebar')).toBeInTheDocument()
    expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument()
    expect(screen.getByTestId('outlet')).toBeInTheDocument()
    expect(screen.getByText('nav.profile')).toBeInTheDocument()
  })

  test('triggers logout and navigates to login when logout is clicked', () => {
    const logoutMock = vi.fn()
    const navigateMock = vi.fn()
    const mockUser = {
      _id: 'user123',
      memberId: 'GLV0001',
      fullName: 'Nguyễn Văn A',
      role: 'user',
    } as any

    vi.mocked(useAuth).mockReturnValue({
      login: vi.fn(),
      logout: logoutMock,
      user: mockUser,
    })

    vi.mocked(useNavigate).mockReturnValue(navigateMock)

    const LayoutComponent = (Route as any).options.component
    render(<LayoutComponent />)

    const logoutBtn = screen.getByRole('button', { name: 'LogoutButton' })
    logoutBtn.click()

    expect(logoutMock).toHaveBeenCalled()
    expect(navigateMock).toHaveBeenCalledWith({ to: '/login' })
  })

  test('renders multiple crumbs with only the last as current page', () => {
    const mockUser = {
      _id: 'user123',
      memberId: 'GLV0001',
      fullName: 'Nguyễn Văn A',
      role: 'user',
    } as any

    vi.mocked(useAuth).mockReturnValue({
      login: vi.fn(),
      logout: vi.fn(),
      user: mockUser,
    })

    vi.mocked(useMatches).mockReturnValue([
      { pathname: '/academic-years', staticData: { crumb: 'nav.dashboard' } },
      {
        pathname: '/academic-years/2024',
        staticData: { crumb: 'academicYears.title' },
      },
    ] as any)

    const LayoutComponent = (Route as any).options.component
    render(<LayoutComponent />)

    expect(screen.getByText('nav.dashboard')).toBeInTheDocument()
    expect(screen.getByText('academicYears.title')).toBeInTheDocument()
    // Earlier crumb is a link, last crumb is plain current-page text
    expect(screen.getByText('nav.dashboard').closest('a')).toHaveAttribute(
      'href',
      '/academic-years',
    )
    expect(screen.getByText('academicYears.title').closest('a')).toBeNull()
  })

  test('renders breadcrumbs from crumbs array (flat routes with parent path)', () => {
    const mockUser = {
      _id: 'user123',
      memberId: 'GLV0001',
      fullName: 'Nguyễn Văn A',
      role: 'catechist',
    } as any

    vi.mocked(useAuth).mockReturnValue({
      login: vi.fn(),
      logout: vi.fn(),
      user: mockUser,
    })

    vi.mocked(useMatches).mockReturnValue([
      {
        pathname: '/classes_/create',
        staticData: {
          crumbs: [
            { label: 'classes.title', path: '/classes' },
            { label: 'classes.create.title' },
          ],
        },
      },
    ] as any)

    const LayoutComponent = (Route as any).options.component
    render(<LayoutComponent />)

    expect(screen.getByText('classes.title')).toBeInTheDocument()
    expect(screen.getByText('classes.create.title')).toBeInTheDocument()
    expect(screen.getByText('classes.title').closest('a')).toHaveAttribute(
      'href',
      '/classes',
    )
    expect(screen.getByText('classes.create.title').closest('a')).toBeNull()
  })

  test('excludes matches without a crumb from the trail', () => {
    const mockUser = {
      _id: 'user123',
      memberId: 'GLV0001',
      fullName: 'Nguyễn Văn A',
      role: 'catechist',
    } as any

    vi.mocked(useAuth).mockReturnValue({
      login: vi.fn(),
      logout: vi.fn(),
      user: mockUser,
    })

    vi.mocked(useMatches).mockReturnValue([
      {
        pathname: '/classes_/create',
        staticData: {
          crumbs: [
            { label: 'classes.title', path: '/classes' },
            { label: 'classes.create.title' },
          ],
        },
      },
    ] as any)

    const LayoutComponent = (Route as any).options.component
    render(<LayoutComponent />)

    expect(screen.getByText('classes.title')).toBeInTheDocument()
    expect(screen.getByText('classes.create.title')).toBeInTheDocument()
    expect(screen.getByText('classes.title').closest('a')).toHaveAttribute(
      'href',
      '/classes',
    )
    expect(screen.getByText('classes.create.title').closest('a')).toBeNull()
  })

  test('excludes matches without a crumb from the trail', () => {
    const mockUser = {
      _id: 'user123',
      memberId: 'GLV0001',
      fullName: 'Nguyễn Văn A',
      role: 'user',
    } as any

    vi.mocked(useAuth).mockReturnValue({
      login: vi.fn(),
      logout: vi.fn(),
      user: mockUser,
    })

    vi.mocked(useMatches).mockReturnValue([
      { pathname: '/_authenticated', staticData: {} },
      { pathname: '/profile', staticData: { crumb: 'nav.profile' } },
    ] as any)

    const LayoutComponent = (Route as any).options.component
    render(<LayoutComponent />)

    expect(screen.getByText('nav.profile')).toBeInTheDocument()
    // The crumb-less match renders nothing
    expect(screen.queryByText('/_authenticated')).not.toBeInTheDocument()
  })

  test('renders empty breadcrumb list without throwing when no matches have a crumb', () => {
    const mockUser = {
      _id: 'user123',
      memberId: 'GLV0001',
      fullName: 'Nguyễn Văn A',
      role: 'user',
    } as any

    vi.mocked(useAuth).mockReturnValue({
      login: vi.fn(),
      logout: vi.fn(),
      user: mockUser,
    })

    vi.mocked(useMatches).mockReturnValue([
      { pathname: '/_authenticated', staticData: {} },
    ] as any)

    const LayoutComponent = (Route as any).options.component
    expect(() => render(<LayoutComponent />)).not.toThrow()
    expect(screen.getByTestId('outlet')).toBeInTheDocument()
  })

  test('redirects catechist to /change-password when mustChangePassword is true and not on change-password page', () => {
    const navigateMock = vi.fn()
    vi.mocked(useNavigate).mockReturnValue(navigateMock)
    vi.mocked(useLocation).mockReturnValue({ pathname: '/dashboard' } as any)

    const mockUser = {
      _id: 'user123',
      memberId: 'GLV0001',
      fullName: 'Nguyễn Văn A',
      accountType: 'catechist',
      role: 'user',
      mustChangePassword: true,
    } as any

    vi.mocked(useAuth).mockReturnValue({
      login: vi.fn(),
      logout: vi.fn(),
      user: mockUser,
    })

    const LayoutComponent = (Route as any).options.component
    const { container } = render(<LayoutComponent />)

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/change-password',
      replace: true,
    })
    expect(container).toBeEmptyDOMElement()
  })

  test('does not redirect catechist when already on /change-password page', () => {
    const navigateMock = vi.fn()
    vi.mocked(useNavigate).mockReturnValue(navigateMock)
    vi.mocked(useLocation).mockReturnValue({
      pathname: '/change-password',
    } as any)

    const mockUser = {
      _id: 'user123',
      memberId: 'GLV0001',
      fullName: 'Nguyễn Văn A',
      accountType: 'catechist',
      role: 'user',
      mustChangePassword: true,
    } as any

    vi.mocked(useAuth).mockReturnValue({
      login: vi.fn(),
      logout: vi.fn(),
      user: mockUser,
    })

    const LayoutComponent = (Route as any).options.component
    render(<LayoutComponent />)

    expect(navigateMock).not.toHaveBeenCalledWith({
      to: '/change-password',
      replace: true,
    })
    expect(screen.getByTestId('outlet')).toBeInTheDocument()
  })

  test('renders student change password dialog when mustChangePassword is true for student', () => {
    const navigateMock = vi.fn()
    vi.mocked(useNavigate).mockReturnValue(navigateMock)
    vi.mocked(useLocation).mockReturnValue({
      pathname: '/my-attendance',
    } as any)

    const mockStudent = {
      _id: 'student123',
      memberId: 'HS0001',
      fullName: 'Trần Thị B',
      accountType: 'student',
      role: null,
      mustChangePassword: true,
    } as any

    vi.mocked(useAuth).mockReturnValue({
      login: vi.fn(),
      logout: vi.fn(),
      user: mockStudent,
    })

    const LayoutComponent = (Route as any).options.component
    render(<LayoutComponent />)

    expect(navigateMock).not.toHaveBeenCalledWith({
      to: '/change-password',
      replace: true,
    })
    expect(screen.getByTestId('change-password-dialog')).toBeInTheDocument()
  })
})
