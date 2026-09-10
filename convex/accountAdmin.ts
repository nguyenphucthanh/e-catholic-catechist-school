import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { hashPassword } from './lib/password'
import { getCatechistLoginId, getStudentLoginId } from './lib/accountPrefix'
import { assertAdminRole } from './lib/authz'
import { ACCOUNT_ADMIN_ERRORS } from './lib/errors'
import type { Doc, Id } from './_generated/dataModel'

type AccountStatus = 'hasAccount' | 'noAccount' | 'disabled'

function buildAccountMap<T extends Id<'catechists'> | Id<'students'>>(
  accounts: Array<Doc<'accounts'>>,
  type: 'catechist' | 'student',
): Map<T, Doc<'accounts'>> {
  const filtered = accounts.filter((a) => a.accountType === type)
  const map = new Map<T, Doc<'accounts'>>()
  for (const a of filtered) {
    map.set(a.userRefId as T, a)
  }
  return map
}

function filterAccountStatus<T extends { account: Doc<'accounts'> | null }>(
  items: Array<T>,
  accountStatus: AccountStatus | undefined,
): Array<T> {
  if (!accountStatus) return items
  return items.filter((r) => {
    if (accountStatus === 'hasAccount')
      return r.account !== null && r.account.isActive
    if (accountStatus === 'noAccount') return r.account === null
    return r.account !== null && !r.account.isActive
  })
}

function paginate<T>(
  items: Array<T>,
  paginationOpts: { cursor?: string | null; numItems: number },
) {
  const cursor = paginationOpts.cursor ?? undefined
  const startIndex = cursor ? Number(cursor) : 0
  const numItems = paginationOpts.numItems
  const page = items.slice(startIndex, startIndex + numItems)
  const isDone = startIndex + numItems >= items.length
  return {
    page,
    isDone,
    continueCursor: isDone ? '' : String(startIndex + numItems),
  }
}

export const listCatechistAccounts = query({
  args: {
    requesterId: v.id('catechists'),
    paginationOpts: paginationOptsValidator,
    role: v.optional(v.union(v.literal('admin'), v.literal('user'))),
    accountStatus: v.optional(
      v.union(
        v.literal('hasAccount'),
        v.literal('noAccount'),
        v.literal('disabled'),
      ),
    ),
    activeStatus: v.optional(v.boolean()),
    name: v.optional(v.string()),
    sortBy: v.optional(
      v.union(
        v.literal('memberId'),
        v.literal('fullName'),
        v.literal('role'),
        v.literal('joinedDate'),
        v.literal('_creationTime'),
      ),
    ),
    sortOrder: v.optional(v.union(v.literal('asc'), v.literal('desc'))),
  },
  handler: async (ctx, args) => {
    await assertAdminRole(ctx, args.requesterId)

    const catechists = await ctx.db
      .query('catechists')
      .withIndex('by_is_deleted', (q) => q.eq('isDeleted', false))
      .collect()

    const accounts = await ctx.db
      .query('accounts')
      .withIndex('by_is_deleted', (q) => q.eq('isDeleted', false))
      .collect()

    const accountMap = buildAccountMap<Id<'catechists'>>(accounts, 'catechist')

    let results = catechists.map((c) => ({
      catechist: c,
      account: accountMap.get(c._id) ?? null,
    }))

    if (args.role) {
      results = results.filter((r) => r.catechist.role === args.role)
    }

    if (args.activeStatus !== undefined) {
      results = results.filter(
        (r) => r.catechist.isActive === args.activeStatus,
      )
    }

    results = filterAccountStatus(results, args.accountStatus)

    const nameQuery = args.name?.trim().toLowerCase()
    if (nameQuery) {
      results = results.filter((r) => {
        const fullNameMatch = r.catechist.fullName
          .toLowerCase()
          .includes(nameQuery)
        const saintNameMatch =
          r.catechist.saintName?.toLowerCase().includes(nameQuery) ?? false
        return fullNameMatch || saintNameMatch
      })
    }

    if (args.sortBy) {
      const sortBy = args.sortBy
      const direction = args.sortOrder === 'desc' ? -1 : 1
      results.sort((a, b) => {
        let aValue: unknown
        let bValue: unknown
        if (sortBy === 'memberId') {
          aValue = a.catechist.memberId
          bValue = b.catechist.memberId
        } else if (sortBy === 'fullName') {
          aValue = a.catechist.fullName
          bValue = b.catechist.fullName
        } else if (sortBy === 'role') {
          aValue = a.catechist.role
          bValue = b.catechist.role
        } else if (sortBy === 'joinedDate') {
          aValue = a.catechist.joinedDate
          bValue = b.catechist.joinedDate
        } else {
          aValue = a.catechist._creationTime
          bValue = b.catechist._creationTime
        }
        if (aValue === bValue) return 0
        if (aValue == null) return 1
        if (bValue == null) return -1
        if (aValue < bValue) return -1 * direction
        if (aValue > bValue) return 1 * direction
        return 0
      })
    } else {
      results.sort(
        (a, b) => b.catechist._creationTime - a.catechist._creationTime,
      )
    }

    return paginate(results, args.paginationOpts)
  },
})

