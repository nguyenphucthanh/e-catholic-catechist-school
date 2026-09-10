import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import {
  assertAdminRole,
  assertValidCatechist,
  getActiveAcademicYear,
  getEffectivePermissions,
} from './lib/authz'
import { nextCounter } from './lib/counter'
import { CATECHIST_ERRORS } from './lib/errors'
import { hashPassword } from './lib/password'
import { getCatechistLoginId } from './lib/accountPrefix'
import { normalizeToE164 } from './lib/phone'
import type { Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'

async function clearPrimaryContacts(
  ctx: MutationCtx,
  catechistId: Id<'catechists'>,
  contactType: string,
  excludeId?: Id<'catechistContacts'>,
): Promise<void> {
  const allContacts = await ctx.db
    .query('catechistContacts')
    .withIndex('by_catechist_id', (q) => q.eq('catechistId', catechistId))
    .collect()
  const existing = allContacts.filter((c) => !c.isDeleted)

  for (const c of existing) {
    if (c.contactType === contactType && c.isPrimary && c._id !== excludeId) {
      await ctx.db.patch('catechistContacts', c._id, { isPrimary: false })
    }
  }
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export const getMyProfile = query({
  args: {
    requesterId: v.id('catechists'),
    catechistId: v.id('catechists'),
  },
  handler: async (ctx, args) => {
    await assertValidCatechist(ctx, args.requesterId)
    return await ctx.db.get('catechists', args.catechistId)
  },
})

export const getMyAddress = query({
  args: {
    requesterId: v.id('catechists'),
    catechistId: v.id('catechists'),
  },
  handler: async (ctx, args) => {
    const requester = await assertValidCatechist(ctx, args.requesterId)
    if (args.requesterId !== args.catechistId && requester.role !== 'admin') {
      return null
    }
    const address = await ctx.db
      .query('catechistAddresses')
      .withIndex('by_catechist_id', (q) =>
        q.eq('catechistId', args.catechistId),
      )
      .unique()
    return address && !address.isDeleted ? address : null
  },
})

export const getMyContacts = query({
  args: {
    requesterId: v.id('catechists'),
    catechistId: v.id('catechists'),
  },
  handler: async (ctx, args) => {
    const requester = await assertValidCatechist(ctx, args.requesterId)
    if (args.requesterId !== args.catechistId && requester.role !== 'admin') {
      return []
    }
    const contacts = await ctx.db
      .query('catechistContacts')
      .withIndex('by_catechist_id', (q) =>
        q.eq('catechistId', args.catechistId),
      )
      .collect()
    return contacts.filter((c) => !c.isDeleted)
  },
})

export const getClassAssignments = query({
  args: {
    requesterId: v.id('catechists'),
    catechistId: v.id('catechists'),
  },
  handler: async (ctx, args) => {
    await assertValidCatechist(ctx, args.requesterId)

    const assignments = await ctx.db
      .query('classCatechists')
      .withIndex('by_catechist_id', (q) =>
        q.eq('catechistId', args.catechistId),
      )
      .collect()

    const active = assignments.filter((a) => !a.isDeleted)

    const results = await Promise.all(
      active.map(async (assignment) => {
        const classYear = await ctx.db.get('classYears', assignment.classYearId)
        if (!classYear || classYear.isDeleted) return null

        const cls = await ctx.db.get('classes', classYear.classId)
        if (!cls || cls.isDeleted) return null

        const academicYear = await ctx.db.get(
          'academicYears',
          assignment.academicYearId,
        )
        if (!academicYear || academicYear.isDeleted) return null

        const branch = await ctx.db.get('branches', cls.branchId)
        if (!branch || branch.isDeleted) return null

        return {
          _id: assignment._id,
          role: assignment.role,
          classYearId: assignment.classYearId,
          classId: classYear.classId,
          className: cls.name,
          branchId: cls.branchId,
          branchName: branch.name,
          academicYearId: assignment.academicYearId,
          academicYearName: academicYear.name,
        }
      }),
    )

    return results.filter((r): r is NonNullable<typeof r> => r !== null)
  },
})

export const getCatechistDetail = query({
  args: {
    requesterId: v.id('catechists'),
    catechistId: v.id('catechists'),
  },
  handler: async (ctx, args) => {
    const requester = await assertValidCatechist(ctx, args.requesterId)

    const profile = await ctx.db.get('catechists', args.catechistId)
    if (!profile || profile.isDeleted) return null

    const canViewSensitive =
      args.requesterId === args.catechistId || requester.role === 'admin'

    const [addressDoc, contactsDocs, assignmentDocs, accountDoc] =
      await Promise.all([
        canViewSensitive
          ? ctx.db
              .query('catechistAddresses')
              .withIndex('by_catechist_id', (q) =>
                q.eq('catechistId', args.catechistId),
              )
              .unique()
          : null,
        canViewSensitive
          ? ctx.db
              .query('catechistContacts')
              .withIndex('by_catechist_id', (q) =>
                q.eq('catechistId', args.catechistId),
              )
              .collect()
          : [],
        ctx.db
          .query('classCatechists')
          .withIndex('by_catechist_id', (q) =>
            q.eq('catechistId', args.catechistId),
          )
          .collect(),
        canViewSensitive
          ? ctx.db
              .query('accounts')
              .withIndex('by_is_deleted', (q) => q.eq('isDeleted', false))
              // eslint-disable-next-line @convex-dev/no-filter-in-query
              .filter((q) =>
                q.and(
                  q.eq(q.field('accountType'), 'catechist'),
                  q.eq(q.field('userRefId'), args.catechistId),
                ),
              )
              .first()
          : null,
      ])

    const address = addressDoc && !addressDoc.isDeleted ? addressDoc : null
    const contacts = contactsDocs.filter((c) => !c.isDeleted)
    const activeAssignments = assignmentDocs.filter((a) => !a.isDeleted)

    const classAssignments = (
      await Promise.all(
        activeAssignments.map(async (assignment) => {
          const classYear = await ctx.db.get(
            'classYears',
            assignment.classYearId,
          )
          if (!classYear || classYear.isDeleted) return null

          const cls = await ctx.db.get('classes', classYear.classId)
          if (!cls || cls.isDeleted) return null

          const academicYear = await ctx.db.get(
            'academicYears',
            assignment.academicYearId,
          )
          if (!academicYear || academicYear.isDeleted) return null

          const branch = await ctx.db.get('branches', cls.branchId)
          if (!branch || branch.isDeleted) return null

          return {
            _id: assignment._id,
            role: assignment.role,
            classYearId: assignment.classYearId,
            classId: classYear.classId,
            className: cls.name,
            branchId: cls.branchId,
            branchName: branch.name,
            academicYearId: assignment.academicYearId,
            academicYearName: academicYear.name,
          }
        }),
      )
    ).filter((r): r is NonNullable<typeof r> => r !== null)

    return {
      profile,
      address,
      contacts,
      classAssignments,
      account: accountDoc
        ? {
            loginId: accountDoc.loginId,
            isActive: accountDoc.isActive,
          }
        : null,
    }
  },
})

const catechistFilterArgs = {
  name: v.optional(v.string()),
  gender: v.optional(v.union(v.literal('male'), v.literal('female'))),
  isActive: v.optional(v.boolean()),
  branchId: v.optional(v.id('branches')),
  academicYearId: v.optional(v.id('academicYears')),
  sortBy: v.optional(
    v.union(
      v.literal('memberId'),
      v.literal('saintName'),
      v.literal('fullName'),
      v.literal('gender'),
      v.literal('isActive'),
      v.literal('joinedDate'),
      v.literal('_creationTime'),
    ),
  ),
  sortOrder: v.optional(v.union(v.literal('asc'), v.literal('desc'))),
}

async function filterAndSortCatechists(
  ctx: QueryCtx | MutationCtx,
  args: {
    name?: string
    gender?: 'male' | 'female'
    isActive?: boolean
    branchId?: Id<'branches'>
    academicYearId?: Id<'academicYears'>
    sortBy?:
      | 'memberId'
      | 'saintName'
      | 'fullName'
      | 'gender'
      | 'isActive'
      | 'joinedDate'
      | '_creationTime'
    sortOrder?: 'asc' | 'desc'
  },
) {
  let eligibleCatechistIds: Set<Id<'catechists'>> | null = null

  if (args.branchId && args.academicYearId) {
    const assignments = await ctx.db
      .query('branchAssignments')
      .withIndex('by_academic_year_id_and_branch_id', (q) =>
        q
          .eq('academicYearId', args.academicYearId!)
          .eq('branchId', args.branchId!),
      )
      .collect()
    const activeAssignments = assignments.filter((a) => !a.isDeleted)
    eligibleCatechistIds = new Set(activeAssignments.map((a) => a.catechistId))
  }

  const catechists = await ctx.db
    .query('catechists')
    .withIndex('by_is_deleted', (q) => q.eq('isDeleted', false))
    .collect()

  const nameQuery = args.name?.trim().toLowerCase()

  const filtered = catechists.filter((c) => {
    if (eligibleCatechistIds && !eligibleCatechistIds.has(c._id)) return false
    if (args.isActive !== undefined && c.isActive !== args.isActive)
      return false
    if (args.gender && c.gender !== args.gender) return false
    if (nameQuery) {
      const fullNameMatch = c.fullName.toLowerCase().includes(nameQuery)
      const saintNameMatch =
        c.saintName?.toLowerCase().includes(nameQuery) ?? false
      if (!fullNameMatch && !saintNameMatch) return false
    }
    return true
  })

  if (args.sortBy) {
    const sortBy = args.sortBy
    const direction = args.sortOrder === 'desc' ? -1 : 1
    filtered.sort((a, b) => {
      const aValue = a[sortBy]
      const bValue = b[sortBy]
      if (aValue === bValue) return 0
      if (aValue === undefined) return 1
      if (bValue === undefined) return -1
      if (aValue < bValue) return -1 * direction
      if (aValue > bValue) return 1 * direction
      return 0
    })
  } else {
    filtered.sort((a, b) => b._creationTime - a._creationTime)
  }

  return filtered
}

export const list = query({
  args: {
    requesterId: v.id('catechists'),
    paginationOpts: paginationOptsValidator,
    ...catechistFilterArgs,
  },
  handler: async (ctx, args) => {
    await assertValidCatechist(ctx, args.requesterId)

    const filtered = await filterAndSortCatechists(ctx, args)

    const cursor = args.paginationOpts.cursor
    const startIndex = cursor ? Number(cursor) : 0
    const numItems = args.paginationOpts.numItems
    const page = filtered.slice(startIndex, startIndex + numItems)
    const isDone = startIndex + numItems >= filtered.length

    // Determine target academic year ID (supplied args.academicYearId or active year)
    let academicYearId = args.academicYearId
    if (!academicYearId) {
      academicYearId = (await getActiveAcademicYear(ctx)) ?? undefined
    }

    const pageWithClasses = await Promise.all(
      page.map(async (c) => {
        if (!academicYearId) {
          return { ...c, assignedClasses: [] }
        }
        const classCatechists = await ctx.db
          .query('classCatechists')
          .withIndex('by_catechist_id', (q) => q.eq('catechistId', c._id))
          .collect()
        const currentYearAssignments = classCatechists.filter(
          (cc) => !cc.isDeleted && cc.academicYearId === academicYearId,
        )

        const assignedClasses = (
          await Promise.all(
            currentYearAssignments.map(async (cc) => {
              const classYear = await ctx.db.get('classYears', cc.classYearId)
              if (!classYear || classYear.isDeleted) return null
              const cls = await ctx.db.get('classes', classYear.classId)
              if (!cls || cls.isDeleted) return null
              return {
                classId: cls._id,
                className: cls.name,
              }
            }),
          )
        ).filter(
          (item): item is { classId: Id<'classes'>; className: string } =>
            item !== null,
        )

        // Sort classes alphabetically by name
        assignedClasses.sort((a, b) => a.className.localeCompare(b.className))

        return {
          ...c,
          assignedClasses,
        }
      }),
    )

    return {
      page: pageWithClasses,
      isDone,
      continueCursor: isDone ? '' : String(startIndex + numItems),
    }
  },
})

export const exportList = query({
  args: {
    requesterId: v.id('catechists'),
    ...catechistFilterArgs,
  },
  handler: async (ctx, args) => {
    await assertValidCatechist(ctx, args.requesterId)

    // Board-member status is checked against the true active year, not a
    // client-supplied one — matches the trust boundary students.ts uses.
    const activeYearId = await getActiveAcademicYear(ctx)
    const perms = await getEffectivePermissions(
      ctx,
      args.requesterId,
      activeYearId ?? undefined,
    )
    if (!perms.isAdmin && !perms.isBoardMember) {
      throw new Error(CATECHIST_ERRORS.EXPORT_UNAUTHORIZED)
    }

    const filtered = await filterAndSortCatechists(ctx, args)

    return Promise.all(
      filtered.map(async (c) => {
        const addresses = await ctx.db
          .query('catechistAddresses')
          .withIndex('by_catechist_id', (q) => q.eq('catechistId', c._id))
          .collect()
        const address = addresses.find((a) => !a.isDeleted)

        const contacts = await ctx.db
          .query('catechistContacts')
          .withIndex('by_catechist_id', (q) => q.eq('catechistId', c._id))
          .collect()
        const activeContacts = contacts.filter((ct) => !ct.isDeleted)
        const primaryPhone = activeContacts.find(
          (ct) => ct.contactType === 'phone' && ct.isPrimary,
        )?.value
        const primaryEmail = activeContacts.find(
          (ct) => ct.contactType === 'email' && ct.isPrimary,
        )?.value

        return {
          memberId: c.memberId,
          saintName: c.saintName,
          fullName: c.fullName,
          gender: c.gender,
          dateOfBirth: c.dateOfBirth,
          role: c.role,
          isActive: c.isActive,
          joinedDate: c.joinedDate,
          title: c.title,
          community: c.community,
          level: c.level,
          notes: c.notes,
          addressLine1: address?.addressLine1,
          addressLine2: address?.addressLine2,
          city: address?.city,
          stateProvince: address?.stateProvince,
          postalCode: address?.postalCode,
          country: address?.country,
          hamlet: address?.hamlet,
          subHamlet: address?.subHamlet,
          primaryPhone,
          primaryEmail,
        }
      }),
    )
  },
})

export const get = query({
  args: { requesterId: v.id('catechists'), catechistId: v.id('catechists') },
  handler: async (ctx, args) => {
    const requester = await assertValidCatechist(ctx, args.requesterId)
    const catechist = await ctx.db.get('catechists', args.catechistId)
    if (!catechist || catechist.isDeleted) return null

    const canViewSensitive =
      args.requesterId === args.catechistId || requester.role === 'admin'

    if (!canViewSensitive) {
      return { ...catechist, address: null, contacts: [], account: null }
    }

    const addr = await ctx.db
      .query('catechistAddresses')
      .withIndex('by_catechist_id', (q) =>
        q.eq('catechistId', args.catechistId),
      )
      .unique()
    const address = addr && !addr.isDeleted ? addr : null

    const allContacts = await ctx.db
      .query('catechistContacts')
      .withIndex('by_catechist_id', (q) =>
        q.eq('catechistId', args.catechistId),
      )
      .collect()
    const contacts = allContacts.filter((c) => !c.isDeleted)

    const account = await ctx.db
      .query('accounts')
      .withIndex('by_login_id', (q) =>
        q.eq('loginId', getCatechistLoginId(catechist.memberId)),
      )
      .unique()

    return {
      ...catechist,
      address,
      contacts,
      account:
        account && !account.isDeleted
          ? {
              _id: account._id,
              isActive: account.isActive,
              loginId: account.loginId,
            }
          : null,
    }
  },
})

// ─── Mutations ────────────────────────────────────────────────────────────────

export const updateMyProfile = mutation({
  args: {
    requesterId: v.id('catechists'),
    catechistId: v.id('catechists'),
    fullName: v.string(),
    saintName: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    gender: v.optional(v.union(v.literal('male'), v.literal('female'))),
    joinedDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    title: v.optional(v.string()),
    community: v.optional(v.string()),
    level: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const requester = await assertValidCatechist(ctx, args.requesterId)
    if (args.requesterId !== args.catechistId && requester.role !== 'admin') {
      throw new Error(CATECHIST_ERRORS.OWN_PROFILE_ONLY)
    }
    const { requesterId, catechistId, ...fields } = args
    await ctx.db.patch('catechists', catechistId, fields)
  },
})

export const upsertMyAddress = mutation({
  args: {
    requesterId: v.id('catechists'),
    catechistId: v.id('catechists'),
    country: v.string(),
    addressLine1: v.optional(v.string()),
    addressLine2: v.optional(v.string()),
    city: v.optional(v.string()),
    stateProvince: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    hamlet: v.optional(v.string()),
    subHamlet: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const requester = await assertValidCatechist(ctx, args.requesterId)
    if (args.requesterId !== args.catechistId && requester.role !== 'admin') {
      throw new Error(CATECHIST_ERRORS.OWN_ADDRESS_ONLY)
    }
    const { requesterId, catechistId, ...fields } = args
    const existing = await ctx.db
      .query('catechistAddresses')
      .withIndex('by_catechist_id', (q) => q.eq('catechistId', catechistId))
      .unique()

    if (existing !== null) {
      await ctx.db.patch('catechistAddresses', existing._id, fields)
    } else {
      await ctx.db.insert('catechistAddresses', {
        catechistId,
        ...fields,
        isDeleted: false,
      })
    }
  },
})

const contactArgs = {
  label: v.string(),
  contactType: v.union(
    v.literal('phone'),
    v.literal('email'),
    v.literal('zalo'),
    v.literal('other'),
  ),
  value: v.string(),
  isPrimary: v.boolean(),
  notes: v.optional(v.string()),
}

export const addContact = mutation({
  args: {
    requesterId: v.id('catechists'),
    catechistId: v.id('catechists'),
    ...contactArgs,
  },
  handler: async (ctx, args) => {
    const requester = await assertValidCatechist(ctx, args.requesterId)
    if (args.requesterId !== args.catechistId && requester.role !== 'admin') {
      throw new Error(CATECHIST_ERRORS.OWN_CONTACT_ONLY)
    }
    if (args.isPrimary) {
      await clearPrimaryContacts(ctx, args.catechistId, args.contactType)
    }
    const { requesterId: _r, ...contactFields } = args
    return await ctx.db.insert('catechistContacts', {
      ...contactFields,
      value:
        args.contactType === 'phone'
          ? normalizeToE164(args.value, CATECHIST_ERRORS.INVALID_PHONE)
          : args.value,
      isDeleted: false,
    })
  },
})

export const updateContact = mutation({
  args: {
    requesterId: v.id('catechists'),
    contactId: v.id('catechistContacts'),
    ...contactArgs,
  },
  handler: async (ctx, args) => {
    const requester = await assertValidCatechist(ctx, args.requesterId)
    const contact = await ctx.db.get('catechistContacts', args.contactId)
    if (!contact || contact.isDeleted) {
      throw new Error(CATECHIST_ERRORS.CONTACT_NOT_FOUND)
    }
    if (
      args.requesterId !== contact.catechistId &&
      requester.role !== 'admin'
    ) {
      throw new Error(CATECHIST_ERRORS.OWN_CONTACT_ONLY)
    }
    if (args.isPrimary) {
      await clearPrimaryContacts(
        ctx,
        contact.catechistId,
        args.contactType,
        args.contactId,
      )
    }
    const { contactId, requesterId, ...fields } = args
    await ctx.db.patch('catechistContacts', contactId, {
      ...fields,
      value:
        args.contactType === 'phone'
          ? normalizeToE164(args.value, CATECHIST_ERRORS.INVALID_PHONE)
          : args.value,
    })
  },
})

export const deleteContact = mutation({
  args: {
    requesterId: v.id('catechists'),
    contactId: v.id('catechistContacts'),
  },
  handler: async (ctx, args) => {
    const requester = await assertValidCatechist(ctx, args.requesterId)
    const contact = await ctx.db.get('catechistContacts', args.contactId)
    if (!contact || contact.isDeleted) {
      throw new Error(CATECHIST_ERRORS.CONTACT_NOT_FOUND)
    }
    if (
      args.requesterId !== contact.catechistId &&
      requester.role !== 'admin'
    ) {
      throw new Error(CATECHIST_ERRORS.OWN_CONTACT_ONLY)
    }
    await ctx.db.patch('catechistContacts', args.contactId, { isDeleted: true })
  },
})

type CatechistCoreFields = {
  fullName: string
  saintName?: string
  dateOfBirth?: string
  gender?: 'male' | 'female'
  role: 'admin' | 'user'
  joinedDate?: string
  notes?: string
  title?: string
  community?: string
  level?: string
  profilePhotoStorageId?: Id<'_storage'>
}

async function insertCatechistRecord(
  ctx: MutationCtx,
  fields: CatechistCoreFields,
): Promise<{ catechistId: Id<'catechists'>; loginId: string }> {
  const memberId = (await nextCounter(ctx, 'catechist')).toString()
  const catechistId = await ctx.db.insert('catechists', {
    ...fields,
    memberId,
    isActive: true,
    isDeleted: false,
  })

  const loginId = getCatechistLoginId(memberId)
  await ctx.db.insert('accounts', {
    loginId,
    passwordHash: hashPassword(loginId),
    accountType: 'catechist',
    userRefId: catechistId,
    mustChangePassword: true,
    isActive: true,
    createdAt: Date.now(),
    isDeleted: false,
  })

  return { catechistId, loginId }
}

export const create = mutation({
  args: {
    requesterId: v.id('catechists'),
    fullName: v.string(),
    saintName: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    gender: v.optional(v.union(v.literal('male'), v.literal('female'))),
    role: v.union(v.literal('admin'), v.literal('user')),
    joinedDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    title: v.optional(v.string()),
    community: v.optional(v.string()),
    level: v.optional(v.string()),
    profilePhotoStorageId: v.optional(v.id('_storage')),
  },
  handler: async (ctx, args) => {
    await assertAdminRole(ctx, args.requesterId)
    const { requesterId, ...fields } = args
    const { catechistId } = await insertCatechistRecord(ctx, fields)
    return catechistId
  },
})

export const createWithDetails = mutation({
  args: {
    requesterId: v.id('catechists'),
    fullName: v.string(),
    saintName: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    gender: v.optional(v.union(v.literal('male'), v.literal('female'))),
    role: v.union(v.literal('admin'), v.literal('user')),
    joinedDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    title: v.optional(v.string()),
    community: v.optional(v.string()),
    level: v.optional(v.string()),
    profilePhotoStorageId: v.optional(v.id('_storage')),
    address: v.optional(
      v.object({
        country: v.string(),
        addressLine1: v.optional(v.string()),
        addressLine2: v.optional(v.string()),
        city: v.optional(v.string()),
        stateProvince: v.optional(v.string()),
        postalCode: v.optional(v.string()),
        hamlet: v.optional(v.string()),
        subHamlet: v.optional(v.string()),
      }),
    ),
    contacts: v.optional(v.array(v.object(contactArgs))),
  },
  handler: async (ctx, args) => {
    await assertAdminRole(ctx, args.requesterId)
    const { requesterId, address, contacts, ...fields } = args

    const normalizedContacts = contacts?.map((contact) =>
      contact.contactType === 'phone'
        ? {
            ...contact,
            value: normalizeToE164(
              contact.value,
              CATECHIST_ERRORS.INVALID_PHONE,
            ),
          }
        : contact,
    )

    const { catechistId, loginId } = await insertCatechistRecord(ctx, fields)

    if (address) {
      await ctx.db.insert('catechistAddresses', {
        catechistId,
        ...address,
        isDeleted: false,
      })
    }

    if (normalizedContacts) {
      // Last contact with isPrimary:true per type wins — matches addContact semantics
      const lastPrimaryIndex = new Map<string, number>()
      normalizedContacts.forEach((c, i) => {
        if (c.isPrimary) lastPrimaryIndex.set(c.contactType, i)
      })
      await Promise.all(
        normalizedContacts.map((contact, i) =>
          ctx.db.insert('catechistContacts', {
            catechistId,
            ...contact,
            isPrimary: lastPrimaryIndex.get(contact.contactType) === i,
            isDeleted: false,
          }),
        ),
      )
    }

    return { catechistId, loginId }
  },
})

// Unified atomic catechist provisioning & account creation mutation
export const createCatechistWithAccount = createWithDetails

export const update = mutation({
  args: {
    requesterId: v.id('catechists'),
    catechistId: v.id('catechists'),
    fullName: v.optional(v.string()),
    saintName: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    gender: v.optional(v.union(v.literal('male'), v.literal('female'))),
    role: v.optional(v.union(v.literal('admin'), v.literal('user'))),
    isActive: v.optional(v.boolean()),
    joinedDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    title: v.optional(v.string()),
    community: v.optional(v.string()),
    level: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertAdminRole(ctx, args.requesterId)
    const catechist = await ctx.db.get('catechists', args.catechistId)
    if (!catechist || catechist.isDeleted) {
      throw new Error(CATECHIST_ERRORS.NOT_FOUND)
    }
    const { requesterId, catechistId, ...fields } = args
    await ctx.db.patch('catechists', catechistId, fields)
  },
})

export const softDelete = mutation({
  args: {
    requesterId: v.id('catechists'),
    catechistId: v.id('catechists'),
  },
  handler: async (ctx, args) => {
    await assertAdminRole(ctx, args.requesterId)
    const catechist = await ctx.db.get('catechists', args.catechistId)
    if (!catechist || catechist.isDeleted) {
      throw new Error(CATECHIST_ERRORS.NOT_FOUND)
    }
    await ctx.db.patch('catechists', args.catechistId, { isDeleted: true })
  },
})

export const softDeleteAddress = mutation({
  args: {
    requesterId: v.id('catechists'),
    catechistId: v.id('catechists'),
  },
  handler: async (ctx, args) => {
    await assertAdminRole(ctx, args.requesterId)
    const addresses = await ctx.db
      .query('catechistAddresses')
      .withIndex('by_catechist_id', (q) =>
        q.eq('catechistId', args.catechistId),
      )
      .collect()
    const address = addresses.find((a) => !a.isDeleted) ?? null
    if (!address) {
      throw new Error(CATECHIST_ERRORS.ADDRESS_NOT_FOUND)
    }
    await ctx.db.patch('catechistAddresses', address._id, { isDeleted: true })
  },
})

// ─── Photo Upload ─────────────────────────────────────────────────────────────

export const updateProfilePhoto = mutation({
  args: {
    requesterId: v.id('catechists'),
    catechistId: v.id('catechists'),
    storageId: v.id('_storage'),
  },
  handler: async (ctx, args) => {
    const requester = await assertValidCatechist(ctx, args.requesterId)
    if (args.requesterId !== args.catechistId && requester.role !== 'admin') {
      throw new Error(CATECHIST_ERRORS.OWN_PROFILE_PHOTO_UPDATE_ONLY)
    }
    await ctx.db.patch('catechists', args.catechistId, {
      profilePhotoStorageId: args.storageId,
    })
  },
})

export const deleteProfilePhoto = mutation({
  args: {
    requesterId: v.id('catechists'),
    catechistId: v.id('catechists'),
  },
  handler: async (ctx, args) => {
    const requester = await assertValidCatechist(ctx, args.requesterId)
    if (args.requesterId !== args.catechistId && requester.role !== 'admin') {
      throw new Error(CATECHIST_ERRORS.OWN_PROFILE_PHOTO_DELETE_ONLY)
    }
    const catechist = await ctx.db.get('catechists', args.catechistId)
    if (!catechist || !catechist.profilePhotoStorageId) return
    await ctx.storage.delete(catechist.profilePhotoStorageId)
    await ctx.db.replace('catechists', args.catechistId, {
      memberId: catechist.memberId,
      fullName: catechist.fullName,
      saintName: catechist.saintName,
      dateOfBirth: catechist.dateOfBirth,
      gender: catechist.gender,
      role: catechist.role,
      isActive: catechist.isActive,
      joinedDate: catechist.joinedDate,
      notes: catechist.notes,
      title: catechist.title,
      community: catechist.community,
      level: catechist.level,
      isDeleted: catechist.isDeleted,
    })
  },
})

export const getProfilePhotoUrl = query({
  args: { catechistId: v.id('catechists') },
  handler: async (ctx, args) => {
    const catechist = await ctx.db.get('catechists', args.catechistId)
    if (!catechist || !catechist.profilePhotoStorageId) return null
    return await ctx.storage.getUrl(catechist.profilePhotoStorageId)
  },
})

export const listAllActive = query({
  args: {
    requesterId: v.id('catechists'),
  },
  handler: async (ctx, args) => {
    await assertValidCatechist(ctx, args.requesterId)
    const catechists = await ctx.db
      .query('catechists')
      .withIndex('by_is_deleted', (q) => q.eq('isDeleted', false))
      .collect()

    return catechists
      .filter((c) => c.isActive)
      .map((c) => ({
        _id: c._id,
        memberId: c.memberId,
        fullName: c.fullName,
        saintName: c.saintName,
      }))
  },
})

export const updateWithDetails = mutation({
  args: {
    requesterId: v.id('catechists'),
    catechistId: v.id('catechists'),
    fullName: v.optional(v.string()),
    saintName: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    gender: v.optional(v.union(v.literal('male'), v.literal('female'))),
    role: v.optional(v.union(v.literal('admin'), v.literal('user'))),
    isActive: v.optional(v.boolean()),
    joinedDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    title: v.optional(v.string()),
    community: v.optional(v.string()),
    level: v.optional(v.string()),
    profilePhotoStorageId: v.optional(v.id('_storage')),
    address: v.optional(
      v.object({
        country: v.optional(v.string()),
        addressLine1: v.optional(v.string()),
        addressLine2: v.optional(v.string()),
        city: v.optional(v.string()),
        stateProvince: v.optional(v.string()),
        postalCode: v.optional(v.string()),
        hamlet: v.optional(v.string()),
        subHamlet: v.optional(v.string()),
      }),
    ),
    contacts: v.optional(
      v.array(
        v.object({
          _id: v.optional(v.id('catechistContacts')),
          ...contactArgs,
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const requester = await assertValidCatechist(ctx, args.requesterId)
    if (args.requesterId !== args.catechistId && requester.role !== 'admin') {
      throw new Error(CATECHIST_ERRORS.OWN_PROFILE_ONLY)
    }

    const catechist = await ctx.db.get('catechists', args.catechistId)
    if (!catechist || catechist.isDeleted) {
      throw new Error(CATECHIST_ERRORS.NOT_FOUND)
    }

    const { requesterId, catechistId, address, contacts, ...profileFields } =
      args

    if (Object.keys(profileFields).length > 0) {
      await ctx.db.patch('catechists', catechistId, profileFields)
    }

    if (address) {
      const existingAddress = await ctx.db
        .query('catechistAddresses')
        .withIndex('by_catechist_id', (q) => q.eq('catechistId', catechistId))
        .unique()

      if (existingAddress) {
        await ctx.db.patch('catechistAddresses', existingAddress._id, address)
      } else {
        await ctx.db.insert('catechistAddresses', {
          catechistId,
          ...address,
          country: address.country ?? 'VN',
          isDeleted: false,
        })
      }
    }

    if (contacts) {
      const existingContacts = await ctx.db
        .query('catechistContacts')
        .withIndex('by_catechist_id', (q) => q.eq('catechistId', catechistId))
        .collect()

      const activeExisting = existingContacts.filter((c) => !c.isDeleted)
      const submittedIds = new Set(
        contacts
          .map((c) => c._id)
          .filter((id): id is Id<'catechistContacts'> => !!id),
      )

      for (const existing of activeExisting) {
        if (!submittedIds.has(existing._id)) {
          await ctx.db.patch('catechistContacts', existing._id, {
            isDeleted: true,
          })
        }
      }

      for (const c of contacts) {
        const value =
          c.contactType === 'phone'
            ? normalizeToE164(c.value, CATECHIST_ERRORS.INVALID_PHONE)
            : c.value

        if (c.isPrimary) {
          await clearPrimaryContacts(ctx, catechistId, c.contactType, c._id)
        }

        if (c._id) {
          await ctx.db.patch('catechistContacts', c._id, {
            label: c.label,
            contactType: c.contactType,
            value,
            isPrimary: c.isPrimary,
            notes: c.notes,
          })
        } else {
          await ctx.db.insert('catechistContacts', {
            catechistId,
            label: c.label,
            contactType: c.contactType,
            value,
            isPrimary: c.isPrimary,
            notes: c.notes,
            isDeleted: false,
          })
        }
      }
    }

    return catechistId
  },
})

export const transformStudentsToCatechists = mutation({
  args: {
    requesterId: v.id('catechists'),
    studentIds: v.array(v.id('students')),
  },
  handler: async (ctx, args) => {
    await assertAdminRole(ctx, args.requesterId)

    if (args.studentIds.length === 0) {
      return { count: 0, createdCatechistIds: [] }
    }

    const todayStr = new Date().toISOString().split('T')[0]
    const createdCatechistIds: Array<Id<'catechists'>> = []

    for (const studentId of args.studentIds) {
      const student = await ctx.db.get('students', studentId)
      if (!student || student.isDeleted) {
        continue
      }

      const seq = await nextCounter(ctx, 'catechist')
      const memberId = String(seq)

      const newCatechistId = await ctx.db.insert('catechists', {
        memberId,
        fullName: student.fullName,
        saintName: student.saintName,
        dateOfBirth: student.dateOfBirth,
        gender: student.gender,
        role: 'user',
        isActive: true,
        joinedDate: todayStr,
        profilePhotoStorageId: student.profilePhotoStorageId,
        isDeleted: false,
      })

      const studentAddr = await ctx.db
        .query('studentAddresses')
        .withIndex('by_student_id', (q) => q.eq('studentId', studentId))
        .unique()

      if (studentAddr && !studentAddr.isDeleted) {
        await ctx.db.insert('catechistAddresses', {
          catechistId: newCatechistId,
          country: studentAddr.country,
          addressLine1: studentAddr.addressLine1,
          addressLine2: studentAddr.addressLine2,
          city: studentAddr.city,
          stateProvince: studentAddr.stateProvince,
          postalCode: studentAddr.postalCode,
          hamlet: studentAddr.hamlet,
          subHamlet: studentAddr.subHamlet,
          isDeleted: false,
        })
      }

      const loginId = getCatechistLoginId(memberId)
      const existingAccount = await ctx.db
        .query('accounts')
        .withIndex('by_login_id', (q) => q.eq('loginId', loginId))
        .first()

      if (!existingAccount) {
        await ctx.db.insert('accounts', {
          loginId,
          passwordHash: hashPassword(loginId),
          accountType: 'catechist',
          userRefId: newCatechistId,
          mustChangePassword: true,
          isActive: true,
          createdAt: Date.now(),
          isDeleted: false,
        })
      }

      createdCatechistIds.push(newCatechistId)
    }

    const createdItems = await Promise.all(
      createdCatechistIds.map(async (catId) => {
        const c = await ctx.db.get('catechists', catId)
        const loginId = c ? getCatechistLoginId(c.memberId) : ''
        return {
          catechistId: catId,
          memberId: c?.memberId ?? '',
          fullName: c?.fullName ?? '',
          saintName: c?.saintName,
          loginId,
          initialPassword: loginId,
        }
      }),
    )

    return {
      count: createdItems.length,
      items: createdItems,
    }
  },
})
