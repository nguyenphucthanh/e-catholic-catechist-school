import * as React from 'react'
import {
  Link,
  Outlet,
  createFileRoute,
  useLocation,
  useMatches,
  useNavigate,
} from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { FileExclamationPoint, UserCog } from 'lucide-react'
import { version } from '../../package.json'
import { ChangePasswordDialog } from '~/components/custom/change-password-dialog'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '~/components/ui/breadcrumb'
import { Separator } from '~/components/ui/separator'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '~/components/ui/sidebar'
import { AppSidebar } from '~/components/app-sidebar'
import { HeaderSearch } from '~/components/header-search'
import { useAuth } from '~/lib/auth'
import '~/lib/breadcrumbs'
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import { clientEnv } from '~/clientEnv'
import { useRouteGuard } from '~/hooks/use-route-guard'

export const Route = createFileRoute('/_authenticated')({
  component: AuthenticatedLayout,
})

const isDemoApp = !!clientEnv.VITE_DEMO_APP

function AuthenticatedLayout() {
  const { user, isHydrated, logout, impersonatorAdmin, returnToAdmin } =
    useAuth()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const matches = useMatches()

  const todayString = React.useMemo(() => {
    const today = new Date()
    const lang = (i18n as any)?.language || 'vi'
    const locale = lang.startsWith('vi') ? 'vi-VN' : 'en-GB'
    const str = today.toLocaleDateString(locale, {
      day: 'numeric',
      weekday: 'narrow',
      month: 'numeric',
    })
    return str.charAt(0).toUpperCase() + str.slice(1)
  }, [i18n])

  const { ready } = useRouteGuard({
    pending: isHydrated === false,
    allowed: !!user,
    redirectTo: '/login',
  })

  const location = useLocation()
  const isCatechist = user?.accountType === 'catechist'
  const isStudent = user?.accountType === 'student'
  const mustChangePassword = !!user?.mustChangePassword
  const isPasswordChangePage = location.pathname === '/change-password'

  const [studentPromptDismissed, setStudentPromptDismissed] =
    React.useState(false)

  React.useEffect(() => {
    if (
      ready &&
      user &&
      mustChangePassword &&
      isCatechist &&
      !isPasswordChangePage
    ) {
      void navigate({ to: '/change-password', replace: true })
    }
  }, [
    ready,
    user,
    mustChangePassword,
    isCatechist,
    isPasswordChangePage,
    navigate,
  ])

  if (!ready || !user) {
    return null
  }

  if (mustChangePassword && isCatechist && !isPasswordChangePage) {
    return null
  }

  const showStudentPrompt =
    isStudent && mustChangePassword && !studentPromptDismissed

  const crumbs = matches
    .filter((match) => match.staticData.crumbs || match.staticData.crumb)
    .flatMap((match) => {
      if (match.staticData.crumbs) {
        return (
          match.staticData.crumbs as Array<{ label: string; path?: string }>
        ).map((c) => ({
          label: t(c.label),
          path: c.path,
        }))
      }
      return [
        {
          label: t(match.staticData.crumb as string),
          path: match.pathname,
        },
      ]
    })
    .map((crumb, i, arr) => ({
      ...crumb,
      isCurrent: i === arr.length - 1,
    }))

  const handleLogout = () => {
    logout()
    void navigate({ to: '/login' })
  }

  const handleReturnToAdmin = () => {
    returnToAdmin?.()
    void navigate({ to: '/' })
  }

  return (
    <SidebarProvider>
      <AppSidebar user={user} onLogout={handleLogout} />
      <SidebarInset>
        <header className="bg-card shadow-sm mb-6 flex h-16 shrink-0 items-center justify-between gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2" />
            <HeaderSearch />
          </div>
          <div className="px-4 text-sm text-muted-foreground font-medium">
            {todayString}
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 min-w-0">
          {isDemoApp && (
            <Alert variant={'destructive'}>
              <FileExclamationPoint />
              <AlertTitle>DEMO APP</AlertTitle>
              <AlertDescription>{t('app.demo.note')}</AlertDescription>
            </Alert>
          )}
          {impersonatorAdmin && (
            <Alert>
              <UserCog />
              <AlertTitle>
                {t('impersonation.banner.title', { name: user.fullName })}
              </AlertTitle>
              <AlertDescription>
                {t('impersonation.banner.description')}
              </AlertDescription>
              <AlertAction>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReturnToAdmin}
                >
                  {t('impersonation.banner.returnToAdmin')}
                </Button>
              </AlertAction>
            </Alert>
          )}
          <Breadcrumb>
            <BreadcrumbList>
              {crumbs.map((crumb, i) => (
                <React.Fragment key={crumb.path}>
                  {i > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem>
                    {crumb.isCurrent ? (
                      <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink render={<Link to={crumb.path} />}>
                        {crumb.label}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </React.Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
          {showStudentPrompt && (
            <ChangePasswordDialog
              open={showStudentPrompt}
              onOpenChange={(open) => {
                if (!open) {
                  setStudentPromptDismissed(true)
                }
              }}
            />
          )}
          <Outlet />
          <footer className="mt-auto pt-6 pb-2 text-center text-xs text-muted-foreground border-t border-border/50 dark:border-border/10">
            eCCS v{version}
          </footer>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
