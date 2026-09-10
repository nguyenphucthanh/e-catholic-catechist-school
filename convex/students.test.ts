/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'
import { api } from './_generated/api'
import schema from './schema'
import { AUTHZ_ERRORS, ENROLLMENT_ERRORS, STUDENT_ERRORS } from './lib/errors'
import { resolveStudentIdsForScope } from './students'
import type { Id } from './_generated/dataModel'

const modules = import.meta.glob('./**/*.ts')

describe('students backend functions', () => {
  test('list query', async () => {
    const t = convexTest(schema, modules)

    const catechistId = await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'GLV001',
        fullName: 'Admin',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
    })

    await t.mutation(api.students.create, {
      requesterId: catechistId,
      fullName: 'Student 1',
    })

    const s2Id = await t.mutation(api.students.create, {
      requesterId: catechistId,
      fullName: 'Student 2',
    })
    await t.mutation(api.students.update, {
      requesterId: catechistId,
      studentId: s2Id,
      isActive: false,
    })

    const listRes = await t.query(api.students.list, {
      requesterId: catechistId,
      paginationOpts: { numItems: 10, cursor: null },
    })

    expect(listRes.page).toHaveLength(2)

    const listActive = await t.query(api.students.list, {
      requesterId: catechistId,
      paginationOpts: { numItems: 10, cursor: null },
      isActive: true,
    })

    expect(listActive.page).toHaveLength(1)
    expect(listActive.page[0].fullName).toBe('Student 1')
  })

  test('list query filters by name and gender', async () => {
    const t = convexTest(schema, modules)

    const catechistId = await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'GLV001',
        fullName: 'Admin',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
    })

    await t.mutation(api.students.create, {
      requesterId: catechistId,
      fullName: 'Nguyen Van A',
      gender: 'male',
    })
    await t.mutation(api.students.create, {
      requesterId: catechistId,
      fullName: 'Tran Thi B',
      gender: 'female',
    })

    const byName = await t.query(api.students.list, {
      requesterId: catechistId,
      paginationOpts: { numItems: 10, cursor: null },
      name: 'nguyen',
    })
    expect(byName.page).toHaveLength(1)
    expect(byName.page[0].fullName).toBe('Nguyen Van A')

    const byGender = await t.query(api.students.list, {
      requesterId: catechistId,
      paginationOpts: { numItems: 10, cursor: null },
      gender: 'female',
    })
    expect(byGender.page).toHaveLength(1)
    expect(byGender.page[0].fullName).toBe('Tran Thi B')
  })

  test('list query paginates correctly with a filter applied', async () => {
    const t = convexTest(schema, modules)

    const catechistId = await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'GLV001',
        fullName: 'Admin',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
    })

    for (let i = 0; i < 3; i++) {
      await t.mutation(api.students.create, {
        requesterId: catechistId,
        fullName: `Male Student ${i}`,
        gender: 'male',
      })
    }
    await t.mutation(api.students.create, {
      requesterId: catechistId,
      fullName: 'Female Student',
      gender: 'female',
    })

    const page1 = await t.query(api.students.list, {
      requesterId: catechistId,
      paginationOpts: { numItems: 2, cursor: null },
      gender: 'male',
    })
    expect(page1.page).toHaveLength(2)
    expect(page1.isDone).toBe(false)

    const page2 = await t.query(api.students.list, {
      requesterId: catechistId,
      paginationOpts: { numItems: 2, cursor: page1.continueCursor },
      gender: 'male',
    })
    expect(page2.page).toHaveLength(1)
    expect(page2.isDone).toBe(true)
  })

  describe('list query sorting', () => {
    test('defaults to _creationTime descending when sortBy is omitted', async () => {
      const t = convexTest(schema, modules)

      const catechistId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV001',
          fullName: 'Admin',
          role: 'admin',
          isActive: true,
          isDeleted: false,
        })
      })

      await t.mutation(api.students.create, {
        requesterId: catechistId,
        fullName: 'First Created',
      })
      await t.mutation(api.students.create, {
        requesterId: catechistId,
        fullName: 'Second Created',
      })

      const result = await t.query(api.students.list, {
        requesterId: catechistId,
        paginationOpts: { numItems: 10, cursor: null },
      })

      expect(result.page.map((s) => s.fullName)).toEqual([
        'Second Created',
        'First Created',
      ])
    })

    test('sorts by fullName ascending', async () => {
      const t = convexTest(schema, modules)

      const catechistId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV001',
          fullName: 'Admin',
          role: 'admin',
          isActive: true,
          isDeleted: false,
        })
      })

      await t.mutation(api.students.create, {
        requesterId: catechistId,
        fullName: 'Charlie',
      })
      await t.mutation(api.students.create, {
        requesterId: catechistId,
        fullName: 'Alice',
      })
      await t.mutation(api.students.create, {
        requesterId: catechistId,
        fullName: 'Bob',
      })

      const result = await t.query(api.students.list, {
        requesterId: catechistId,
        paginationOpts: { numItems: 10, cursor: null },
        sortBy: 'fullName',
        sortOrder: 'asc',
      })

      expect(result.page.map((s) => s.fullName)).toEqual([
        'Alice',
        'Bob',
        'Charlie',
      ])
    })

    test('sorts by fullName descending', async () => {
      const t = convexTest(schema, modules)

      const catechistId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV001',
          fullName: 'Admin',
          role: 'admin',
          isActive: true,
          isDeleted: false,
        })
      })

      await t.mutation(api.students.create, {
        requesterId: catechistId,
        fullName: 'Charlie',
      })
      await t.mutation(api.students.create, {
        requesterId: catechistId,
        fullName: 'Alice',
      })
      await t.mutation(api.students.create, {
        requesterId: catechistId,
        fullName: 'Bob',
      })

      const result = await t.query(api.students.list, {
        requesterId: catechistId,
        paginationOpts: { numItems: 10, cursor: null },
        sortBy: 'fullName',
        sortOrder: 'desc',
      })

      expect(result.page.map((s) => s.fullName)).toEqual([
        'Charlie',
        'Bob',
        'Alice',
      ])
    })

    test('sorts by isActive, defaulting to ascending when sortOrder is omitted', async () => {
      const t = convexTest(schema, modules)

      const catechistId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV001',
          fullName: 'Admin',
          role: 'admin',
          isActive: true,
          isDeleted: false,
        })
      })

      const activeId = await t.mutation(api.students.create, {
        requesterId: catechistId,
        fullName: 'Active Student',
      })
      const inactiveId = await t.mutation(api.students.create, {
        requesterId: catechistId,
        fullName: 'Inactive Student',
      })
      await t.mutation(api.students.update, {
        requesterId: catechistId,
        studentId: inactiveId,
        isActive: false,
      })

      const result = await t.query(api.students.list, {
        requesterId: catechistId,
        paginationOpts: { numItems: 10, cursor: null },
        sortBy: 'isActive',
      })

      expect(result.page.map((s) => s._id)).toEqual([inactiveId, activeId])
    })
  })

  describe('list query class/branch filters', () => {
    async function setupClassFixture(t: ReturnType<typeof convexTest>) {
      const adminId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV001',
          fullName: 'Admin',
          role: 'admin',
          isActive: true,
          isDeleted: false,
        })
      })

      const academicYearId = await t.run(async (ctx) => {
        return await ctx.db.insert('academicYears', {
          name: '2024-2025',
          startDate: '2024-09-01',
          endDate: '2025-05-31',
          timezone: 'Asia/Ho_Chi_Minh',
          isActive: true,
          isDeleted: false,
        })
      })

      const branchId = await t.run(async (ctx) => {
        return await ctx.db.insert('branches', {
          name: 'Branch A',
          sortOrder: 1,
          isDeleted: false,
        })
      })

      const otherBranchId = await t.run(async (ctx) => {
        return await ctx.db.insert('branches', {
          name: 'Branch B',
          sortOrder: 2,
          isDeleted: false,
        })
      })

      const classId = await t.run(async (ctx) => {
        return await ctx.db.insert('classes', {
          branchId,
          name: 'Au Nhi 1',
          isDeleted: false,
        })
      })

      const classYearId = await t.run(async (ctx) => {
        return await ctx.db.insert('classYears', {
          academicYearId,
          classId,
          isDeleted: false,
        })
      })

      const enrolledStudentId = await t.mutation(api.students.create, {
        requesterId: adminId,
        fullName: 'Enrolled Student',
      })
      const unenrolledStudentId = await t.mutation(api.students.create, {
        requesterId: adminId,
        fullName: 'Unenrolled Student',
      })

      await t.mutation(api.students.enrollStudentInClass, {
        requesterId: adminId,
        studentId: enrolledStudentId,
        classYearId,
        enrolledDate: '2024-09-01',
      })

      return {
        adminId,
        academicYearId,
        branchId,
        otherBranchId,
        classYearId,
        enrolledStudentId,
        unenrolledStudentId,
      }
    }

    test('filters students by classYearId', async () => {
      const t = convexTest(schema, modules)
      const { adminId, classYearId } = await setupClassFixture(t)

      const result = await t.query(api.students.list, {
        requesterId: adminId,
        paginationOpts: { numItems: 10, cursor: null },
        classYearId,
      })

      expect(result.page).toHaveLength(1)
      expect(result.page[0].fullName).toBe('Enrolled Student')
    })

    test('filters students by branchId scoped to the academic year', async () => {
      const t = convexTest(schema, modules)
      const { adminId, academicYearId, branchId, otherBranchId } =
        await setupClassFixture(t)

      const matching = await t.query(api.students.list, {
        requesterId: adminId,
        paginationOpts: { numItems: 10, cursor: null },
        branchId,
        academicYearId,
      })
      expect(matching.page).toHaveLength(1)
      expect(matching.page[0].fullName).toBe('Enrolled Student')

      const nonMatching = await t.query(api.students.list, {
        requesterId: adminId,
        paginationOpts: { numItems: 10, cursor: null },
        branchId: otherBranchId,
        academicYearId,
      })
      expect(nonMatching.page).toHaveLength(0)
    })
  })

  test('get query', async () => {
    const t = convexTest(schema, modules)

    const catechistId = await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'GLV001',
        fullName: 'Admin',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
    })

    const studentId = await t.mutation(api.students.create, {
      requesterId: catechistId,
      fullName: 'Student 1',
    })

    const student = await t.query(api.students.get, {
      requesterId: catechistId,
      id: studentId,
    })

    expect(student).not.toBeNull()
    expect(student?.fullName).toBe('Student 1')
    expect(student?.address).toBeNull()
    expect(student?.guardians).toEqual([])

    await t.mutation(api.students.softDelete, {
      requesterId: catechistId,
      studentId,
    })

    const deletedStudent = await t.query(api.students.get, {
      requesterId: catechistId,
      id: studentId,
    })

    expect(deletedStudent).toBeNull()

    // Non-existent id
    const fakeId = await t.run(async (ctx) => {
      return ctx.db.insert('students', {
        studentCode: '999',
        fullName: 'Fake',
        isActive: true,
        isDeleted: false,
        createdAt: Date.now(),
      })
    })
    await t.run(async (ctx) => {
      await ctx.db.patch('students', fakeId, { isDeleted: true })
    })

    const nonExistent = await t.query(api.students.get, {
      requesterId: catechistId,
      id: fakeId,
    })

    expect(nonExistent).toBeNull()
  })

  test('create mutation', async () => {
    const t = convexTest(schema, modules)

    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'GLV001',
        fullName: 'Admin',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
    })

    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'GLV002',
        fullName: 'User',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
    })

    const student1Id = await t.mutation(api.students.create, {
      requesterId: adminId,
      fullName: 'Student 1',
      dateOfBirth: '2010-01-01',
      gender: 'male',
    })

    const student2Id = await t.mutation(api.students.create, {
      requesterId: adminId,
      fullName: 'Student 2',
    })

    const s1 = await t.query(api.students.get, {
      requesterId: adminId,
      id: student1Id,
    })
    const s2 = await t.query(api.students.get, {
      requesterId: adminId,
      id: student2Id,
    })

    expect(s1?.studentCode).toBe('1')
    expect(s2?.studentCode).toBe('2')
    expect(s1?.dateOfBirth).toBe('2010-01-01')
    expect(s1?.gender).toBe('male')
    expect(s1?.isActive).toBe(true)
    expect(s1?.isDeleted).toBe(false)
    expect(s1?.createdAt).toBeDefined()

    const student3Id = await t.mutation(api.students.create, {
      requesterId: userId,
      fullName: 'Student 3',
    })
    expect(student3Id).toBeDefined()
  })

  test('update mutation', async () => {
    const t = convexTest(schema, modules)

    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'GLV001',
        fullName: 'Admin',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
    })

    const studentId = await t.mutation(api.students.create, {
      requesterId: adminId,
      fullName: 'Student 1',
    })

    await t.mutation(api.students.update, {
      requesterId: adminId,
      studentId,
      fullName: 'Student 1 Updated',
      isActive: false,
    })

    const updated = await t.query(api.students.get, {
      requesterId: adminId,
      id: studentId,
    })
    expect(updated?.fullName).toBe('Student 1 Updated')
    expect(updated?.isActive).toBe(false)

    // Soft deleted update should fail
    await t.mutation(api.students.softDelete, {
      requesterId: adminId,
      studentId,
    })

    await expect(
      t.mutation(api.students.update, {
        requesterId: adminId,
        studentId,
        fullName: 'Student 1 Updated Again',
      }),
    ).rejects.toThrow(STUDENT_ERRORS.NOT_FOUND)
  })

  test('softDelete mutation', async () => {
    const t = convexTest(schema, modules)

    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'GLV001',
        fullName: 'Admin',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
    })

    const studentId = await t.mutation(api.students.create, {
      requesterId: adminId,
      fullName: 'Student 1',
    })

    const academicYearId = await t.run(async (ctx) => {
      return await ctx.db.insert('academicYears', {
        name: '2023-2024',
        startDate: '2023-09-01',
        endDate: '2024-05-31',
        timezone: 'Asia/Ho_Chi_Minh',
        isActive: true,
        isDeleted: false,
      })
    })

    const branchId = await t.run(async (ctx) => {
      return await ctx.db.insert('branches', {
        name: 'Branch 1',
        sortOrder: 1,
        isDeleted: false,
      })
    })

    const classId = await t.run(async (ctx) => {
      return await ctx.db.insert('classes', {
        branchId,
        name: 'Class 1',
        isDeleted: false,
      })
    })

    const classYearId = await t.run(async (ctx) => {
      return await ctx.db.insert('classYears', {
        classId,
        academicYearId,
        isDeleted: false,
      })
    })

    const enrollmentId = await t.run(async (ctx) => {
      return await ctx.db.insert('studentClasses', {
        studentId,
        classYearId,
        isPrimaryClass: true,
        enrolledDate: '2023-01-01',
        status: 'active',
        isDeleted: false,
      })
    })

    // Active enrollment prevents deletion
    await expect(
      t.mutation(api.students.softDelete, {
        requesterId: adminId,
        studentId,
      }),
    ).rejects.toThrow(STUDENT_ERRORS.IN_USE_BY_ENROLLMENT)

    // Withdrawn enrollment allows deletion
    await t.run(async (ctx) => {
      await ctx.db.patch('studentClasses', enrollmentId, {
        status: 'withdrawn',
      })
    })

    await t.mutation(api.students.softDelete, {
      requesterId: adminId,
      studentId,
    })

    const deleted = await t.run(async (ctx) => {
      return await ctx.db.get('students', studentId)
    })
    expect(deleted?.isDeleted).toBe(true)

    // Soft deleted deletion should fail
    await expect(
      t.mutation(api.students.softDelete, {
        requesterId: adminId,
        studentId,
      }),
    ).rejects.toThrow(STUDENT_ERRORS.NOT_FOUND)
  })

  describe('StudentAddress mutations', () => {
    test('upsertStudentAddress and getStudentAddress', async () => {
      const t = convexTest(schema, modules)
      const adminId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV001',
          fullName: 'Admin',
          role: 'admin',
          isActive: true,
          isDeleted: false,
        })
      })
      const studentId = await t.mutation(api.students.create, {
        requesterId: adminId,
        fullName: 'Student 1',
      })

      // 1. getStudentAddress returns null when no address
      const addr1 = await t.query(api.students.getStudentAddress, {
        requesterId: adminId,
        studentId,
      })
      expect(addr1).toBeNull()

      // 2. upsertStudentAddress creates address
      await t.mutation(api.students.upsertStudentAddress, {
        requesterId: adminId,
        studentId,
        country: 'VN',
        city: 'Ho Chi Minh',
      })
      const addr2 = await t.query(api.students.getStudentAddress, {
        requesterId: adminId,
        studentId,
      })
      expect(addr2).not.toBeNull()
      expect(addr2?.country).toBe('VN')
      expect(addr2?.city).toBe('Ho Chi Minh')

      // 3. upsertStudentAddress again updates
      await t.mutation(api.students.upsertStudentAddress, {
        requesterId: adminId,
        studentId,
        country: 'VN',
        city: 'Hanoi',
      })
      const addr3 = await t.query(api.students.getStudentAddress, {
        requesterId: adminId,
        studentId,
      })
      expect(addr3?.city).toBe('Hanoi')
      expect(addr3?._id).toBe(addr2?._id)

      // Test student get returns address
      const student = await t.query(api.students.get, {
        requesterId: adminId,
        id: studentId,
      })
      expect(student?.address?.city).toBe('Hanoi')

      // 4. softDeleteStudentAddress
      await t.mutation(api.students.softDeleteStudentAddress, {
        requesterId: adminId,
        studentId,
      })
      const deletedAddr = await t.run(async (ctx) => {
        return await ctx.db.get('studentAddresses', addr3!._id)
      })
      expect(deletedAddr?.isDeleted).toBe(true)

      // 5. softDelete on already deleted throws
      await expect(
        t.mutation(api.students.softDeleteStudentAddress, {
          requesterId: adminId,
          studentId,
        }),
      ).rejects.toThrow(STUDENT_ERRORS.ADDRESS_NOT_FOUND)
    })

    test('upsertStudentAddress unauthorized', async () => {
      const t = convexTest(schema, modules)
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV002',
          fullName: 'User',
          role: 'user',
          isActive: true,
          isDeleted: false,
        })
      })
      const studentId = await t.run(async (ctx) => {
        return await ctx.db.insert('students', {
          studentCode: '1',
          fullName: 'Student 1',
          isActive: true,
          isDeleted: false,
          createdAt: Date.now(),
        })
      })
      await t.run(async (ctx) => {
        const yearId = await ctx.db.insert('academicYears', {
          name: '2024',
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          timezone: 'Asia/Ho_Chi_Minh',
          isActive: true,
          isDeleted: false,
        })
        const branchId = await ctx.db.insert('branches', {
          name: 'B1',
          isDeleted: false,
          sortOrder: 1,
        })
        const classId = await ctx.db.insert('classes', {
          name: 'Class 1',
          branchId,
          isDeleted: false,
        })
        const cyId = await ctx.db.insert('classYears', {
          classId,
          academicYearId: yearId,
          isDeleted: false,
        })
        await ctx.db.insert('studentClasses', {
          studentId,
          classYearId: cyId,
          isPrimaryClass: true,
          enrolledDate: '2024-01-01',
          status: 'active',
          isDeleted: false,
        })
      })

      await expect(
        t.mutation(api.students.upsertStudentAddress, {
          requesterId: userId,
          studentId,
          country: 'VN',
        }),
      ).rejects.toThrow()
    })
  })

  test('getStudentDetail query', async () => {
    const t = convexTest(schema, modules)

    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'GLV001',
        fullName: 'Admin',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
    })

    const studentId = await t.mutation(api.students.create, {
      requesterId: adminId,
      fullName: 'John Doe',
      dateOfBirth: '2012-05-15',
      gender: 'male',
    })

    // Create address
    await t.mutation(api.students.upsertStudentAddress, {
      requesterId: adminId,
      studentId,
      country: 'VN',
      city: 'Ho Chi Minh',
      addressLine1: '123 Main St',
    })

    // Create sacraments
    await t.run(async (ctx) => {
      await ctx.db.insert('studentSacraments', {
        studentId,
        sacramentType: 'baptism',
        receivedDate: '2012-06-01',
        receivedPlace: 'St. Peter Church',
        isDeleted: false,
      })
      await ctx.db.insert('studentSacraments', {
        studentId,
        sacramentType: 'first_communion',
        receivedDate: '2020-05-10',
        receivedPlace: 'St. Peter Church',
        isDeleted: false,
      })
    })

    // Create enrollment data
    const academicYearId = await t.run(async (ctx) => {
      return await ctx.db.insert('academicYears', {
        name: '2024-2025',
        startDate: '2024-09-01',
        endDate: '2025-05-31',
        timezone: 'Asia/Ho_Chi_Minh',
        isActive: true,
        isDeleted: false,
      })
    })

    const branchId = await t.run(async (ctx) => {
      return await ctx.db.insert('branches', {
        name: 'Branch A',
        sortOrder: 1,
        isDeleted: false,
      })
    })

    const classId = await t.run(async (ctx) => {
      return await ctx.db.insert('classes', {
        branchId,
        name: 'Au Nhi 1',
        isDeleted: false,
      })
    })

    const classYearId = await t.run(async (ctx) => {
      return await ctx.db.insert('classYears', {
        classId,
        academicYearId,
        isDeleted: false,
      })
    })

    await t.run(async (ctx) => {
      await ctx.db.insert('studentClasses', {
        studentId,
        classYearId,
        isPrimaryClass: true,
        enrolledDate: '2024-09-01',
        status: 'active',
        isDeleted: false,
      })
    })

    // Call getStudentDetail
    const detail = await t.query(api.students.getStudentDetail, {
      requesterId: adminId,
      studentId,
    })

    expect(detail).not.toBeNull()
    expect(detail?.fullName).toBe('John Doe')
    expect(detail?.address).not.toBeNull()
    expect(detail?.address?.city).toBe('Ho Chi Minh')
    expect(detail?.sacraments).toHaveLength(2)
    expect(detail?.sacraments[0].sacramentType).toBe('baptism')
    expect(detail?.enrollments).toHaveLength(1)
    expect(detail?.enrollments[0].classYear.className).toBe('Au Nhi 1')
    expect(detail?.enrollments[0].classYear.academicYearName).toBe('2024-2025')
    expect(detail?.siblings).toHaveLength(0)

    // Test non-existent student
    const fakeId = await t.run(async (ctx) => {
      return ctx.db.insert('students', {
        studentCode: '999',
        fullName: 'Fake',
        isActive: true,
        isDeleted: false,
        createdAt: Date.now(),
      })
    })
    await t.run(async (ctx) => {
      await ctx.db.patch('students', fakeId, { isDeleted: true })
    })

    const nonExistent = await t.query(api.students.getStudentDetail, {
      requesterId: adminId,
      studentId: fakeId,
    })
    expect(nonExistent).toBeNull()
  })

  test('getStudentDetail query returns siblings sharing a guardian', async () => {
    const t = convexTest(schema, modules)

    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'GLV002',
        fullName: 'Admin',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
    })

    const studentAId = await t.mutation(api.students.create, {
      requesterId: adminId,
      fullName: 'Sibling A',
    })
    const studentBId = await t.mutation(api.students.create, {
      requesterId: adminId,
      fullName: 'Sibling B',
      saintName: 'Peter',
    })
    // Unrelated student, no shared guardian
    await t.mutation(api.students.create, {
      requesterId: adminId,
      fullName: 'Unrelated',
    })

    const { guardianId, classYearId } = await t.run(async (ctx) => {
      // eslint-disable-next-line no-shadow
      const guardianId = await ctx.db.insert('guardians', {
        fullName: 'Parent Nguyen',
        isDeleted: false,
      })
      const academicYearId = await ctx.db.insert('academicYears', {
        name: '2024-2025',
        startDate: '2024-09-01',
        endDate: '2025-05-31',
        timezone: 'Asia/Ho_Chi_Minh',
        isActive: true,
        isDeleted: false,
      })
      const branchId = await ctx.db.insert('branches', {
        name: 'Branch A',
        sortOrder: 1,
        isDeleted: false,
      })

      const classId = await ctx.db.insert('classes', {
        branchId,
        name: 'Thieu Nhi 1',
        isDeleted: false,
      })
      // eslint-disable-next-line no-shadow
      const classYearId = await ctx.db.insert('classYears', {
        classId,
        academicYearId,
        isDeleted: false,
      })
      return { guardianId, academicYearId, branchId, classId, classYearId }
    })

    await t.run(async (ctx) => {
      await ctx.db.insert('studentGuardians', {
        studentId: studentAId,
        guardianId,
        relationship: 'father',
        contactPriority: 1,
        isDeleted: false,
      })
      await ctx.db.insert('studentGuardians', {
        studentId: studentBId,
        guardianId,
        relationship: 'father',
        contactPriority: 1,
        isDeleted: false,
      })
      await ctx.db.insert('studentClasses', {
        studentId: studentBId,
        classYearId,
        isPrimaryClass: true,
        enrolledDate: '2024-09-01',
        status: 'active',
        isDeleted: false,
      })
    })

    const detail = await t.query(api.students.getStudentDetail, {
      requesterId: adminId,
      studentId: studentAId,
    })

    expect(detail?.siblings).toHaveLength(1)
    expect(detail?.siblings[0]._id).toBe(studentBId)
    expect(detail?.siblings[0].saintName).toBe('Peter')
    expect(detail?.siblings[0].currentClassName).toBe('Thieu Nhi 1')
  })

  describe('getMyProfile query', () => {
    test('returns the requesting student own profile detail', async () => {
      const t = convexTest(schema, modules)

      const adminId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV001',
          fullName: 'Admin',
          role: 'admin',
          isActive: true,
          isDeleted: false,
        })
      })

      const studentId = await t.mutation(api.students.create, {
        requesterId: adminId,
        fullName: 'Jane Doe',
        dateOfBirth: '2012-05-15',
        gender: 'female',
      })

      await t.mutation(api.students.upsertStudentAddress, {
        requesterId: adminId,
        studentId,
        country: 'VN',
        city: 'Ho Chi Minh',
        addressLine1: '123 Main St',
      })

      const profile = await t.query(api.students.getMyProfile, {
        requesterId: studentId,
      })

      expect(profile).not.toBeNull()
      expect(profile?.fullName).toBe('Jane Doe')
      expect(profile?.address?.city).toBe('Ho Chi Minh')
      expect(profile?.sacraments).toEqual([])
      expect(profile?.enrollments).toEqual([])
      expect(profile?.guardians).toHaveLength(0)
    })

    test('rejects an inactive student', async () => {
      const t = convexTest(schema, modules)

      const adminId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV001',
          fullName: 'Admin',
          role: 'admin',
          isActive: true,
          isDeleted: false,
        })
      })

      const studentId = await t.mutation(api.students.create, {
        requesterId: adminId,
        fullName: 'Inactive Student',
      })
      await t.mutation(api.students.update, {
        requesterId: adminId,
        studentId,
        isActive: false,
      })

      await expect(
        t.query(api.students.getMyProfile, { requesterId: studentId }),
      ).rejects.toThrow(AUTHZ_ERRORS.ACCOUNT_INACTIVE)
    })

    test('rejects a soft-deleted student', async () => {
      const t = convexTest(schema, modules)

      const adminId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV001',
          fullName: 'Admin',
          role: 'admin',
          isActive: true,
          isDeleted: false,
        })
      })

      const studentId = await t.mutation(api.students.create, {
        requesterId: adminId,
        fullName: 'Deleted Student',
      })
      await t.mutation(api.students.softDelete, {
        requesterId: adminId,
        studentId,
      })

      await expect(
        t.query(api.students.getMyProfile, { requesterId: studentId }),
      ).rejects.toThrow(AUTHZ_ERRORS.ACCOUNT_DELETED)
    })
  })

  describe('upsertStudentSacrament mutation', () => {
    test('inserts a new sacrament record', async () => {
      const t = convexTest(schema, modules)
      const adminId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV001',
          fullName: 'Admin',
          role: 'admin',
          isActive: true,
          isDeleted: false,
        })
      })
      const studentId = await t.mutation(api.students.create, {
        requesterId: adminId,
        fullName: 'Student 1',
      })

      const sacramentId = await t.mutation(
        api.students.upsertStudentSacrament,
        {
          requesterId: adminId,
          studentId,
          sacramentType: 'baptism',
          receivedDate: '2015-06-01',
          receivedPlace: 'St. Mary Church',
        },
      )

      expect(sacramentId).toBeDefined()

      const record = await t.run(async (ctx) => {
        return await ctx.db.get('studentSacraments', sacramentId)
      })
      expect(record?.sacramentType).toBe('baptism')
      expect(record?.receivedDate).toBe('2015-06-01')
      expect(record?.receivedPlace).toBe('St. Mary Church')
      expect(record?.isDeleted).toBe(false)
    })

    test('patches an existing non-deleted sacrament record', async () => {
      const t = convexTest(schema, modules)
      const adminId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV001',
          fullName: 'Admin',
          role: 'admin',
          isActive: true,
          isDeleted: false,
        })
      })
      const studentId = await t.mutation(api.students.create, {
        requesterId: adminId,
        fullName: 'Student 1',
      })

      const firstId = await t.mutation(api.students.upsertStudentSacrament, {
        requesterId: adminId,
        studentId,
        sacramentType: 'baptism',
        receivedDate: '2015-06-01',
        receivedPlace: 'Old Church',
      })

      const secondId = await t.mutation(api.students.upsertStudentSacrament, {
        requesterId: adminId,
        studentId,
        sacramentType: 'baptism',
        receivedDate: '2015-06-01',
        receivedPlace: 'New Church',
        notes: 'Updated',
      })

      // Same record id — no new insert
      expect(secondId).toBe(firstId)

      const record = await t.run(async (ctx) => {
        return await ctx.db.get('studentSacraments', firstId)
      })
      expect(record?.receivedPlace).toBe('New Church')
      expect(record?.notes).toBe('Updated')
      expect(record?.isDeleted).toBe(false)
    })

    test('re-activates a previously soft-deleted sacrament record', async () => {
      const t = convexTest(schema, modules)
      const adminId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV001',
          fullName: 'Admin',
          role: 'admin',
          isActive: true,
          isDeleted: false,
        })
      })
      const studentId = await t.mutation(api.students.create, {
        requesterId: adminId,
        fullName: 'Student 1',
      })

      const firstId = await t.mutation(api.students.upsertStudentSacrament, {
        requesterId: adminId,
        studentId,
        sacramentType: 'first_communion',
      })

      // Soft delete it
      await t.mutation(api.students.softDeleteStudentSacrament, {
        requesterId: adminId,
        studentId,
        sacramentType: 'first_communion',
      })

      const afterDelete = await t.run(async (ctx) => {
        return await ctx.db.get('studentSacraments', firstId)
      })
      expect(afterDelete?.isDeleted).toBe(true)

      // Upsert again — should patch isDeleted: false
      const secondId = await t.mutation(api.students.upsertStudentSacrament, {
        requesterId: adminId,
        studentId,
        sacramentType: 'first_communion',
        notes: 'Re-activated',
      })

      expect(secondId).toBe(firstId)
      const reactivated = await t.run(async (ctx) => {
        return await ctx.db.get('studentSacraments', firstId)
      })
      expect(reactivated?.isDeleted).toBe(false)
      expect(reactivated?.notes).toBe('Re-activated')
    })

    test('throws Unauthorized for non-admin requester', async () => {
      const t = convexTest(schema, modules)
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV002',
          fullName: 'User',
          role: 'user',
          isActive: true,
          isDeleted: false,
        })
      })
      const studentId = await t.run(async (ctx) => {
        return await ctx.db.insert('students', {
          studentCode: '1',
          fullName: 'Student 1',
          isActive: true,
          isDeleted: false,
          createdAt: Date.now(),
        })
      })
      await t.run(async (ctx) => {
        const yearId = await ctx.db.insert('academicYears', {
          name: '2024',
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          timezone: 'Asia/Ho_Chi_Minh',
          isActive: true,
          isDeleted: false,
        })
        const branchId = await ctx.db.insert('branches', {
          name: 'B1',
          isDeleted: false,
          sortOrder: 1,
        })
        const classId = await ctx.db.insert('classes', {
          name: 'Class 1',
          branchId,
          isDeleted: false,
        })
        const cyId = await ctx.db.insert('classYears', {
          classId,
          academicYearId: yearId,
          isDeleted: false,
        })
        await ctx.db.insert('studentClasses', {
          studentId,
          classYearId: cyId,
          isPrimaryClass: true,
          enrolledDate: '2024-01-01',
          status: 'active',
          isDeleted: false,
        })
      })

      await expect(
        t.mutation(api.students.upsertStudentSacrament, {
          requesterId: userId,
          studentId,
          sacramentType: 'baptism',
        }),
      ).rejects.toThrow()
    })
  })

  describe('softDeleteStudentSacrament mutation', () => {
    test('soft deletes an existing sacrament record', async () => {
      const t = convexTest(schema, modules)
      const adminId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV001',
          fullName: 'Admin',
          role: 'admin',
          isActive: true,
          isDeleted: false,
        })
      })
      const studentId = await t.mutation(api.students.create, {
        requesterId: adminId,
        fullName: 'Student 1',
      })

      const sacramentId = await t.mutation(
        api.students.upsertStudentSacrament,
        {
          requesterId: adminId,
          studentId,
          sacramentType: 'confirmation',
          receivedDate: '2020-05-10',
        },
      )

      await t.mutation(api.students.softDeleteStudentSacrament, {
        requesterId: adminId,
        studentId,
        sacramentType: 'confirmation',
      })

      const record = await t.run(async (ctx) => {
        return await ctx.db.get('studentSacraments', sacramentId)
      })
      expect(record?.isDeleted).toBe(true)
    })

    test('no-ops if sacrament record does not exist', async () => {
      const t = convexTest(schema, modules)
      const adminId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV001',
          fullName: 'Admin',
          role: 'admin',
          isActive: true,
          isDeleted: false,
        })
      })
      const studentId = await t.mutation(api.students.create, {
        requesterId: adminId,
        fullName: 'Student 1',
      })

      // No sacrament inserted — should not throw
      await expect(
        t.mutation(api.students.softDeleteStudentSacrament, {
          requesterId: adminId,
          studentId,
          sacramentType: 'first_confession',
        }),
      ).resolves.not.toThrow()
    })

    test('no-ops if sacrament record is already deleted', async () => {
      const t = convexTest(schema, modules)
      const adminId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV001',
          fullName: 'Admin',
          role: 'admin',
          isActive: true,
          isDeleted: false,
        })
      })
      const studentId = await t.mutation(api.students.create, {
        requesterId: adminId,
        fullName: 'Student 1',
      })

      await t.mutation(api.students.upsertStudentSacrament, {
        requesterId: adminId,
        studentId,
        sacramentType: 'baptism',
      })
      await t.mutation(api.students.softDeleteStudentSacrament, {
        requesterId: adminId,
        studentId,
        sacramentType: 'baptism',
      })

      // Second delete — should be a no-op, not throw
      await expect(
        t.mutation(api.students.softDeleteStudentSacrament, {
          requesterId: adminId,
          studentId,
          sacramentType: 'baptism',
        }),
      ).resolves.not.toThrow()
    })

    test('throws Unauthorized for non-admin requester', async () => {
      const t = convexTest(schema, modules)
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV002',
          fullName: 'User',
          role: 'user',
          isActive: true,
          isDeleted: false,
        })
      })
      const studentId = await t.run(async (ctx) => {
        return await ctx.db.insert('students', {
          studentCode: '1',
          fullName: 'Student 1',
          isActive: true,
          isDeleted: false,
          createdAt: Date.now(),
        })
      })
      await t.run(async (ctx) => {
        const yearId = await ctx.db.insert('academicYears', {
          name: '2024',
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          timezone: 'Asia/Ho_Chi_Minh',
          isActive: true,
          isDeleted: false,
        })
        const branchId = await ctx.db.insert('branches', {
          name: 'B1',
          isDeleted: false,
          sortOrder: 1,
        })
        const classId = await ctx.db.insert('classes', {
          name: 'Class 1',
          branchId,
          isDeleted: false,
        })
        const cyId = await ctx.db.insert('classYears', {
          classId,
          academicYearId: yearId,
          isDeleted: false,
        })
        await ctx.db.insert('studentClasses', {
          studentId,
          classYearId: cyId,
          isPrimaryClass: true,
          enrolledDate: '2024-01-01',
          status: 'active',
          isDeleted: false,
        })
      })

      await expect(
        t.mutation(api.students.softDeleteStudentSacrament, {
          requesterId: userId,
          studentId,
          sacramentType: 'baptism',
        }),
      ).rejects.toThrow()
    })
  })

  describe('assignStudentToClassYear mutation', () => {
    test('atomically transfers primary class enrollment and resolves conflicts', async () => {
      const t = convexTest(schema, modules)
      const adminId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV001',
          fullName: 'Admin',
          role: 'admin',
          isActive: true,
          isDeleted: false,
        })
      })
      const studentId = await t.mutation(api.students.create, {
        requesterId: adminId,
        fullName: 'Student Placement Test',
      })
      const academicYearId = await t.run(async (ctx) => {
        return await ctx.db.insert('academicYears', {
          name: '2026-2027',
          startDate: '2026-09-01',
          endDate: '2027-05-31',
          timezone: 'Asia/Ho_Chi_Minh',
          isActive: true,
          isDeleted: false,
        })
      })
      const branchId = await t.run(async (ctx) => {
        return await ctx.db.insert('branches', {
          name: 'Branch 1',
          sortOrder: 1,
          isDeleted: false,
        })
      })
      const class1Id = await t.run(async (ctx) => {
        return await ctx.db.insert('classes', {
          name: 'Class A',
          branchId,
          isDeleted: false,
        })
      })
      const class2Id = await t.run(async (ctx) => {
        return await ctx.db.insert('classes', {
          name: 'Class B',
          branchId,
          isDeleted: false,
        })
      })
      const classYear1Id = await t.run(async (ctx) => {
        return await ctx.db.insert('classYears', {
          classId: class1Id,
          academicYearId,
          isDeleted: false,
        })
      })
      const classYear2Id = await t.run(async (ctx) => {
        return await ctx.db.insert('classYears', {
          classId: class2Id,
          academicYearId,
          isDeleted: false,
        })
      })

      // Initial placement in Class A
      await t.mutation(api.students.assignStudentToClassYear, {
        requesterId: adminId,
        studentIds: [studentId],
        targetClassYearId: classYear1Id,
        isPrimaryClass: true,
        enrolledDate: '2026-09-01',
      })

      // Transfer to Class B using assignStudentToClassYear
      await t.mutation(api.students.assignStudentToClassYear, {
        requesterId: adminId,
        studentIds: [studentId],
        targetClassYearId: classYear2Id,
        isPrimaryClass: true,
        enrolledDate: '2026-09-15',
        replaceExistingPrimary: true,
      })

      const enrollments = await t.run(async (ctx) => {
        return await ctx.db
          .query('studentClasses')
          .withIndex('by_student_id', (q) => q.eq('studentId', studentId))
          .collect()
      })

      const classAEnrollment = enrollments.find(
        (e) => e.classYearId === classYear1Id,
      )
      const classBEnrollment = enrollments.find(
        (e) => e.classYearId === classYear2Id,
      )

      expect(classAEnrollment?.status).toBe('withdrawn')
      expect(classAEnrollment?.isPrimaryClass).toBe(false)
      expect(classBEnrollment?.status).toBe('active')
      expect(classBEnrollment?.isPrimaryClass).toBe(true)
    })

    test('authorizes catechist assigned only to source class when sourceClassYearId is provided', async () => {
      const t = convexTest(schema, modules)
      const catechistId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV002',
          fullName: 'Teacher A',
          role: 'user',
          isActive: true,
          isDeleted: false,
        })
      })
      const studentId = await t.run(async (ctx) => {
        return await ctx.db.insert('students', {
          fullName: 'Student Source Auth',
          studentCode: 'S999',
          isActive: true,
          isDeleted: false,
          createdAt: Date.now(),
        })
      })
      const academicYearId = await t.run(async (ctx) => {
        return await ctx.db.insert('academicYears', {
          name: '2026-2027',
          startDate: '2026-09-01',
          endDate: '2027-05-31',
          timezone: 'Asia/Ho_Chi_Minh',
          isActive: true,
          isDeleted: false,
        })
      })
      const branchId = await t.run(async (ctx) => {
        return await ctx.db.insert('branches', {
          name: 'Branch 1',
          sortOrder: 1,
          isDeleted: false,
        })
      })
      const class1Id = await t.run(async (ctx) => {
        return await ctx.db.insert('classes', {
          name: 'Class Source',
          branchId,
          isDeleted: false,
        })
      })
      const class2Id = await t.run(async (ctx) => {
        return await ctx.db.insert('classes', {
          name: 'Class Target',
          branchId,
          isDeleted: false,
        })
      })
      const classYear1Id = await t.run(async (ctx) => {
        return await ctx.db.insert('classYears', {
          classId: class1Id,
          academicYearId,
          isDeleted: false,
        })
      })
      const classYear2Id = await t.run(async (ctx) => {
        return await ctx.db.insert('classYears', {
          classId: class2Id,
          academicYearId,
          isDeleted: false,
        })
      })
      // Assign catechist ONLY to classYear1Id
      await t.run(async (ctx) => {
        return await ctx.db.insert('classCatechists', {
          catechistId,
          classYearId: classYear1Id,
          academicYearId,
          role: 'homeroom',
          isDeleted: false,
        })
      })
      // Enroll student initially in classYear1Id
      await t.run(async (ctx) => {
        return await ctx.db.insert('studentClasses', {
          studentId,
          classYearId: classYear1Id,
          enrolledDate: '2026-09-01',
          isPrimaryClass: true,
          status: 'active',
          isDeleted: false,
        })
      })

      // Transfer student from classYear1 to classYear2 using sourceClassYearId
      await t.mutation(api.students.assignStudentToClassYear, {
        requesterId: catechistId,
        studentIds: [studentId],
        sourceClassYearId: classYear1Id,
        targetClassYearId: classYear2Id,
        isPrimaryClass: true,
        enrolledDate: '2026-09-20',
        replaceExistingPrimary: true,
      })

      const enrollments = await t.run(async (ctx) => {
        return await ctx.db
          .query('studentClasses')
          .withIndex('by_student_id', (q) => q.eq('studentId', studentId))
          .collect()
      })

      const sourceEnr = enrollments.find((e) => e.classYearId === classYear1Id)
      const targetEnr = enrollments.find((e) => e.classYearId === classYear2Id)

      expect(sourceEnr?.status).toBe('withdrawn')
      expect(targetEnr?.status).toBe('active')
      expect(targetEnr?.isPrimaryClass).toBe(true)
    })

    test('multi-enrolls student into non-primary class without withdrawing primary class', async () => {
      const t = convexTest(schema, modules)
      const adminId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV001',
          fullName: 'Admin',
          role: 'admin',
          isActive: true,
          isDeleted: false,
        })
      })
      const studentId = await t.run(async (ctx) => {
        return await ctx.db.insert('students', {
          fullName: 'Student Multi Enroll',
          studentCode: 'S998',
          isActive: true,
          isDeleted: false,
          createdAt: Date.now(),
        })
      })
      const academicYearId = await t.run(async (ctx) => {
        return await ctx.db.insert('academicYears', {
          name: '2026-2027',
          startDate: '2026-09-01',
          endDate: '2027-05-31',
          timezone: 'Asia/Ho_Chi_Minh',
          isActive: true,
          isDeleted: false,
        })
      })
      const branchId = await t.run(async (ctx) => {
        return await ctx.db.insert('branches', {
          name: 'Branch 1',
          sortOrder: 1,
          isDeleted: false,
        })
      })
      const class1Id = await t.run(async (ctx) => {
        return await ctx.db.insert('classes', {
          name: 'Primary Class',
          branchId,
          isDeleted: false,
        })
      })
      const class2Id = await t.run(async (ctx) => {
        return await ctx.db.insert('classes', {
          name: 'Choir Class',
          branchId,
          isDeleted: false,
        })
      })
      const classYear1Id = await t.run(async (ctx) => {
        return await ctx.db.insert('classYears', {
          classId: class1Id,
          academicYearId,
          classType: 'primary',
          isDeleted: false,
        })
      })
      const classYear2Id = await t.run(async (ctx) => {
        return await ctx.db.insert('classYears', {
          classId: class2Id,
          academicYearId,
          classType: 'apostle',
          isDeleted: false,
        })
      })

      // Initial placement in Primary Class
      await t.mutation(api.students.assignStudentToClassYear, {
        requesterId: adminId,
        studentIds: [studentId],
        targetClassYearId: classYear1Id,
        isPrimaryClass: true,
        enrolledDate: '2026-09-01',
      })

      // Send to Choir (non-primary)
      await t.mutation(api.students.assignStudentToClassYear, {
        requesterId: adminId,
        studentIds: [studentId],
        sourceClassYearId: classYear1Id,
        targetClassYearId: classYear2Id,
        isPrimaryClass: false,
        enrolledDate: '2026-09-10',
        replaceExistingPrimary: false,
      })

      const enrollments = await t.run(async (ctx) => {
        return await ctx.db
          .query('studentClasses')
          .withIndex('by_student_id', (q) => q.eq('studentId', studentId))
          .collect()
      })

      const primaryEnr = enrollments.find((e) => e.classYearId === classYear1Id)
      const choirEnr = enrollments.find((e) => e.classYearId === classYear2Id)

      expect(primaryEnr?.status).toBe('active')
      expect(primaryEnr?.isPrimaryClass).toBe(true)
      expect(choirEnr?.status).toBe('active')
      expect(choirEnr?.isPrimaryClass).toBe(false)
    })
  })

  describe('updateStudentSacramentDetails mutation', () => {
    test('creates a new sacrament record with only the detail fields', async () => {
      const t = convexTest(schema, modules)
      const adminId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV001',
          fullName: 'Admin',
          role: 'admin',
          isActive: true,
          isDeleted: false,
        })
      })
      const studentId = await t.mutation(api.students.create, {
        requesterId: adminId,
        fullName: 'Student 1',
      })

      await t.mutation(api.students.updateStudentSacramentDetails, {
        requesterId: adminId,
        studentId,
        sacramentType: 'confirmation',
        receivedDate: '2026-05-15',
        receivedPlace: 'Giao xu Tan Dinh',
        feastName: 'Phanxico',
        sponsorName: 'Pham Van Sponsor',
        notes: 'First entry',
      })

      const record = await t.run(async (ctx) => {
        return await ctx.db
          .query('studentSacraments')
          .withIndex('by_student_id_and_sacrament_type', (q) =>
            q.eq('studentId', studentId).eq('sacramentType', 'confirmation'),
          )
          .unique()
      })
      expect(record?.receivedDate).toBe('2026-05-15')
      expect(record?.receivedPlace).toBe('Giao xu Tan Dinh')
      expect(record?.feastName).toBe('Phanxico')
      expect(record?.sponsorName).toBe('Pham Van Sponsor')
      expect(record?.notes).toBe('First entry')
      expect(record?.isDeleted).toBe(false)
    })

    test('patches only the provided detail fields on an existing record', async () => {
      const t = convexTest(schema, modules)
      const adminId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV001',
          fullName: 'Admin',
          role: 'admin',
          isActive: true,
          isDeleted: false,
        })
      })
      const studentId = await t.mutation(api.students.create, {
        requesterId: adminId,
        fullName: 'Student 1',
      })

      const sacramentId = await t.mutation(
        api.students.upsertStudentSacrament,
        {
          requesterId: adminId,
          studentId,
          sacramentType: 'baptism',
          receivedDate: '2015-06-01',
          receivedPlace: 'St. Mary Church',
          feastName: 'Old Feast',
        },
      )

      await t.mutation(api.students.updateStudentSacramentDetails, {
        requesterId: adminId,
        studentId,
        sacramentType: 'baptism',
        feastName: 'New Feast',
      })

      const record = await t.run(async (ctx) => {
        return await ctx.db.get('studentSacraments', sacramentId)
      })
      expect(record?.feastName).toBe('New Feast')
      // Unrelated fields from the original upsert remain untouched
      expect(record?.receivedDate).toBe('2015-06-01')
      expect(record?.receivedPlace).toBe('St. Mary Church')
    })

    test('throws when requester lacks edit permission for the student', async () => {
      const t = convexTest(schema, modules)
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV002',
          fullName: 'User',
          role: 'user',
          isActive: true,
          isDeleted: false,
        })
      })
      const studentId = await t.run(async (ctx) => {
        return await ctx.db.insert('students', {
          studentCode: '1',
          fullName: 'Student 1',
          isActive: true,
          isDeleted: false,
          createdAt: Date.now(),
        })
      })
      // Enroll the student in an active class the requester has no assignment
      // to — the "floating student" rule (no non-deleted enrollments) would
      // otherwise let any catechist edit an unenrolled student.
      await t.run(async (ctx) => {
        const yearId = await ctx.db.insert('academicYears', {
          name: '2024',
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          timezone: 'Asia/Ho_Chi_Minh',
          isActive: true,
          isDeleted: false,
        })
        const branchId = await ctx.db.insert('branches', {
          name: 'B1',
          isDeleted: false,
          sortOrder: 1,
        })
        const classId = await ctx.db.insert('classes', {
          name: 'Class 1',
          branchId,
          isDeleted: false,
        })
        const cyId = await ctx.db.insert('classYears', {
          classId,
          academicYearId: yearId,
          isDeleted: false,
        })
        await ctx.db.insert('studentClasses', {
          studentId,
          classYearId: cyId,
          isPrimaryClass: true,
          enrolledDate: '2024-01-01',
          status: 'active',
          isDeleted: false,
        })
      })

      await expect(
        t.mutation(api.students.updateStudentSacramentDetails, {
          requesterId: userId,
          studentId,
          sacramentType: 'confirmation',
          feastName: 'Phanxico',
        }),
      ).rejects.toThrow(AUTHZ_ERRORS.CANNOT_EDIT_STUDENT)
    })

    test('reactivates a soft-deleted record when patching its fields', async () => {
      const t = convexTest(schema, modules)
      const adminId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV001',
          fullName: 'Admin',
          role: 'admin',
          isActive: true,
          isDeleted: false,
        })
      })
      const studentId = await t.mutation(api.students.create, {
        requesterId: adminId,
        fullName: 'Student 1',
      })

      const sacramentId = await t.mutation(
        api.students.upsertStudentSacrament,
        {
          requesterId: adminId,
          studentId,
          sacramentType: 'baptism',
          receivedDate: '2015-06-01',
        },
      )
      await t.mutation(api.students.softDeleteStudentSacrament, {
        requesterId: adminId,
        studentId,
        sacramentType: 'baptism',
      })
      const softDeleted = await t.run(async (ctx) => {
        return await ctx.db.get('studentSacraments', sacramentId)
      })
      expect(softDeleted?.isDeleted).toBe(true)

      await t.mutation(api.students.updateStudentSacramentDetails, {
        requesterId: adminId,
        studentId,
        sacramentType: 'baptism',
        feastName: 'New Feast',
      })

      const reactivated = await t.run(async (ctx) => {
        return await ctx.db.get('studentSacraments', sacramentId)
      })
      expect(reactivated?.isDeleted).toBe(false)
      expect(reactivated?.feastName).toBe('New Feast')
    })
  })

  describe('getClassSacramentDetails query', () => {
    async function seedClassWithStudents(t: ReturnType<typeof convexTest>) {
      const adminId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV001',
          fullName: 'Admin',
          role: 'admin',
          isActive: true,
          isDeleted: false,
        })
      })

      const { classYearId, studentId1, studentId2 } = await t.run(
        async (ctx) => {
          const academicYearId = await ctx.db.insert('academicYears', {
            name: '2024-2025',
            startDate: '2024-09-01',
            endDate: '2025-05-31',
            timezone: 'Asia/Ho_Chi_Minh',
            isActive: true,
            isDeleted: false,
          })
          const branchId = await ctx.db.insert('branches', {
            name: 'Branch 1',
            sortOrder: 1,
            isDeleted: false,
          })
          const classId = await ctx.db.insert('classes', {
            branchId,
            name: 'Class 1',
            isDeleted: false,
          })
          const seededClassYearId = await ctx.db.insert('classYears', {
            classId,
            academicYearId,
            isDeleted: false,
          })

          const seededStudentId1 = await ctx.db.insert('students', {
            studentCode: '1',
            fullName: 'Student 1',
            isActive: true,
            isDeleted: false,
            createdAt: Date.now(),
          })
          const seededStudentId2 = await ctx.db.insert('students', {
            studentCode: '2',
            fullName: 'Student 2',
            isActive: true,
            isDeleted: false,
            createdAt: Date.now(),
          })

          await ctx.db.insert('studentClasses', {
            studentId: seededStudentId1,
            classYearId: seededClassYearId,
            isPrimaryClass: true,
            enrolledDate: '2024-09-01',
            status: 'active',
            isDeleted: false,
          })
          await ctx.db.insert('studentClasses', {
            studentId: seededStudentId2,
            classYearId: seededClassYearId,
            isPrimaryClass: true,
            enrolledDate: '2024-09-01',
            status: 'withdrawn',
            isDeleted: true,
          })

          return {
            classYearId: seededClassYearId,
            studentId1: seededStudentId1,
            studentId2: seededStudentId2,
          }
        },
      )

      return { adminId, classYearId, studentId1, studentId2 }
    }

    test('returns non-deleted sacrament records only for actively enrolled students', async () => {
      const t = convexTest(schema, modules)
      const { adminId, classYearId, studentId1, studentId2 } =
        await seedClassWithStudents(t)

      await t.mutation(api.students.upsertStudentSacrament, {
        requesterId: adminId,
        studentId: studentId1,
        sacramentType: 'confirmation',
        receivedDate: '2026-05-10',
        feastName: 'Phanxico',
      })
      // Soft-deleted sacrament record should be excluded
      const deletedId = await t.mutation(api.students.upsertStudentSacrament, {
        requesterId: adminId,
        studentId: studentId1,
        sacramentType: 'baptism',
        receivedDate: '2015-06-01',
      })
      await t.mutation(api.students.softDeleteStudentSacrament, {
        requesterId: adminId,
        studentId: studentId1,
        sacramentType: 'baptism',
      })
      // studentId2's withdrawn/deleted enrollment means it's excluded entirely
      await t.mutation(api.students.upsertStudentSacrament, {
        requesterId: adminId,
        studentId: studentId2,
        sacramentType: 'confirmation',
        receivedDate: '2026-05-10',
      })

      const result = await t.query(api.students.getClassSacramentDetails, {
        requesterId: adminId,
        classYearId,
      })

      expect(result).toHaveLength(1)
      expect(result[0].studentId).toBe(studentId1)
      expect(result[0].records).toHaveLength(1)
      expect(result[0].records[0].sacramentType).toBe('confirmation')
      expect(result[0].records[0].feastName).toBe('Phanxico')
      expect(result[0].records.some((r) => r._id === deletedId)).toBe(false)
    })

    test('returns an empty records array for an enrolled student with no sacraments', async () => {
      const t = convexTest(schema, modules)
      const { adminId, classYearId, studentId1 } =
        await seedClassWithStudents(t)

      const result = await t.query(api.students.getClassSacramentDetails, {
        requesterId: adminId,
        classYearId,
      })

      expect(result).toHaveLength(1)
      expect(result[0].studentId).toBe(studentId1)
      expect(result[0].records).toHaveLength(0)
    })

    test('throws when the class year does not exist', async () => {
      const t = convexTest(schema, modules)
      const adminId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV001',
          fullName: 'Admin',
          role: 'admin',
          isActive: true,
          isDeleted: false,
        })
      })
      const bogusClassYearId = await t.run(async (ctx) => {
        const academicYearId = await ctx.db.insert('academicYears', {
          name: '2024-2025',
          startDate: '2024-09-01',
          endDate: '2025-05-31',
          timezone: 'Asia/Ho_Chi_Minh',
          isActive: true,
          isDeleted: false,
        })
        const branchId = await ctx.db.insert('branches', {
          name: 'Branch 1',
          sortOrder: 1,
          isDeleted: false,
        })
        const classId = await ctx.db.insert('classes', {
          branchId,
          name: 'Class 1',
          isDeleted: false,
        })
        const classYearId = await ctx.db.insert('classYears', {
          classId,
          academicYearId,
          isDeleted: true,
        })
        return classYearId
      })

      await expect(
        t.query(api.students.getClassSacramentDetails, {
          requesterId: adminId,
          classYearId: bogusClassYearId,
        }),
      ).rejects.toThrow('Class year not found')
    })

    test('throws for an unauthorized/inactive requester', async () => {
      const t = convexTest(schema, modules)
      const { classYearId } = await seedClassWithStudents(t)

      const inactiveCatechistId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV099',
          fullName: 'Inactive',
          role: 'user',
          isActive: false,
          isDeleted: false,
        })
      })

      await expect(
        t.query(api.students.getClassSacramentDetails, {
          requesterId: inactiveCatechistId,
          classYearId,
        }),
      ).rejects.toThrow(AUTHZ_ERRORS.ACCOUNT_INACTIVE)
    })
  })

  describe('bulkUpdateStudentSacraments mutation', () => {
    test('updates sacraments for enrolled students when requester is authorized', async () => {
      const t = convexTest(schema, modules)

      const academicYearId = await t.run(async (ctx) => {
        return await ctx.db.insert('academicYears', {
          name: '2024-2025',
          startDate: '2024-09-01',
          endDate: '2025-05-31',
          timezone: 'Asia/Ho_Chi_Minh',
          isActive: true,
          isDeleted: false,
        })
      })

      const branchId = await t.run(async (ctx) => {
        return await ctx.db.insert('branches', {
          name: 'Branch A',
          sortOrder: 1,
          isDeleted: false,
        })
      })

      const classId = await t.run(async (ctx) => {
        return await ctx.db.insert('classes', {
          branchId,
          name: 'Au Nhi 1',
          isDeleted: false,
        })
      })

      const classYearId = await t.run(async (ctx) => {
        return await ctx.db.insert('classYears', {
          classId,
          academicYearId,
          isDeleted: false,
        })
      })

      const catechistId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV001',
          fullName: 'Homeroom Teacher',
          role: 'user',
          isActive: true,
          isDeleted: false,
        })
      })

      await t.run(async (ctx) => {
        await ctx.db.insert('classCatechists', {
          catechistId,
          classYearId,
          academicYearId,
          role: 'homeroom',
          isDeleted: false,
        })
      })

      const student1Id = await t.run(async (ctx) => {
        return await ctx.db.insert('students', {
          studentCode: '1',
          fullName: 'Student 1',
          isActive: true,
          isDeleted: false,
          createdAt: Date.now(),
        })
      })
      const student2Id = await t.run(async (ctx) => {
        return await ctx.db.insert('students', {
          studentCode: '2',
          fullName: 'Student 2',
          isActive: true,
          isDeleted: false,
          createdAt: Date.now(),
        })
      })

      // Enroll student 1 and 2 in classYear
      await t.run(async (ctx) => {
        await ctx.db.insert('studentClasses', {
          studentId: student1Id,
          classYearId,
          isPrimaryClass: true,
          enrolledDate: '2024-09-01',
          status: 'active',
          isDeleted: false,
        })
        await ctx.db.insert('studentClasses', {
          studentId: student2Id,
          classYearId,
          isPrimaryClass: true,
          enrolledDate: '2024-09-01',
          status: 'active',
          isDeleted: false,
        })
      })

      // Let's create an existing sacrament for student 1 to verify patch works
      const existingSacramentId = await t.run(async (ctx) => {
        return await ctx.db.insert('studentSacraments', {
          studentId: student1Id,
          sacramentType: 'first_confession',
          receivedDate: '2023-01-01',
          receivedPlace: 'Old Church',
          isDeleted: false,
        })
      })

      // Act: bulk update first_confession date
      await t.mutation(api.students.bulkUpdateStudentSacraments, {
        requesterId: catechistId,
        classYearId,
        studentIds: [student1Id, student2Id],
        sacramentType: 'first_confession',
        receivedDate: '2025-05-01',
      })

      // Assert
      const sac1 = await t.run(async (ctx) => {
        return await ctx.db.get('studentSacraments', existingSacramentId)
      })
      expect(sac1?.receivedDate).toBe('2025-05-01')
      expect(sac1?.receivedPlace).toBe('Old Church') // unchanged

      const sac2 = await t.run(async (ctx) => {
        return await ctx.db
          .query('studentSacraments')
          .withIndex('by_student_id_and_sacrament_type', (q) =>
            q
              .eq('studentId', student2Id)
              .eq('sacramentType', 'first_confession'),
          )
          .unique()
      })
      expect(sac2).not.toBeNull()
      expect(sac2?.receivedDate).toBe('2025-05-01')
    })

    test('throws error if requester lacks permissions', async () => {
      const t = convexTest(schema, modules)

      const academicYearId = await t.run(async (ctx) => {
        return await ctx.db.insert('academicYears', {
          name: '2024-2025',
          startDate: '2024-09-01',
          endDate: '2025-05-31',
          timezone: 'Asia/Ho_Chi_Minh',
          isActive: true,
          isDeleted: false,
        })
      })
      const branchId = await t.run(async (ctx) => {
        return await ctx.db.insert('branches', {
          name: 'Branch A',
          sortOrder: 1,
          isDeleted: false,
        })
      })
      const classId = await t.run(async (ctx) => {
        return await ctx.db.insert('classes', {
          branchId,
          name: 'Au Nhi 1',
          isDeleted: false,
        })
      })
      const classYearId = await t.run(async (ctx) => {
        return await ctx.db.insert('classYears', {
          classId,
          academicYearId,
          isDeleted: false,
        })
      })
      const student1Id = await t.run(async (ctx) => {
        return await ctx.db.insert('students', {
          studentCode: '1',
          fullName: 'Student 1',
          isActive: true,
          isDeleted: false,
          createdAt: Date.now(),
        })
      })

      // Enroll student 1
      await t.run(async (ctx) => {
        await ctx.db.insert('studentClasses', {
          studentId: student1Id,
          classYearId,
          isPrimaryClass: true,
          enrolledDate: '2024-09-01',
          status: 'active',
          isDeleted: false,
        })
      })

      const unauthorizedCatechistId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV002',
          fullName: 'Other Teacher',
          role: 'user',
          isActive: true,
          isDeleted: false,
        })
      })

      await expect(
        t.mutation(api.students.bulkUpdateStudentSacraments, {
          requesterId: unauthorizedCatechistId,
          classYearId,
          studentIds: [student1Id],
          sacramentType: 'baptism',
          receivedDate: '2025-05-01',
        }),
      ).rejects.toThrow()
    })

    test('throws error if a student is not enrolled in the class', async () => {
      const t = convexTest(schema, modules)

      const academicYearId = await t.run(async (ctx) => {
        return await ctx.db.insert('academicYears', {
          name: '2024-2025',
          startDate: '2024-09-01',
          endDate: '2025-05-31',
          timezone: 'Asia/Ho_Chi_Minh',
          isActive: true,
          isDeleted: false,
        })
      })
      const branchId = await t.run(async (ctx) => {
        return await ctx.db.insert('branches', {
          name: 'Branch A',
          sortOrder: 1,
          isDeleted: false,
        })
      })
      const classId = await t.run(async (ctx) => {
        return await ctx.db.insert('classes', {
          branchId,
          name: 'Au Nhi 1',
          isDeleted: false,
        })
      })
      const classYearId = await t.run(async (ctx) => {
        return await ctx.db.insert('classYears', {
          classId,
          academicYearId,
          isDeleted: false,
        })
      })
      const catechistId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV001',
          fullName: 'Homeroom Teacher',
          role: 'user',
          isActive: true,
          isDeleted: false,
        })
      })
      await t.run(async (ctx) => {
        await ctx.db.insert('classCatechists', {
          catechistId,
          classYearId,
          academicYearId,
          role: 'homeroom',
          isDeleted: false,
        })
      })

      const student1Id = await t.run(async (ctx) => {
        return await ctx.db.insert('students', {
          studentCode: '1',
          fullName: 'Student 1',
          isActive: true,
          isDeleted: false,
          createdAt: Date.now(),
        })
      })

      // Student 1 is NOT enrolled

      await expect(
        t.mutation(api.students.bulkUpdateStudentSacraments, {
          requesterId: catechistId,
          classYearId,
          studentIds: [student1Id],
          sacramentType: 'baptism',
          receivedDate: '2025-05-01',
        }),
      ).rejects.toThrow('ENROLLMENT_STUDENT_NOT_ENROLLED')
    })

    test('throws error if a student enrollment is withdrawn (not active)', async () => {
      const t = convexTest(schema, modules)

      const academicYearId = await t.run(async (ctx) => {
        return await ctx.db.insert('academicYears', {
          name: '2024-2025',
          startDate: '2024-09-01',
          endDate: '2025-05-31',
          timezone: 'Asia/Ho_Chi_Minh',
          isActive: true,
          isDeleted: false,
        })
      })
      const branchId = await t.run(async (ctx) => {
        return await ctx.db.insert('branches', {
          name: 'Branch A',
          sortOrder: 1,
          isDeleted: false,
        })
      })
      const classId = await t.run(async (ctx) => {
        return await ctx.db.insert('classes', {
          branchId,
          name: 'Au Nhi 1',
          isDeleted: false,
        })
      })
      const classYearId = await t.run(async (ctx) => {
        return await ctx.db.insert('classYears', {
          classId,
          academicYearId,
          isDeleted: false,
        })
      })
      const catechistId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV001',
          fullName: 'Homeroom Teacher',
          role: 'user',
          isActive: true,
          isDeleted: false,
        })
      })
      await t.run(async (ctx) => {
        await ctx.db.insert('classCatechists', {
          catechistId,
          classYearId,
          academicYearId,
          role: 'homeroom',
          isDeleted: false,
        })
      })

      const student1Id = await t.run(async (ctx) => {
        return await ctx.db.insert('students', {
          studentCode: '1',
          fullName: 'Student 1',
          isActive: true,
          isDeleted: false,
          createdAt: Date.now(),
        })
      })

      // Student is enrolled but withdrawn
      await t.run(async (ctx) => {
        await ctx.db.insert('studentClasses', {
          studentId: student1Id,
          classYearId,
          isPrimaryClass: true,
          enrolledDate: '2024-09-01',
          status: 'withdrawn',
          isDeleted: false,
        })
      })

      await expect(
        t.mutation(api.students.bulkUpdateStudentSacraments, {
          requesterId: catechistId,
          classYearId,
          studentIds: [student1Id],
          sacramentType: 'baptism',
          receivedDate: '2025-05-01',
        }),
      ).rejects.toThrow('ENROLLMENT_STUDENT_NOT_ENROLLED')
    })
  })

  describe('enrollStudentInClass mutation', () => {
    async function setupEnrollmentFixture(t: ReturnType<typeof convexTest>) {
      const adminId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV001',
          fullName: 'Admin',
          role: 'admin',
          isActive: true,
          isDeleted: false,
        })
      })

      const studentId = await t.mutation(api.students.create, {
        requesterId: adminId,
        fullName: 'Student Enroll',
      })

      const academicYearId = await t.run(async (ctx) => {
        return await ctx.db.insert('academicYears', {
          name: '2024-2025',
          startDate: '2024-09-01',
          endDate: '2025-05-31',
          timezone: 'Asia/Ho_Chi_Minh',
          isActive: true,
          isDeleted: false,
        })
      })

      const branchId = await t.run(async (ctx) => {
        return await ctx.db.insert('branches', {
          name: 'Branch A',
          sortOrder: 1,
          isDeleted: false,
        })
      })

      const classId = await t.run(async (ctx) => {
        return await ctx.db.insert('classes', {
          branchId,
          name: 'Au Nhi 1',
          isDeleted: false,
        })
      })

      const classYearId = await t.run(async (ctx) => {
        return await ctx.db.insert('classYears', {
          academicYearId,
          classId,
          isDeleted: false,
        })
      })

      return {
        adminId,
        studentId,
        academicYearId,
        branchId,
        classId,
        classYearId,
      }
    }

    test('enrolls student in a class year (happy path)', async () => {
      const t = convexTest(schema, modules)
      const { adminId, studentId, classYearId } =
        await setupEnrollmentFixture(t)

      const enrollmentId = await t.mutation(api.students.enrollStudentInClass, {
        requesterId: adminId,
        studentId,
        classYearId,
        enrolledDate: '2024-09-01',
      })

      expect(enrollmentId).toBeDefined()

      const record = await t.run(async (ctx) => {
        return await ctx.db.get('studentClasses', enrollmentId)
      })
      expect(record?.status).toBe('active')
      expect(record?.isPrimaryClass).toBe(true)
      expect(record?.isDeleted).toBe(false)
      expect(record?.enrolledDate).toBe('2024-09-01')
    })

    test('throws on duplicate active enrollment in same class year', async () => {
      const t = convexTest(schema, modules)
      const { adminId, studentId, classYearId } =
        await setupEnrollmentFixture(t)

      await t.mutation(api.students.enrollStudentInClass, {
        requesterId: adminId,
        studentId,
        classYearId,
        enrolledDate: '2024-09-01',
      })

      await expect(
        t.mutation(api.students.enrollStudentInClass, {
          requesterId: adminId,
          studentId,
          classYearId,
          enrolledDate: '2024-09-01',
        }),
      ).rejects.toThrow(ENROLLMENT_ERRORS.ALREADY_ENROLLED)
    })

    test('re-activates a soft-deleted enrollment record', async () => {
      const t = convexTest(schema, modules)
      const { adminId, studentId, classYearId } =
        await setupEnrollmentFixture(t)

      const firstId = await t.mutation(api.students.enrollStudentInClass, {
        requesterId: adminId,
        studentId,
        classYearId,
        enrolledDate: '2024-09-01',
      })

      // Soft delete the enrollment
      await t.run(async (ctx) => {
        await ctx.db.patch('studentClasses', firstId, { isDeleted: true })
      })

      // Re-enroll — should re-activate
      const secondId = await t.mutation(api.students.enrollStudentInClass, {
        requesterId: adminId,
        studentId,
        classYearId,
        enrolledDate: '2024-09-15',
      })

      expect(secondId).toBe(firstId)

      const record = await t.run(async (ctx) => {
        return await ctx.db.get('studentClasses', firstId)
      })
      expect(record?.isDeleted).toBe(false)
      expect(record?.status).toBe('active')
      expect(record?.enrolledDate).toBe('2024-09-15')
    })

    test('re-activates a withdrawn enrollment record', async () => {
      const t = convexTest(schema, modules)
      const { adminId, studentId, classYearId } =
        await setupEnrollmentFixture(t)

      const firstId = await t.mutation(api.students.enrollStudentInClass, {
        requesterId: adminId,
        studentId,
        classYearId,
        enrolledDate: '2024-09-01',
      })

      // Withdraw the enrollment
      await t.run(async (ctx) => {
        await ctx.db.patch('studentClasses', firstId, { status: 'withdrawn' })
      })

      // Re-enroll — should re-activate
      const secondId = await t.mutation(api.students.enrollStudentInClass, {
        requesterId: adminId,
        studentId,
        classYearId,
        enrolledDate: '2024-09-20',
      })

      expect(secondId).toBe(firstId)

      const record = await t.run(async (ctx) => {
        return await ctx.db.get('studentClasses', firstId)
      })
      expect(record?.status).toBe('active')
      expect(record?.isDeleted).toBe(false)
    })

    test('throws on primary class conflict for same academic year', async () => {
      const t = convexTest(schema, modules)
      const { adminId, studentId, academicYearId, branchId, classYearId } =
        await setupEnrollmentFixture(t)

      // Enroll in the first class year
      await t.mutation(api.students.enrollStudentInClass, {
        requesterId: adminId,
        studentId,
        classYearId,
        enrolledDate: '2024-09-01',
      })

      // Create a second class and class year in the same academic year
      const class2Id = await t.run(async (ctx) => {
        return await ctx.db.insert('classes', {
          branchId,
          name: 'Au Nhi 2',
          isDeleted: false,
        })
      })
      const classYear2Id = await t.run(async (ctx) => {
        return await ctx.db.insert('classYears', {
          academicYearId,
          classId: class2Id,
          isDeleted: false,
        })
      })

      await expect(
        t.mutation(api.students.enrollStudentInClass, {
          requesterId: adminId,
          studentId,
          classYearId: classYear2Id,
          enrolledDate: '2024-09-01',
        }),
      ).rejects.toThrow(ENROLLMENT_ERRORS.PRIMARY_CLASS_CONFLICT)
    })

    test('throws Unauthorized for non-admin requester', async () => {
      const t = convexTest(schema, modules)
      const { classYearId } = await setupEnrollmentFixture(t)

      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV099',
          fullName: 'User',
          role: 'user',
          isActive: true,
          isDeleted: false,
        })
      })
      const studentId = await t.run(async (ctx) => {
        return await ctx.db.insert('students', {
          studentCode: '99',
          fullName: 'Other Student',
          isActive: true,
          isDeleted: false,
          createdAt: Date.now(),
        })
      })

      await expect(
        t.mutation(api.students.enrollStudentInClass, {
          requesterId: userId,
          studentId,
          classYearId,
          enrolledDate: '2024-09-01',
        }),
      ).rejects.toThrow()
    })
  })

  describe('enrollStudents mutation', () => {
    async function setupFixture(t: ReturnType<typeof convexTest>) {
      const adminId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV001',
          fullName: 'Admin',
          role: 'admin',
          isActive: true,
          isDeleted: false,
        })
      })

      const academicYearId = await t.run(async (ctx) => {
        return await ctx.db.insert('academicYears', {
          name: '2024-2025',
          startDate: '2024-09-01',
          endDate: '2025-05-31',
          timezone: 'Asia/Ho_Chi_Minh',
          isActive: true,
          isDeleted: false,
        })
      })

      const branchId = await t.run(async (ctx) => {
        return await ctx.db.insert('branches', {
          name: 'Branch A',
          sortOrder: 1,
          isDeleted: false,
        })
      })

      const classId = await t.run(async (ctx) => {
        return await ctx.db.insert('classes', {
          branchId,
          name: 'Au Nhi 1',
          isDeleted: false,
        })
      })

      const classYearId = await t.run(async (ctx) => {
        return await ctx.db.insert('classYears', {
          academicYearId,
          classId,
          isDeleted: false,
        })
      })

      return { adminId, academicYearId, branchId, classId, classYearId }
    }

    async function makeStudent(
      t: ReturnType<typeof convexTest>,
      adminId: Id<'catechists'>,
      fullName: string,
    ) {
      return await t.mutation(api.students.create, {
        requesterId: adminId,
        fullName,
      })
    }

    async function makeCatechist(
      t: ReturnType<typeof convexTest>,
      memberId: string,
      fullName: string,
    ) {
      return await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId,
          fullName,
          role: 'user',
          isActive: true,
          isDeleted: false,
        })
      })
    }

    describe('permission assertions', () => {
      test('admin is allowed', async () => {
        const t = convexTest(schema, modules)
        const { adminId, classYearId } = await setupFixture(t)
        const studentId = await makeStudent(t, adminId, 'Student A')

        await expect(
          t.mutation(api.students.enrollStudents, {
            requesterId: adminId,
            studentIds: [studentId],
            classYearId,
            isPrimaryClass: true,
            enrolledDate: '2024-09-01',
          }),
        ).resolves.toBeDefined()
      })

      test('board_member is allowed', async () => {
        const t = convexTest(schema, modules)
        const { adminId, academicYearId, classYearId } = await setupFixture(t)
        const studentId = await makeStudent(t, adminId, 'Student A')
        const boardMemberId = await makeCatechist(t, 'GLV010', 'Board Member')

        await t.run(async (ctx) => {
          await ctx.db.insert('academicYearAssignments', {
            academicYearId,
            catechistId: boardMemberId,
            assignmentType: 'board_member',
            isDeleted: false,
          })
        })

        await expect(
          t.mutation(api.students.enrollStudents, {
            requesterId: boardMemberId,
            studentIds: [studentId],
            classYearId,
            isPrimaryClass: true,
            enrolledDate: '2024-09-01',
          }),
        ).resolves.toBeDefined()
      })

      test('branch_head of class branch is allowed', async () => {
        const t = convexTest(schema, modules)
        const { adminId, academicYearId, branchId, classYearId } =
          await setupFixture(t)
        const studentId = await makeStudent(t, adminId, 'Student A')
        const branchHeadId = await makeCatechist(t, 'GLV011', 'Branch Head')

        await t.run(async (ctx) => {
          await ctx.db.insert('branchAssignments', {
            academicYearId,
            catechistId: branchHeadId,
            branchId,
            isDeleted: false,
          })
        })

        await expect(
          t.mutation(api.students.enrollStudents, {
            requesterId: branchHeadId,
            studentIds: [studentId],
            classYearId,
            isPrimaryClass: true,
            enrolledDate: '2024-09-01',
          }),
        ).resolves.toBeDefined()
      })

      test('homeroom teacher of class year is allowed', async () => {
        const t = convexTest(schema, modules)
        const { adminId, academicYearId, classYearId } = await setupFixture(t)
        const studentId = await makeStudent(t, adminId, 'Student A')
        const homeroomId = await makeCatechist(t, 'GLV012', 'Homeroom')

        await t.run(async (ctx) => {
          await ctx.db.insert('classCatechists', {
            catechistId: homeroomId,
            classYearId,
            academicYearId,
            role: 'homeroom',
            isDeleted: false,
          })
        })

        await expect(
          t.mutation(api.students.enrollStudents, {
            requesterId: homeroomId,
            studentIds: [studentId],
            classYearId,
            isPrimaryClass: true,
            enrolledDate: '2024-09-01',
          }),
        ).resolves.toBeDefined()
      })

      test('co_teacher of class year is allowed', async () => {
        const t = convexTest(schema, modules)
        const { adminId, academicYearId, classYearId } = await setupFixture(t)
        const studentId = await makeStudent(t, adminId, 'Student A')
        const coTeacherId = await makeCatechist(t, 'GLV013', 'Co Teacher')

        await t.run(async (ctx) => {
          await ctx.db.insert('classCatechists', {
            catechistId: coTeacherId,
            classYearId,
            academicYearId,
            role: 'co_teacher',
            isDeleted: false,
          })
        })

        await expect(
          t.mutation(api.students.enrollStudents, {
            requesterId: coTeacherId,
            studentIds: [studentId],
            classYearId,
            isPrimaryClass: true,
            enrolledDate: '2024-09-01',
          }),
        ).resolves.toBeDefined()
      })

      test('other catechists with no assignment are rejected', async () => {
        const t = convexTest(schema, modules)
        const { adminId, classYearId } = await setupFixture(t)
        const studentId = await makeStudent(t, adminId, 'Student A')
        const otherId = await makeCatechist(t, 'GLV014', 'Other')

        await expect(
          t.mutation(api.students.enrollStudents, {
            requesterId: otherId,
            studentIds: [studentId],
            classYearId,
            isPrimaryClass: true,
            enrolledDate: '2024-09-01',
          }),
        ).rejects.toThrow(ENROLLMENT_ERRORS.UNAUTHORIZED)
      })
    })

    describe('active academic year', () => {
      test('enrollment succeeds when academic year is active', async () => {
        const t = convexTest(schema, modules)
        const { adminId, classYearId } = await setupFixture(t)
        const studentId = await makeStudent(t, adminId, 'Student A')

        await expect(
          t.mutation(api.students.enrollStudents, {
            requesterId: adminId,
            studentIds: [studentId],
            classYearId,
            isPrimaryClass: true,
            enrolledDate: '2024-09-01',
          }),
        ).resolves.toBeDefined()
      })

      test('enrollment throws when academic year is inactive', async () => {
        const t = convexTest(schema, modules)
        const { adminId, academicYearId, classYearId } = await setupFixture(t)
        const studentId = await makeStudent(t, adminId, 'Student A')

        await t.run(async (ctx) => {
          await ctx.db.patch('academicYears', academicYearId, {
            isActive: false,
          })
        })

        await expect(
          t.mutation(api.students.enrollStudents, {
            requesterId: adminId,
            studentIds: [studentId],
            classYearId,
            isPrimaryClass: true,
            enrolledDate: '2024-09-01',
          }),
        ).rejects.toThrow(ENROLLMENT_ERRORS.ACADEMIC_YEAR_NOT_ACTIVE)
      })
    })

    describe('primary class constraints', () => {
      test('enroll student into a primary class succeeds', async () => {
        const t = convexTest(schema, modules)
        const { adminId, classYearId } = await setupFixture(t)
        const studentId = await makeStudent(t, adminId, 'Student A')

        const ids = await t.mutation(api.students.enrollStudents, {
          requesterId: adminId,
          studentIds: [studentId],
          classYearId,
          isPrimaryClass: true,
          enrolledDate: '2024-09-01',
        })
        expect(ids).toHaveLength(1)

        const record = await t.run(async (ctx) => {
          return await ctx.db.get('studentClasses', ids[0])
        })
        expect(record?.isPrimaryClass).toBe(true)
      })

      test('enroll student into a supplemental class succeeds', async () => {
        const t = convexTest(schema, modules)
        const { adminId, classYearId } = await setupFixture(t)
        const studentId = await makeStudent(t, adminId, 'Student A')

        const ids = await t.mutation(api.students.enrollStudents, {
          requesterId: adminId,
          studentIds: [studentId],
          classYearId,
          isPrimaryClass: false,
          enrolledDate: '2024-09-01',
        })
        expect(ids).toHaveLength(1)

        const record = await t.run(async (ctx) => {
          return await ctx.db.get('studentClasses', ids[0])
        })
        expect(record?.isPrimaryClass).toBe(false)
      })

      test('second primary class in same AY throws conflict', async () => {
        const t = convexTest(schema, modules)
        const { adminId, academicYearId, branchId, classYearId } =
          await setupFixture(t)
        const studentId = await makeStudent(t, adminId, 'Student A')

        await t.mutation(api.students.enrollStudents, {
          requesterId: adminId,
          studentIds: [studentId],
          classYearId,
          isPrimaryClass: true,
          enrolledDate: '2024-09-01',
        })

        const class2Id = await t.run(async (ctx) => {
          return await ctx.db.insert('classes', {
            branchId,
            name: 'Au Nhi 2',
            isDeleted: false,
          })
        })
        const classYear2Id = await t.run(async (ctx) => {
          return await ctx.db.insert('classYears', {
            academicYearId,
            classId: class2Id,
            isDeleted: false,
          })
        })

        await expect(
          t.mutation(api.students.enrollStudents, {
            requesterId: adminId,
            studentIds: [studentId],
            classYearId: classYear2Id,
            isPrimaryClass: true,
            enrolledDate: '2024-09-01',
          }),
        ).rejects.toThrow(ENROLLMENT_ERRORS.PRIMARY_CLASS_CONFLICT)
      })

      test('withdraw from primary then enroll in another primary succeeds', async () => {
        const t = convexTest(schema, modules)
        const { adminId, academicYearId, branchId, classYearId } =
          await setupFixture(t)
        const studentId = await makeStudent(t, adminId, 'Student A')

        const [firstId] = await t.mutation(api.students.enrollStudents, {
          requesterId: adminId,
          studentIds: [studentId],
          classYearId,
          isPrimaryClass: true,
          enrolledDate: '2024-09-01',
        })

        await t.mutation(api.students.updateEnrollmentsStatus, {
          requesterId: adminId,
          studentClassIds: [firstId],
          status: 'withdrawn',
          statusChangedDate: '2024-10-01',
        })

        const class2Id = await t.run(async (ctx) => {
          return await ctx.db.insert('classes', {
            branchId,
            name: 'Au Nhi 2',
            isDeleted: false,
          })
        })
        const classYear2Id = await t.run(async (ctx) => {
          return await ctx.db.insert('classYears', {
            academicYearId,
            classId: class2Id,
            isDeleted: false,
          })
        })

        await expect(
          t.mutation(api.students.enrollStudents, {
            requesterId: adminId,
            studentIds: [studentId],
            classYearId: classYear2Id,
            isPrimaryClass: true,
            enrolledDate: '2024-10-02',
          }),
        ).resolves.toBeDefined()
      })

      test('on_leave in primary then enroll in another primary throws conflict', async () => {
        const t = convexTest(schema, modules)
        const { adminId, academicYearId, branchId, classYearId } =
          await setupFixture(t)
        const studentId = await makeStudent(t, adminId, 'Student A')

        const [firstId] = await t.mutation(api.students.enrollStudents, {
          requesterId: adminId,
          studentIds: [studentId],
          classYearId,
          isPrimaryClass: true,
          enrolledDate: '2024-09-01',
        })

        await t.mutation(api.students.updateEnrollmentsStatus, {
          requesterId: adminId,
          studentClassIds: [firstId],
          status: 'on_leave',
          statusChangedDate: '2024-10-01',
        })

        const class2Id = await t.run(async (ctx) => {
          return await ctx.db.insert('classes', {
            branchId,
            name: 'Au Nhi 2',
            isDeleted: false,
          })
        })
        const classYear2Id = await t.run(async (ctx) => {
          return await ctx.db.insert('classYears', {
            academicYearId,
            classId: class2Id,
            isDeleted: false,
          })
        })

        await expect(
          t.mutation(api.students.enrollStudents, {
            requesterId: adminId,
            studentIds: [studentId],
            classYearId: classYear2Id,
            isPrimaryClass: true,
            enrolledDate: '2024-10-02',
          }),
        ).rejects.toThrow(ENROLLMENT_ERRORS.PRIMARY_CLASS_CONFLICT)
      })
    })

    describe('bulk enrollment', () => {
      test('bulk enrolls multiple students as primary', async () => {
        const t = convexTest(schema, modules)
        const { adminId, classYearId } = await setupFixture(t)
        const student1 = await makeStudent(t, adminId, 'Student A')
        const student2 = await makeStudent(t, adminId, 'Student B')

        const ids = await t.mutation(api.students.enrollStudents, {
          requesterId: adminId,
          studentIds: [student1, student2],
          classYearId,
          isPrimaryClass: true,
          enrolledDate: '2024-09-01',
        })

        expect(ids).toHaveLength(2)
      })

      test('bulk enrolls multiple students as supplemental', async () => {
        const t = convexTest(schema, modules)
        const { adminId, classYearId } = await setupFixture(t)
        const student1 = await makeStudent(t, adminId, 'Student A')
        const student2 = await makeStudent(t, adminId, 'Student B')

        const ids = await t.mutation(api.students.enrollStudents, {
          requesterId: adminId,
          studentIds: [student1, student2],
          classYearId,
          isPrimaryClass: false,
          enrolledDate: '2024-09-01',
        })

        expect(ids).toHaveLength(2)
      })

      test('rolls back all-or-nothing when one student has a conflict', async () => {
        const t = convexTest(schema, modules)
        const { adminId, academicYearId, branchId, classYearId } =
          await setupFixture(t)
        const student1 = await makeStudent(t, adminId, 'Student A')
        const student2 = await makeStudent(t, adminId, 'Student B')

        // student2 already has a primary class in a different classYear of
        // the same academic year, so bulk-enrolling both into classYearId
        // as primary should fail entirely (including student1's insert).
        const class2Id = await t.run(async (ctx) => {
          return await ctx.db.insert('classes', {
            branchId,
            name: 'Au Nhi 2',
            isDeleted: false,
          })
        })
        const classYear2Id = await t.run(async (ctx) => {
          return await ctx.db.insert('classYears', {
            academicYearId,
            classId: class2Id,
            isDeleted: false,
          })
        })

        await t.mutation(api.students.enrollStudents, {
          requesterId: adminId,
          studentIds: [student2],
          classYearId: classYear2Id,
          isPrimaryClass: true,
          enrolledDate: '2024-09-01',
        })

        await expect(
          t.mutation(api.students.enrollStudents, {
            requesterId: adminId,
            studentIds: [student1, student2],
            classYearId,
            isPrimaryClass: true,
            enrolledDate: '2024-09-01',
          }),
        ).rejects.toThrow(ENROLLMENT_ERRORS.PRIMARY_CLASS_CONFLICT)

        // student1 should NOT have been enrolled — mutation is transactional
        const student1Enrollments = await t.run(async (ctx) => {
          return await ctx.db
            .query('studentClasses')
            .withIndex('by_student_id', (q) => q.eq('studentId', student1))
            .collect()
        })
        expect(student1Enrollments).toHaveLength(0)
      })
    })
  })

  describe('updateEnrollmentsStatus mutation', () => {
    async function setupFixture(t: ReturnType<typeof convexTest>) {
      const adminId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV001',
          fullName: 'Admin',
          role: 'admin',
          isActive: true,
          isDeleted: false,
        })
      })

      const academicYearId = await t.run(async (ctx) => {
        return await ctx.db.insert('academicYears', {
          name: '2024-2025',
          startDate: '2024-09-01',
          endDate: '2025-05-31',
          timezone: 'Asia/Ho_Chi_Minh',
          isActive: true,
          isDeleted: false,
        })
      })

      const branchId = await t.run(async (ctx) => {
        return await ctx.db.insert('branches', {
          name: 'Branch A',
          sortOrder: 1,
          isDeleted: false,
        })
      })

      const classId = await t.run(async (ctx) => {
        return await ctx.db.insert('classes', {
          branchId,
          name: 'Au Nhi 1',
          isDeleted: false,
        })
      })

      const classYearId = await t.run(async (ctx) => {
        return await ctx.db.insert('classYears', {
          academicYearId,
          classId,
          isDeleted: false,
        })
      })

      const studentId = await t.mutation(api.students.create, {
        requesterId: adminId,
        fullName: 'Student A',
      })

      const [studentClassId] = await t.mutation(api.students.enrollStudents, {
        requesterId: adminId,
        studentIds: [studentId],
        classYearId,
        isPrimaryClass: true,
        enrolledDate: '2024-09-01',
      })

      return {
        adminId,
        academicYearId,
        branchId,
        classId,
        classYearId,
        studentId,
        studentClassId,
      }
    }

    test('marks enrollment as on_leave and clears leftDate', async () => {
      const t = convexTest(schema, modules)
      const { adminId, studentClassId } = await setupFixture(t)

      await t.mutation(api.students.updateEnrollmentsStatus, {
        requesterId: adminId,
        studentClassIds: [studentClassId],
        status: 'on_leave',
        statusChangedDate: '2024-10-01',
      })

      const record = await t.run(async (ctx) => {
        return await ctx.db.get('studentClasses', studentClassId)
      })
      expect(record?.status).toBe('on_leave')
      expect(record?.statusChangedDate).toBe('2024-10-01')
      expect(record?.leftDate).toBeUndefined()
    })

    test('marks enrollment as withdrawn and sets leftDate', async () => {
      const t = convexTest(schema, modules)
      const { adminId, studentClassId } = await setupFixture(t)

      await t.mutation(api.students.updateEnrollmentsStatus, {
        requesterId: adminId,
        studentClassIds: [studentClassId],
        status: 'withdrawn',
        statusChangedDate: '2024-11-15',
      })

      const record = await t.run(async (ctx) => {
        return await ctx.db.get('studentClasses', studentClassId)
      })
      expect(record?.status).toBe('withdrawn')
      expect(record?.statusChangedDate).toBe('2024-11-15')
      expect(record?.leftDate).toBe('2024-11-15')
    })

    test('reactivating from withdrawn to active clears leftDate', async () => {
      const t = convexTest(schema, modules)
      const { adminId, studentClassId } = await setupFixture(t)

      await t.mutation(api.students.updateEnrollmentsStatus, {
        requesterId: adminId,
        studentClassIds: [studentClassId],
        status: 'withdrawn',
        statusChangedDate: '2024-11-15',
      })

      await t.mutation(api.students.updateEnrollmentsStatus, {
        requesterId: adminId,
        studentClassIds: [studentClassId],
        status: 'active',
        statusChangedDate: '2024-12-01',
      })

      const record = await t.run(async (ctx) => {
        return await ctx.db.get('studentClasses', studentClassId)
      })
      expect(record?.status).toBe('active')
      expect(record?.statusChangedDate).toBe('2024-12-01')
      expect(record?.leftDate).toBeUndefined()
    })

    test('throws RECORD_NOT_FOUND for deleted studentClass record', async () => {
      const t = convexTest(schema, modules)
      const { adminId, studentClassId } = await setupFixture(t)

      await t.run(async (ctx) => {
        await ctx.db.patch('studentClasses', studentClassId, {
          isDeleted: true,
        })
      })

      await expect(
        t.mutation(api.students.updateEnrollmentsStatus, {
          requesterId: adminId,
          studentClassIds: [studentClassId],
          status: 'withdrawn',
          statusChangedDate: '2024-11-15',
        }),
      ).rejects.toThrow(ENROLLMENT_ERRORS.RECORD_NOT_FOUND)
    })

    test('throws UNAUTHORIZED for a catechist without permission', async () => {
      const t = convexTest(schema, modules)
      const { studentClassId } = await setupFixture(t)

      const otherId = await t.run(async (ctx) => {
        return await ctx.db.insert('catechists', {
          memberId: 'GLV020',
          fullName: 'Other',
          role: 'user',
          isActive: true,
          isDeleted: false,
        })
      })

      await expect(
        t.mutation(api.students.updateEnrollmentsStatus, {
          requesterId: otherId,
          studentClassIds: [studentClassId],
          status: 'withdrawn',
          statusChangedDate: '2024-11-15',
        }),
      ).rejects.toThrow(ENROLLMENT_ERRORS.UNAUTHORIZED)
    })

    test('allows status change even when academic year is inactive', async () => {
      const t = convexTest(schema, modules)
      const { adminId, academicYearId, studentClassId } = await setupFixture(t)

      await t.run(async (ctx) => {
        await ctx.db.patch('academicYears', academicYearId, {
          isActive: false,
        })
      })

      await expect(
        t.mutation(api.students.updateEnrollmentsStatus, {
          requesterId: adminId,
          studentClassIds: [studentClassId],
          status: 'withdrawn',
          statusChangedDate: '2024-12-01',
        }),
      ).resolves.not.toThrow()

      const record = await t.run(async (ctx) => {
        return await ctx.db.get('studentClasses', studentClassId)
      })
      expect(record?.status).toBe('withdrawn')
    })

    test('reactivating a withdrawn primary throws conflict when another primary is active', async () => {
      const t = convexTest(schema, modules)
      const { adminId, academicYearId, branchId, studentId, studentClassId } =
        await setupFixture(t)

      // Withdraw the original primary class enrollment.
      await t.mutation(api.students.updateEnrollmentsStatus, {
        requesterId: adminId,
        studentClassIds: [studentClassId],
        status: 'withdrawn',
        statusChangedDate: '2024-10-05',
      })

      // Enroll the student in a second primary class in the same AY.
      const class2Id = await t.run(async (ctx) => {
        return await ctx.db.insert('classes', {
          branchId,
          name: 'Au Nhi 2',
          isDeleted: false,
        })
      })
      const classYear2Id = await t.run(async (ctx) => {
        return await ctx.db.insert('classYears', {
          academicYearId,
          classId: class2Id,
          isDeleted: false,
        })
      })

      await t.mutation(api.students.enrollStudents, {
        requesterId: adminId,
        studentIds: [studentId],
        classYearId: classYear2Id,
        isPrimaryClass: true,
        enrolledDate: '2024-10-06',
      })

      // Reactivating the original withdrawn primary should now conflict,
      // since the second primary class enrollment is active.
      await expect(
        t.mutation(api.students.updateEnrollmentsStatus, {
          requesterId: adminId,
          studentClassIds: [studentClassId],
          status: 'active',
          statusChangedDate: '2024-10-06',
        }),
      ).rejects.toThrow(ENROLLMENT_ERRORS.PRIMARY_CLASS_CONFLICT)
    })
  })

  test('getEligibleForEnrollment query returns active students with enrollment info', async () => {
    const t = convexTest(schema, modules)

    // Create catechist and academic year
    const catechistId = await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'GLV001',
        fullName: 'Catechist',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
    })

    const academicYearId = await t.run(async (ctx) => {
      return await ctx.db.insert('academicYears', {
        name: '2024-2025',
        startDate: '2024-09-01',
        endDate: '2025-06-30',
        timezone: 'Asia/Ho_Chi_Minh',
        isActive: true,
        isDeleted: false,
      })
    })

    // Create branch and class
    const classId = await t.run(async (ctx) => {
      const branchId = await ctx.db.insert('branches', {
        name: 'Ấu Nhi',
        sortOrder: 2,
        isDeleted: false,
      })
      return await ctx.db.insert('classes', {
        branchId,
        name: 'Ấu Nhi 1',
        isDeleted: false,
      })
    })

    // Create class year
    const classYearId = await t.run(async (ctx) => {
      return await ctx.db.insert('classYears', {
        classId,
        academicYearId,
        isDeleted: false,
      })
    })

    // Create two active students
    const student1Id = await t.mutation(api.students.create, {
      requesterId: catechistId,
      fullName: 'Active Student 1',
    })

    const student2Id = await t.mutation(api.students.create, {
      requesterId: catechistId,
      fullName: 'Active Student 2',
    })

    // Create an inactive student
    const student3Id = await t.mutation(api.students.create, {
      requesterId: catechistId,
      fullName: 'Inactive Student',
    })
    await t.mutation(api.students.update, {
      requesterId: catechistId,
      studentId: student3Id,
      isActive: false,
    })

    // Enroll student 1 in the class (active primary)
    await t.mutation(api.students.enrollStudents, {
      requesterId: catechistId,
      studentIds: [student1Id],
      classYearId,
      isPrimaryClass: true,
      enrolledDate: '2024-09-01',
    })

    // Query eligible students
    const eligibleStudents = await t.query(
      api.students.getEligibleForEnrollment,
      {
        requesterId: catechistId,
        academicYearId,
      },
    )

    // Should return both active students (even if one is enrolled)
    const activeStudents = eligibleStudents.filter(
      (s) => s._id === student1Id || s._id === student2Id,
    )
    expect(activeStudents).toHaveLength(2)

    // Student 1 should have enrollment info
    const student1Result = eligibleStudents.find((s) => s._id === student1Id)
    expect(student1Result?.enrolledClassYearId).toBe(classYearId)
    expect(student1Result?.className).toBe('Ấu Nhi 1')
    expect(student1Result?.isPrimaryClass).toBe(true)
    expect(student1Result?.status).toBe('active')

    // Student 2 should not have enrollment info
    const student2Result = eligibleStudents.find((s) => s._id === student2Id)
    expect(student2Result?.enrolledClassYearId).toBeNull()
    expect(student2Result?.className).toBeNull()
    expect(student2Result?.status).toBeNull()

    // Inactive student should not be in results
    const inactiveStudent = eligibleStudents.find((s) => s._id === student3Id)
    expect(inactiveStudent).toBeUndefined()
  })
})

