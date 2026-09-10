import { createFileRoute } from '@tanstack/react-router'
import { useForm } from '@tanstack/react-form'
import { useMutation } from 'convex/react'
import { AlertCircle, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'
import { useMemo } from 'react'
import { api } from '../../../convex/_generated/api'
import { useAuth } from '~/lib/auth'
import { PageHeader } from '~/components/page-header'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Card, CardContent } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Button } from '~/components/ui/button'
import { Field, FieldError, FieldLabel } from '~/components/ui/field'

export const Route = createFileRoute('/_authenticated/change-password')({
  component: ChangePasswordPage,
  staticData: { crumb: 'password.title' },
})

function ChangePasswordPage() {
  const { t } = useTranslation()
  const { user, markPasswordChanged } = useAuth()
  const changePasswordMutation = useMutation(api.auth.changePassword)

  const passwordSchema = useMemo(
    () =>
      z
        .object({
          currentPassword: z.string().min(1, t('password.current.required')),
          newPassword: z.string().min(8, t('password.new.min')),
          confirmPassword: z.string().min(1, t('password.confirm.mismatch')),
        })
        .refine((v) => v.newPassword === v.confirmPassword, {
          message: t('password.confirm.mismatch'),
          path: ['confirmPassword'],
        }),
    [t],
  )

  const form = useForm({
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
    validators: {
      onSubmit: passwordSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        await changePasswordMutation({
          loginId: user!.loginId,
          oldPassword: value.currentPassword,
          newPassword: value.newPassword,
        })
        markPasswordChanged?.()
        toast.success(t('password.success'))
        form.reset()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e))
      }
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Lock}
        title={t('password.title')}
        subtitle={t('password.subtitle')}
      />

      {user?.mustChangePassword && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>{t('password.force.title')}</AlertTitle>
          <AlertDescription>{t('password.force.description')}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              form.handleSubmit()
            }}
            className="flex flex-col gap-4"
          >
            <form.Field
              name="currentPassword"
              children={(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor="currentPassword">
                      {t('password.current')}
                    </FieldLabel>
                    <Input
                      id="currentPassword"
                      name={field.name}
                      type="password"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      autoComplete="current-password"
                      aria-invalid={isInvalid}
                    />
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            />

            <form.Field
              name="newPassword"
              children={(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor="newPassword">
                      {t('password.new')}
                    </FieldLabel>
                    <Input
                      id="newPassword"
                      name={field.name}
                      type="password"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      autoComplete="new-password"
                      aria-invalid={isInvalid}
                    />
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            />

            <form.Field
              name="confirmPassword"
              children={(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor="confirmPassword">
                      {t('password.confirm')}
                    </FieldLabel>
                    <Input
                      id="confirmPassword"
                      name={field.name}
                      type="password"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      autoComplete="new-password"
                      aria-invalid={isInvalid}
                    />
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            />

            <form.Subscribe
              selector={(s) => ({ isSubmitting: s.isSubmitting })}
              children={({ isSubmitting }) => (
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting
                    ? t('password.submitting')
                    : t('password.submit')}
                </Button>
              )}
            />
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
