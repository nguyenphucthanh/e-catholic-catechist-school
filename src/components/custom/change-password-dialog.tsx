import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from '@tanstack/react-form'
import { useMutation } from 'convex/react'
import { KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { api } from '../../../convex/_generated/api'
import { useAuth } from '~/lib/auth'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Field, FieldError, FieldLabel } from '~/components/ui/field'

interface ChangePasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: ChangePasswordDialogProps) {
  const { t } = useTranslation()
  const { user, markPasswordChanged } = useAuth()
  const changePasswordMutation = useMutation(api.auth.changePassword)

  const passwordSchema = React.useMemo(
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
      if (!user) return
      try {
        await changePasswordMutation({
          loginId: user.loginId,
          oldPassword: value.currentPassword,
          newPassword: value.newPassword,
        })
        markPasswordChanged?.()
        toast.success(t('password.success'))
        form.reset()
        onOpenChange(false)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e))
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <KeyRound className="size-5" />
            </div>
            <DialogTitle>{t('password.recommend.title')}</DialogTitle>
          </div>
          <DialogDescription>
            {t('password.recommend.description')}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            form.handleSubmit()
          }}
          className="flex flex-col gap-4 py-2"
        >
          <form.Field
            name="currentPassword"
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor="dlg-currentPassword">
                    {t('password.current')}
                  </FieldLabel>
                  <Input
                    id="dlg-currentPassword"
                    name={field.name}
                    type="password"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    autoComplete="current-password"
                    aria-invalid={isInvalid}
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
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
                  <FieldLabel htmlFor="dlg-newPassword">
                    {t('password.new')}
                  </FieldLabel>
                  <Input
                    id="dlg-newPassword"
                    name={field.name}
                    type="password"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    autoComplete="new-password"
                    aria-invalid={isInvalid}
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
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
                  <FieldLabel htmlFor="dlg-confirmPassword">
                    {t('password.confirm')}
                  </FieldLabel>
                  <Input
                    id="dlg-confirmPassword"
                    name={field.name}
                    type="password"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    autoComplete="new-password"
                    aria-invalid={isInvalid}
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              )
            }}
          />

          <DialogFooter className="mt-2 flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('password.recommend.remindLater')}
            </Button>
            <form.Subscribe
              selector={(s) => ({ isSubmitting: s.isSubmitting })}
              children={({ isSubmitting }) => (
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting
                    ? t('password.submitting')
                    : t('password.recommend.changeNow')}
                </Button>
              )}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