describe('getEligibleForTransfer query', () => {
  async function setupTransferFixture(t: ReturnType<typeof convexTest>) {
    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'GLV001',
        fullName: 'Admin',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
    })

    const sourceAcademicYearId = await t.run(async (ctx) => {
      return await ctx.db.insert('academicYears', {
        name: '2023-2024',
        startDate: '2023-09-01',
        endDate: '2024-05-31',
        timezone: 'Asia/Ho_Chi_Minh',
        isActive: false,
        isDeleted: false,
      })
    })

    const targetAcademicYearId = await t.run(async (ctx) => {
      return await ctx.db.insert('academicYears', {
        name: '2024-2025',
        startDate: '2024-09-01',
        endDate: '2025-05-31',
        timezone: 'Asia/Ho_Chi_Minh',
        isActive: true,
        isDeleted: false,
      })
    })

    const branchId = await t.run(async (ctx) => {
      return await ctx.db.insert('branches', {
        name: 'Branch A',
        sortOrder: 1,
        isDeleted: false,
      })
    })

    const classId = await t.run(async (ctx) => {
      return await ctx.db.insert('classes', {
        branchId,
        name: 'Au Nhi 1',
        isDeleted: false,
      })
    })

    const sourceClassYearId = await t.run(async (ctx) => {
      return await ctx.db.insert('classYears', {
        academicYearId: sourceAcademicYearId,
        classId,
        isDeleted: false,
      })
    })

    const targetClassYearId = await t.run(async (ctx) => {
      return await ctx.db.insert('classYears', {
        academicYearId: targetAcademicYearId,
        classId,
        isDeleted: false,
      })
    })

    return {
      adminId,
      sourceAcademicYearId,
      targetAcademicYearId,
      branchId,
      classId,
      sourceClassYearId,
      targetClassYearId,
    }
  }

  test('returns roster excluding withdrawn and deleted enrollments', async () => {
    const t = convexTest(schema, modules)
    const { adminId, sourceClassYearId, targetAcademicYearId } =
      await setupTransferFixture(t)

    const activeStudentId = await t.mutation(api.students.create, {
      requesterId: adminId,
      fullName: 'Active Student',
    })
    const onLeaveStudentId = await t.mutation(api.students.create, {
      requesterId: adminId,
      fullName: 'On Leave Student',
    })
    const withdrawnStudentId = await t.mutation(api.students.create, {
      requesterId: adminId,
      fullName: 'Withdrawn Student',
    })
    const deletedEnrollmentStudentId = await t.mutation(api.students.create, {
      requesterId: adminId,
      fullName: 'Deleted Enrollment Student',
    })

    // The source academic year is not active, so seed enrollments directly
    // rather than via the `enrollStudents` mutation (which requires the
    // target class year's academic year to be active).
    await t.run(async (ctx) => {
      await ctx.db.insert('studentClasses', {
        studentId: activeStudentId,
        classYearId: sourceClassYearId,
        isPrimaryClass: true,
        enrolledDate: '2023-09-01',
        status: 'active',
        isDeleted: false,
      })
      await ctx.db.insert('studentClasses', {
        studentId: onLeaveStudentId,
        classYearId: sourceClassYearId,
        isPrimaryClass: true,
        enrolledDate: '2023-09-01',
        status: 'on_leave',
        isDeleted: false,
      })
      await ctx.db.insert('studentClasses', {
        studentId: withdrawnStudentId,
        classYearId: sourceClassYearId,
        isPrimaryClass: true,
        enrolledDate: '2023-09-01',
        status: 'withdrawn',
        leftDate: '2023-12-01',
        isDeleted: false,
      })
      // A soft-deleted enrollment should never appear in the roster.
      await ctx.db.insert('studentClasses', {
        studentId: deletedEnrollmentStudentId,
        classYearId: sourceClassYearId,
        isPrimaryClass: false,
        enrolledDate: '2023-09-01',
        status: 'active',
        isDeleted: true,
      })
    })

    const result = await t.query(api.students.getEligibleForTransfer, {
      requesterId: adminId,
      sourceClassYearId,
      targetAcademicYearId,
    })

    const studentIds = result.map((r) => r.studentId)
    expect(studentIds).toContain(activeStudentId)
    expect(studentIds).toContain(onLeaveStudentId)
    expect(studentIds).not.toContain(withdrawnStudentId)
    expect(studentIds).not.toContain(deletedEnrollmentStudentId)
    expect(result).toHaveLength(2)

    // Sorted by fullName
    expect(result.map((r) => r.fullName)).toEqual(
      [...result.map((r) => r.fullName)].sort((a, b) => a.localeCompare(b)),
    )

    for (const row of result) {
      expect(row.alreadyEnrolledInTargetYear).toBe(false)
    }
  })

  test('flags a student already enrolled in the target academic year', async () => {
    const t = convexTest(schema, modules)
    const {
      adminId,
      sourceClassYearId,
      targetClassYearId,
      targetAcademicYearId,
    } = await setupTransferFixture(t)

    const studentId = await t.mutation(api.students.create, {
      requesterId: adminId,
      fullName: 'Already Enrolled Student',
    })

    await t.run(async (ctx) => {
      await ctx.db.insert('studentClasses', {
        studentId,
        classYearId: sourceClassYearId,
        isPrimaryClass: true,
        enrolledDate: '2023-09-01',
        status: 'active',
        isDeleted: false,
      })
    })

    await t.mutation(api.students.enrollStudents, {
      requesterId: adminId,
      studentIds: [studentId],
      classYearId: targetClassYearId,
      isPrimaryClass: true,
      enrolledDate: '2024-09-01',
    })

    const result = await t.query(api.students.getEligibleForTransfer, {
      requesterId: adminId,
      sourceClassYearId,
      targetAcademicYearId,
    })

    const row = result.find((r) => r.studentId === studentId)
    expect(row?.alreadyEnrolledInTargetYear).toBe(true)
  })

  test('includes annualResult when present, null when absent or deleted', async () => {
    const t = convexTest(schema, modules)
    const { adminId, sourceClassYearId, targetAcademicYearId } =
      await setupTransferFixture(t)

    const studentWithResultId = await t.mutation(api.students.create, {
      requesterId: adminId,
      fullName: 'Student With Evaluation',
    })
    const studentNoResultId = await t.mutation(api.students.create, {
      requesterId: adminId,
      fullName: 'Student Without Evaluation',
    })
    const studentDeletedResultId = await t.mutation(api.students.create, {
      requesterId: adminId,
      fullName: 'Student With Deleted Evaluation',
    })

    let scWithResultId: any
    let scDeletedResultId: any

    await t.run(async (ctx) => {
      scWithResultId = await ctx.db.insert('studentClasses', {
        studentId: studentWithResultId,
        classYearId: sourceClassYearId,
        isPrimaryClass: true,
        enrolledDate: '2023-09-01',
        status: 'active',
        isDeleted: false,
      })
      await ctx.db.insert('studentClasses', {
        studentId: studentNoResultId,
        classYearId: sourceClassYearId,
        isPrimaryClass: true,
        enrolledDate: '2023-09-01',
        status: 'active',
        isDeleted: false,
      })
      scDeletedResultId = await ctx.db.insert('studentClasses', {
        studentId: studentDeletedResultId,
        classYearId: sourceClassYearId,
        isPrimaryClass: true,
        enrolledDate: '2023-09-01',
        status: 'active',
        isDeleted: false,
      })

      await ctx.db.insert('annualResults', {
        studentClassId: scWithResultId,
        conductGrade: 'excellent',
        remark: 'Chăm chỉ và tích cực',
        isCompleted: true,
        isDeleted: false,
      })

      await ctx.db.insert('annualResults', {
        studentClassId: scDeletedResultId,
        conductGrade: 'poor',
        remark: 'Đã xóa',
        isCompleted: false,
        isDeleted: true,
      })
    })

    const result = await t.query(api.students.getEligibleForTransfer, {
      requesterId: adminId,
      sourceClassYearId,
      targetAcademicYearId,
    })

    const rowWithResult = result.find(
      (r) => r.studentId === studentWithResultId,
    )
    expect(rowWithResult?.annualResult).toEqual({
      _id: expect.any(String),
      conductGrade: 'excellent',
      remark: 'Chăm chỉ và tích cực',
      isCompleted: true,
    })

    const rowNoResult = result.find((r) => r.studentId === studentNoResultId)
    expect(rowNoResult?.annualResult).toBeNull()

    const rowDeletedResult = result.find(
      (r) => r.studentId === studentDeletedResultId,
    )
    expect(rowDeletedResult?.annualResult).toBeNull()
  })

  test('throws on a deleted or non-existent sourceClassYearId', async () => {
    const t = convexTest(schema, modules)
    const { adminId, sourceClassYearId, targetAcademicYearId } =
      await setupTransferFixture(t)

    await t.run(async (ctx) => {
      await ctx.db.patch('classYears', sourceClassYearId, { isDeleted: true })
    })

    await expect(
      t.query(api.students.getEligibleForTransfer, {
        requesterId: adminId,
        sourceClassYearId,
        targetAcademicYearId,
      }),
    ).rejects.toThrow(ENROLLMENT_ERRORS.CLASS_YEAR_NOT_FOUND)
  })

  test('throws if requester is not a valid catechist', async () => {
    const t = convexTest(schema, modules)
    const { sourceClassYearId, targetAcademicYearId } =
      await setupTransferFixture(t)

    const deletedCatechistId = await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'GLV999',
        fullName: 'Deleted Catechist',
        role: 'admin',
        isActive: true,
        isDeleted: true,
      })
    })

    await expect(
      t.query(api.students.getEligibleForTransfer, {
        requesterId: deletedCatechistId,
        sourceClassYearId,
        targetAcademicYearId,
      }),
    ).rejects.toThrow()
  })
})

