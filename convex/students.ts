import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import {
  assertAdminRole,
  assertEditStudentPermission,
  assertEnrollmentPermission,
  assertValidCatechist,
  assertValidStudent,
  checkEditStudentPermission,
  checkStudentSensitiveInfoPermission,
  getActiveAcademicYear,
  getEffectivePermissions,
  hasPrimaryClassConflict,
} from './lib/authz'
import {
  computeAttendanceSummary,
  isClassScopedSession,
} from './lib/attendance'
import { nextCounter } from './lib/counter'
import { ENROLLMENT_ERRORS, STUDENT_ERRORS } from './lib/errors'
import { hashPassword } from './lib/password'
import { getStudentLoginId } from './lib/accountPrefix'
import { upsertSacramentRecord } from './lib/sacramentHelpers'
import { maskAddress, maskEmailOrOther, maskPhoneOrZalo } from './lib/masking'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { DataModel, Doc, Id } from './_generated/dataModel'

// Creates a student row plus its login account (loginId `STD-${studentCode}`).
// Shared by the `create` mutation and CSV import so the account-creation
// shape (loginId format, password hash, account fields) has one owner.
// Caller is responsible for permission checks, studentCode generation, and
// any enrollment/guardian linking.
export async function createStudentWithAccount(
  ctx: MutationCtx,
  args: {
    studentCode: string
    fullName: string
    saintName?: string
    dateOfBirth?: string
    gender?: 'male' | 'female'
    previousParish?: string
    previousDiocese?: string
    isActive?: boolean
    profilePhotoStorageId?: Id<'_storage'>
    passwordHash?: string
  },
): Promise<Id<'students'>> {
  const { studentCode, isActive, passwordHash, ...fields } = args
  const studentId = await ctx.db.insert('students', {
    ...fields,
    studentCode,
    isActive: isActive ?? true,
    isDeleted: false,
    createdAt: Date.now(),
  })

  const loginId = getStudentLoginId(studentCode)
  await ctx.db.insert('accounts', {
    loginId,
    passwordHash: passwordHash ?? hashPassword(loginId),
    accountType: 'student',
    userRefId: studentId,
    mustChangePassword: true,
    isActive: true,
    createdAt: Date.now(),
    isDeleted: false,
  })

  return studentId
}

// Resolves the set of student ids enrolled (non-deleted) in a given class
// year. Used by the `list` query's classYear/branch filters.
async function getStudentIdsInClassYear(
  ctx: QueryCtx,
  classYearId: Id<'classYears'>,
): Promise<Array<Id<'students'>>> {
  const enrollments = await ctx.db
    .query('studentClasses')
    .withIndex('by_class_year_id', (q) => q.eq('classYearId', classYearId))
    .collect()
  return enrollments.filter((e) => !e.isDeleted).map((e) => e.studentId)
}

const studentFilterArgs = {
  name: v.optional(v.string()),
  gender: v.optional(v.union(v.literal('male'), v.literal('female'))),
  isActive: v.optional(v.boolean()),
  // Class/branch filters are scoped to a single academic year: classYearId
  // already pins one, branchId needs academicYearId to disambiguate which
  // year's classes to match against.
  classYearId: v.optional(v.id('classYears')),
  branchId: v.optional(v.id('branches')),
  academicYearId: v.optional(v.id('academicYears')),
  sortBy: v.optional(
    v.union(
      v.literal('studentCode'),
      v.literal('saintName'),
      v.literal('fullName'),
      v.literal('gender'),
      v.literal('isActive'),
      v.literal('_creationTime'),
    ),
  ),
  sortOrder: v.optional(v.union(v.literal('asc'), v.literal('desc'))),
}

// Resolves student IDs matching optional classYear and branch/academicYear scoping criteria.
export async function resolveStudentIdsForScope(
  ctx: QueryCtx,
  args: {
    classYearId?: Id<'classYears'>
    branchId?: Id<'branches'>
    academicYearId?: Id<'academicYears'>
  },
): Promise<Set<Id<'students'>> | null> {
  let eligibleStudentIds: Set<Id<'students'>> | null = null

  if (args.classYearId) {
    eligibleStudentIds = new Set(
      await getStudentIdsInClassYear(ctx, args.classYearId),
    )
  }

  if (args.branchId) {
    const classesInBranch = await ctx.db
      .query('classes')
      .withIndex('by_branch_id', (q) => q.eq('branchId', args.branchId!))
      .collect()

    const classYearIds: Array<Id<'classYears'>> = []
    for (const cls of classesInBranch) {
      if (cls.isDeleted) continue
      const classYears = args.academicYearId
        ? await ctx.db
            .query('classYears')
            .withIndex('by_class_id_and_academic_year_id', (q) =>
              q
                .eq('classId', cls._id)
                .eq('academicYearId', args.academicYearId!),
            )
            .collect()
        : await ctx.db
            .query('classYears')
            .withIndex('by_class_id', (q) => q.eq('classId', cls._id))
            .collect()
      for (const cy of classYears) {
        if (!cy.isDeleted) classYearIds.push(cy._id)
      }
    }

    const branchStudentIds = new Set<Id<'students'>>()
    for (const classYearId of classYearIds) {
      for (const studentId of await getStudentIdsInClassYear(
        ctx,
        classYearId,
      )) {
        branchStudentIds.add(studentId)
      }
    }

    eligibleStudentIds = eligibleStudentIds
      ? new Set(
          [...eligibleStudentIds].filter((id) => branchStudentIds.has(id)),
        )
      : branchStudentIds
  }

  return eligibleStudentIds
}

