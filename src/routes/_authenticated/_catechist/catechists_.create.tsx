import React from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useTranslation } from 'react-i18next'
import { useForm } from '@tanstack/react-form'
import {
  Check,
  Copy,
  Edit,
  MoreHorizontal,
  Plus,
  Trash2,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'

import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import type { ContactType } from '~/components/forms/catechist-contact-dialog-form'
import { useAuth } from '~/lib/auth'
import { translateConvexError } from '~/lib/convex-errors'
import { isAdmin } from '~/lib/permissions'
import { DEFAULT_COUNTRY } from '~/lib/locale'

import { PageHeader } from '~/components/page-header'
import { Button } from '~/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card'
import { Field, FieldError, FieldLabel } from '~/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '~/components/ui/input-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { Badge } from '~/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { ContactTypeIcon } from '~/components/forms/catechist-contacts-section'
import { CatechistPhotoUpload } from '~/components/custom/catechist-photo-upload'
import { CatechistPersonalInfoFields } from '~/components/forms/catechist-personal-info-form'
import { CatechistAddressFields } from '~/components/forms/catechist-address-form'
import { CatechistContactDialogForm } from '~/components/forms/catechist-contact-dialog-form'

export const Route = createFileRoute(
  '/_authenticated/_catechist/catechists_/create',
)({
  component: CreateCatechistPage,
  staticData: {
    crumbs: [
      { label: 'catechists.title', path: '/catechists' },
      { label: 'catechists.create.title' },
    ],
  },
})

function CreateCatechistPage() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const canManage = isAdmin(user)
  const requesterId = user?.userDocId as Id<'catechists'> | undefined

  if (!canManage || !requesterId) {
    return (
      <div className="p-4 text-destructive flex items-center justify-center h-full">
        {t('common.contactAdmin')}
      </div>
    )
  }

  return <CreateCatechistForm requesterId={requesterId} />
}

type StagedContact = {
  id: string
  label: string
  contactType: ContactType
  value: string
  isPrimary: boolean
  notes?: string
}

type ContactDialogState =
  | { mode: 'closed' }
  | { mode: 'add' }
  | { mode: 'edit'; contact: StagedContact }

