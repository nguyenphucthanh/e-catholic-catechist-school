/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'
import { api } from './_generated/api'
import schema from './schema'
import { hashPassword } from './lib/password'
import { AUTHZ_ERRORS, AUTH_ERRORS } from './lib/errors'

const modules = import.meta.glob('./**/*.ts')

describe('accountAdmin backend functions', () => {
  // ─── helpers ──────────────────────────────────────────────────────────────

  async function seedAdminCatechist(t: ReturnType<typeof convexTest>) {
    return t.run(async (ctx) => {
      const id = await ctx.db.insert('catechists', {
        memberId: '1',
        fullName: 'Admin User',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
      const hash = await hashPassword('admin123')
      await ctx.db.insert('accounts', {
        loginId: 'CAT-1',
        passwordHash: hash,
        accountType: 'catechist',
        userRefId: id,
        isActive: true,
        createdAt: Date.now(),
        isDeleted: false,
      })
      return id
    })
  }

  async function seedNonAdminCatechist(t: ReturnType<typeof convexTest>) {
    return t.run(async (ctx) => {
      const id = await ctx.db.insert('catechists', {
        memberId: '2',
        fullName: 'Regular Catechist',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      const hash = await hashPassword('secret')
      await ctx.db.insert('accounts', {
        loginId: 'CAT-2',
        passwordHash: hash,
        accountType: 'catechist',
        userRefId: id,
        isActive: true,
        createdAt: Date.now(),
        isDeleted: false,
      })
      return id
    })
  }

  async function seedPlainCatechist(
    t: ReturnType<typeof convexTest>,
    memberId = '3',
  ) {
    return t.run(async (ctx) => {
      return ctx.db.insert('catechists', {
        memberId,
        fullName: 'Plain Catechist',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
    })
  }

  async function seedPlainStudent(
    t: ReturnType<typeof convexTest>,
    studentCode = '1',
  ) {
    return t.run(async (ctx) => {
      return ctx.db.insert('students', {
        studentCode,
        fullName: 'Test Student',
        isActive: true,
        createdAt: Date.now(),
        isDeleted: false,
      })
    })
  }

  // ─── listCatechistAccounts ────────────────────────────────────────────────

  describe('listCatechistAccounts', () => {
    test('returns catechists with null account when no account exists', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      const plainId = await seedPlainCatechist(t, '10')

      const result = await t.query(api.accountAdmin.listCatechistAccounts, {
        requesterId: adminId,
        paginationOpts: { numItems: 100, cursor: null },
      })

      const plain = result.page.find((r) => r.catechist._id === plainId)
      const adminEntry = result.page.find((r) => r.catechist._id === adminId)

      expect(plain?.account).toBeNull()
      expect(adminEntry?.account).not.toBeNull()
      expect(adminEntry?.account?.loginId).toBe('CAT-1')
    })

    test('returns account for catechists that have one', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)

      const result = await t.query(api.accountAdmin.listCatechistAccounts, {
        requesterId: adminId,
        paginationOpts: { numItems: 100, cursor: null },
      })

      const adminEntry = result.page.find((r) => r.catechist._id === adminId)
      expect(adminEntry?.account).not.toBeNull()
    })

    test('throws for non-admin requester', async () => {
      const t = convexTest(schema, modules)
      const nonAdminId = await seedNonAdminCatechist(t)

      await expect(
        t.query(api.accountAdmin.listCatechistAccounts, {
          requesterId: nonAdminId,
          paginationOpts: { numItems: 100, cursor: null },
        }),
      ).rejects.toThrow(AUTHZ_ERRORS.ADMIN_REQUIRED)
    })

    test('filters by role', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      await seedNonAdminCatechist(t)

      const result = await t.query(api.accountAdmin.listCatechistAccounts, {
        requesterId: adminId,
        paginationOpts: { numItems: 100, cursor: null },
        role: 'admin',
      })

      expect(result.page.every((r) => r.catechist.role === 'admin')).toBe(true)
      expect(result.page.some((r) => r.catechist._id === adminId)).toBe(true)
    })

    test('filters by activeStatus', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      const inactiveId = await t.run(async (ctx) => {
        return ctx.db.insert('catechists', {
          memberId: '900',
          fullName: 'Inactive Catechist',
          role: 'user',
          isActive: false,
          isDeleted: false,
        })
      })

      const result = await t.query(api.accountAdmin.listCatechistAccounts, {
        requesterId: adminId,
        paginationOpts: { numItems: 100, cursor: null },
        activeStatus: false,
      })

      expect(result.page.some((r) => r.catechist._id === inactiveId)).toBe(true)
      expect(result.page.every((r) => r.catechist.isActive === false)).toBe(
        true,
      )
    })

    test('filters by accountStatus disabled', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      const plainId = await seedPlainCatechist(t, '910')
      await t.mutation(api.accountAdmin.grantCatechistAccount, {
        requesterId: adminId,
        catechistId: plainId,
      })
      const account = await t.run(async (ctx) => {
        return ctx.db
          .query('accounts')
          .withIndex('by_login_id', (q) => q.eq('loginId', 'CAT-910'))
          .unique()
      })
      await t.mutation(api.accountAdmin.toggleAccountStatus, {
        requesterId: adminId,
        accountId: account!._id,
      })

      const result = await t.query(api.accountAdmin.listCatechistAccounts, {
        requesterId: adminId,
        paginationOpts: { numItems: 100, cursor: null },
        accountStatus: 'disabled',
      })

      expect(result.page.some((r) => r.catechist._id === plainId)).toBe(true)
    })

    test('filters by name matching fullName or saintName case-insensitively', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      const matchId = await t.run(async (ctx) => {
        return ctx.db.insert('catechists', {
          memberId: '920',
          fullName: 'Nguyen Van A',
          saintName: 'Peter',
          role: 'user',
          isActive: true,
          isDeleted: false,
        })
      })

      const byFullName = await t.query(api.accountAdmin.listCatechistAccounts, {
        requesterId: adminId,
        paginationOpts: { numItems: 100, cursor: null },
        name: 'nguyen van a',
      })
      expect(byFullName.page.some((r) => r.catechist._id === matchId)).toBe(
        true,
      )

      const bySaintName = await t.query(
        api.accountAdmin.listCatechistAccounts,
        {
          requesterId: adminId,
          paginationOpts: { numItems: 100, cursor: null },
          name: 'PETER',
        },
      )
      expect(bySaintName.page.some((r) => r.catechist._id === matchId)).toBe(
        true,
      )

      const noMatch = await t.query(api.accountAdmin.listCatechistAccounts, {
        requesterId: adminId,
        paginationOpts: { numItems: 100, cursor: null },
        name: 'zzz-no-match',
      })
      expect(noMatch.page).toHaveLength(0)
    })

    test('sorts by each sortBy key, direction, and defaults', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      await t.run(async (ctx) => {
        await ctx.db.insert('catechists', {
          memberId: '930',
          fullName: 'Bob',
          role: 'user',
          isActive: true,
          joinedDate: '2020-01-01',
          isDeleted: false,
        })
        await ctx.db.insert('catechists', {
          memberId: '931',
          fullName: 'Alice',
          role: 'user',
          isActive: true,
          joinedDate: undefined,
          isDeleted: false,
        })
      })

      for (const sortBy of [
        'memberId',
        'fullName',
        'role',
        'joinedDate',
        '_creationTime',
      ] as const) {
        for (const sortOrder of ['asc', 'desc'] as const) {
          const result = await t.query(api.accountAdmin.listCatechistAccounts, {
            requesterId: adminId,
            paginationOpts: { numItems: 100, cursor: null },
            sortBy,
            sortOrder,
          })
          expect(result.page.length).toBeGreaterThan(0)
        }
      }

      // default sort (no sortBy) falls back to _creationTime desc
      const defaultSorted = await t.query(
        api.accountAdmin.listCatechistAccounts,
        {
          requesterId: adminId,
          paginationOpts: { numItems: 100, cursor: null },
        },
      )
      expect(defaultSorted.page[0].catechist._id).not.toBeNull()
    })
  })

  // ─── listStudentAccounts ──────────────────────────────────────────────────

  describe('listStudentAccounts', () => {
    test('returns students with null account when no account exists', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      const studentId = await seedPlainStudent(t, '5')

      const result = await t.query(api.accountAdmin.listStudentAccounts, {
        requesterId: adminId,
        paginationOpts: { numItems: 100, cursor: null },
      })

      const entry = result.page.find((r) => r.student._id === studentId)
      expect(entry?.account).toBeNull()
    })

    test('returns students with their linked account', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      const studentId = await seedPlainStudent(t, '5')

      await t.run(async (ctx) => {
        await ctx.db.insert('accounts', {
          loginId: 'STD-5',
          passwordHash: await hashPassword('STD-5'),
          accountType: 'student',
          userRefId: studentId,
          isActive: true,
          createdAt: Date.now(),
          isDeleted: false,
        })
      })

      const result = await t.query(api.accountAdmin.listStudentAccounts, {
        requesterId: adminId,
        paginationOpts: { numItems: 100, cursor: null },
      })

      const entry = result.page.find((r) => r.student._id === studentId)
      expect(entry?.account).not.toBeNull()
      expect(entry?.account?.loginId).toBe('STD-5')
    })

    test('throws for non-admin requester', async () => {
      const t = convexTest(schema, modules)
      const nonAdminId = await seedNonAdminCatechist(t)

      await expect(
        t.query(api.accountAdmin.listStudentAccounts, {
          requesterId: nonAdminId,
          paginationOpts: { numItems: 100, cursor: null },
        }),
      ).rejects.toThrow(AUTHZ_ERRORS.ADMIN_REQUIRED)
    })

    test('filters by activeStatus', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      const inactiveId = await t.run(async (ctx) => {
        return ctx.db.insert('students', {
          studentCode: '900',
          fullName: 'Inactive Student',
          isActive: false,
          createdAt: Date.now(),
          isDeleted: false,
        })
      })

      const result = await t.query(api.accountAdmin.listStudentAccounts, {
        requesterId: adminId,
        paginationOpts: { numItems: 100, cursor: null },
        activeStatus: false,
      })

      expect(result.page.some((r) => r.student._id === inactiveId)).toBe(true)
      expect(result.page.every((r) => r.student.isActive === false)).toBe(true)
    })

    test('filters by accountStatus disabled', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      const studentId = await seedPlainStudent(t, '910')
      await t.mutation(api.accountAdmin.grantStudentAccount, {
        requesterId: adminId,
        studentId,
      })
      const account = await t.run(async (ctx) => {
        return ctx.db
          .query('accounts')
          .withIndex('by_login_id', (q) => q.eq('loginId', 'STD-910'))
          .unique()
      })
      await t.mutation(api.accountAdmin.toggleAccountStatus, {
        requesterId: adminId,
        accountId: account!._id,
      })

      const result = await t.query(api.accountAdmin.listStudentAccounts, {
        requesterId: adminId,
        paginationOpts: { numItems: 100, cursor: null },
        accountStatus: 'disabled',
      })

      expect(result.page.some((r) => r.student._id === studentId)).toBe(true)
    })

    test('filters by name matching fullName or saintName case-insensitively', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      const matchId = await t.run(async (ctx) => {
        return ctx.db.insert('students', {
          studentCode: '920',
          fullName: 'Tran Thi B',
          saintName: 'Maria',
          isActive: true,
          createdAt: Date.now(),
          isDeleted: false,
        })
      })

      const byFullName = await t.query(api.accountAdmin.listStudentAccounts, {
        requesterId: adminId,
        paginationOpts: { numItems: 100, cursor: null },
        name: 'tran thi b',
      })
      expect(byFullName.page.some((r) => r.student._id === matchId)).toBe(true)

      const bySaintName = await t.query(api.accountAdmin.listStudentAccounts, {
        requesterId: adminId,
        paginationOpts: { numItems: 100, cursor: null },
        name: 'MARIA',
      })
      expect(bySaintName.page.some((r) => r.student._id === matchId)).toBe(true)

      const noMatch = await t.query(api.accountAdmin.listStudentAccounts, {
        requesterId: adminId,
        paginationOpts: { numItems: 100, cursor: null },
        name: 'zzz-no-match',
      })
      expect(noMatch.page).toHaveLength(0)
    })

    test('sorts by each sortBy key, direction, and defaults', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      await t.run(async (ctx) => {
        await ctx.db.insert('students', {
          studentCode: '930',
          fullName: 'Bob',
          gender: 'male',
          isActive: true,
          createdAt: Date.now(),
          isDeleted: false,
        })
        await ctx.db.insert('students', {
          studentCode: '931',
          fullName: 'Alice',
          gender: undefined,
          isActive: true,
          createdAt: Date.now(),
          isDeleted: false,
        })
      })

      for (const sortBy of [
        'studentCode',
        'fullName',
        'gender',
        '_creationTime',
      ] as const) {
        for (const sortOrder of ['asc', 'desc'] as const) {
          const result = await t.query(api.accountAdmin.listStudentAccounts, {
            requesterId: adminId,
            paginationOpts: { numItems: 100, cursor: null },
            sortBy,
            sortOrder,
          })
          expect(result.page.length).toBeGreaterThan(0)
        }
      }

      const defaultSorted = await t.query(
        api.accountAdmin.listStudentAccounts,
        {
          requesterId: adminId,
          paginationOpts: { numItems: 100, cursor: null },
        },
      )
      expect(defaultSorted.page[0].student._id).not.toBeNull()
    })
  })

  // ─── grantCatechistAccount ────────────────────────────────────────────────

  describe('grantCatechistAccount', () => {
    test('creates account for catechist without one', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      const plainId = await seedPlainCatechist(t, '50')

      await t.mutation(api.accountAdmin.grantCatechistAccount, {
        requesterId: adminId,
        catechistId: plainId,
      })

      const account = await t.run(async (ctx) => {
        return ctx.db
          .query('accounts')
          .withIndex('by_login_id', (q) => q.eq('loginId', 'CAT-50'))
          .unique()
      })

      expect(account).not.toBeNull()
      expect(account?.accountType).toBe('catechist')
      expect(account?.userRefId).toBe(plainId)
      expect(account?.isActive).toBe(true)
      expect(account?.isDeleted).toBe(false)
      expect(account?.mustChangePassword).toBe(true)
    })

    test('restores soft-deleted account', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      const plainId = await seedPlainCatechist(t, '60')

      await t.run(async (ctx) => {
        await ctx.db.insert('accounts', {
          loginId: 'CAT-60',
          passwordHash: 'oldhash',
          accountType: 'catechist',
          userRefId: plainId,
          isActive: false,
          createdAt: Date.now(),
          isDeleted: true,
        })
      })

      await t.mutation(api.accountAdmin.grantCatechistAccount, {
        requesterId: adminId,
        catechistId: plainId,
      })

      const account = await t.run(async (ctx) => {
        return ctx.db
          .query('accounts')
          .withIndex('by_login_id', (q) => q.eq('loginId', 'CAT-60'))
          .unique()
      })

      expect(account?.isDeleted).toBe(false)
      expect(account?.isActive).toBe(true)
    })

    test('throws if account already exists', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      const plainId = await seedPlainCatechist(t, '70')

      await t.mutation(api.accountAdmin.grantCatechistAccount, {
        requesterId: adminId,
        catechistId: plainId,
      })

      await expect(
        t.mutation(api.accountAdmin.grantCatechistAccount, {
          requesterId: adminId,
          catechistId: plainId,
        }),
      ).rejects.toThrow('ACCOUNT_ALREADY_EXISTS')
    })

    test('throws for non-admin requester', async () => {
      const t = convexTest(schema, modules)
      const nonAdminId = await seedNonAdminCatechist(t)
      const plainId = await seedPlainCatechist(t, '80')

      await expect(
        t.mutation(api.accountAdmin.grantCatechistAccount, {
          requesterId: nonAdminId,
          catechistId: plainId,
        }),
      ).rejects.toThrow(AUTHZ_ERRORS.ADMIN_REQUIRED)
    })
  })

  // ─── grantStudentAccount ──────────────────────────────────────────────────

  describe('grantStudentAccount', () => {
    test('creates account for student without one', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      const studentId = await seedPlainStudent(t, '100')

      await t.mutation(api.accountAdmin.grantStudentAccount, {
        requesterId: adminId,
        studentId,
      })

      const account = await t.run(async (ctx) => {
        return ctx.db
          .query('accounts')
          .withIndex('by_login_id', (q) => q.eq('loginId', 'STD-100'))
          .unique()
      })

      expect(account).not.toBeNull()
      expect(account?.accountType).toBe('student')
      expect(account?.userRefId).toBe(studentId)
      expect(account?.isActive).toBe(true)
    })

    test('restores soft-deleted student account', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      const studentId = await seedPlainStudent(t, '110')

      await t.run(async (ctx) => {
        await ctx.db.insert('accounts', {
          loginId: 'STD-110',
          passwordHash: 'oldhash',
          accountType: 'student',
          userRefId: studentId,
          isActive: false,
          createdAt: Date.now(),
          isDeleted: true,
        })
      })

      await t.mutation(api.accountAdmin.grantStudentAccount, {
        requesterId: adminId,
        studentId,
      })

      const account = await t.run(async (ctx) => {
        return ctx.db
          .query('accounts')
          .withIndex('by_login_id', (q) => q.eq('loginId', 'STD-110'))
          .unique()
      })

      expect(account?.isDeleted).toBe(false)
      expect(account?.isActive).toBe(true)
    })

    test('throws if student account already exists', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      const studentId = await seedPlainStudent(t, '120')

      await t.mutation(api.accountAdmin.grantStudentAccount, {
        requesterId: adminId,
        studentId,
      })

      await expect(
        t.mutation(api.accountAdmin.grantStudentAccount, {
          requesterId: adminId,
          studentId,
        }),
      ).rejects.toThrow('ACCOUNT_ALREADY_EXISTS')
    })
  })

  // ─── resetPassword ────────────────────────────────────────────────────────

  describe('resetPassword', () => {
    test('resets password to loginId', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      const plainId = await seedPlainCatechist(t, '200')

      await t.mutation(api.accountAdmin.grantCatechistAccount, {
        requesterId: adminId,
        catechistId: plainId,
      })

      const account = await t.run(async (ctx) => {
        return ctx.db
          .query('accounts')
          .withIndex('by_login_id', (q) => q.eq('loginId', 'CAT-200'))
          .unique()
      })

      await t.mutation(api.accountAdmin.resetPassword, {
        requesterId: adminId,
        accountId: account!._id,
      })

      const loginResult = await t.mutation(api.auth.login, {
        loginId: 'CAT-200',
        password: 'CAT-200',
      })
      expect(loginResult.memberId).toBe('200')
      expect(loginResult.mustChangePassword).toBe(true)
    })

    test('throws for non-admin', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      const nonAdminId = await seedNonAdminCatechist(t)
      const plainId = await seedPlainCatechist(t, '300')

      await t.mutation(api.accountAdmin.grantCatechistAccount, {
        requesterId: adminId,
        catechistId: plainId,
      })

      const account = await t.run(async (ctx) => {
        return ctx.db
          .query('accounts')
          .withIndex('by_login_id', (q) => q.eq('loginId', 'CAT-300'))
          .unique()
      })

      await expect(
        t.mutation(api.accountAdmin.resetPassword, {
          requesterId: nonAdminId,
          accountId: account!._id,
        }),
      ).rejects.toThrow(AUTHZ_ERRORS.ADMIN_REQUIRED)
    })
  })

  // ─── loginAsCatechist ─────────────────────────────────────────────────────

  describe('loginAsCatechist', () => {
    test('throws for non-admin requester', async () => {
      const t = convexTest(schema, modules)
      const nonAdminId = await seedNonAdminCatechist(t)
      const plainId = await seedPlainCatechist(t, '600')

      await expect(
        t.mutation(api.accountAdmin.loginAsCatechist, {
          requesterId: nonAdminId,
          targetCatechistId: plainId,
        }),
      ).rejects.toThrow(AUTHZ_ERRORS.ADMIN_REQUIRED)
    })

    test('throws CANNOT_LOGIN_AS_SELF when target is the requester', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)

      await expect(
        t.mutation(api.accountAdmin.loginAsCatechist, {
          requesterId: adminId,
          targetCatechistId: adminId,
        }),
      ).rejects.toThrow('CANNOT_LOGIN_AS_SELF')
    })

    test('throws CATECHIST_NOT_FOUND when target is soft-deleted', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      const deletedId = await t.run(async (ctx) => {
        return ctx.db.insert('catechists', {
          memberId: '610',
          fullName: 'Deleted Catechist',
          role: 'user',
          isActive: true,
          isDeleted: true,
        })
      })

      await expect(
        t.mutation(api.accountAdmin.loginAsCatechist, {
          requesterId: adminId,
          targetCatechistId: deletedId,
        }),
      ).rejects.toThrow('CATECHIST_NOT_FOUND')
    })

    test('throws ACCOUNT_NOT_ACTIVE when target has no account', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      const plainId = await seedPlainCatechist(t, '620')

      await expect(
        t.mutation(api.accountAdmin.loginAsCatechist, {
          requesterId: adminId,
          targetCatechistId: plainId,
        }),
      ).rejects.toThrow('ACCOUNT_NOT_ACTIVE')
    })

    test('throws ACCOUNT_NOT_ACTIVE when target account is soft-deleted', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      const plainId = await seedPlainCatechist(t, '630')
      await t.run(async (ctx) => {
        await ctx.db.insert('accounts', {
          loginId: 'CAT-630',
          passwordHash: 'hash',
          accountType: 'catechist',
          userRefId: plainId,
          isActive: true,
          createdAt: Date.now(),
          isDeleted: true,
        })
      })

      await expect(
        t.mutation(api.accountAdmin.loginAsCatechist, {
          requesterId: adminId,
          targetCatechistId: plainId,
        }),
      ).rejects.toThrow('ACCOUNT_NOT_ACTIVE')
    })

    test('throws ACCOUNT_NOT_ACTIVE when target account is inactive', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      const plainId = await seedPlainCatechist(t, '640')
      await t.run(async (ctx) => {
        await ctx.db.insert('accounts', {
          loginId: 'CAT-640',
          passwordHash: 'hash',
          accountType: 'catechist',
          userRefId: plainId,
          isActive: false,
          createdAt: Date.now(),
          isDeleted: false,
        })
      })

      await expect(
        t.mutation(api.accountAdmin.loginAsCatechist, {
          requesterId: adminId,
          targetCatechistId: plainId,
        }),
      ).rejects.toThrow('ACCOUNT_NOT_ACTIVE')
    })

    test('returns catechist login info and logs the impersonation on success', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      const plainId = await seedPlainCatechist(t, '650')
      await t.run(async (ctx) => {
        await ctx.db.insert('accounts', {
          loginId: 'CAT-650',
          passwordHash: 'hash',
          accountType: 'catechist',
          userRefId: plainId,
          isActive: true,
          createdAt: Date.now(),
          isDeleted: false,
        })
      })

      const result = await t.mutation(api.accountAdmin.loginAsCatechist, {
        requesterId: adminId,
        targetCatechistId: plainId,
      })

      expect(result).toEqual({
        accountType: 'catechist',
        userDocId: plainId,
        loginId: 'CAT-650',
        memberId: '650',
        fullName: 'Plain Catechist',
        role: 'user',
      })

      const logs = await t.run(async (ctx) => {
        return ctx.db
          .query('impersonationLogs')
          .withIndex('by_admin_id', (q) => q.eq('adminId', adminId))
          .collect()
      })

      expect(logs).toHaveLength(1)
      expect(logs[0].targetCatechistId).toBe(plainId)
      expect(typeof logs[0].at).toBe('number')
    })
  })

  // ─── bulkGrantStudentAccounts ─────────────────────────────────────────────

  describe('bulkGrantStudentAccounts', () => {
    test('throws for non-admin requester', async () => {
      const t = convexTest(schema, modules)
      const nonAdminId = await seedNonAdminCatechist(t)
      const studentId = await seedPlainStudent(t, '700')

      await expect(
        t.mutation(api.accountAdmin.bulkGrantStudentAccounts, {
          requesterId: nonAdminId,
          studentIds: [studentId],
        }),
      ).rejects.toThrow(AUTHZ_ERRORS.ADMIN_REQUIRED)
    })

    test('skips missing and soft-deleted students', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      const studentId = await seedPlainStudent(t, '710')
      const deletedId = await t.run(async (ctx) => {
        return ctx.db.insert('students', {
          studentCode: '711',
          fullName: 'Deleted Student',
          isActive: true,
          createdAt: Date.now(),
          isDeleted: true,
        })
      })
      await t.run(async (ctx) => {
        await ctx.db.delete('students', studentId)
      })

      await t.mutation(api.accountAdmin.bulkGrantStudentAccounts, {
        requesterId: adminId,
        studentIds: [studentId, deletedId],
      })

      const accounts = await t.run(async (ctx) => {
        return ctx.db
          .query('accounts')
          .withIndex('by_login_id', (q) => q.eq('loginId', 'STD-711'))
          .collect()
      })
      expect(accounts).toHaveLength(0)
    })

    test('reactivates a soft-deleted account', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      const studentId = await seedPlainStudent(t, '720')
      await t.run(async (ctx) => {
        await ctx.db.insert('accounts', {
          loginId: 'STD-720',
          passwordHash: 'oldhash',
          accountType: 'student',
          userRefId: studentId,
          isActive: false,
          createdAt: Date.now(),
          isDeleted: true,
          lastLoginAt: Date.now(),
        })
      })

      await t.mutation(api.accountAdmin.bulkGrantStudentAccounts, {
        requesterId: adminId,
        studentIds: [studentId],
      })

      const account = await t.run(async (ctx) => {
        return ctx.db
          .query('accounts')
          .withIndex('by_login_id', (q) => q.eq('loginId', 'STD-720'))
          .unique()
      })
      expect(account?.isDeleted).toBe(false)
      expect(account?.isActive).toBe(true)
      expect(account?.lastLoginAt).toBeUndefined()
    })

    test('skips a student whose account already exists and is active', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      const studentId = await seedPlainStudent(t, '730')
      await t.run(async (ctx) => {
        await ctx.db.insert('accounts', {
          loginId: 'STD-730',
          passwordHash: 'existinghash',
          accountType: 'student',
          userRefId: studentId,
          isActive: true,
          createdAt: Date.now(),
          isDeleted: false,
        })
      })

      await t.mutation(api.accountAdmin.bulkGrantStudentAccounts, {
        requesterId: adminId,
        studentIds: [studentId],
      })

      const account = await t.run(async (ctx) => {
        return ctx.db
          .query('accounts')
          .withIndex('by_login_id', (q) => q.eq('loginId', 'STD-730'))
          .unique()
      })
      expect(account?.passwordHash).toBe('existinghash')
    })

    test('inserts a new account for a student without one', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      const studentId = await seedPlainStudent(t, '740')

      await t.mutation(api.accountAdmin.bulkGrantStudentAccounts, {
        requesterId: adminId,
        studentIds: [studentId],
      })

      const account = await t.run(async (ctx) => {
        return ctx.db
          .query('accounts')
          .withIndex('by_login_id', (q) => q.eq('loginId', 'STD-740'))
          .unique()
      })
      expect(account).not.toBeNull()
      expect(account?.accountType).toBe('student')
      expect(account?.userRefId).toBe(studentId)
      expect(account?.isActive).toBe(true)
      expect(account?.isDeleted).toBe(false)
    })
  })

  // ─── bulkGrantCatechistAccounts ───────────────────────────────────────────

  describe('bulkGrantCatechistAccounts', () => {
    test('throws for non-admin requester', async () => {
      const t = convexTest(schema, modules)
      const nonAdminId = await seedNonAdminCatechist(t)
      const plainId = await seedPlainCatechist(t, '750')

      await expect(
        t.mutation(api.accountAdmin.bulkGrantCatechistAccounts, {
          requesterId: nonAdminId,
          catechistIds: [plainId],
        }),
      ).rejects.toThrow(AUTHZ_ERRORS.ADMIN_REQUIRED)
    })

    test('skips missing and soft-deleted catechists', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      const plainId = await seedPlainCatechist(t, '751')
      const deletedId = await t.run(async (ctx) => {
        return ctx.db.insert('catechists', {
          memberId: '752',
          fullName: 'Deleted Catechist',
          role: 'user',
          isActive: true,
          isDeleted: true,
        })
      })
      await t.run(async (ctx) => {
        await ctx.db.delete('catechists', plainId)
      })

      await t.mutation(api.accountAdmin.bulkGrantCatechistAccounts, {
        requesterId: adminId,
        catechistIds: [plainId, deletedId],
      })

      const accounts = await t.run(async (ctx) => {
        return ctx.db
          .query('accounts')
          .withIndex('by_login_id', (q) => q.eq('loginId', 'CAT-752'))
          .collect()
      })
      expect(accounts).toHaveLength(0)
    })

    test('reactivates a soft-deleted account', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      const plainId = await seedPlainCatechist(t, '753')
      await t.run(async (ctx) => {
        await ctx.db.insert('accounts', {
          loginId: 'CAT-753',
          passwordHash: 'oldhash',
          accountType: 'catechist',
          userRefId: plainId,
          isActive: false,
          createdAt: Date.now(),
          isDeleted: true,
          lastLoginAt: Date.now(),
        })
      })

      await t.mutation(api.accountAdmin.bulkGrantCatechistAccounts, {
        requesterId: adminId,
        catechistIds: [plainId],
      })

      const account = await t.run(async (ctx) => {
        return ctx.db
          .query('accounts')
          .withIndex('by_login_id', (q) => q.eq('loginId', 'CAT-753'))
          .unique()
      })
      expect(account?.isDeleted).toBe(false)
      expect(account?.isActive).toBe(true)
      expect(account?.lastLoginAt).toBeUndefined()
    })

    test('skips a catechist whose account already exists and is active', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      const plainId = await seedPlainCatechist(t, '754')
      await t.run(async (ctx) => {
        await ctx.db.insert('accounts', {
          loginId: 'CAT-754',
          passwordHash: 'existinghash',
          accountType: 'catechist',
          userRefId: plainId,
          isActive: true,
          createdAt: Date.now(),
          isDeleted: false,
        })
      })

      await t.mutation(api.accountAdmin.bulkGrantCatechistAccounts, {
        requesterId: adminId,
        catechistIds: [plainId],
      })

      const account = await t.run(async (ctx) => {
        return ctx.db
          .query('accounts')
          .withIndex('by_login_id', (q) => q.eq('loginId', 'CAT-754'))
          .unique()
      })
      expect(account?.passwordHash).toBe('existinghash')
    })

    test('inserts a new account for a catechist without one', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      const plainId = await seedPlainCatechist(t, '755')

      await t.mutation(api.accountAdmin.bulkGrantCatechistAccounts, {
        requesterId: adminId,
        catechistIds: [plainId],
      })

      const account = await t.run(async (ctx) => {
        return ctx.db
          .query('accounts')
          .withIndex('by_login_id', (q) => q.eq('loginId', 'CAT-755'))
          .unique()
      })
      expect(account).not.toBeNull()
      expect(account?.accountType).toBe('catechist')
      expect(account?.userRefId).toBe(plainId)
      expect(account?.isActive).toBe(true)
      expect(account?.isDeleted).toBe(false)
    })
  })

  // ─── bulkResetPasswords ───────────────────────────────────────────────────

  describe('bulkResetPasswords', () => {
    test('throws for non-admin requester', async () => {
      const t = convexTest(schema, modules)
      const nonAdminId = await seedNonAdminCatechist(t)

      await expect(
        t.mutation(api.accountAdmin.bulkResetPasswords, {
          requesterId: nonAdminId,
          accountIds: [],
        }),
      ).rejects.toThrow(AUTHZ_ERRORS.ADMIN_REQUIRED)
    })

    test('skips missing and soft-deleted accounts', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      const plainId = await seedPlainCatechist(t, '760')
      const deletedAccountId = await t.run(async (ctx) => {
        return ctx.db.insert('accounts', {
          loginId: 'CAT-760',
          passwordHash: 'oldhash',
          accountType: 'catechist',
          userRefId: plainId,
          isActive: false,
          createdAt: Date.now(),
          isDeleted: true,
        })
      })

      // bulkResetPasswords should not throw and should leave the deleted
      // account's passwordHash untouched
      await t.mutation(api.accountAdmin.bulkResetPasswords, {
        requesterId: adminId,
        accountIds: [deletedAccountId],
      })

      const account = await t.run(async (ctx) => {
        return ctx.db.get('accounts', deletedAccountId)
      })
      expect(account?.passwordHash).toBe('oldhash')
    })

    test('resets password for valid accounts', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      const plainId = await seedPlainCatechist(t, '770')

      await t.mutation(api.accountAdmin.grantCatechistAccount, {
        requesterId: adminId,
        catechistId: plainId,
      })

      const account = await t.run(async (ctx) => {
        return ctx.db
          .query('accounts')
          .withIndex('by_login_id', (q) => q.eq('loginId', 'CAT-770'))
          .unique()
      })

      await t.mutation(api.accountAdmin.bulkResetPasswords, {
        requesterId: adminId,
        accountIds: [account!._id],
      })

      const loginResult = await t.mutation(api.auth.login, {
        loginId: 'CAT-770',
        password: 'CAT-770',
      })
      expect(loginResult.memberId).toBe('770')
    })
  })

  // ─── toggleAccountStatus ──────────────────────────────────────────────────

  describe('toggleAccountStatus', () => {
    test('disables an active account', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      const plainId = await seedPlainCatechist(t, '400')

      await t.mutation(api.accountAdmin.grantCatechistAccount, {
        requesterId: adminId,
        catechistId: plainId,
      })

      const account = await t.run(async (ctx) => {
        return ctx.db
          .query('accounts')
          .withIndex('by_login_id', (q) => q.eq('loginId', 'CAT-400'))
          .unique()
      })

      await t.mutation(api.accountAdmin.toggleAccountStatus, {
        requesterId: adminId,
        accountId: account!._id,
      })

      const updated = await t.run(async (ctx) => {
        return ctx.db.get('accounts', account!._id)
      })
      expect(updated?.isActive).toBe(false)

      await expect(
        t.mutation(api.auth.login, {
          loginId: 'CAT-400',
          password: 'CAT-400',
        }),
      ).rejects.toThrow(AUTH_ERRORS.INVALID_CREDENTIALS)
    })

    test('enables a disabled account', async () => {
      const t = convexTest(schema, modules)
      const adminId = await seedAdminCatechist(t)
      const plainId = await seedPlainCatechist(t, '500')

      await t.mutation(api.accountAdmin.grantCatechistAccount, {
        requesterId: adminId,
        catechistId: plainId,
      })

      const account = await t.run(async (ctx) => {
        return ctx.db
          .query('accounts')
          .withIndex('by_login_id', (q) => q.eq('loginId', 'CAT-500'))
          .unique()
      })

      await t.mutation(api.accountAdmin.toggleAccountStatus, {
        requesterId: adminId,
        accountId: account!._id,
      })
      await t.mutation(api.accountAdmin.toggleAccountStatus, {
        requesterId: adminId,
        accountId: account!._id,
      })

      const updated = await t.run(async (ctx) => {
        return ctx.db.get('accounts', account!._id)
      })
      expect(updated?.isActive).toBe(true)

      const result = await t.mutation(api.auth.login, {
        loginId: 'CAT-500',
        password: 'CAT-500',
      })
      expect(result.memberId).toBe('500')
    })
  })
})