async function filterAndSortStudents(
  ctx: QueryCtx,
  args: {
    name?: string
    gender?: 'male' | 'female'
    isActive?: boolean
    classYearId?: Id<'classYears'>
    branchId?: Id<'branches'>
    academicYearId?: Id<'academicYears'>
    sortBy?:
      | 'studentCode'
      | 'saintName'
      | 'fullName'
      | 'gender'
      | 'isActive'
      | '_creationTime'
    sortOrder?: 'asc' | 'desc'
  },
) {
  const eligibleStudentIds = await resolveStudentIdsForScope(ctx, args)

  const students = await ctx.db
    .query('students')
    .withIndex('by_is_deleted', (q) => q.eq('isDeleted', false))
    .collect()

  const nameQuery = args.name?.trim().toLowerCase()

  const filtered = students.filter((s) => {
    if (args.isActive !== undefined && s.isActive !== args.isActive) {
      return false
    }
    if (args.gender && s.gender !== args.gender) return false
    if (nameQuery) {
      const fullNameMatch = s.fullName.toLowerCase().includes(nameQuery)
      const saintNameMatch =
        s.saintName?.toLowerCase().includes(nameQuery) ?? false
      if (!fullNameMatch && !saintNameMatch) return false
    }
    if (eligibleStudentIds && !eligibleStudentIds.has(s._id)) return false
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

// Priority-1 (non-deleted) guardian's primary phone/email — the guardian
// record, not the student, owns contact info (see schema.ts GuardianContact).
async function getPrimaryGuardianContact(
  ctx: QueryCtx,
  studentId: Id<'students'>,
) {
  const links = await ctx.db
    .query('studentGuardians')
    .withIndex('by_student_id', (q) => q.eq('studentId', studentId))
    .collect()
  const active = links.filter((l) => !l.isDeleted)
  if (active.length === 0) return null

  active.sort((a, b) => a.contactPriority - b.contactPriority)
  const top = active[0]
  const guardian = await ctx.db.get('guardians', top.guardianId)
  if (!guardian || guardian.isDeleted) return null

  const contacts = await ctx.db
    .query('guardianContacts')
    .withIndex('by_guardian_id', (q) => q.eq('guardianId', guardian._id))
    .collect()
  const activeContacts = contacts.filter((c) => !c.isDeleted)
  const primaryPhone = activeContacts.find(
    (c) => c.contactType === 'phone' && c.isPrimary,
  )?.value
  const primaryEmail = activeContacts.find(
    (c) => c.contactType === 'email' && c.isPrimary,
  )?.value

  return {
    name: guardian.fullName,
    relationship: top.relationship,
    primaryPhone,
    primaryEmail,
  }
}

export const list = query({
  args: {
    requesterId: v.id('catechists'),
    paginationOpts: paginationOptsValidator,
    ...studentFilterArgs,
  },
  handler: async (ctx, args) => {
    const catechist = await assertValidCatechist(ctx, args.requesterId)
    const activeYearId = await getActiveAcademicYear(ctx)
    let isBoardMemberForActiveYear = false
    if (activeYearId) {
      const boardAssignment = await ctx.db
        .query('academicYearAssignments')
        .withIndex('by_academic_year_id_and_catechist_id', (q) =>
          q
            .eq('academicYearId', activeYearId)
            .eq('catechistId', args.requesterId),
        )
        .first()
      isBoardMemberForActiveYear = !!(
        boardAssignment && !boardAssignment.isDeleted
      )
    }
    const prefetchedPerms = {
      role: catechist.role,
      activeAcademicYearId: activeYearId,
      isBoardMemberForActiveYear,
    }

    const filtered = await filterAndSortStudents(ctx, args)

    const cursor = args.paginationOpts.cursor
    const startIndex = cursor ? Number(cursor) : 0
    const numItems = args.paginationOpts.numItems
    const page = filtered.slice(startIndex, startIndex + numItems)
    const isDone = startIndex + numItems >= filtered.length

    let targetAcademicYearId = args.academicYearId
    if (!targetAcademicYearId) {
      targetAcademicYearId = activeYearId ?? undefined
    }

    const pageWithDetails = await Promise.all(
      page.map(async (student) => {
        const isEditable = await checkEditStudentPermission(
          ctx,
          args.requesterId,
          student._id,
          prefetchedPerms,
        )

        let joinedClasses: Array<{
          classId: Id<'classes'>
          className: string
        }> = []

        if (targetAcademicYearId) {
          const studentClasses = await ctx.db
            .query('studentClasses')
            .withIndex('by_student_id', (q) => q.eq('studentId', student._id))
            .collect()
          const activeStudentClasses = studentClasses.filter(
            (sc) => !sc.isDeleted,
          )

          joinedClasses = (
            await Promise.all(
              activeStudentClasses.map(async (sc) => {
                const classYear = await ctx.db.get('classYears', sc.classYearId)
                if (
                  !classYear ||
                  classYear.isDeleted ||
                  classYear.academicYearId !== targetAcademicYearId
                ) {
                  return null
                }
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
        }

        return {
          ...student,
          isEditable,
          joinedClasses,
        }
      }),
    )

    return {
      page: pageWithDetails,
      isDone,
      continueCursor: isDone ? '' : String(startIndex + numItems),
    }
  },
})

export const exportList = query({
  args: {
    requesterId: v.id('catechists'),
    ...studentFilterArgs,
  },
  handler: async (ctx, args) => {
    await assertValidCatechist(ctx, args.requesterId)

    // Board-member status is checked against the true active year, not a
    // client-supplied one — matches the trust boundary `list` already uses.
    const activeYearId = await getActiveAcademicYear(ctx)
    const perms = await getEffectivePermissions(
      ctx,
      args.requesterId,
      activeYearId ?? undefined,
    )
    if (!perms.isAdmin && !perms.isBoardMember) {
      throw new Error(STUDENT_ERRORS.EXPORT_UNAUTHORIZED)
    }

    const filtered = await filterAndSortStudents(ctx, args)

    return Promise.all(
      filtered.map(async (s) => {
        const addresses = await ctx.db
          .query('studentAddresses')
          .withIndex('by_student_id', (q) => q.eq('studentId', s._id))
          .collect()
        const address = addresses.find((a) => !a.isDeleted)

        const guardianContact = await getPrimaryGuardianContact(ctx, s._id)

        return {
          studentCode: s.studentCode,
          saintName: s.saintName,
          fullName: s.fullName,
          gender: s.gender,
          dateOfBirth: s.dateOfBirth,
          isActive: s.isActive,
          previousParish: s.previousParish,
          previousDiocese: s.previousDiocese,
          addressLine1: address?.addressLine1,
          addressLine2: address?.addressLine2,
          city: address?.city,
          stateProvince: address?.stateProvince,
          postalCode: address?.postalCode,
          country: address?.country,
          hamlet: address?.hamlet,
          subHamlet: address?.subHamlet,
          fullAddress: address?.fullAddress,
          primaryGuardianName: guardianContact?.name,
          primaryGuardianRelationship: guardianContact?.relationship,
          primaryPhone: guardianContact?.primaryPhone,
          primaryEmail: guardianContact?.primaryEmail,
        }
      }),
    )
  },
})

export const get = query({
  args: { requesterId: v.id('catechists'), id: v.id('students') },
  handler: async (ctx, args) => {
    await assertValidCatechist(ctx, args.requesterId)
    const student = await ctx.db.get('students', args.id)
    if (!student || student.isDeleted) return null

    const canViewSensitive = await checkStudentSensitiveInfoPermission(
      ctx,
      args.requesterId,
      args.id,
    )

    const address = canViewSensitive
      ? await ctx.db
          .query('studentAddresses')
          .withIndex('by_student_id', (q) => q.eq('studentId', args.id))
          .unique()
      : null

    const links = await ctx.db
      .query('studentGuardians')
      .withIndex('by_student_id', (q) => q.eq('studentId', args.id))
      // eslint-disable-next-line @convex-dev/no-filter-in-query
      .filter((q) => q.eq(q.field('isDeleted'), false))
      .collect()

    const guardians = await Promise.all(
      links.map(async (link) => {
        let guardian = await ctx.db.get('guardians', link.guardianId)
        if (guardian?.isDeleted) {
          guardian = null
        }
        const contacts =
          guardian && canViewSensitive
            ? (
                await ctx.db
                  .query('guardianContacts')
                  .withIndex('by_guardian_id', (q) =>
                    q.eq('guardianId', link.guardianId),
                  )
                  .collect()
              ).filter((c) => !c.isDeleted)
            : []
        return { ...link, guardian, contacts }
      }),
    )

    return {
      ...student,
      address: address?.isDeleted ? null : (address ?? null),
      guardians,
    }
  },
})

export const create = mutation({
  args: {
    requesterId: v.id('catechists'),
    fullName: v.string(),
    saintName: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()), // ISO: YYYY-MM-DD
    gender: v.optional(v.union(v.literal('male'), v.literal('female'))),
    previousParish: v.optional(v.string()),
    previousDiocese: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    profilePhotoStorageId: v.optional(v.id('_storage')),
  },
  handler: async (ctx, args) => {
    await assertValidCatechist(ctx, args.requesterId)

    const seq = await nextCounter(ctx, 'student')
    const studentCode = String(seq)

    const { requesterId, ...fields } = args
    return await createStudentWithAccount(ctx, { ...fields, studentCode })
  },
})

// Unified atomic student registration mutation including address, sacraments, guardians, and initial enrollment
export const createStudentWithProfile = mutation({
  args: {
    requesterId: v.id('catechists'),
    student: v.object({
      fullName: v.string(),
      saintName: v.optional(v.string()),
      dateOfBirth: v.optional(v.string()),
      gender: v.optional(v.union(v.literal('male'), v.literal('female'))),
      previousParish: v.optional(v.string()),
      previousDiocese: v.optional(v.string()),
      isActive: v.optional(v.boolean()),
      profilePhotoStorageId: v.optional(v.id('_storage')),
    }),
    address: v.optional(
      v.object({
        country: v.optional(v.string()),
        fullAddress: v.optional(v.string()),
        addressLine1: v.optional(v.string()),
        addressLine2: v.optional(v.string()),
        city: v.optional(v.string()),
        stateProvince: v.optional(v.string()),
        postalCode: v.optional(v.string()),
        hamlet: v.optional(v.string()),
        subHamlet: v.optional(v.string()),
      }),
    ),
    sacraments: v.optional(
      v.array(
        v.object({
          sacramentType: v.union(
            v.literal('baptism'),
            v.literal('first_confession'),
            v.literal('first_communion'),
            v.literal('confirmation'),
          ),
          receivedDate: v.optional(v.string()),
          receivedPlace: v.optional(v.string()),
          feastName: v.optional(v.string()),
          sponsorName: v.optional(v.string()),
          notes: v.optional(v.string()),
        }),
      ),
    ),
    guardians: v.optional(
      v.array(
        v.object({
          guardianId: v.optional(v.id('guardians')),
          fullName: v.string(),
          saintName: v.optional(v.string()),
          relationship: v.string(),
          contactPriority: v.number(),
          phone: v.optional(v.string()),
          email: v.optional(v.string()),
          notes: v.optional(v.string()),
        }),
      ),
    ),
    initialEnrollment: v.optional(
      v.object({
        classYearId: v.id('classYears'),
        isPrimaryClass: v.boolean(),
        enrolledDate: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await assertValidCatechist(ctx, args.requesterId)

    const seq = await nextCounter(ctx, 'student')
    const studentCode = String(seq)

    const studentId = await createStudentWithAccount(ctx, {
      ...args.student,
      studentCode,
    })

    if (args.address) {
      const { country, ...addressFields } = args.address
      await ctx.db.insert('studentAddresses', {
        studentId,
        country: country ?? 'VN',
        ...addressFields,
        isDeleted: false,
      })
    }

    if (args.sacraments && args.sacraments.length > 0) {
      for (const sac of args.sacraments) {
        const { sacramentType, ...fields } = sac
        await upsertSacramentRecord(ctx, {
          studentId,
          sacramentType,
          fields,
        })
      }
    }

    if (args.guardians && args.guardians.length > 0) {
      for (const g of args.guardians) {
        let guardianId: Id<'guardians'>

        if (g.guardianId) {
          guardianId = g.guardianId
        } else {
          guardianId = await ctx.db.insert('guardians', {
            fullName: g.fullName,
            saintName: g.saintName,
            notes: g.notes,
            isDeleted: false,
          })

          if (g.phone) {
            await ctx.db.insert('guardianContacts', {
              guardianId,
              contactType: 'phone',
              value: g.phone,
              isPrimary: true,
              isDeleted: false,
            })
          }
          if (g.email) {
            await ctx.db.insert('guardianContacts', {
              guardianId,
              contactType: 'email',
              value: g.email,
              isPrimary: true,
              isDeleted: false,
            })
          }
        }

        await ctx.db.insert('studentGuardians', {
          studentId,
          guardianId,
          relationship: g.relationship,
          contactPriority: g.contactPriority,
          notes: g.notes,
          isDeleted: false,
        })
      }
    }

    if (args.initialEnrollment) {
      await enrollStudentsInternal(ctx, {
        requesterId: args.requesterId,
        studentIds: [studentId],
        classYearId: args.initialEnrollment.classYearId,
        isPrimaryClass: args.initialEnrollment.isPrimaryClass,
        enrolledDate: args.initialEnrollment.enrolledDate,
      })
    }

    return studentId
  },
})

export const update = mutation({
  args: {
    requesterId: v.id('catechists'),
    studentId: v.id('students'),
    fullName: v.optional(v.string()),
    saintName: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    gender: v.optional(v.union(v.literal('male'), v.literal('female'))),
    previousParish: v.optional(v.string()),
    previousDiocese: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await assertEditStudentPermission(ctx, args.requesterId, args.studentId)

    const student = await ctx.db.get('students', args.studentId)
    if (!student || student.isDeleted) {
      throw new Error(STUDENT_ERRORS.NOT_FOUND)
    }

    const { requesterId, studentId, ...fields } = args
    await ctx.db.patch('students', studentId, fields)
  },
})

export const softDelete = mutation({
  args: {
    requesterId: v.id('catechists'),
    studentId: v.id('students'),
  },
  handler: async (ctx, args) => {
    await assertAdminRole(ctx, args.requesterId)

    const student = await ctx.db.get('students', args.studentId)
    if (!student || student.isDeleted) {
      throw new Error(STUDENT_ERRORS.NOT_FOUND)
    }

    // Guard: cannot delete student enrolled in active classes
    const enrollments = await ctx.db
      .query('studentClasses')
      .withIndex('by_student_id', (q) => q.eq('studentId', args.studentId))
      .collect()

    if (enrollments.some((e) => !e.isDeleted && e.status === 'active')) {
      throw new Error(STUDENT_ERRORS.IN_USE_BY_ENROLLMENT)
    }

    await ctx.db.patch('students', args.studentId, { isDeleted: true })
  },
})

export const getStudentAddress = query({
  args: {
    requesterId: v.id('catechists'),
    studentId: v.id('students'),
  },
  handler: async (ctx, { requesterId, studentId }) => {
    await assertValidCatechist(ctx, requesterId)
    return await ctx.db
      .query('studentAddresses')
      .withIndex('by_student_id', (q) => q.eq('studentId', studentId))
      // eslint-disable-next-line @convex-dev/no-filter-in-query
      .filter((q) => q.eq(q.field('isDeleted'), false))
      .unique()
  },
})

export const upsertStudentAddress = mutation({
  args: {
    requesterId: v.id('catechists'),
    studentId: v.id('students'),
    country: v.string(),
    fullAddress: v.optional(v.string()),
    addressLine1: v.optional(v.string()),
    addressLine2: v.optional(v.string()),
    city: v.optional(v.string()),
    stateProvince: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    hamlet: v.optional(v.string()),
    subHamlet: v.optional(v.string()),
  },
  handler: async (ctx, { requesterId, studentId, ...fields }) => {
    await assertEditStudentPermission(ctx, requesterId, studentId)
    const existing = await ctx.db
      .query('studentAddresses')
      .withIndex('by_student_id', (q) => q.eq('studentId', studentId))
      .unique()
    if (existing !== null) {
      await ctx.db.patch('studentAddresses', existing._id, fields)
    } else {
      await ctx.db.insert('studentAddresses', {
        studentId,
        ...fields,
        isDeleted: false,
      })
    }
  },
})

export const softDeleteStudentAddress = mutation({
  args: {
    requesterId: v.id('catechists'),
    studentId: v.id('students'),
  },
  handler: async (ctx, { requesterId, studentId }) => {
    await assertEditStudentPermission(ctx, requesterId, studentId)
    const address = await ctx.db
      .query('studentAddresses')
      .withIndex('by_student_id', (q) => q.eq('studentId', studentId))
      .unique()
    if (!address || address.isDeleted) {
      throw new Error(STUDENT_ERRORS.ADDRESS_NOT_FOUND)
    }
    await ctx.db.patch('studentAddresses', address._id, { isDeleted: true })
  },
})

export const upsertStudentSacrament = mutation({
  args: {
    requesterId: v.id('catechists'),
    studentId: v.id('students'),
    sacramentType: v.union(
      v.literal('baptism'),
      v.literal('first_confession'),
      v.literal('first_communion'),
      v.literal('confirmation'),
    ),
    receivedDate: v.optional(v.string()),
    receivedPlace: v.optional(v.string()),
    feastName: v.optional(v.string()),
    sponsorName: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertEditStudentPermission(ctx, args.requesterId, args.studentId)
    const { requesterId, studentId, sacramentType, ...fields } = args

    return await upsertSacramentRecord(ctx, {
      studentId,
      sacramentType,
      fields,
    })
  },
})

export const updateStudentSacramentDetails = mutation({
  args: {
    requesterId: v.id('catechists'),
    studentId: v.id('students'),
    sacramentType: v.union(
      v.literal('baptism'),
      v.literal('first_confession'),
      v.literal('first_communion'),
      v.literal('confirmation'),
    ),
    receivedDate: v.optional(v.string()),
    receivedPlace: v.optional(v.string()),
    feastName: v.optional(v.string()),
    sponsorName: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertEditStudentPermission(ctx, args.requesterId, args.studentId)
    const { requesterId, studentId, sacramentType, ...fields } = args

    await upsertSacramentRecord(ctx, { studentId, sacramentType, fields })
  },
})

export const softDeleteStudentSacrament = mutation({
  args: {
    requesterId: v.id('catechists'),
    studentId: v.id('students'),
    sacramentType: v.union(
      v.literal('baptism'),
      v.literal('first_confession'),
      v.literal('first_communion'),
      v.literal('confirmation'),
    ),
  },
  handler: async (ctx, args) => {
    await assertEditStudentPermission(ctx, args.requesterId, args.studentId)
    const { studentId, sacramentType } = args

    const existing = await ctx.db
      .query('studentSacraments')
      .withIndex('by_student_id_and_sacrament_type', (q) =>
        q.eq('studentId', studentId).eq('sacramentType', sacramentType),
      )
      .unique()

    if (existing && !existing.isDeleted) {
      await ctx.db.patch('studentSacraments', existing._id, { isDeleted: true })
    }
  },
})

export const bulkUpdateStudentSacraments = mutation({
  args: {
    requesterId: v.id('catechists'),
    classYearId: v.id('classYears'),
    studentIds: v.array(v.id('students')),
    sacramentType: v.union(
      v.literal('baptism'),
      v.literal('first_confession'),
      v.literal('first_communion'),
      v.literal('confirmation'),
    ),
    receivedDate: v.string(),
    receivedPlace: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertEnrollmentPermission(ctx, args.requesterId, args.classYearId)

    const classYear = await ctx.db.get('classYears', args.classYearId)
    if (!classYear || classYear.isDeleted) {
      throw new Error(ENROLLMENT_ERRORS.CLASS_YEAR_NOT_FOUND)
    }

    // Batch-fetch all enrollments in parallel
    const enrollments = await Promise.all(
      args.studentIds.map((studentId) =>
        ctx.db
          .query('studentClasses')
          .withIndex('by_student_id_and_class_year_id', (q) =>
            q.eq('studentId', studentId).eq('classYearId', args.classYearId),
          )
          .unique(),
      ),
    )

    // Validate all enrollments before writing anything
    for (let i = 0; i < args.studentIds.length; i++) {
      const enrollment = enrollments[i]
      if (
        !enrollment ||
        enrollment.isDeleted ||
        enrollment.status !== 'active'
      ) {
        throw new Error(ENROLLMENT_ERRORS.STUDENT_NOT_ENROLLED)
      }
    }

    // Apply upserts
    await Promise.all(
      args.studentIds.map(async (studentId) => {
        const fields: Partial<DataModel['studentSacraments']['document']> = {
          receivedDate: args.receivedDate,
        }
        if (args.receivedPlace !== undefined) {
          fields.receivedPlace = args.receivedPlace
        }

        await upsertSacramentRecord(ctx, {
          studentId,
          sacramentType: args.sacramentType,
          fields,
        })
      }),
    )
  },
})

async function enrollStudentsInternal(
  ctx: MutationCtx,
  args: {
    requesterId: Id<'catechists'>
    studentIds: Array<Id<'students'>>
    classYearId: Id<'classYears'>
    isPrimaryClass: boolean
    enrolledDate: string
    skipPermissionCheck?: boolean
  },
): Promise<Array<Id<'studentClasses'>>> {
  if (!args.skipPermissionCheck) {
    await assertEnrollmentPermission(ctx, args.requesterId, args.classYearId)
  }

  const classYear = await ctx.db.get('classYears', args.classYearId)
  if (!classYear || classYear.isDeleted) {
    throw new Error(ENROLLMENT_ERRORS.CLASS_YEAR_NOT_FOUND)
  }

  const academicYear = await ctx.db.get(
    'academicYears',
    classYear.academicYearId,
  )
  if (!academicYear || academicYear.isDeleted || !academicYear.isActive) {
    throw new Error(ENROLLMENT_ERRORS.ACADEMIC_YEAR_NOT_ACTIVE)
  }

  const results: Array<Id<'studentClasses'>> = []

  for (const studentId of args.studentIds) {
    const student = await ctx.db.get('students', studentId)
    if (!student || student.isDeleted) {
      throw new Error(STUDENT_ERRORS.NOT_FOUND)
    }

    const existing = await ctx.db
      .query('studentClasses')
      .withIndex('by_student_id_and_class_year_id', (q) =>
        q.eq('studentId', studentId).eq('classYearId', args.classYearId),
      )
      .unique()

    if (existing) {
      if (existing.isDeleted || existing.status !== 'active') {
        // Reactivation flow
        if (args.isPrimaryClass) {
          const conflict = await hasPrimaryClassConflict(
            ctx,
            studentId,
            classYear.academicYearId,
            existing._id,
          )
          if (conflict) {
            throw new Error(ENROLLMENT_ERRORS.PRIMARY_CLASS_CONFLICT)
          }
        }
        await ctx.db.patch('studentClasses', existing._id, {
          status: 'active',
          enrolledDate: args.enrolledDate,
          isPrimaryClass: args.isPrimaryClass,
          isDeleted: false,
          leftDate: undefined,
          statusChangedDate: undefined,
        })
        results.push(existing._id)
        continue
      }

      // Already-enrolled flow
      if (existing.isPrimaryClass === args.isPrimaryClass) {
        throw new Error(ENROLLMENT_ERRORS.ALREADY_ENROLLED)
      }
      if (args.isPrimaryClass) {
        const conflict = await hasPrimaryClassConflict(
          ctx,
          studentId,
          classYear.academicYearId,
          existing._id,
        )
        if (conflict) {
          throw new Error(ENROLLMENT_ERRORS.PRIMARY_CLASS_CONFLICT)
        }
      }
      await ctx.db.patch('studentClasses', existing._id, {
        isPrimaryClass: args.isPrimaryClass,
      })
      results.push(existing._id)
      continue
    }

    // New enrollment flow
    if (args.isPrimaryClass) {
      const conflict = await hasPrimaryClassConflict(
        ctx,
        studentId,
        classYear.academicYearId,
      )
      if (conflict) {
        throw new Error(ENROLLMENT_ERRORS.PRIMARY_CLASS_CONFLICT)
      }
    }

    const id = await ctx.db.insert('studentClasses', {
      studentId,
      classYearId: args.classYearId,
      enrolledDate: args.enrolledDate,
      isPrimaryClass: args.isPrimaryClass,
      status: 'active',
      isDeleted: false,
    })
    results.push(id)
  }

  return results
}

export const enrollStudents = mutation({
  args: {
    requesterId: v.id('catechists'),
    studentIds: v.array(v.id('students')),
    classYearId: v.id('classYears'),
    isPrimaryClass: v.boolean(),
    enrolledDate: v.string(),
  },
  handler: async (ctx, args) => {
    return await enrollStudentsInternal(ctx, args)
  },
})

// Unified atomic student placement / promotion mutation
export const assignStudentToClassYear = mutation({
  args: {
    requesterId: v.id('catechists'),
    studentIds: v.array(v.id('students')),
    targetClassYearId: v.id('classYears'),
    sourceClassYearId: v.optional(v.id('classYears')),
    isPrimaryClass: v.boolean(),
    enrolledDate: v.string(),
    replaceExistingPrimary: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.sourceClassYearId) {
      let hasSourcePerm = false
      try {
        await assertEnrollmentPermission(
          ctx,
          args.requesterId,
          args.sourceClassYearId,
        )
        hasSourcePerm = true
      } catch {
        // Fall back to checking target permission
      }
      if (!hasSourcePerm) {
        await assertEnrollmentPermission(
          ctx,
          args.requesterId,
          args.targetClassYearId,
        )
      }
    } else {
      await assertEnrollmentPermission(
        ctx,
        args.requesterId,
        args.targetClassYearId,
      )
    }

    const targetClassYear = await ctx.db.get(
      'classYears',
      args.targetClassYearId,
    )
    if (!targetClassYear || targetClassYear.isDeleted) {
      throw new Error(ENROLLMENT_ERRORS.CLASS_YEAR_NOT_FOUND)
    }

    const replacePrimary = args.replaceExistingPrimary ?? true

    const assignedIds: Array<Id<'studentClasses'>> = []

    for (const studentId of args.studentIds) {
      if (args.isPrimaryClass && replacePrimary) {
        // Find existing primary class in the target academic year and deactivate/withdraw it
        const existingEnrollments = await ctx.db
          .query('studentClasses')
          .withIndex('by_student_id', (q) => q.eq('studentId', studentId))
          .collect()

        for (const sc of existingEnrollments) {
          if (sc.isDeleted || sc.status !== 'active' || !sc.isPrimaryClass)
            continue
          if (sc.classYearId === args.targetClassYearId) continue

          const cy = await ctx.db.get('classYears', sc.classYearId)
          if (
            cy &&
            !cy.isDeleted &&
            cy.academicYearId === targetClassYear.academicYearId
          ) {
            // Withdraw/unassign from previous primary class in the same year
            await ctx.db.patch('studentClasses', sc._id, {
              status: 'withdrawn',
              statusChangedDate: args.enrolledDate,
              leftDate: args.enrolledDate,
              isPrimaryClass: false,
            })
          }
        }
      }

      const [assignedId] = await enrollStudentsInternal(ctx, {
        requesterId: args.requesterId,
        studentIds: [studentId],
        classYearId: args.targetClassYearId,
        isPrimaryClass: args.isPrimaryClass,
        enrolledDate: args.enrolledDate,
        skipPermissionCheck: true,
      })
      assignedIds.push(assignedId)
    }

    return assignedIds
  },
})

// Lightweight active-primary roster for a single class year, for kanban-style
// class-relocation UIs (columns keyed by classYearId).
export const listActiveRosterByClassYear = query({
  args: {
    requesterId: v.id('catechists'),
    classYearId: v.id('classYears'),
  },
  handler: async (ctx, args) => {
    await assertValidCatechist(ctx, args.requesterId)

    const enrollments = await ctx.db
      .query('studentClasses')
      .withIndex('by_class_year_id', (q) =>
        q.eq('classYearId', args.classYearId),
      )
      .collect()

    const roster: Array<{
      studentClassId: Id<'studentClasses'>
      studentId: Id<'students'>
      studentCode: string
      fullName: string
      saintName: string | undefined
    }> = []

    for (const enrollment of enrollments) {
      if (
        enrollment.isDeleted ||
        enrollment.status !== 'active' ||
        !enrollment.isPrimaryClass
      )
        continue
      const student = await ctx.db.get('students', enrollment.studentId)
      if (!student || student.isDeleted) continue
      roster.push({
        studentClassId: enrollment._id,
        studentId: student._id,
        studentCode: student.studentCode,
        fullName: student.fullName,
        saintName: student.saintName,
      })
    }

    return roster
  },
})

export const updateEnrollmentsStatus = mutation({
  args: {
    requesterId: v.id('catechists'),
    studentClassIds: v.array(v.id('studentClasses')),
    status: v.union(
      v.literal('active'),
      v.literal('on_leave'),
      v.literal('withdrawn'),
    ),
    statusChangedDate: v.string(),
  },
  handler: async (ctx, args) => {
    for (const studentClassId of args.studentClassIds) {
      const studentClass = await ctx.db.get('studentClasses', studentClassId)
      if (!studentClass || studentClass.isDeleted) {
        throw new Error(ENROLLMENT_ERRORS.RECORD_NOT_FOUND)
      }

      await assertEnrollmentPermission(
        ctx,
        args.requesterId,
        studentClass.classYearId,
      )

      const patch: Partial<Doc<'studentClasses'>> = {
        status: args.status,
        statusChangedDate: args.statusChangedDate,
      }

      if (args.status === 'withdrawn') {
        patch.leftDate = args.statusChangedDate
      } else {
        patch.leftDate = undefined
        if (studentClass.isPrimaryClass) {
          const classYear = await ctx.db.get(
            'classYears',
            studentClass.classYearId,
          )
          if (classYear && !classYear.isDeleted) {
            const conflict = await hasPrimaryClassConflict(
              ctx,
              studentClass.studentId,
              classYear.academicYearId,
              studentClass._id,
            )
            if (conflict) {
              throw new Error(ENROLLMENT_ERRORS.PRIMARY_CLASS_CONFLICT)
            }
          }
        }
      }

      await ctx.db.patch('studentClasses', studentClassId, patch)
    }
  },
})

export const enrollStudentInClass = mutation({
  args: {
    requesterId: v.id('catechists'),
    studentId: v.id('students'),
    classYearId: v.id('classYears'),
    enrolledDate: v.string(),
  },
  handler: async (ctx, args) => {
    const results = await enrollStudentsInternal(ctx, {
      requesterId: args.requesterId,
      studentIds: [args.studentId],
      classYearId: args.classYearId,
      isPrimaryClass: true,
      enrolledDate: args.enrolledDate,
    })
    return results[0]
  },
})

async function buildStudentDetail(
  ctx: QueryCtx,
  studentId: Id<'students'>,
  canViewSensitive: boolean = true,
) {
  const student = await ctx.db.get('students', studentId)
  if (!student || student.isDeleted) return null

  const address = canViewSensitive
    ? await ctx.db
        .query('studentAddresses')
        .withIndex('by_student_id', (q) => q.eq('studentId', studentId))
        .unique()
    : null

  const sacraments = await ctx.db
    .query('studentSacraments')
    .withIndex('by_student_id', (q) => q.eq('studentId', studentId))
    // eslint-disable-next-line @convex-dev/no-filter-in-query
    .filter((q) => q.eq(q.field('isDeleted'), false))
    .collect()

  const studentClasses = await ctx.db
    .query('studentClasses')
    .withIndex('by_student_id', (q) => q.eq('studentId', studentId))
    // eslint-disable-next-line @convex-dev/no-filter-in-query
    .filter((q) => q.eq(q.field('isDeleted'), false))
    .collect()

  const enrollments = await Promise.all(
    studentClasses.map(async (sc) => {
      const classYear = await ctx.db.get('classYears', sc.classYearId)
      if (!classYear || classYear.isDeleted) {
        return null
      }

      const classRecord = await ctx.db.get('classes', classYear.classId)
      if (!classRecord || classRecord.isDeleted) {
        return null
      }

      const academicYear = await ctx.db.get(
        'academicYears',
        classYear.academicYearId,
      )
      if (!academicYear || academicYear.isDeleted) {
        return null
      }

      return {
        ...sc,
        classYear: {
          ...classYear,
          className: classRecord.name,
          academicYearName: academicYear.name,
          academicYearActive: academicYear.isActive,
          academicYearStartDate: academicYear.startDate,
        },
      }
    }),
  )

  // filter out nulls in case any classYear / class / academicYear was deleted
  const filteredEnrollments = enrollments.filter(
    (e): e is NonNullable<typeof e> => e !== null,
  )

  const guardianLinks = (
    await ctx.db
      .query('studentGuardians')
      .withIndex('by_student_id', (q) => q.eq('studentId', studentId))
      .collect()
  ).filter((l) => !l.isDeleted)

  const guardians = await Promise.all(
    guardianLinks.map(async (link) => {
      const guardian = await ctx.db.get('guardians', link.guardianId)
      if (!guardian || guardian.isDeleted) return null
      const contacts = canViewSensitive
        ? (
            await ctx.db
              .query('guardianContacts')
              .withIndex('by_guardian_id', (q) =>
                q.eq('guardianId', link.guardianId),
              )
              .collect()
          ).filter((c) => !c.isDeleted)
        : []
      return { ...link, guardian, contacts }
    }),
  )

  const filteredGuardians = guardians
    .filter((g): g is NonNullable<typeof g> => g !== null)
    .sort((a, b) => a.contactPriority - b.contactPriority)

  // ─── Siblings (students sharing a guardian) ────────────────────────
  const siblingLinksByGuardian = await Promise.all(
    filteredGuardians.map((g) =>
      ctx.db
        .query('studentGuardians')
        .withIndex('by_guardian_id', (q) => q.eq('guardianId', g.guardianId))
        // eslint-disable-next-line @convex-dev/no-filter-in-query
        .filter((q) => q.eq(q.field('isDeleted'), false))
        .collect(),
    ),
  )

  const siblingStudentIds = new Set<Id<'students'>>()
  for (const links of siblingLinksByGuardian) {
    for (const link of links) {
      if (link.studentId !== studentId) siblingStudentIds.add(link.studentId)
    }
  }

  const siblings = (
    await Promise.all(
      Array.from(siblingStudentIds).map(async (siblingId) => {
        const sibling = await ctx.db.get('students', siblingId)
        if (!sibling || sibling.isDeleted) return null

        const siblingClasses = (
          await ctx.db
            .query('studentClasses')
            .withIndex('by_student_id', (q) => q.eq('studentId', siblingId))
            // eslint-disable-next-line @convex-dev/no-filter-in-query
            .filter((q) => q.eq(q.field('isDeleted'), false))
            .collect()
        ).filter((sc) => sc.status === 'active')

        let currentClassName: string | null = null
        for (const sc of siblingClasses) {
          const classYear = await ctx.db.get('classYears', sc.classYearId)
          if (!classYear || classYear.isDeleted) continue
          const academicYear = await ctx.db.get(
            'academicYears',
            classYear.academicYearId,
          )
          if (!academicYear || academicYear.isDeleted || !academicYear.isActive)
            continue
          const classRecord = await ctx.db.get('classes', classYear.classId)
          if (!classRecord || classRecord.isDeleted) continue
          currentClassName = classRecord.name
          break
        }

        return {
          _id: sibling._id,
          studentCode: sibling.studentCode,
          saintName: sibling.saintName,
          fullName: sibling.fullName,
          currentClassName,
        }
      }),
    )
  ).filter((s): s is NonNullable<typeof s> => s !== null)

  return {
    ...student,
    address: address?.isDeleted ? null : (address ?? null),
    sacraments,
    enrollments: filteredEnrollments,
    guardians: filteredGuardians,
    siblings,
  }
}

export const getStudentDetail = query({
  args: {
    requesterId: v.id('catechists'),
    studentId: v.id('students'),
  },
  handler: async (ctx, args) => {
    await assertValidCatechist(ctx, args.requesterId)
    const canViewSensitive = await checkStudentSensitiveInfoPermission(
      ctx,
      args.requesterId,
      args.studentId,
    )
    const detail = await buildStudentDetail(
      ctx,
      args.studentId,
      canViewSensitive,
    )
    if (!detail) return null
    const isEditable = await checkEditStudentPermission(
      ctx,
      args.requesterId,
      args.studentId,
    )
    return {
      ...detail,
      isEditable,
    }
  },
})

export const getMyProfile = query({
  args: {
    requesterId: v.id('students'),
  },
  handler: async (ctx, args) => {
    await assertValidStudent(ctx, args.requesterId)
    const detail = await buildStudentDetail(ctx, args.requesterId, true)
    if (!detail) return null

    const address = detail.address
      ? {
          ...detail.address,
          fullAddress: maskAddress(detail.address.fullAddress),
          addressLine1: maskAddress(detail.address.addressLine1),
          addressLine2: maskAddress(detail.address.addressLine2),
        }
      : null

    const guardians = detail.guardians.map((g) => ({
      ...g,
      contacts: g.contacts.map((c) => ({
        ...c,
        value:
          c.contactType === 'phone' || c.contactType === 'zalo'
            ? (maskPhoneOrZalo(c.value) ?? c.value)
            : (maskEmailOrOther(c.value) ?? c.value),
      })),
    }))

    return {
      ...detail,
      address,
      guardians,
      isEditable: false,
    }
  },
})

async function buildEnrollmentSummary(
  ctx: QueryCtx,
  studentClassId: Id<'studentClasses'>,
) {
  // ─── Academic year semesters (for annual avg completeness check) ────
  const studentClassForYear = await ctx.db.get('studentClasses', studentClassId)
  const classYearForSemesters = studentClassForYear
    ? await ctx.db.get('classYears', studentClassForYear.classYearId)
    : null
  const academicYearSemesters = classYearForSemesters
    ? (
        await ctx.db
          .query('semesters')
          .withIndex('by_academic_year_id_and_semester_number', (q) =>
            q.eq('academicYearId', classYearForSemesters.academicYearId),
          )
          .collect()
      )
        .filter((s) => !s.isDeleted)
        .map((s) => s._id)
    : []

  // ─── Attendance ─────────────────────────────────────────────────────
  const scheduledSessions = classYearForSemesters
    ? (
        await ctx.db
          .query('classSessions')
          .withIndex('by_class_year_id_and_semester_id', (q) =>
            q.eq('classYearId', classYearForSemesters._id),
          )
          .collect()
      ).filter(isClassScopedSession)
    : []

  const attendanceRecords = (
    await ctx.db
      .query('attendanceRecords')
      .withIndex('by_student_class_id', (q) =>
        q.eq('studentClassId', studentClassId),
      )
      .collect()
  ).filter((r) => !r.isDeleted)

  const statusBySessionId = new Map<
    Id<'classSessions'>,
    Doc<'attendanceRecords'>['status']
  >()
  for (const record of attendanceRecords) {
    statusBySessionId.set(record.sessionId, record.status)
  }

  const attendance = computeAttendanceSummary(
    scheduledSessions.map((s) => s._id),
    statusBySessionId,
  )

  // ─── Grading ────────────────────────────────────────────────────────
  const scoreEntries = (
    await ctx.db
      .query('scoreEntries')
      .withIndex('by_student_class_id', (q) =>
        q.eq('studentClassId', studentClassId),
      )
      .collect()
  ).filter((e) => !e.isDeleted)

  const semesterGroups = new Map<
    Id<'semesters'>,
    Array<{
      sortOrder: number
      exam: {
        columnName: string
        columnType: string
        scaleType: 'scale_10' | 'pass_fail' | 'letter_af'
        weight: number
        scoreValue?: number
        scoreLabel?: string
      }
    }>
  >()
  const semesterDocCache = new Map<Id<'semesters'>, Doc<'semesters'> | null>()

  for (const entry of scoreEntries) {
    const column = await ctx.db.get('scoreColumns', entry.scoreColumnId)
    if (!column || column.isDeleted) continue

    if (!semesterDocCache.has(column.semesterId)) {
      const semester = await ctx.db.get('semesters', column.semesterId)
      semesterDocCache.set(
        column.semesterId,
        semester && !semester.isDeleted ? semester : null,
      )
    }
    const semester = semesterDocCache.get(column.semesterId)
    if (!semester) continue

    const group = semesterGroups.get(column.semesterId) ?? []
    group.push({
      sortOrder: column.sortOrder,
      exam: {
        columnName: column.columnName,
        columnType: column.columnType,
        scaleType: column.scaleType ?? 'scale_10',
        weight: column.weight ?? 1,
        scoreValue: entry.scoreValue,
        scoreLabel: entry.scoreLabel,
      },
    })
    semesterGroups.set(column.semesterId, group)
  }

  const grading = Array.from(semesterGroups.entries())
    .map(([semesterId, exams]) => {
      const semester = semesterDocCache.get(semesterId)
      return {
        semesterId,
        semesterName: semester?.name,
        semesterNumber: semester?.semesterNumber ?? 0,
        exams: exams
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((e) => e.exam),
      }
    })
    .sort((a, b) => a.semesterNumber - b.semesterNumber)

  // ─── Semester results ───────────────────────────────────────────────
  const semesterResultRows = (
    await ctx.db
      .query('semesterResults')
      .withIndex('by_student_class_id', (q) =>
        q.eq('studentClassId', studentClassId),
      )
      .collect()
  ).filter((r) => !r.isDeleted)

  const semesterResultsWithSemester = await Promise.all(
    semesterResultRows.map(async (row) => {
      const semester = await ctx.db.get('semesters', row.semesterId)
      if (!semester || semester.isDeleted) return null
      return {
        semesterId: row.semesterId,
        semesterName: semester.name,
        semesterNumber: semester.semesterNumber,
        morality: row.morality,
        teacherNote: row.teacherNote,
        isCompleted: row.isCompleted,
      }
    }),
  )

  const semesterResults = semesterResultsWithSemester
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => a.semesterNumber - b.semesterNumber)

  // ─── Annual result ──────────────────────────────────────────────────
  const annualResultRows = (
    await ctx.db
      .query('annualResults')
      .withIndex('by_student_class_id', (q) =>
        q.eq('studentClassId', studentClassId),
      )
      .collect()
  ).filter((r) => !r.isDeleted)

  const annualResultRow = annualResultRows.at(0)
  const annualResult = annualResultRow
    ? {
        conductGrade: annualResultRow.conductGrade,
        remark: annualResultRow.remark,
        isCompleted: annualResultRow.isCompleted,
      }
    : null

  return {
    attendance,
    grading,
    semesterResults,
    annualResult,
    academicYearSemesterIds: academicYearSemesters,
  }
}

export const getEnrollmentSummary = query({
  args: {
    requesterId: v.id('catechists'),
    studentClassId: v.id('studentClasses'),
  },
  handler: async (ctx, args) => {
    await assertValidCatechist(ctx, args.requesterId)

    const studentClass = await ctx.db.get('studentClasses', args.studentClassId)
    if (!studentClass || studentClass.isDeleted) return null

    return buildEnrollmentSummary(ctx, args.studentClassId)
  },
})

export const getMyEnrollmentSummary = query({
  args: {
    requesterId: v.id('students'),
    studentClassId: v.id('studentClasses'),
  },
  handler: async (ctx, args) => {
    await assertValidStudent(ctx, args.requesterId)

    const studentClass = await ctx.db.get('studentClasses', args.studentClassId)
    if (
      !studentClass ||
      studentClass.isDeleted ||
      studentClass.studentId !== args.requesterId
    ) {
      return null
    }

    return buildEnrollmentSummary(ctx, args.studentClassId)
  },
})

// ─── Photo Upload ─────────────────────────────────────────────────────────────

export const updateProfilePhoto = mutation({
  args: {
    requesterId: v.id('catechists'),
    studentId: v.id('students'),
    storageId: v.id('_storage'),
  },
  handler: async (ctx, args) => {
    await assertEditStudentPermission(ctx, args.requesterId, args.studentId)
    await ctx.db.patch('students', args.studentId, {
      profilePhotoStorageId: args.storageId,
    })
  },
})

export const deleteProfilePhoto = mutation({
  args: {
    requesterId: v.id('catechists'),
    studentId: v.id('students'),
  },
  handler: async (ctx, args) => {
    await assertEditStudentPermission(ctx, args.requesterId, args.studentId)
    const student = await ctx.db.get('students', args.studentId)
    if (!student || !student.profilePhotoStorageId) return
    await ctx.storage.delete(student.profilePhotoStorageId)
    await ctx.db.replace('students', args.studentId, {
      studentCode: student.studentCode,
      fullName: student.fullName,
      saintName: student.saintName,
      dateOfBirth: student.dateOfBirth,
      gender: student.gender,
      previousParish: student.previousParish,
      previousDiocese: student.previousDiocese,
      isActive: student.isActive,
      createdAt: student.createdAt,
      isDeleted: student.isDeleted,
    })
  },
})

export const getProfilePhotoUrl = query({
  args: { studentId: v.id('students') },
  handler: async (ctx, args) => {
    const student = await ctx.db.get('students', args.studentId)
    if (!student || !student.profilePhotoStorageId) return null
    return await ctx.storage.getUrl(student.profilePhotoStorageId)
  },
})

export const getEligibleForEnrollment = query({
  args: {
    requesterId: v.id('catechists'),
    academicYearId: v.id('academicYears'),
  },
  handler: async (ctx, args) => {
    await assertValidCatechist(ctx, args.requesterId)

    // Fetch all active, non-deleted students
    const students = await ctx.db
      .query('students')
      .withIndex('by_is_deleted', (q) => q.eq('isDeleted', false))
      // eslint-disable-next-line @convex-dev/no-filter-in-query
      .filter((q) => q.eq(q.field('isActive'), true))
      .collect()

    // Fetch all class years for the current academic year
    const classYears = await ctx.db
      .query('classYears')
      .withIndex('by_academic_year_id', (q) =>
        q.eq('academicYearId', args.academicYearId),
      )
      // eslint-disable-next-line @convex-dev/no-filter-in-query
      .filter((q) => q.eq(q.field('isDeleted'), false))
      .collect()

    const classYearIds = classYears.map((cy) => cy._id)

    // Fetch all enrollments for these class years
    const allEnrollments = await ctx.db.query('studentClasses').collect()

    // Filter to only non-deleted active/on_leave enrollments in the current academic year
    const relevantEnrollments = allEnrollments.filter((e) => {
      if (e.isDeleted) return false
      if (e.status !== 'active' && e.status !== 'on_leave') return false
      return classYearIds.includes(e.classYearId)
    })

    // Build a map of studentId -> enrollment info for quick lookup
    const enrollmentMap = new Map<
      Id<'students'>,
      {
        enrolledClassYearId: Id<'classYears'>
        isPrimaryClass: boolean
        status: 'active' | 'on_leave' | 'withdrawn'
      }
    >()

    for (const enrollment of relevantEnrollments) {
      if (!enrollmentMap.has(enrollment.studentId)) {
        enrollmentMap.set(enrollment.studentId, {
          enrolledClassYearId: enrollment.classYearId,
          isPrimaryClass: enrollment.isPrimaryClass,
          status: enrollment.status,
        })
      }
    }

    // Fetch class names for enrolled students
    const classNameMap = new Map<Id<'classYears'>, string>()
    for (const classYear of classYears) {
      const classDoc = await ctx.db.get('classes', classYear.classId)
      if (classDoc && !classDoc.isDeleted) {
        classNameMap.set(classYear._id, classDoc.name)
      }
    }

    // Build result with enrollment info for each student
    return students.map((student) => {
      const enrollmentInfo = enrollmentMap.get(student._id)
      if (enrollmentInfo) {
        const className = classNameMap.get(enrollmentInfo.enrolledClassYearId)
        return {
          ...student,
          enrolledClassYearId: enrollmentInfo.enrolledClassYearId,
          className: className ?? 'Unknown',
          isPrimaryClass: enrollmentInfo.isPrimaryClass,
          status: enrollmentInfo.status,
        }
      }

      // Not enrolled
      return {
        ...student,
        enrolledClassYearId: null,
        className: null,
        isPrimaryClass: false,
        status: null,
      }
    })
  },
})

// Builds the roster of a source class year (from a past academic year) for
// the "promote/transfer students" flow, flagging students who already have
// a non-deleted active/on_leave enrollment somewhere in the target academic
// year so the frontend can disable/warn on them instead of letting the
// bulk `enrollStudents` mutation throw PRIMARY_CLASS_CONFLICT.
export const getEligibleForTransfer = query({
  args: {
    requesterId: v.id('catechists'),
    sourceClassYearId: v.id('classYears'),
    targetAcademicYearId: v.id('academicYears'),
  },
  handler: async (ctx, args) => {
    await assertValidCatechist(ctx, args.requesterId)

    const sourceClassYear = await ctx.db.get(
      'classYears',
      args.sourceClassYearId,
    )
    if (!sourceClassYear || sourceClassYear.isDeleted) {
      throw new Error(ENROLLMENT_ERRORS.CLASS_YEAR_NOT_FOUND)
    }

    // Roster of the source class year: non-deleted active/on_leave enrollments.
    const sourceEnrollments = await ctx.db
      .query('studentClasses')
      .withIndex('by_class_year_id', (q) =>
        q.eq('classYearId', args.sourceClassYearId),
      )
      .collect()

    const rosterEnrollments = sourceEnrollments.filter(
      (e) => !e.isDeleted && (e.status === 'active' || e.status === 'on_leave'),
    )

    // Pre-fetch target academic year classYears to build a conflict lookup Set
    const targetClassYears = await ctx.db
      .query('classYears')
      .withIndex('by_academic_year_id', (q) =>
        q.eq('academicYearId', args.targetAcademicYearId),
      )
      .collect()
    const targetClassYearIds = new Set(
      targetClassYears.filter((cy) => !cy.isDeleted).map((cy) => cy._id),
    )

    // Fetch all active/on_leave primary class enrollments across target classYears
    const targetEnrollmentLists = await Promise.all(
      Array.from(targetClassYearIds).map((cyId) =>
        ctx.db
          .query('studentClasses')
          .withIndex('by_class_year_id', (q) => q.eq('classYearId', cyId))
          .collect(),
      ),
    )

    const conflictedStudentIds = new Set<Id<'students'>>()
    for (const enrollmentList of targetEnrollmentLists) {
      for (const e of enrollmentList) {
        if (
          !e.isDeleted &&
          e.isPrimaryClass &&
          (e.status === 'active' || e.status === 'on_leave')
        ) {
          conflictedStudentIds.add(e.studentId)
        }
      }
    }

    const roster = (
      await Promise.all(
        rosterEnrollments.map(async (enrollment) => {
          const student = await ctx.db.get('students', enrollment.studentId)
          if (!student || student.isDeleted) return null

          const annualResultRecord = await ctx.db
            .query('annualResults')
            .withIndex('by_student_class_id', (q) =>
              q.eq('studentClassId', enrollment._id),
            )
            .first()

          const annualResult =
            annualResultRecord && !annualResultRecord.isDeleted
              ? {
                  _id: annualResultRecord._id,
                  conductGrade: annualResultRecord.conductGrade,
                  remark: annualResultRecord.remark,
                  isCompleted: annualResultRecord.isCompleted,
                }
              : null

          return {
            studentClassId: enrollment._id,
            studentId: student._id,
            studentCode: student.studentCode,
            fullName: student.fullName,
            saintName: student.saintName,
            gender: student.gender,
            alreadyEnrolledInTargetYear: conflictedStudentIds.has(student._id),
            annualResult,
          }
        }),
      )
    ).filter((item): item is NonNullable<typeof item> => item !== null)

    roster.sort((a, b) => a.fullName.localeCompare(b.fullName))

    return roster
  },
})

export const checkPrimaryClassConflict = query({
  args: {
    requesterId: v.id('catechists'),
    studentId: v.id('students'),
    academicYearId: v.id('academicYears'),
  },
  handler: async (ctx, args) => {
    await assertValidCatechist(ctx, args.requesterId)

    return await hasPrimaryClassConflict(
      ctx,
      args.studentId,
      args.academicYearId,
    )
  },
})

export const getClassSacramentDetails = query({
  args: {
    requesterId: v.id('catechists'),
    classYearId: v.id('classYears'),
  },
  handler: async (ctx, args) => {
    await assertValidCatechist(ctx, args.requesterId)

    const classYear = await ctx.db.get('classYears', args.classYearId)
    if (!classYear || classYear.isDeleted) {
      throw new Error('Class year not found')
    }

    // Get all students enrolled in this class year
    const enrollments = await ctx.db
      .query('studentClasses')
      .withIndex('by_class_year_id', (q) =>
        q.eq('classYearId', args.classYearId),
      )
      .collect()

    const activeEnrollments = enrollments.filter((e) => !e.isDeleted)
    const studentIds = activeEnrollments.map((e) => e.studentId)

    // Fetch all sacraments for these students
    const sacraments = await Promise.all(
      studentIds.map(async (studentId) => {
        const records = await ctx.db
          .query('studentSacraments')
          .withIndex('by_student_id', (q) => q.eq('studentId', studentId))
          .collect()
        return { studentId, records: records.filter((r) => !r.isDeleted) }
      }),
    )

    return sacraments
  },
})

export const getRosterByClassYear = query({
  args: {
    requesterId: v.id('catechists'),
    classYearId: v.id('classYears'),
  },
  handler: async (ctx, args) => {
    await assertValidCatechist(ctx, args.requesterId)

    const enrollments = await ctx.db
      .query('studentClasses')
      .withIndex('by_class_year_id', (q) =>
        q.eq('classYearId', args.classYearId),
      )
      .collect()

    const activeEnrollments = enrollments.filter((e) => !e.isDeleted)

    const roster = await Promise.all(
      activeEnrollments.map(async (e) => {
        const student = await ctx.db.get('students', e.studentId)
        if (!student || student.isDeleted) return null
        return {
          studentClassId: e._id,
          studentId: student._id,
          studentCode: student.studentCode,
          fullName: student.fullName,
          saintName: student.saintName,
          gender: student.gender,
        }
      }),
    )

    return roster.filter(
      (item): item is NonNullable<typeof item> => item !== null,
    )
  },
})
