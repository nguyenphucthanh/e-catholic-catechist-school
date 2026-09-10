import { beforeEach, describe, expect, test, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

// Unmock ~/lib/auth so we can test the real implementation
vi.unmock('~/lib/auth')

// Re-import the real module after unmocking
const { AuthProvider, useAuth } = await import('~/lib/auth')

// Clear localStorage between tests
beforeEach(() => {
  localStorage.clear()
})

const TARGET_USER = {
  userDocId: 'cat2',
  loginId: 'CAT-GLV0002',
  memberId: 'GLV0002',
  fullName: 'Trần Thị B',
  accountType: 'catechist' as const,
  role: 'user' as const,
}

// Helper: a component that exercises the auth context
function AuthConsumer() {
  const {
    user,
    impersonatorAdmin,
    isHydrated,
    login,
    logout,
    loginAs,
    returnToAdmin,
    markPasswordChanged,
  } = useAuth()
  return (
    <div>
      <span data-testid="hydrated">{String(isHydrated)}</span>
      <span data-testid="user">{user ? user.fullName : 'no-user'}</span>
      <span data-testid="must-change-pw">
        {String(user?.mustChangePassword)}
      </span>
      <span data-testid="impersonator">
        {impersonatorAdmin ? impersonatorAdmin.fullName : 'no-impersonator'}
      </span>
      <button
        onClick={() =>
          login({
            userDocId: 'cat1',
            loginId: 'CAT-GLV0001',
            memberId: 'GLV0001',
            fullName: 'Nguyễn Văn A',
            accountType: 'catechist',
            role: 'admin',
            mustChangePassword: true,
          })
        }
      >
        login
      </button>
      <button onClick={logout}>logout</button>
      <button onClick={() => loginAs?.(TARGET_USER)}>loginAs</button>
      <button onClick={() => returnToAdmin?.()}>returnToAdmin</button>
      <button onClick={() => markPasswordChanged?.()}>
        markPasswordChanged
      </button>
    </div>
  )
}

describe('AuthProvider / useAuth', () => {
  test('starts with no user when localStorage is empty', () => {
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    )
    expect(screen.getByTestId('user').textContent).toBe('no-user')
  })

  test('isHydrated becomes true after mount', async () => {
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    )
    await waitFor(() => {
      expect(screen.getByTestId('hydrated').textContent).toBe('true')
    })
  })

  test('login sets the user and persists to localStorage', () => {
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    )
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'login' }))
    })
    expect(screen.getByTestId('user').textContent).toBe('Nguyễn Văn A')
    const stored = JSON.parse(localStorage.getItem('giaoly_auth')!)
    expect(stored.memberId).toBe('GLV0001')
  })

  test('logout clears the user and removes from localStorage', () => {
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    )
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'login' }))
    })
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'logout' }))
    })
    expect(screen.getByTestId('user').textContent).toBe('no-user')
    expect(localStorage.getItem('giaoly_auth')).toBeNull()
  })

  test('reads persisted user from localStorage on mount', () => {
    const stored = {
      userDocId: 'cat99',
      loginId: 'CAT-GLV0099',
      memberId: 'GLV0099',
      fullName: 'Persisted User',
      accountType: 'catechist',
      role: null,
    }
    localStorage.setItem('giaoly_auth', JSON.stringify(stored))

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    )
    expect(screen.getByTestId('user').textContent).toBe('Persisted User')
  })

  test('discards stale localStorage user missing loginId', () => {
    const stored = {
      userDocId: 'cat99',
      memberId: 'GLV0099',
      fullName: 'Stale User',
      accountType: 'catechist',
      role: null,
    }
    localStorage.setItem('giaoly_auth', JSON.stringify(stored))

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    )
    expect(screen.getByTestId('user').textContent).toBe('no-user')
    expect(localStorage.getItem('giaoly_auth')).toBeNull()
  })

  test('handles corrupted localStorage data gracefully', () => {
    localStorage.setItem('giaoly_auth', 'not-valid-json}}}')

    // Should not throw; falls back to null
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    )
    expect(screen.getByTestId('user').textContent).toBe('no-user')
  })

  test('useAuth throws when used outside AuthProvider', () => {
    // Suppress the expected React error boundary console output
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    function Bare() {
      useAuth()
      return null
    }

    expect(() => render(<Bare />)).toThrow(
      'useAuth must be used within AuthProvider',
    )

    spy.mockRestore()
  })

  describe('impersonation', () => {
    test('loginAs stashes current user as impersonatorAdmin and switches to target', () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      )
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'login' }))
      })
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'loginAs' }))
      })

      expect(screen.getByTestId('user').textContent).toBe('Trần Thị B')
      expect(screen.getByTestId('impersonator').textContent).toBe(
        'Nguyễn Văn A',
      )

      const storedUser = JSON.parse(localStorage.getItem('giaoly_auth')!)
      expect(storedUser.memberId).toBe('GLV0002')

      const storedImpersonator = JSON.parse(
        localStorage.getItem('giaoly_impersonator')!,
      )
      expect(storedImpersonator.memberId).toBe('GLV0001')
    })

    test('loginAs is a no-op when there is no current user', () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      )
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'loginAs' }))
      })

      expect(screen.getByTestId('user').textContent).toBe('no-user')
      expect(screen.getByTestId('impersonator').textContent).toBe(
        'no-impersonator',
      )
      expect(localStorage.getItem('giaoly_auth')).toBeNull()
      expect(localStorage.getItem('giaoly_impersonator')).toBeNull()
    })

    test('returnToAdmin restores the admin user and clears impersonator state', () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      )
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'login' }))
      })
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'loginAs' }))
      })
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'returnToAdmin' }))
      })

      expect(screen.getByTestId('user').textContent).toBe('Nguyễn Văn A')
      expect(screen.getByTestId('impersonator').textContent).toBe(
        'no-impersonator',
      )
      expect(localStorage.getItem('giaoly_impersonator')).toBeNull()
      const storedUser = JSON.parse(localStorage.getItem('giaoly_auth')!)
      expect(storedUser.memberId).toBe('GLV0001')
    })

    test('returnToAdmin is a no-op when there is no impersonatorAdmin', () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      )
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'login' }))
      })
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'returnToAdmin' }))
      })

      expect(screen.getByTestId('user').textContent).toBe('Nguyễn Văn A')
      expect(screen.getByTestId('impersonator').textContent).toBe(
        'no-impersonator',
      )
    })

    test('logout also clears impersonatorAdmin and its localStorage key', () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      )
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'login' }))
      })
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'loginAs' }))
      })
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'logout' }))
      })

      expect(screen.getByTestId('user').textContent).toBe('no-user')
      expect(screen.getByTestId('impersonator').textContent).toBe(
        'no-impersonator',
      )
      expect(localStorage.getItem('giaoly_auth')).toBeNull()
      expect(localStorage.getItem('giaoly_impersonator')).toBeNull()
    })

    test('loads a validly-shaped impersonatorAdmin from localStorage on mount', () => {
      const stored = {
        userDocId: 'cat1',
        loginId: 'CAT-GLV0001',
        memberId: 'GLV0001',
        fullName: 'Persisted Admin',
        accountType: 'catechist',
        role: 'admin',
      }
      localStorage.setItem('giaoly_impersonator', JSON.stringify(stored))

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      )
      expect(screen.getByTestId('impersonator').textContent).toBe(
        'Persisted Admin',
      )
    })

    test('discards malformed impersonatorAdmin from localStorage on mount', () => {
      const stored = {
        userDocId: 'cat1',
        memberId: 'GLV0001',
        fullName: 'Stale Admin',
        accountType: 'catechist',
        role: 'admin',
      }
      localStorage.setItem('giaoly_impersonator', JSON.stringify(stored))

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      )
      expect(screen.getByTestId('impersonator').textContent).toBe(
        'no-impersonator',
      )
      expect(localStorage.getItem('giaoly_impersonator')).toBeNull()
    })

    test('updates mustChangePassword to false when markPasswordChanged is called', () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      )
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'login' }))
      })
      expect(screen.getByTestId('must-change-pw').textContent).toBe('true')
      const storedBefore = JSON.parse(localStorage.getItem('giaoly_auth')!)
      expect(storedBefore.mustChangePassword).toBe(true)

      act(() => {
        fireEvent.click(
          screen.getByRole('button', { name: 'markPasswordChanged' }),
        )
      })
      expect(screen.getByTestId('must-change-pw').textContent).toBe('false')
      const storedAfter = JSON.parse(localStorage.getItem('giaoly_auth')!)
      expect(storedAfter.mustChangePassword).toBe(false)
    })

    test('preserves mustChangePassword flag when reading stored user from localStorage', () => {
      const stored = {
        userDocId: 'cat1',
        loginId: 'CAT-GLV0001',
        memberId: 'GLV0001',
        fullName: 'Persisted User',
        accountType: 'catechist',
        role: 'user',
        mustChangePassword: true,
      }
      localStorage.setItem('giaoly_auth', JSON.stringify(stored))

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      )
      expect(screen.getByTestId('user').textContent).toBe('Persisted User')
      expect(screen.getByTestId('must-change-pw').textContent).toBe('true')
    })
  })
})