export const listStudentAccounts = query({
  args: {
    requesterId: v.id('catechists'),
    paginationOpts: paginationOptsValidator,
    accountStatus: v.optional(
      v.union(
        v.literal('hasAccount'),
        v.literal('noAccount'),
        v.literal('disabled'),
      ),
    ),
    activeStatus: v.optional(v.boolean()),
    name: v.optional(v.string()),
    sortBy: v.optional(
      v.union(
        v.literal('studentCode'),
        v.literal('fullName'),
        v.literal('gender'),
        v.literal('_creationTime'),
      ),
    ),
    sortOrder: v.optional(v.union(v.literal('asc'), v.literal('desc'))),
  },
  handler: async (ctx, args) => {
    await assertAdminRole(ctx, args.requesterId)

    const students = await ctx.db
      .query('students')
      .withIndex('by_is_deleted', (q) => q.eq('isDeleted', false))
      .collect()

    const accounts = await ctx.db
      .query('accounts')
      .withIndex('by_is_deleted', (q) => q.eq('isDeleted', false))
      .collect()

    const accountMap = buildAccountMap<Id<'students'>>(accounts, 'student')

    let results = students.map((s) => ({
      student: s,
      account: accountMap.get(s._id) ?? null,
    }))

    if (args.activeStatus !== undefined) {
      results = results.filter((r) => r.student.isActive === args.activeStatus)
    }

    results = filterAccountStatus(results, args.accountStatus)

    const nameQuery = args.name?.trim().toLowerCase()
    if (nameQuery) {
      results = results.filter((r) => {
        const fullNameMatch = r.student.fullName
          .toLowerCase()
          .includes(nameQuery)
        const saintNameMatch =
          r.student.saintName?.toLowerCase().includes(nameQuery) ?? false
        return fullNameMatch || saintNameMatch
      })
    }

    if (args.sortBy) {
      const sortBy = args.sortBy
      const direction = args.sortOrder === 'desc' ? -1 : 1
      results.sort((a, b) => {
        let aValue: unknown
        let bValue: unknown
        if (sortBy === 'studentCode') {
          aValue = a.student.studentCode
          bValue = b.student.studentCode
        } else if (sortBy === 'fullName') {
          aValue = a.student.fullName
          bValue = b.student.fullName
        } else if (sortBy === 'gender') {
          aValue = a.student.gender
          bValue = b.student.gender
        } else {
          aValue = a.student._creationTime
          bValue = b.student._creationTime
        }
        if (aValue === bValue) return 0
        if (aValue == null) return 1
        if (bValue == null) return -1
        if (aValue < bValue) return -1 * direction
        if (aValue > bValue) return 1 * direction
        return 0
      })
    } else {
      results.sort((a, b) => b.student._creationTime - a.student._creationTime)
    }

    return paginate(results, args.paginationOpts)
  },
})