describe('auto-account creation for students', () => {
  test('create auto-creates an account with loginId STD-<studentCode>', async () => {
    const t = convexTest(schema, modules)
    const adminId = await t.run(async (ctx) => {
      return ctx.db.insert('catechists', {
        memberId: 'ADMIN',
        fullName: 'Admin',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
    })

    const studentId = await t.mutation(api.students.create, {
      requesterId: adminId,
      fullName: 'New Student',
    })

    const newStudent = await t.run(async (ctx) =>
      ctx.db.get('students', studentId),
    )
    expect(newStudent?.studentCode).toBe('1')

    const account = await t.run(async (ctx) =>
      ctx.db
        .query('accounts')
        .withIndex('by_login_id', (q) => q.eq('loginId', 'STD-1'))
        .unique(),
    )
    expect(account).not.toBeNull()
    expect(account?.loginId).toBe('STD-1')
    expect(account?.accountType).toBe('student')
    expect(account?.userRefId).toBe(studentId)
    expect(account?.isActive).toBe(true)
    expect(account?.isDeleted).toBe(false)
    expect(account?.passwordHash).toMatch(/^\$2/) // bcrypt
    expect(account?.mustChangePassword).toBe(true)
  })

  test('create respects STUDENT_ACCOUNT_PREFIX env var', async () => {
    const originalPrefix = process.env.STUDENT_ACCOUNT_PREFIX
    process.env.STUDENT_ACCOUNT_PREFIX = 'TN'

    try {
      const t = convexTest(schema, modules)
      const adminId = await t.run(async (ctx) => {
        return ctx.db.insert('catechists', {
          memberId: 'ADMIN',
          fullName: 'Admin',
          role: 'admin',
          isActive: true,
          isDeleted: false,
        })
      })

      await t.mutation(api.students.create, {
        requesterId: adminId,
        fullName: 'Custom Prefix Student',
      })

      const account = await t.run(async (ctx) =>
        ctx.db
          .query('accounts')
          .withIndex('by_login_id', (q) => q.eq('loginId', 'TN-1'))
          .unique(),
      )
      expect(account).not.toBeNull()
      expect(account?.loginId).toBe('TN-1')
    } finally {
      if (originalPrefix === undefined) {
        delete process.env.STUDENT_ACCOUNT_PREFIX
      } else {
        process.env.STUDENT_ACCOUNT_PREFIX = originalPrefix
      }
    }
  })
})

describe('getEnrollmentSummary query', () => {
  async function setupEnrollment(t: ReturnType<typeof convexTest>) {
    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'GLV001',
        fullName: 'Admin',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
    })

    const academicYearId = await t.run(async (ctx) => {
      return await ctx.db.insert('academicYears', {
        name: '2024-2025',
        startDate: '2024-09-01',
        endDate: '2025-05-31',
        timezone: 'Asia/Ho_Chi_Minh',
        isActive: true,
        isDeleted: false,
      })
    })

    const branchId = await t.run(async (ctx) => {
      return await ctx.db.insert('branches', {
        name: 'Branch A',
        sortOrder: 1,
        isDeleted: false,
      })
    })

    const classId = await t.run(async (ctx) => {
      return await ctx.db.insert('classes', {
        branchId,
        name: 'Au Nhi 1',
        isDeleted: false,
      })
    })

    const classYearId = await t.run(async (ctx) => {
      return await ctx.db.insert('classYears', {
        classId,
        academicYearId,
        isDeleted: false,
      })
    })

    const semester1Id = await t.run(async (ctx) => {
      return await ctx.db.insert('semesters', {
        academicYearId,
        semesterNumber: 1,
        name: 'Học Kỳ 1',
        isDeleted: false,
      })
    })

    const semester2Id = await t.run(async (ctx) => {
      return await ctx.db.insert('semesters', {
        academicYearId,
        semesterNumber: 2,
        isDeleted: false,
      })
    })

    const studentId = await t.mutation(api.students.create, {
      requesterId: adminId,
      fullName: 'John Doe',
    })

    const studentClassId = await t.run(async (ctx) => {
      return await ctx.db.insert('studentClasses', {
        studentId,
        classYearId,
        isPrimaryClass: true,
        enrolledDate: '2024-09-01',
        status: 'active',
        isDeleted: false,
      })
    })

    return {
      adminId,
      academicYearId,
      classYearId,
      semester1Id,
      semester2Id,
      studentId,
      studentClassId,
    }
  }

  test('returns null for a missing studentClassId', async () => {
    const t = convexTest(schema, modules)
    const { adminId, studentClassId } = await setupEnrollment(t)

    // fabricate a non-existent id by deleting the row's presence via a fake id
    const fakeId = studentClassId // reuse a real id shape, then delete it
    await t.run(async (ctx) => {
      await ctx.db.delete('studentClasses', fakeId)
    })

    const result = await t.query(api.students.getEnrollmentSummary, {
      requesterId: adminId,
      studentClassId: fakeId,
    })

    expect(result).toBeNull()
  })

  test('returns null for a soft-deleted studentClassId', async () => {
    const t = convexTest(schema, modules)
    const { adminId, studentClassId } = await setupEnrollment(t)

    await t.run(async (ctx) => {
      await ctx.db.patch('studentClasses', studentClassId, { isDeleted: true })
    })

    const result = await t.query(api.students.getEnrollmentSummary, {
      requesterId: adminId,
      studentClassId,
    })

    expect(result).toBeNull()
  })

  test('rejects an invalid/inactive requester', async () => {
    const t = convexTest(schema, modules)
    const { studentClassId } = await setupEnrollment(t)

    const inactiveCatechistId = await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'GLV002',
        fullName: 'Inactive',
        role: 'user',
        isActive: false,
        isDeleted: false,
      })
    })

    await expect(
      t.query(api.students.getEnrollmentSummary, {
        requesterId: inactiveCatechistId,
        studentClassId,
      }),
    ).rejects.toThrow(AUTHZ_ERRORS.ACCOUNT_INACTIVE)
  })

  test('returns zeroed/empty structures when no attendance/grading/results data exists', async () => {
    const t = convexTest(schema, modules)
    const { adminId, studentClassId } = await setupEnrollment(t)

    const result = await t.query(api.students.getEnrollmentSummary, {
      requesterId: adminId,
      studentClassId,
    })

    expect(result).not.toBeNull()
    expect(result?.attendance).toEqual({
      present: 0,
      late: 0,
      excusedAbsence: 0,
      unexcusedAbsence: 0,
      notMarked: 0,
      total: 0,
      rate: 0,
    })
    expect(result?.grading).toEqual([])
    expect(result?.semesterResults).toEqual([])
    expect(result?.annualResult).toBeNull()
  })

  test('aggregates attendance, grading, semester results, and annual result', async () => {
    const t = convexTest(schema, modules)
    const { adminId, classYearId, semester1Id, semester2Id, studentClassId } =
      await setupEnrollment(t)

    // ─── Attendance: 1 present, 1 late, 1 excused, 1 unexcused ─────────
    const sessionIds = await t.run(async (ctx) => {
      const ids: Array<Id<'classSessions'>> = []
      for (let i = 0; i < 4; i++) {
        ids.push(
          await ctx.db.insert('classSessions', {
            classYearId,
            semesterId: semester1Id,
            sessionDate: `2024-09-0${i + 1}`,
            sessionType: 'catechism',
            isCancelled: false,
            isDeleted: false,
          }),
        )
      }
      return ids
    })

    await t.run(async (ctx) => {
      const statuses = [
        'present',
        'late',
        'excused_absence',
        'unexcused_absence',
      ] as const
      for (let i = 0; i < sessionIds.length; i++) {
        await ctx.db.insert('attendanceRecords', {
          sessionId: sessionIds[i],
          studentClassId,
          status: statuses[i],
          recordedBy: adminId,
          deviceQueuedAt: Date.now(),
          isDeleted: false,
        })
      }
      // a soft-deleted record that must be excluded from tallies
      await ctx.db.insert('attendanceRecords', {
        sessionId: sessionIds[0],
        studentClassId,
        status: 'present',
        recordedBy: adminId,
        deviceQueuedAt: Date.now(),
        isDeleted: true,
      })
    })

    // ─── Grading: two columns in semester 1, one in semester 2 ─────────
    const { quizColumnId, examColumnId, s2ColumnId } = await t.run(
      async (ctx) => {
        const quizColId = await ctx.db.insert('scoreColumns', {
          classYearId,
          semesterId: semester1Id,
          columnName: '15-min Quiz 1',
          columnType: 'short_quiz',
          scaleType: 'scale_10',
          sortOrder: 2,
          isDeleted: false,
        })
        const examColId = await ctx.db.insert('scoreColumns', {
          classYearId,
          semesterId: semester1Id,
          columnName: 'Semester Exam',
          columnType: 'semester_exam',
          scaleType: 'scale_10',
          sortOrder: 1,
          isDeleted: false,
        })
        const s2ColId = await ctx.db.insert('scoreColumns', {
          classYearId,
          semesterId: semester2Id,
          columnName: 'Midterm',
          columnType: 'midterm_test',
          scaleType: 'pass_fail',
          sortOrder: 1,
          isDeleted: false,
        })
        // a deleted column whose entry must be skipped
        const deletedColumnId = await ctx.db.insert('scoreColumns', {
          classYearId,
          semesterId: semester1Id,
          columnName: 'Removed Quiz',
          columnType: 'short_quiz',
          sortOrder: 3,
          isDeleted: true,
        })
        await ctx.db.insert('scoreEntries', {
          studentClassId,
          scoreColumnId: deletedColumnId,
          scoreValue: 5,
          enteredBy: adminId,
          enteredAt: Date.now(),
          isDeleted: false,
        })
        return {
          quizColumnId: quizColId,
          examColumnId: examColId,
          s2ColumnId: s2ColId,
        }
      },
    )

    await t.run(async (ctx) => {
      await ctx.db.insert('scoreEntries', {
        studentClassId,
        scoreColumnId: quizColumnId,
        scoreValue: 8.5,
        enteredBy: adminId,
        enteredAt: Date.now(),
        isDeleted: false,
      })
      await ctx.db.insert('scoreEntries', {
        studentClassId,
        scoreColumnId: examColumnId,
        scoreValue: 9,
        enteredBy: adminId,
        enteredAt: Date.now(),
        isDeleted: false,
      })
      await ctx.db.insert('scoreEntries', {
        studentClassId,
        scoreColumnId: s2ColumnId,
        scoreLabel: 'pass',
        enteredBy: adminId,
        enteredAt: Date.now(),
        isDeleted: false,
      })
    })

    // ─── Semester results ───────────────────────────────────────────────
    await t.run(async (ctx) => {
      await ctx.db.insert('semesterResults', {
        studentClassId,
        semesterId: semester2Id,
        morality: 'good',
        teacherNote: 'Doing well',
        isCompleted: true,
        isDeleted: false,
      })
      await ctx.db.insert('semesterResults', {
        studentClassId,
        semesterId: semester1Id,
        morality: 'excellent',
        teacherNote: 'Great start',
        isCompleted: true,
        isDeleted: false,
      })
    })

    // ─── Annual result ──────────────────────────────────────────────────
    await t.run(async (ctx) => {
      await ctx.db.insert('annualResults', {
        studentClassId,
        conductGrade: 'excellent',
        remark: 'Excellent year overall',
        isCompleted: true,
        isDeleted: false,
      })
    })

    const result = await t.query(api.students.getEnrollmentSummary, {
      requesterId: adminId,
      studentClassId,
    })

    expect(result).not.toBeNull()

    // Attendance
    expect(result?.attendance).toEqual({
      present: 1,
      late: 1,
      excusedAbsence: 1,
      unexcusedAbsence: 1,
      notMarked: 0,
      total: 4,
      rate: 0.5,
    })

    // Grading — grouped by semester, sorted by semesterNumber, exams sorted by sortOrder
    expect(result?.grading).toHaveLength(2)
    expect(result?.grading[0].semesterNumber).toBe(1)
    expect(result?.grading[0].semesterName).toBe('Học Kỳ 1')
    expect(result?.grading[0].exams).toEqual([
      {
        columnName: 'Semester Exam',
        columnType: 'semester_exam',
        scaleType: 'scale_10',
        weight: 1,
        scoreValue: 9,
      },
      {
        columnName: '15-min Quiz 1',
        columnType: 'short_quiz',
        scaleType: 'scale_10',
        weight: 1,
        scoreValue: 8.5,
      },
    ])
    expect(result?.grading[1].semesterNumber).toBe(2)
    expect(result?.grading[1].semesterName).toBeUndefined()
    expect(result?.grading[1].exams).toEqual([
      {
        columnName: 'Midterm',
        columnType: 'midterm_test',
        scaleType: 'pass_fail',
        weight: 1,
        scoreLabel: 'pass',
      },
    ])

    // Semester results — sorted by semesterNumber ascending
    expect(result?.semesterResults).toHaveLength(2)
    expect(result?.semesterResults[0]).toMatchObject({
      semesterNumber: 1,
      morality: 'excellent',
      teacherNote: 'Great start',
      isCompleted: true,
    })
    expect(result?.semesterResults[1]).toMatchObject({
      semesterNumber: 2,
      morality: 'good',
      teacherNote: 'Doing well',
      isCompleted: true,
    })

    // Annual result
    expect(result?.annualResult).toEqual({
      conductGrade: 'excellent',
      remark: 'Excellent year overall',
      isCompleted: true,
    })
  })

  describe('getMyEnrollmentSummary query', () => {
    test('succeeds for the owning student', async () => {
      const t = convexTest(schema, modules)
      const { studentId, studentClassId } = await setupEnrollment(t)

      const result = await t.query(api.students.getMyEnrollmentSummary, {
        requesterId: studentId,
        studentClassId,
      })

      expect(result).not.toBeNull()
      expect(result?.attendance).toEqual({
        present: 0,
        late: 0,
        excusedAbsence: 0,
        unexcusedAbsence: 0,
        notMarked: 0,
        total: 0,
        rate: 0,
      })
    })

    test('returns null when the studentClassId belongs to a different student', async () => {
      const t = convexTest(schema, modules)
      const { adminId, classYearId, studentClassId } = await setupEnrollment(t)

      const otherStudentId = await t.mutation(api.students.create, {
        requesterId: adminId,
        fullName: 'Other Student',
      })

      const result = await t.query(api.students.getMyEnrollmentSummary, {
        requesterId: otherStudentId,
        studentClassId,
      })

      expect(result).toBeNull()
      // sanity: classYearId untouched, confirms we didn't just get lucky with a shared id
      expect(classYearId).toBeDefined()
    })

    test('returns null for a deleted studentClassId', async () => {
      const t = convexTest(schema, modules)
      const { studentId, studentClassId } = await setupEnrollment(t)

      await t.run(async (ctx) => {
        await ctx.db.patch('studentClasses', studentClassId, {
          isDeleted: true,
        })
      })

      const result = await t.query(api.students.getMyEnrollmentSummary, {
        requesterId: studentId,
        studentClassId,
      })

      expect(result).toBeNull()
    })

    test('returns null for a nonexistent studentClassId', async () => {
      const t = convexTest(schema, modules)
      const { studentId, studentClassId } = await setupEnrollment(t)

      await t.run(async (ctx) => {
        await ctx.db.delete('studentClasses', studentClassId)
      })

      const result = await t.query(api.students.getMyEnrollmentSummary, {
        requesterId: studentId,
        studentClassId,
      })

      expect(result).toBeNull()
    })

    test('rejects an inactive/invalid requester', async () => {
      const t = convexTest(schema, modules)
      const { adminId, studentClassId } = await setupEnrollment(t)

      const inactiveStudentId = await t.mutation(api.students.create, {
        requesterId: adminId,
        fullName: 'Inactive Student',
      })
      await t.mutation(api.students.update, {
        requesterId: adminId,
        studentId: inactiveStudentId,
        isActive: false,
      })

      await expect(
        t.query(api.students.getMyEnrollmentSummary, {
          requesterId: inactiveStudentId,
          studentClassId,
        }),
      ).rejects.toThrow(AUTHZ_ERRORS.ACCOUNT_INACTIVE)
    })
  })
})