function CreateCatechistForm({
  requesterId,
}: {
  requesterId: Id<'catechists'>
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const createMutation = useMutation(api.catechists.createWithDetails)

  const [formDirty, setFormDirty] = React.useState(false)
  const [confirmLeaveOpen, setConfirmLeaveOpen] = React.useState(false)
  const [profilePhotoStorageId, setProfilePhotoStorageId] =
    React.useState<Id<'_storage'> | null>(null)

  const [stagedContacts, setStagedContacts] = React.useState<
    Array<StagedContact>
  >([])
  const [contactDialog, setContactDialog] = React.useState<ContactDialogState>({
    mode: 'closed',
  })
  const [credentials, setCredentials] = React.useState<{
    catechistId: Id<'catechists'>
    loginId: string
  } | null>(null)

  const handleContactSave = (data: {
    label: string
    contactType: ContactType
    value: string
    isPrimary: boolean
    notes?: string
  }) => {
    const targetId =
      contactDialog.mode === 'edit'
        ? contactDialog.contact.id
        : crypto.randomUUID()
    let contacts =
      contactDialog.mode === 'edit'
        ? stagedContacts.map((c) =>
            c.id === targetId ? { ...data, id: targetId } : c,
          )
        : [...stagedContacts, { ...data, id: targetId }]

    if (data.isPrimary) {
      contacts = contacts.map((c) =>
        c.contactType === data.contactType && c.id !== targetId
          ? { ...c, isPrimary: false }
          : c,
      )
    }
    setStagedContacts(contacts)
    setFormDirty(true)
    setContactDialog({ mode: 'closed' })
  }

  const handleCancel = () => {
    if (formDirty) setConfirmLeaveOpen(true)
    else void navigate({ to: '/catechists' })
  }

  const formSchema = React.useMemo(
    () =>
      z.object({
        fullName: z
          .string()
          .trim()
          .min(1, t('profile.personal.fullName.required')),
        saintName: z.string(),
        dateOfBirth: z.string(),
        gender: z.enum(['male', 'female', '']),
        role: z
          .enum(['admin', 'user', ''])
          .refine((val) => val === 'admin' || val === 'user', {
            message: t('common.required'),
          }),
        joinedDate: z.string(),
        notes: z.string(),
        title: z.string(),
        community: z.string(),
        level: z.string(),
        addressLine1: z.string(),
        addressLine2: z.string(),
        city: z.string(),
        stateProvince: z.string(),
        postalCode: z.string(),
        hamlet: z.string(),
        subHamlet: z.string(),
      }),
    [t],
  )

  const form = useForm({
    defaultValues: {
      saintName: '',
      fullName: '',
      dateOfBirth: '',
      gender: '' as '' | 'male' | 'female',
      role: 'user' as '' | 'admin' | 'user',
      joinedDate: '',
      notes: '',
      title: '',
      community: '',
      level: '',
      // Address fields
      addressLine1: '',
      addressLine2: '',
      city: '',
      stateProvince: '',
      postalCode: '',
      hamlet: '',
      subHamlet: '',
    },
    validators: {
      onSubmit: formSchema,
    },
    onSubmitInvalid: ({ formApi }) => {
      console.error('Validation failed!', formApi.state.fieldMeta)
    },
    onSubmit: async ({ value }) => {
      try {
        const hasAddress =
          value.addressLine1 ||
          value.addressLine2 ||
          value.city ||
          value.stateProvince ||
          value.postalCode ||
          value.hamlet ||
          value.subHamlet

        const { catechistId, loginId } = await createMutation({
          requesterId,
          fullName: value.fullName,
          saintName: value.saintName || undefined,
          dateOfBirth: value.dateOfBirth || undefined,
          gender: value.gender || undefined,
          role: value.role as 'admin' | 'user',
          joinedDate: value.joinedDate || undefined,
          notes: value.notes || undefined,
          title: value.title || undefined,
          community: value.community || undefined,
          level: value.level || undefined,
          profilePhotoStorageId: profilePhotoStorageId || undefined,
          ...(hasAddress && {
            address: {
              country: DEFAULT_COUNTRY,
              addressLine1: value.addressLine1 || undefined,
              addressLine2: value.addressLine2 || undefined,
              city: value.city || undefined,
              stateProvince: value.stateProvince || undefined,
              postalCode: value.postalCode || undefined,
              hamlet: value.hamlet || undefined,
              subHamlet: value.subHamlet || undefined,
            },
          }),
          ...(stagedContacts.length > 0 && {
            contacts: stagedContacts.map((c) => ({
              label: c.label,
              contactType: c.contactType,
              value: c.value,
              isPrimary: c.isPrimary,
              notes: c.notes,
            })),
          }),
        })

        toast.success(t('catechists.created'))
        setFormDirty(false)
        setCredentials({ catechistId, loginId })
      } catch (error) {
        toast.error(translateConvexError(error, t))
      }
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Users}
        title={t('catechists.create.title')}
        subtitle={t('catechists.create.subtitle')}
      />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
        className="flex flex-col gap-6"
      >
        <Card>
          <CardHeader>
            <CardTitle>{t('profile.personal.photo')}</CardTitle>
            <CardDescription>
              {t('profile.personal.photo.maxSize')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form.Subscribe
              selector={(s) => ({
                saintName: s.values.saintName,
                fullName: s.values.fullName,
              })}
              children={({ saintName, fullName }) => (
                <CatechistPhotoUpload
                  fullName={
                    fullName
                      ? saintName
                        ? `${saintName} ${fullName}`
                        : fullName
                      : t('profile.personal.photo')
                  }
                  onPhotoChange={(storageId) => {
                    setProfilePhotoStorageId(storageId)
                    setFormDirty(true)
                  }}
                />
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('catechists.edit.personal.title')}</CardTitle>
            <CardDescription>
              {t('catechists.edit.personal.description')}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <CatechistPersonalInfoFields
              form={form}
              onDirtyChange={() => setFormDirty(true)}
              roleField={
                <form.Field
                  name="role"
                  children={(field) => {
                    const isInvalid =
                      field.state.meta.isTouched && !field.state.meta.isValid
                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel>
                          {t('catechists.col.role')}{' '}
                          <span className="text-destructive">*</span>
                        </FieldLabel>
                        <Select
                          value={field.state.value}
                          onValueChange={(val) => {
                            field.handleChange(val as 'admin' | 'user')
                            setFormDirty(true)
                          }}
                          items={[
                            {
                              value: 'admin',
                              label: t('catechists.role.admin'),
                            },
                            {
                              value: 'user',
                              label: t('catechists.role.user'),
                            },
                          ]}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue
                              placeholder={t('catechists.role.placeholder')}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">
                              {t('catechists.role.admin')}
                            </SelectItem>
                            <SelectItem value="user">
                              {t('catechists.role.user')}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        {isInvalid && (
                          <FieldError errors={field.state.meta.errors} />
                        )}
                      </Field>
                    )
                  }}
                />
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('catechists.edit.address.title')}</CardTitle>
            <CardDescription>
              {t('catechists.edit.address.description')}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <CatechistAddressFields
              form={form}
              onDirtyChange={() => setFormDirty(true)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{t('catechists.edit.contacts.title')}</CardTitle>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setContactDialog({ mode: 'add' })}
            >
              <Plus className="mr-1 size-4" />
              {t('catechists.create.contacts.add')}
            </Button>
          </CardHeader>
          <CardContent>
            {stagedContacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('catechists.create.contacts.empty')}
              </p>
            ) : (
              <ul className="flex flex-col">
                {stagedContacts.map((contact) => (
                  <li
                    key={contact.id}
                    className="flex flex-row items-center justify-between gap-4 py-3 border-b last:border-0"
                  >
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex flex-row items-center gap-2">
                        <ContactTypeIcon type={contact.contactType} />
                        <span className="font-medium truncate">
                          {contact.value}
                        </span>
                        {contact.isPrimary && (
                          <Badge variant="secondary" className="px-1.5 py-0">
                            {t('profile.contacts.isPrimary')}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {contact.label && (
                          <span className="truncate">{contact.label}</span>
                        )}
                        {contact.label && contact.notes && <span>&bull;</span>}
                        {contact.notes && (
                          <span className="truncate">{contact.notes}</span>
                        )}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 shrink-0"
                          >
                            <MoreHorizontal className="size-4" />
                            <span className="sr-only">
                              {t('common.moreActions')}
                            </span>
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            setContactDialog({ mode: 'edit', contact })
                          }
                        >
                          <Edit className="mr-2 size-4" />
                          {t('common.edit')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                          onClick={() => {
                            setStagedContacts((prev) =>
                              prev.filter((c) => c.id !== contact.id),
                            )
                            setFormDirty(true)
                          }}
                        >
                          <Trash2 className="mr-2 size-4" />
                          {t('common.delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={handleCancel}>
            {t('common.cancel')}
          </Button>
          <form.Subscribe
            selector={(s) => ({ isSubmitting: s.isSubmitting })}
            children={({ isSubmitting }) => (
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? t('common.saving')
                  : t('catechists.create.title')}
              </Button>
            )}
          />
        </div>
      </form>

      <Dialog
        open={contactDialog.mode !== 'closed'}
        onOpenChange={(open) => {
          if (!open) setContactDialog({ mode: 'closed' })
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {contactDialog.mode === 'edit'
                ? t('profile.contacts.dialog.edit')
                : t('profile.contacts.dialog.add')}
            </DialogTitle>
          </DialogHeader>
          {contactDialog.mode !== 'closed' && (
            <CatechistContactDialogForm
              key={
                contactDialog.mode === 'edit' ? contactDialog.contact.id : 'add'
              }
              initialValues={
                contactDialog.mode === 'edit'
                  ? {
                      label: contactDialog.contact.label,
                      contactType: contactDialog.contact.contactType,
                      value: contactDialog.contact.value,
                      isPrimary: contactDialog.contact.isPrimary,
                      notes: contactDialog.contact.notes ?? '',
                    }
                  : undefined
              }
              onSubmit={async (values) => {
                handleContactSave(values)
                await Promise.resolve()
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmLeaveOpen} onOpenChange={setConfirmLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('catechists.confirmLeave.title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('catechists.confirmLeave.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmLeaveOpen(false)
                void navigate({ to: '/catechists' })
              }}
            >
              {t('catechists.confirmLeave.discard')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={credentials !== null}
        onOpenChange={(open) => {
          if (!open && credentials) {
            const id = credentials.catechistId
            setCredentials(null)
            void navigate({ to: '/catechists/$id', params: { id } })
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('catechists.create.credentials.title')}
            </DialogTitle>
          </DialogHeader>
          {credentials && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                {t('catechists.create.credentials.description')}
              </p>
              <CopyField
                label={t('catechists.create.credentials.loginId')}
                value={credentials.loginId}
              />
              <CopyField
                label={t('catechists.create.credentials.password')}
                value={credentials.loginId}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CopyField({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput readOnly value={value} />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            aria-label={t('common.copy')}
            onClick={() => void handleCopy()}
          >
            {copied ? (
              <Check className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </Field>
  )
}