export const grantCatechistAccount = mutation({
  args: {
    requesterId: v.id('catechists'),
    catechistId: v.id('catechists'),
  },
  handler: async (ctx, args) => {
    await assertAdminRole(ctx, args.requesterId)

    const catechist = await ctx.db.get('catechists', args.catechistId)
    if (!catechist || catechist.isDeleted) {
      throw new Error(ACCOUNT_ADMIN_ERRORS.CATECHIST_NOT_FOUND)
    }

    const loginId = getCatechistLoginId(catechist.memberId)
    const existing = await ctx.db
      .query('accounts')
      .withIndex('by_login_id', (q) => q.eq('loginId', loginId))
      .first()

    if (existing) {
      if (existing.isDeleted) {
        await ctx.db.patch('accounts', existing._id, {
          isDeleted: false,
          isActive: true,
          passwordHash: hashPassword(loginId),
          lastLoginAt: undefined,
          mustChangePassword: true,
        })
        return { username: loginId, password: loginId }
      }
      throw new Error(ACCOUNT_ADMIN_ERRORS.ACCOUNT_ALREADY_EXISTS)
    }

    await ctx.db.insert('accounts', {
      loginId,
      passwordHash: hashPassword(loginId),
      accountType: 'catechist',
      userRefId: args.catechistId,
      isActive: true,
      mustChangePassword: true,
      createdAt: Date.now(),
      isDeleted: false,
    })
    return { username: loginId, password: loginId }
  },
})

export const grantStudentAccount = mutation({
  args: {
    requesterId: v.id('catechists'),
    studentId: v.id('students'),
  },
  handler: async (ctx, args) => {
    await assertAdminRole(ctx, args.requesterId)

    const student = await ctx.db.get('students', args.studentId)
    if (!student || student.isDeleted) {
      throw new Error(ACCOUNT_ADMIN_ERRORS.STUDENT_NOT_FOUND)
    }

    const loginId = getStudentLoginId(student.studentCode)
    const existingById = await ctx.db
      .query('accounts')
      .withIndex('by_login_id', (q) => q.eq('loginId', loginId))
      .first()

    if (existingById) {
      if (existingById.isDeleted) {
        await ctx.db.patch('accounts', existingById._id, {
          isDeleted: false,
          isActive: true,
          passwordHash: hashPassword(loginId),
          lastLoginAt: undefined,
          mustChangePassword: true,
        })
        return { username: loginId, password: loginId }
      }
      throw new Error(ACCOUNT_ADMIN_ERRORS.ACCOUNT_ALREADY_EXISTS)
    }

    await ctx.db.insert('accounts', {
      loginId,
      passwordHash: hashPassword(loginId),
      accountType: 'student',
      userRefId: args.studentId,
      isActive: true,
      mustChangePassword: true,
      createdAt: Date.now(),
      isDeleted: false,
    })
    return { username: loginId, password: loginId }
  },
})

export const resetPassword = mutation({
  args: {
    requesterId: v.id('catechists'),
    accountId: v.id('accounts'),
  },
  handler: async (ctx, args) => {
    await assertAdminRole(ctx, args.requesterId)

    const account = await ctx.db.get('accounts', args.accountId)
    if (!account || account.isDeleted) {
      throw new Error(ACCOUNT_ADMIN_ERRORS.ACCOUNT_NOT_FOUND)
    }

    await ctx.db.patch('accounts', args.accountId, {
      passwordHash: hashPassword(account.loginId),
      mustChangePassword: true,
    })
    return { username: account.loginId, password: account.loginId }
  },
})

export const toggleAccountStatus = mutation({
  args: {
    requesterId: v.id('catechists'),
    accountId: v.id('accounts'),
  },
  handler: async (ctx, args) => {
    await assertAdminRole(ctx, args.requesterId)

    const account = await ctx.db.get('accounts', args.accountId)
    if (!account || account.isDeleted) {
      throw new Error(ACCOUNT_ADMIN_ERRORS.ACCOUNT_NOT_FOUND)
    }

    await ctx.db.patch('accounts', args.accountId, {
      isActive: !account.isActive,
    })
  },
})

