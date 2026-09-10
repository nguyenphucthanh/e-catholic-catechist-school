import * as React from 'react'

const AUTH_KEY = 'giaoly_auth'
const IMPERSONATOR_KEY = 'giaoly_impersonator'

export type AuthUser = {
  userDocId: string
  loginId: string
  memberId: string
  fullName: string
  accountType: 'catechist' | 'student'
  role: 'admin' | 'user' | null
  mustChangePassword?: boolean
}

type AuthContextValue = {
  user: AuthUser | null
  isHydrated?: boolean
  impersonatorAdmin?: AuthUser | null
  login: (user: AuthUser) => void
  logout: () => void
  loginAs?: (target: AuthUser) => void
  returnToAdmin?: () => void
  markPasswordChanged?: () => void
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

function isValidStoredUser(value: unknown): value is AuthUser {
  if (typeof value !== 'object' || value === null) return false
  const u = value as Record<string, unknown>
  return (
    typeof u.userDocId === 'string' &&
    typeof u.loginId === 'string' &&
    typeof u.memberId === 'string' &&
    typeof u.fullName === 'string' &&
    (u.accountType === 'catechist' || u.accountType === 'student') &&
    (u.role === 'admin' || u.role === 'user' || u.role === null) &&
    (u.mustChangePassword === undefined ||
      typeof u.mustChangePassword === 'boolean')
  )
}

function readStoredUser(key: string): AuthUser | null {
  try {
    const stored = localStorage.getItem(key)
    if (!stored) return null
    const parsed = JSON.parse(stored) as unknown
    if (!isValidStoredUser(parsed)) {
      localStorage.removeItem(key)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null)
  const [impersonatorAdmin, setImpersonatorAdmin] =
    React.useState<AuthUser | null>(null)
  const [isHydrated, setIsHydrated] = React.useState(false)

  React.useEffect(() => {
    setUser(readStoredUser(AUTH_KEY))
    setImpersonatorAdmin(readStoredUser(IMPERSONATOR_KEY))
    setIsHydrated(true)
  }, [])

  const login = React.useCallback((u: AuthUser) => {
    setUser(u)
    localStorage.setItem(AUTH_KEY, JSON.stringify(u))
  }, [])

  const logout = React.useCallback(() => {
    setUser(null)
    setImpersonatorAdmin(null)
    localStorage.removeItem(AUTH_KEY)
    localStorage.removeItem(IMPERSONATOR_KEY)
  }, [])

  const markPasswordChanged = React.useCallback(() => {
    setUser((prev) => {
      if (!prev) return null
      const updated = { ...prev, mustChangePassword: false }
      localStorage.setItem(AUTH_KEY, JSON.stringify(updated))
      return updated
    })
  }, [])

  const loginAs = React.useCallback(
    (target: AuthUser) => {
      if (!user) return
      setImpersonatorAdmin(user)
      localStorage.setItem(IMPERSONATOR_KEY, JSON.stringify(user))
      setUser(target)
      localStorage.setItem(AUTH_KEY, JSON.stringify(target))
    },
    [user],
  )

  const returnToAdmin = React.useCallback(() => {
    if (!impersonatorAdmin) return
    setUser(impersonatorAdmin)
    localStorage.setItem(AUTH_KEY, JSON.stringify(impersonatorAdmin))
    setImpersonatorAdmin(null)
    localStorage.removeItem(IMPERSONATOR_KEY)
  }, [impersonatorAdmin])

  return (
    <AuthContext.Provider
      value={{
        user,
        isHydrated,
        impersonatorAdmin,
        login,
        logout,
        loginAs,
        returnToAdmin,
        markPasswordChanged,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