describe('exportList query', () => {
  async function seedAdmin(t: ReturnType<typeof convexTest>) {
    return await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'ADMIN',
        fullName: 'Admin',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
    })
  }

  async function seedCatechist(
    t: ReturnType<typeof convexTest>,
    memberId: string,
    fullName: string,
  ) {
    return await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId,
        fullName,
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
    })
  }

  async function seedAcademicYear(
    t: ReturnType<typeof convexTest>,
    name: string,
    isActive: boolean,
  ) {
    return await t.run(async (ctx) => {
      return await ctx.db.insert('academicYears', {
        name,
        startDate: '2024-09-01',
        endDate: '2025-05-31',
        timezone: 'Asia/Ho_Chi_Minh',
        isActive,
        isDeleted: false,
      })
    })
  }

  async function makeBoardMember(
    t: ReturnType<typeof convexTest>,
    academicYearId: Id<'academicYears'>,
    catechistId: Id<'catechists'>,
  ) {
    await t.run(async (ctx) => {
      await ctx.db.insert('academicYearAssignments', {
        academicYearId,
        catechistId,
        assignmentType: 'board_member',
        isDeleted: false,
      })
    })
  }

  test('admin requester gets all matching students with joined address/guardian contact data', async () => {
    const t = convexTest(schema, modules)
    const adminId = await seedAdmin(t)

    const studentId = await t.mutation(api.students.create, {
      requesterId: adminId,
      fullName: 'Nguyễn Văn A',
      saintName: 'Giuse',
      gender: 'male',
    })

    await t.run(async (ctx) => {
      await ctx.db.insert('studentAddresses', {
        studentId,
        country: 'VN',
        addressLine1: '123 Đường ABC',
        city: 'HCMC',
        isDeleted: false,
      })
      const guardianId = await ctx.db.insert('guardians', {
        fullName: 'Nguyễn Văn Bố',
        isDeleted: false,
      })
      await ctx.db.insert('studentGuardians', {
        studentId,
        guardianId,
        relationship: 'father',
        contactPriority: 1,
        isDeleted: false,
      })
      await ctx.db.insert('guardianContacts', {
        guardianId,
        contactType: 'phone',
        value: '+84123456789',
        isPrimary: true,
        isDeleted: false,
      })
      await ctx.db.insert('guardianContacts', {
        guardianId,
        contactType: 'email',
        value: 'bo@example.com',
        isPrimary: true,
        isDeleted: false,
      })
    })

    const rows = await t.query(api.students.exportList, {
      requesterId: adminId,
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      fullName: 'Nguyễn Văn A',
      saintName: 'Giuse',
      gender: 'male',
      addressLine1: '123 Đường ABC',
      city: 'HCMC',
      country: 'VN',
      primaryGuardianName: 'Nguyễn Văn Bố',
      primaryGuardianRelationship: 'father',
      primaryPhone: '+84123456789',
      primaryEmail: 'bo@example.com',
    })
  })

  test('board member (for the true active academic year) is allowed', async () => {
    const t = convexTest(schema, modules)
    const adminId = await seedAdmin(t)
    const boardMemberId = await seedCatechist(t, 'BOARD', 'Board Member')
    const activeYearId = await seedAcademicYear(t, '2024-2025', true)
    await makeBoardMember(t, activeYearId, boardMemberId)

    await t.mutation(api.students.create, {
      requesterId: adminId,
      fullName: 'Student A',
    })

    const rows = await t.query(api.students.exportList, {
      requesterId: boardMemberId,
      academicYearId: activeYearId,
    })

    expect(rows).toHaveLength(1)
  })

  test('plain catechist without board/admin permission is rejected', async () => {
    const t = convexTest(schema, modules)
    const userId = await seedCatechist(t, 'USER', 'Plain User')
    await seedAcademicYear(t, '2024-2025', true)

    await expect(
      t.query(api.students.exportList, { requesterId: userId }),
    ).rejects.toThrow(STUDENT_ERRORS.EXPORT_UNAUTHORIZED)
  })

  test('spoofed academicYearId from a past board membership is still rejected (active-year trust boundary)', async () => {
    const t = convexTest(schema, modules)
    const userId = await seedCatechist(t, 'USER', 'Plain User')
    // Currently active year — user is NOT a board member of this one.
    await seedAcademicYear(t, '2024-2025', true)
    // Past year the user WAS a board member of, but it's inactive now.
    const pastYearId = await seedAcademicYear(t, '2022-2023', false)
    await makeBoardMember(t, pastYearId, userId)

    await expect(
      t.query(api.students.exportList, {
        requesterId: userId,
        // Attempt to spoof the permission check with the past year id.
        academicYearId: pastYearId,
      }),
    ).rejects.toThrow(STUDENT_ERRORS.EXPORT_UNAUTHORIZED)
  })

  test('filters (name/gender/isActive/branchId/classYearId) narrow results the same way list does', async () => {
    const t = convexTest(schema, modules)
    const adminId = await seedAdmin(t)

    const matchId = await t.mutation(api.students.create, {
      requesterId: adminId,
      fullName: 'Nguyễn Thị Match',
      gender: 'female',
    })
    await t.mutation(api.students.create, {
      requesterId: adminId,
      fullName: 'Trần Văn Other',
      gender: 'male',
      isActive: false,
    })

    const {
      branchId: outerBranchId,
      classYearId: outerClassYearId,
      academicYearId: outerAcademicYearId,
    } = await t.run(async (ctx) => {
      const academicYearId = await ctx.db.insert('academicYears', {
        name: '2024-2025',
        startDate: '2024-09-01',
        endDate: '2025-05-31',
        timezone: 'Asia/Ho_Chi_Minh',
        isActive: true,
        isDeleted: false,
      })
      const branchId = await ctx.db.insert('branches', {
        name: 'Chiên Con',
        sortOrder: 1,
        isDeleted: false,
      })
      const classId = await ctx.db.insert('classes', {
        branchId,
        name: 'Chiên Con 1',
        isDeleted: false,
      })
      const classYearId = await ctx.db.insert('classYears', {
        classId,
        academicYearId,
        isDeleted: false,
      })
      await ctx.db.insert('studentClasses', {
        studentId: matchId,
        classYearId,
        isPrimaryClass: true,
        enrolledDate: '2024-09-01',
        status: 'active',
        isDeleted: false,
      })
      return { branchId, classYearId, academicYearId }
    })

    const rows = await t.query(api.students.exportList, {
      requesterId: adminId,
      name: 'Match',
      gender: 'female',
      isActive: true,
      branchId: outerBranchId,
      classYearId: outerClassYearId,
      academicYearId: outerAcademicYearId,
    })

    expect(rows).toHaveLength(1)
    expect(rows[0].fullName).toBe('Nguyễn Thị Match')
  })

  test('student with no guardian link and student with a guardian lacking a primary contact both return undefined fields, without throwing', async () => {
    const t = convexTest(schema, modules)
    const adminId = await seedAdmin(t)

    await t.mutation(api.students.create, {
      requesterId: adminId,
      fullName: 'No Guardian',
    })

    const noContactStudentId = await t.mutation(api.students.create, {
      requesterId: adminId,
      fullName: 'Guardian No Contact',
    })
    await t.run(async (ctx) => {
      const guardianId = await ctx.db.insert('guardians', {
        fullName: 'Guardian Without Contact',
        isDeleted: false,
      })
      await ctx.db.insert('studentGuardians', {
        studentId: noContactStudentId,
        guardianId,
        relationship: 'mother',
        contactPriority: 1,
        isDeleted: false,
      })
    })

    const rows = await t.query(api.students.exportList, {
      requesterId: adminId,
    })

    const noGuardianRow = rows.find((r) => r.fullName === 'No Guardian')
    expect(noGuardianRow?.primaryGuardianName).toBeUndefined()
    expect(noGuardianRow?.primaryPhone).toBeUndefined()
    expect(noGuardianRow?.addressLine1).toBeUndefined()

    const noContactRow = rows.find((r) => r.fullName === 'Guardian No Contact')
    expect(noContactRow?.primaryGuardianName).toBe('Guardian Without Contact')
    expect(noContactRow?.primaryPhone).toBeUndefined()
    expect(noContactRow?.primaryEmail).toBeUndefined()
  })

  test('when a student has 2+ guardians at different contactPriority, the priority-1 guardian is chosen', async () => {
    const t = convexTest(schema, modules)
    const adminId = await seedAdmin(t)

    const studentId = await t.mutation(api.students.create, {
      requesterId: adminId,
      fullName: 'Multi Guardian Student',
    })

    await t.run(async (ctx) => {
      const primaryGuardianId = await ctx.db.insert('guardians', {
        fullName: 'Priority One Guardian',
        isDeleted: false,
      })
      await ctx.db.insert('guardianContacts', {
        guardianId: primaryGuardianId,
        contactType: 'phone',
        value: '+84111111111',
        isPrimary: true,
        isDeleted: false,
      })
      await ctx.db.insert('studentGuardians', {
        studentId,
        guardianId: primaryGuardianId,
        relationship: 'father',
        contactPriority: 1,
        isDeleted: false,
      })

      const secondaryGuardianId = await ctx.db.insert('guardians', {
        fullName: 'Priority Two Guardian',
        isDeleted: false,
      })
      await ctx.db.insert('guardianContacts', {
        guardianId: secondaryGuardianId,
        contactType: 'phone',
        value: '+84222222222',
        isPrimary: true,
        isDeleted: false,
      })
      await ctx.db.insert('studentGuardians', {
        studentId,
        guardianId: secondaryGuardianId,
        relationship: 'mother',
        contactPriority: 2,
        isDeleted: false,
      })
    })

    const rows = await t.query(api.students.exportList, {
      requesterId: adminId,
    })

    expect(rows[0].primaryGuardianName).toBe('Priority One Guardian')
    expect(rows[0].primaryPhone).toBe('+84111111111')
  })
})

