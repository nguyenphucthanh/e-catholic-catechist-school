import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import * as Sentry from '@sentry/tanstackstart-react'
import { ChevronDown, Home, RotateCw, TriangleAlert } from 'lucide-react'
import type { ErrorRouteComponent } from '@tanstack/react-router'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'
import { ForceLogout, isAuthError } from '~/components/auth-error-boundary'

export const RouteError: ErrorRouteComponent = ({ error }) => {
  const [showDetails, setShowDetails] = useState(false)

  useEffect(() => {
    if (!isAuthError(error)) {
      Sentry.captureException(error)
    }
  }, [error])

  if (isAuthError(error)) {
    return <ForceLogout />
  }

  const errorMessage = error instanceof Error ? error.message : String(error)
  const errorStack = error instanceof Error ? error.stack : String(error)

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)]">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <TriangleAlert className="size-6" />
        </div>

        <h1 className="mt-4 text-lg font-semibold text-foreground">
          Đã có lỗi xảy ra
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {errorMessage || 'Vui lòng thử lại hoặc quay về trang chủ.'}
        </p>

        <div className="mt-6 flex justify-center gap-2">
          <Button variant="outline" onClick={() => window.location.reload()}>
            <RotateCw className="size-4" />
            Thử lại
          </Button>
          <Button nativeButton={false} render={<Link to="/" />}>
            <Home className="size-4" />
            Trang chủ
          </Button>
        </div>

        {errorStack && (
          <div className="mt-6 border-t border-border pt-4 text-left">
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="flex w-full items-center justify-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Chi tiết lỗi
              <ChevronDown
                className={cn(
                  'size-3.5 transition-transform',
                  showDetails && 'rotate-180',
                )}
              />
            </button>
            {showDetails && (
              <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-muted p-3 text-[11px] leading-relaxed text-muted-foreground">
                {errorStack}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