export const bulkGrantCatechistAccounts = mutation({
  args: {
    requesterId: v.id('catechists'),
    catechistIds: v.array(v.id('catechists')),
  },
  handler: async (ctx, args) => {
    await assertAdminRole(ctx, args.requesterId)

    for (const catechistId of args.catechistIds) {
      const catechist = await ctx.db.get('catechists', catechistId)
      if (!catechist || catechist.isDeleted) continue

      const loginId = getCatechistLoginId(catechist.memberId)
      const existing = await ctx.db
        .query('accounts')
        .withIndex('by_login_id', (q) => q.eq('loginId', loginId))
        .first()

      if (existing) {
        if (existing.isDeleted) {
          await ctx.db.patch('accounts', existing._id, {
            isDeleted: false,
            isActive: true,
            passwordHash: hashPassword(loginId),
            lastLoginAt: undefined,
            mustChangePassword: true,
          })
        }
        continue
      }

      await ctx.db.insert('accounts', {
        loginId,
        passwordHash: hashPassword(loginId),
        accountType: 'catechist',
        userRefId: catechistId,
        isActive: true,
        mustChangePassword: true,
        createdAt: Date.now(),
        isDeleted: false,
      })
    }
  },
})

export const bulkGrantStudentAccounts = mutation({
  args: {
    requesterId: v.id('catechists'),
    studentIds: v.array(v.id('students')),
  },
  handler: async (ctx, args) => {
    await assertAdminRole(ctx, args.requesterId)

    for (const studentId of args.studentIds) {
      const student = await ctx.db.get('students', studentId)
      if (!student || student.isDeleted) continue

      const loginId = getStudentLoginId(student.studentCode)
      const existing = await ctx.db
        .query('accounts')
        .withIndex('by_login_id', (q) => q.eq('loginId', loginId))
        .first()

      if (existing) {
        if (existing.isDeleted) {
          await ctx.db.patch('accounts', existing._id, {
            isDeleted: false,
            isActive: true,
            passwordHash: hashPassword(loginId),
            lastLoginAt: undefined,
            mustChangePassword: true,
          })
        }
        continue
      }

      await ctx.db.insert('accounts', {
        loginId,
        passwordHash: hashPassword(loginId),
        accountType: 'student',
        userRefId: studentId,
        isActive: true,
        mustChangePassword: true,
        createdAt: Date.now(),
        isDeleted: false,
      })
    }
  },
})

export const loginAsCatechist = mutation({
  args: {
    requesterId: v.id('catechists'),
    targetCatechistId: v.id('catechists'),
  },
  handler: async (ctx, args) => {
    await assertAdminRole(ctx, args.requesterId)

    if (args.targetCatechistId === args.requesterId) {
      throw new Error(ACCOUNT_ADMIN_ERRORS.CANNOT_LOGIN_AS_SELF)
    }

    const target = await ctx.db.get('catechists', args.targetCatechistId)
    if (!target || target.isDeleted) {
      throw new Error(ACCOUNT_ADMIN_ERRORS.CATECHIST_NOT_FOUND)
    }

    const account = await ctx.db
      .query('accounts')
      .withIndex('by_login_id', (q) =>
        q.eq('loginId', getCatechistLoginId(target.memberId)),
      )
      .unique()
    if (!account || account.isDeleted || !account.isActive) {
      throw new Error(ACCOUNT_ADMIN_ERRORS.ACCOUNT_NOT_ACTIVE)
    }

    await ctx.db.insert('impersonationLogs', {
      adminId: args.requesterId,
      targetCatechistId: args.targetCatechistId,
      at: Date.now(),
    })

    return {
      accountType: 'catechist' as const,
      userDocId: target._id,
      loginId: account.loginId,
      memberId: target.memberId,
      fullName: target.fullName,
      role: target.role,
    }
  },
})

export const bulkResetPasswords = mutation({
  args: {
    requesterId: v.id('catechists'),
    accountIds: v.array(v.id('accounts')),
  },
  handler: async (ctx, args) => {
    await assertAdminRole(ctx, args.requesterId)

    for (const accountId of args.accountIds) {
      const account = await ctx.db.get('accounts', accountId)
      if (!account || account.isDeleted) continue

      await ctx.db.patch('accounts', accountId, {
        passwordHash: hashPassword(account.loginId),
        mustChangePassword: true,
      })
    }
  },
})