describe('Candidate 5: unit tests against deepened backend seams', () => {
  test('resolveStudentIdsForScope correctly scopes by branch and classYear', async () => {
    const t = convexTest(schema, modules)
    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'ADMIN01',
        fullName: 'Admin User',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
    })

    const branchId = await t.run(async (ctx) => {
      return await ctx.db.insert('branches', {
        name: 'Chi Nhanh 1',
        sortOrder: 1,
        isDeleted: false,
      })
    })

    const academicYearId = await t.run(async (ctx) => {
      return await ctx.db.insert('academicYears', {
        name: '2024-2025',
        startDate: '2024-09-01',
        endDate: '2025-06-30',
        timezone: 'Asia/Ho_Chi_Minh',
        isActive: true,
        isDeleted: false,
      })
    })

    const classId = await t.run(async (ctx) => {
      return await ctx.db.insert('classes', {
        name: 'Lop 1A',
        branchId,
        isDeleted: false,
      })
    })

    const classYearId = await t.run(async (ctx) => {
      return await ctx.db.insert('classYears', {
        classId,
        academicYearId,
        isDeleted: false,
      })
    })

    const student1Id = await t.mutation(api.students.create, {
      requesterId: adminId,
      fullName: 'Student One',
    })
    const student2Id = await t.mutation(api.students.create, {
      requesterId: adminId,
      fullName: 'Student Two',
    })

    await t.run(async (ctx) => {
      await ctx.db.insert('studentClasses', {
        studentId: student1Id,
        classYearId,
        isPrimaryClass: true,
        enrolledDate: '2024-09-01',
        status: 'active',
        isDeleted: false,
      })
    })

    await t.run(async (ctx) => {
      const scopeIds = await resolveStudentIdsForScope(ctx, {
        branchId,
        academicYearId,
      })
      expect(scopeIds).not.toBeNull()
      expect(scopeIds?.has(student1Id)).toBe(true)
      expect(scopeIds?.has(student2Id)).toBe(false)
    })
  })

  test('createStudentWithProfile creates student, address, sacraments, guardians and initial enrollment atomically', async () => {
    const t = convexTest(schema, modules)

    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'GLV001',
        fullName: 'Admin Catechist',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
    })

    const branchId = await t.run(async (ctx) => {
      return await ctx.db.insert('branches', {
        name: 'Au Nhi',
        sortOrder: 1,
        isDeleted: false,
      })
    })

    const academicYearId = await t.run(async (ctx) => {
      return await ctx.db.insert('academicYears', {
        name: '2024-2025',
        startDate: '2024-09-01',
        endDate: '2025-06-30',
        timezone: 'Asia/Ho_Chi_Minh',
        isActive: true,
        isDeleted: false,
      })
    })

    const classId = await t.run(async (ctx) => {
      return await ctx.db.insert('classes', {
        name: 'Lop 1A',
        branchId,
        isDeleted: false,
      })
    })

    const classYearId = await t.run(async (ctx) => {
      return await ctx.db.insert('classYears', {
        classId,
        academicYearId,
        isDeleted: false,
      })
    })

    const studentId = await t.mutation(api.students.createStudentWithProfile, {
      requesterId: adminId,
      student: {
        fullName: 'Nguyen Van Composite',
        saintName: 'Giuse',
        gender: 'male',
        dateOfBirth: '2015-05-20',
      },
      address: {
        addressLine1: '123 Main St',
        city: 'Ho Chi Minh',
      },
      sacraments: [
        {
          sacramentType: 'baptism',
          receivedDate: '2016-01-10',
          receivedPlace: 'Giao Xu Tan Dinh',
        },
      ],
      guardians: [
        {
          fullName: 'Nguyen Van Parent',
          relationship: 'father',
          contactPriority: 1,
          phone: '0901234567',
        },
      ],
      initialEnrollment: {
        classYearId,
        isPrimaryClass: true,
        enrolledDate: '2024-09-01',
      },
    })

    const detail = await t.query(api.students.getStudentDetail, {
      requesterId: adminId,
      studentId,
    })

    expect(detail).not.toBeNull()
    expect(detail?.fullName).toBe('Nguyen Van Composite')
    expect(detail?.address?.addressLine1).toBe('123 Main St')
    expect(detail?.sacraments).toHaveLength(1)
    expect(detail?.sacraments[0].sacramentType).toBe('baptism')
    expect(detail?.guardians).toHaveLength(1)
    expect(detail?.guardians[0].guardian.fullName).toBe('Nguyen Van Parent')
    expect(detail?.enrollments).toHaveLength(1)
    expect(detail?.enrollments[0].classYearId).toBe(classYearId)
  })

  test('getStudentDetail and get mask address and guardian contacts for unauthorized catechists', async () => {
    const t = convexTest(schema, modules)

    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'GLV_ADMIN',
        fullName: 'Admin Catechist',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
    })

    const activeAyId = await t.run(async (ctx) => {
      return await ctx.db.insert('academicYears', {
        name: '2024-2025',
        startDate: '2024-09-01',
        endDate: '2025-06-30',
        timezone: 'Asia/Ho_Chi_Minh',
        isActive: true,
        isDeleted: false,
      })
    })

    const pastAyId = await t.run(async (ctx) => {
      return await ctx.db.insert('academicYears', {
        name: '2023-2024',
        startDate: '2023-09-01',
        endDate: '2024-06-30',
        timezone: 'Asia/Ho_Chi_Minh',
        isActive: false,
        isDeleted: false,
      })
    })

    const branchId = await t.run(async (ctx) => {
      return await ctx.db.insert('branches', {
        name: 'Au Nhi',
        sortOrder: 1,
        isDeleted: false,
      })
    })

    const class1Id = await t.run(async (ctx) => {
      return await ctx.db.insert('classes', {
        name: 'Au Nhi 1',
        branchId,
        isDeleted: false,
      })
    })

    const class2Id = await t.run(async (ctx) => {
      return await ctx.db.insert('classes', {
        name: 'Au Nhi 2',
        branchId,
        isDeleted: false,
      })
    })

    // Class 1 in Active Year
    const class1ActiveCyId = await t.run(async (ctx) => {
      return await ctx.db.insert('classYears', {
        classId: class1Id,
        academicYearId: activeAyId,
        isDeleted: false,
      })
    })

    // Class 2 in Active Year
    const class2ActiveCyId = await t.run(async (ctx) => {
      return await ctx.db.insert('classYears', {
        classId: class2Id,
        academicYearId: activeAyId,
        isDeleted: false,
      })
    })

    // Class 1 in Past Year
    const class1PastCyId = await t.run(async (ctx) => {
      return await ctx.db.insert('classYears', {
        classId: class1Id,
        academicYearId: pastAyId,
        isDeleted: false,
      })
    })

    // Catechist 1 (teaches Class 1 in Active Year)
    const catechist1Id = await t.run(async (ctx) => {
      const id = await ctx.db.insert('catechists', {
        memberId: 'GLV001',
        fullName: 'Catechist 1 (Active Class 1)',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      await ctx.db.insert('classCatechists', {
        classYearId: class1ActiveCyId,
        catechistId: id,
        academicYearId: activeAyId,
        role: 'homeroom',
        isDeleted: false,
      })
      return id
    })

    // Catechist 2 (teaches Class 2 in Active Year)
    const catechist2Id = await t.run(async (ctx) => {
      const id = await ctx.db.insert('catechists', {
        memberId: 'GLV002',
        fullName: 'Catechist 2 (Active Class 2)',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      await ctx.db.insert('classCatechists', {
        classYearId: class2ActiveCyId,
        catechistId: id,
        academicYearId: activeAyId,
        role: 'homeroom',
        isDeleted: false,
      })
      return id
    })

    // Catechist 3 (taught Class 1 in Past Year only)
    const catechist3Id = await t.run(async (ctx) => {
      const id = await ctx.db.insert('catechists', {
        memberId: 'GLV003',
        fullName: 'Catechist 3 (Past Year Only)',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      await ctx.db.insert('classCatechists', {
        classYearId: class1PastCyId,
        catechistId: id,
        academicYearId: pastAyId,
        role: 'homeroom',
        isDeleted: false,
      })
      return id
    })

    // Create student enrolled in Class 1 in both past year and active year
    const studentId = await t.mutation(api.students.createStudentWithProfile, {
      requesterId: adminId,
      student: {
        fullName: 'Student In Class 1',
        saintName: 'Maria',
        gender: 'female',
      },
      address: {
        addressLine1: '789 Secret Street',
        city: 'Ho Chi Minh',
      },
      guardians: [
        {
          fullName: 'Guardian Mother',
          relationship: 'mother',
          contactPriority: 1,
          phone: '0987654321',
          email: 'mother@example.com',
        },
      ],
      initialEnrollment: {
        classYearId: class1ActiveCyId,
        isPrimaryClass: true,
        enrolledDate: '2024-09-01',
      },
    })

    // Also enroll in past year
    await t.run(async (ctx) => {
      await ctx.db.insert('studentClasses', {
        studentId,
        classYearId: class1PastCyId,
        isPrimaryClass: true,
        enrolledDate: '2023-09-01',
        status: 'active',
        isDeleted: false,
      })
    })

    // 1. Admin viewing student -> address & guardian contacts visible
    const adminDetail = await t.query(api.students.getStudentDetail, {
      requesterId: adminId,
      studentId,
    })
    expect(adminDetail?.address?.addressLine1).toBe('789 Secret Street')
    expect(adminDetail?.guardians[0].contacts).toHaveLength(2)

    const adminGet = await t.query(api.students.get, {
      requesterId: adminId,
      id: studentId,
    })
    expect(adminGet?.address?.addressLine1).toBe('789 Secret Street')
    expect(adminGet?.guardians[0].contacts).toHaveLength(2)

    // 2. Catechist 1 (assigned to student's active class) -> address & contacts visible
    const cat1Detail = await t.query(api.students.getStudentDetail, {
      requesterId: catechist1Id,
      studentId,
    })
    expect(cat1Detail?.address?.addressLine1).toBe('789 Secret Street')
    expect(cat1Detail?.guardians[0].contacts).toHaveLength(2)

    const cat1Get = await t.query(api.students.get, {
      requesterId: catechist1Id,
      id: studentId,
    })
    expect(cat1Get?.address?.addressLine1).toBe('789 Secret Street')
    expect(cat1Get?.guardians[0].contacts).toHaveLength(2)

    // 3. Catechist 2 (assigned to different class in active year) -> address null & contacts empty
    const cat2Detail = await t.query(api.students.getStudentDetail, {
      requesterId: catechist2Id,
      studentId,
    })
    expect(cat2Detail?.address).toBeNull()
    expect(cat2Detail?.guardians[0].guardian.fullName).toBe('Guardian Mother')
    expect(cat2Detail?.guardians[0].contacts).toEqual([])

    const cat2Get = await t.query(api.students.get, {
      requesterId: catechist2Id,
      id: studentId,
    })
    expect(cat2Get?.address).toBeNull()
    expect(cat2Get?.guardians[0].contacts).toEqual([])

    // 4. Catechist 3 (assigned to student in past year, not active year) -> address null & contacts empty
    const cat3Detail = await t.query(api.students.getStudentDetail, {
      requesterId: catechist3Id,
      studentId,
    })
    expect(cat3Detail?.address).toBeNull()
    expect(cat3Detail?.guardians[0].contacts).toEqual([])

    const cat3Get = await t.query(api.students.get, {
      requesterId: catechist3Id,
      id: studentId,
    })
    expect(cat3Get?.address).toBeNull()
    expect(cat3Get?.guardians[0].contacts).toEqual([])
  })
})
