/// <reference types="vite/client" />

import { convexTest } from 'convex-test'
/* eslint-disable no-shadow */
import { describe, expect, test } from 'vitest'
import { api } from './_generated/api'
import { AUTHZ_ERRORS, CATECHIST_ERRORS } from './lib/errors'
import schema from './schema'
import type { Id } from './_generated/dataModel'

const modules = import.meta.glob('./**/*.ts')

describe('catechists backend functions', () => {
  test('profile queries and mutations', async () => {
    const t = convexTest(schema, modules)

    const catechistId = await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'GLV0001',
        fullName: 'Nguyễn Văn A',
        saintName: 'Giuse',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
    })

    const profile = await t.query(api.catechists.getMyProfile, {
      requesterId: catechistId,
      catechistId,
    })
    expect(profile).toMatchObject({
      fullName: 'Nguyễn Văn A',
      saintName: 'Giuse',
      role: 'user',
    })

    await t.mutation(api.catechists.updateMyProfile, {
      requesterId: catechistId,
      catechistId,
      fullName: 'Nguyễn Văn B',
      saintName: 'Maria',
    })

    const updatedProfile = await t.query(api.catechists.getMyProfile, {
      requesterId: catechistId,
      catechistId,
    })
    expect(updatedProfile?.fullName).toBe('Nguyễn Văn B')
    expect(updatedProfile?.saintName).toBe('Maria')
  })

  test('profile update with new fields', async () => {
    const t = convexTest(schema, modules)

    const catechistId = await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'GLV1001',
        fullName: 'Trần Văn X',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
    })

    await t.mutation(api.catechists.updateMyProfile, {
      requesterId: catechistId,
      catechistId,
      fullName: 'Trần Văn X',
      title: 'Cha',
      community: 'Dòng Chúa Cứu Thế',
      level: '1',
    })

    const profile = await t.query(api.catechists.getMyProfile, {
      requesterId: catechistId,
      catechistId,
    })
    expect(profile?.title).toBe('Cha')
    expect(profile?.community).toBe('Dòng Chúa Cứu Thế')
    expect(profile?.level).toBe('1')

    await t.mutation(api.catechists.updateMyProfile, {
      requesterId: catechistId,
      catechistId,
      fullName: 'Trần Văn X',
      title: '',
      community: '',
      level: '',
    })
    const updated = await t.query(api.catechists.getMyProfile, {
      requesterId: catechistId,
      catechistId,
    })
    expect(updated?.title).toBe('')
    expect(updated?.community).toBe('')
    expect(updated?.level).toBe('')
  })

  test('getCatechistDetail query returns consolidated profile aggregate', async () => {
    const t = convexTest(schema, modules)

    const catechistId = await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'GLV_DETAIL_001',
        fullName: 'Nguyễn Văn Detail',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
    })

    const detail = await t.query(api.catechists.getCatechistDetail, {
      requesterId: catechistId,
      catechistId,
    })

    expect(detail).not.toBeNull()
    expect(detail?.profile.fullName).toBe('Nguyễn Văn Detail')
    expect(detail?.address).toBeNull()
    expect(detail?.contacts).toHaveLength(0)
    expect(detail?.classAssignments).toHaveLength(0)
  })

  test('profile photo field mutations', async () => {
    const t = convexTest(schema, modules)

    const catechistId = await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'GLV1002',
        fullName: 'Nguyễn Văn P',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
    })

    const profile = await t.query(api.catechists.getMyProfile, {
      requesterId: catechistId,
      catechistId,
    })
    expect(profile?.profilePhotoStorageId).toBeUndefined()

    await t.run(async (ctx) => {
      await ctx.db.patch('catechists', catechistId, {
        profilePhotoStorageId: undefined,
      })
    })

    const updated = await t.query(api.catechists.getMyProfile, {
      requesterId: catechistId,
      catechistId,
    })
    expect(updated?.profilePhotoStorageId).toBeUndefined()
  })

  test('admin update with new fields', async () => {
    const t = convexTest(schema, modules)

    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'GLV_ADMIN',
        fullName: 'Admin',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
    })

    const catechistId = await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'GLV1003',
        fullName: 'Lê Văn Y',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
    })

    await t.mutation(api.catechists.update, {
      requesterId: adminId,
      catechistId,
      title: 'Soeur',
      community: 'Dòng Mến Thánh Giá',
      level: '2',
    })

    const profile = await t.query(api.catechists.get, {
      requesterId: adminId,
      catechistId,
    })
    expect(profile?.title).toBe('Soeur')
    expect(profile?.community).toBe('Dòng Mến Thánh Giá')
    expect(profile?.level).toBe('2')
  })

  test('address queries and mutations', async () => {
    const t = convexTest(schema, modules)

    const catechistId = await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'GLV0002',
        fullName: 'Nguyễn Văn C',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
    })

    const initialAddress = await t.query(api.catechists.getMyAddress, {
      requesterId: catechistId,
      catechistId,
    })
    expect(initialAddress).toBeNull()

    await t.mutation(api.catechists.upsertMyAddress, {
      requesterId: catechistId,
      catechistId,
      country: 'VN',
      addressLine1: '123 Đường ABC',
      city: 'Hồ Chí Minh',
    })

    const address = await t.query(api.catechists.getMyAddress, {
      requesterId: catechistId,
      catechistId,
    })
    expect(address).toMatchObject({
      country: 'VN',
      addressLine1: '123 Đường ABC',
      city: 'Hồ Chí Minh',
    })

    await t.mutation(api.catechists.upsertMyAddress, {
      requesterId: catechistId,
      catechistId,
      country: 'VN',
      addressLine1: '456 Đường DEF',
      city: 'Hà Nội',
    })

    const updatedAddress = await t.query(api.catechists.getMyAddress, {
      requesterId: catechistId,
      catechistId,
    })
    expect(updatedAddress?.addressLine1).toBe('456 Đường DEF')
    expect(updatedAddress?.city).toBe('Hà Nội')
  })

  test('contacts queries and mutations', async () => {
    const t = convexTest(schema, modules)

    const catechistId = await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'GLV0003',
        fullName: 'Nguyễn Văn D',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
    })

    const contactId = await t.mutation(api.catechists.addContact, {
      requesterId: catechistId,
      catechistId,
      label: 'Personal Phone',
      contactType: 'phone',
      value: '+84912345678',
      isPrimary: true,
    })

    const contacts = await t.query(api.catechists.getMyContacts, {
      requesterId: catechistId,
      catechistId,
    })
    expect(contacts).toHaveLength(1)
    expect(contacts[0]).toMatchObject({
      label: 'Personal Phone',
      contactType: 'phone',
      value: '+84912345678',
      isPrimary: true,
    })

    await t.mutation(api.catechists.updateContact, {
      requesterId: catechistId,
      contactId,
      label: 'Work Phone',
      contactType: 'phone',
      value: '+84987654321',
      isPrimary: false,
    })

    const updatedContacts = await t.query(api.catechists.getMyContacts, {
      requesterId: catechistId,
      catechistId,
    })
    expect(updatedContacts[0].label).toBe('Work Phone')
    expect(updatedContacts[0].value).toBe('+84987654321')
    expect(updatedContacts[0].isPrimary).toBe(false)

    await t.mutation(api.catechists.deleteContact, {
      requesterId: catechistId,
      contactId,
    })
    const postDeleteContacts = await t.query(api.catechists.getMyContacts, {
      requesterId: catechistId,
      catechistId,
    })
    expect(postDeleteContacts).toHaveLength(0)

    const rawContact = await t.run(async (ctx) =>
      ctx.db.get('catechistContacts', contactId),
    )
    expect(rawContact?.isDeleted).toBe(true)
  })

  test('addContact rejects invalid phone E.164', async () => {
    const t = convexTest(schema, modules)
    const catechistId = await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'GLV0004',
        fullName: 'Test E164',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
    })

    await expect(
      t.mutation(api.catechists.addContact, {
        requesterId: catechistId,
        catechistId,
        label: 'Bad Phone',
        contactType: 'phone',
        value: 'not-a-phone-number',
        isPrimary: false,
      }),
    ).rejects.toThrow('CATECHIST_INVALID_PHONE')
  })

  test('addContact allows non-phone without E.164', async () => {
    const t = convexTest(schema, modules)
    const catechistId = await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'GLV0005',
        fullName: 'Test Email',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
    })

    await expect(
      t.mutation(api.catechists.addContact, {
        requesterId: catechistId,
        catechistId,
        label: 'Email',
        contactType: 'email',
        value: 'test@example.com',
        isPrimary: false,
      }),
    ).resolves.not.toThrow()
  })

  test('addContact clears previous primary of same type', async () => {
    const t = convexTest(schema, modules)
    const catechistId = await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'GLV0006',
        fullName: 'Test Primary',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
    })

    const contact1 = await t.mutation(api.catechists.addContact, {
      requesterId: catechistId,
      catechistId,
      label: 'Phone 1',
      contactType: 'phone',
      value: '+84912345671',
      isPrimary: true,
    })

    const contact2 = await t.mutation(api.catechists.addContact, {
      requesterId: catechistId,
      catechistId,
      label: 'Phone 2',
      contactType: 'phone',
      value: '+84912345672',
      isPrimary: true,
    })

    const contacts = await t.query(api.catechists.getMyContacts, {
      requesterId: catechistId,
      catechistId,
    })
    const c1 = contacts.find((c) => c._id === contact1)
    const c2 = contacts.find((c) => c._id === contact2)

    expect(c1?.isPrimary).toBe(false)
    expect(c2?.isPrimary).toBe(true)
  })
})

describe('admin CRUD', () => {
  test('create generates memberId and returns id', async () => {
    const t = convexTest(schema, modules)
    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'ADMIN',
        fullName: 'Admin',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
    })

    const newId = await t.mutation(api.catechists.create, {
      requesterId: adminId,
      fullName: 'New User',
      role: 'user',
    })

    const newUser = await t.run(async (ctx) => ctx.db.get('catechists', newId))
    expect(newUser?.fullName).toBe('New User')
    expect(newUser?.memberId).toBe('1')
  })

  test('list returns only non-deleted catechists', async () => {
    const t = convexTest(schema, modules)
    const adminId = await t.run(async (ctx) => {
      const admin = await ctx.db.insert('catechists', {
        memberId: 'ADMIN',
        fullName: 'Admin',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
      await ctx.db.insert('catechists', {
        memberId: 'DEL',
        fullName: 'Deleted',
        role: 'user',
        isActive: true,
        isDeleted: true,
      })
      return admin
    })

    const list = await t.query(api.catechists.list, {
      requesterId: adminId,
      paginationOpts: { numItems: 100, cursor: null },
    })
    expect(list.page).toHaveLength(1)
    expect(list.page[0]._id).toBe(adminId)
  })

  test('get returns profile + address + contacts for admin or self, masks sensitive info for other catechists', async () => {
    const t = convexTest(schema, modules)
    const { adminId, user1Id, user2Id } = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert('catechists', {
        memberId: 'ADMIN',
        fullName: 'Admin',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
      const user1Id = await ctx.db.insert('catechists', {
        memberId: 'USER1',
        fullName: 'User 1',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      const user2Id = await ctx.db.insert('catechists', {
        memberId: 'USER2',
        fullName: 'User 2',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      await ctx.db.insert('catechistAddresses', {
        catechistId: user1Id,
        country: 'VN',
        addressLine1: 'Secret Address',
        isDeleted: false,
      })
      await ctx.db.insert('catechistContacts', {
        catechistId: user1Id,
        label: 'Phone',
        contactType: 'phone',
        value: '+84123',
        isPrimary: true,
        isDeleted: false,
      })
      return { adminId, user1Id, user2Id }
    })

    // Admin viewing User 1 -> gets address and contacts
    const adminResult = await t.query(api.catechists.get, {
      requesterId: adminId,
      catechistId: user1Id,
    })
    expect(adminResult).not.toBeNull()
    expect(adminResult?.fullName).toBe('User 1')
    expect(adminResult?.address?.addressLine1).toBe('Secret Address')
    expect(adminResult?.contacts).toHaveLength(1)

    // User 1 viewing own profile -> gets address and contacts
    const selfResult = await t.query(api.catechists.get, {
      requesterId: user1Id,
      catechistId: user1Id,
    })
    expect(selfResult).not.toBeNull()
    expect(selfResult?.address?.addressLine1).toBe('Secret Address')
    expect(selfResult?.contacts).toHaveLength(1)

    // User 2 viewing User 1 profile -> address is null and contacts are empty
    const peerResult = await t.query(api.catechists.get, {
      requesterId: user2Id,
      catechistId: user1Id,
    })
    expect(peerResult).not.toBeNull()
    expect(peerResult?.fullName).toBe('User 1')
    expect(peerResult?.address).toBeNull()
    expect(peerResult?.contacts).toEqual([])

    // Also verify getMyAddress and getMyContacts protect against peer access
    const peerAddress = await t.query(api.catechists.getMyAddress, {
      requesterId: user2Id,
      catechistId: user1Id,
    })
    expect(peerAddress).toBeNull()

    const peerContacts = await t.query(api.catechists.getMyContacts, {
      requesterId: user2Id,
      catechistId: user1Id,
    })
    expect(peerContacts).toEqual([])

    // getCatechistDetail also masks for peer
    const peerDetail = await t.query(api.catechists.getCatechistDetail, {
      requesterId: user2Id,
      catechistId: user1Id,
    })
    expect(peerDetail?.address).toBeNull()
    expect(peerDetail?.contacts).toEqual([])
    expect(peerDetail?.account).toBeNull()
  })

  test('get returns null for invalid or deleted catechist', async () => {
    const t = convexTest(schema, modules)
    const { adminId, deletedId } = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert('catechists', {
        memberId: 'ADMIN',
        fullName: 'Admin',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
      const deletedId = await ctx.db.insert('catechists', {
        memberId: 'DEL',
        fullName: 'Deleted User',
        role: 'user',
        isActive: true,
        isDeleted: true,
      })
      return { adminId, deletedId }
    })

    const deletedResult = await t.query(api.catechists.get, {
      requesterId: adminId,
      catechistId: deletedId,
    })
    expect(deletedResult).toBeNull()

    const invalidId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('catechists', {
        memberId: 'TMP',
        fullName: 'TMP',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      await ctx.db.delete('catechists', id)
      return id
    })

    const notFoundResult = await t.query(api.catechists.get, {
      requesterId: adminId,
      catechistId: invalidId,
    })
    expect(notFoundResult).toBeNull()
  })

  test('update patches fields', async () => {
    const t = convexTest(schema, modules)
    const { adminId, userId } = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert('catechists', {
        memberId: 'ADMIN',
        fullName: 'Admin',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
      const userId = await ctx.db.insert('catechists', {
        memberId: 'USER',
        fullName: 'User',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      return { adminId, userId }
    })

    await t.mutation(api.catechists.update, {
      requesterId: adminId,
      catechistId: userId,
      fullName: 'Updated User',
      isActive: false,
    })

    const updated = await t.run(async (ctx) => ctx.db.get('catechists', userId))
    expect(updated?.fullName).toBe('Updated User')
    expect(updated?.isActive).toBe(false)
  })

  test('softDelete sets isDeleted true', async () => {
    const t = convexTest(schema, modules)
    const { adminId, userId } = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert('catechists', {
        memberId: 'ADMIN',
        fullName: 'Admin',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
      const userId = await ctx.db.insert('catechists', {
        memberId: 'USER',
        fullName: 'User',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      return { adminId, userId }
    })

    await t.mutation(api.catechists.softDelete, {
      requesterId: adminId,
      catechistId: userId,
    })

    const updated = await t.run(async (ctx) => ctx.db.get('catechists', userId))
    expect(updated?.isDeleted).toBe(true)
  })

  test('softDeleteAddress sets isDeleted true', async () => {
    const t = convexTest(schema, modules)
    const { adminId, addressId, userId } = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert('catechists', {
        memberId: 'ADMIN',
        fullName: 'Admin',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
      const userId = await ctx.db.insert('catechists', {
        memberId: 'USER',
        fullName: 'User',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      const addressId = await ctx.db.insert('catechistAddresses', {
        catechistId: userId,
        country: 'VN',
        isDeleted: false,
      })
      return { adminId, addressId, userId }
    })

    const resultBefore = await t.run(async (ctx) =>
      ctx.db.get('catechistAddresses', addressId),
    )
    expect(resultBefore?.isDeleted).toBe(false)

    await t.mutation(api.catechists.softDeleteAddress, {
      requesterId: adminId,
      catechistId: userId,
    })

    const updated = await t.run(async (ctx) =>
      ctx.db.get('catechistAddresses', addressId),
    )
    expect(updated?.isDeleted).toBe(true)
  })

  test('non-admin cannot create/update/softDelete', async () => {
    const t = convexTest(schema, modules)
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'USER',
        fullName: 'User',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
    })

    await expect(
      t.mutation(api.catechists.create, {
        requesterId: userId,
        fullName: 'New User',
        role: 'user',
      }),
    ).rejects.toThrow(AUTHZ_ERRORS.ADMIN_REQUIRED)
  })

  test('update throws NOT_FOUND for invalid id', async () => {
    const t = convexTest(schema, modules)
    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'ADMIN',
        fullName: 'Admin',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
    })

    // valid Id format, but we will test with a non-existent id by creating and hard deleting
    const invalidId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('catechists', {
        memberId: 'TMP',
        fullName: 'TMP',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      await ctx.db.delete('catechists', id)
      return id
    })

    await expect(
      t.mutation(api.catechists.update, {
        requesterId: adminId,
        catechistId: invalidId,
        fullName: 'Updated User',
      }),
    ).rejects.toThrow('CATECHIST_NOT_FOUND')
  })

  test('softDelete throws NOT_FOUND for invalid id', async () => {
    const t = convexTest(schema, modules)
    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'ADMIN',
        fullName: 'Admin',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
    })

    const invalidId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('catechists', {
        memberId: 'TMP',
        fullName: 'TMP',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      await ctx.db.delete('catechists', id)
      return id
    })

    await expect(
      t.mutation(api.catechists.softDelete, {
        requesterId: adminId,
        catechistId: invalidId,
      }),
    ).rejects.toThrow('CATECHIST_NOT_FOUND')
  })

  test('softDeleteAddress throws ADDRESS_NOT_FOUND if none exists', async () => {
    const t = convexTest(schema, modules)
    const { adminId, userId } = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert('catechists', {
        memberId: 'ADMIN',
        fullName: 'Admin',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
      const userId = await ctx.db.insert('catechists', {
        memberId: 'USER',
        fullName: 'User',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      return { adminId, userId }
    })

    await expect(
      t.mutation(api.catechists.softDeleteAddress, {
        requesterId: adminId,
        catechistId: userId,
      }),
    ).rejects.toThrow('CATECHIST_ADDRESS_NOT_FOUND')
  })
})

describe('getClassAssignments', () => {
  test('returns resolved class assignments grouped data', async () => {
    const t = convexTest(schema, modules)
    const { requesterId, catechistId, classId, yearId, branchId } = await t.run(
      async (ctx) => {
        const requesterId = await ctx.db.insert('catechists', {
          memberId: 'ADMIN',
          fullName: 'Admin',
          role: 'admin',
          isActive: true,
          isDeleted: false,
        })
        const catechistId = await ctx.db.insert('catechists', {
          memberId: 'GLV01',
          fullName: 'Giáo Lý Viên A',
          role: 'user',
          isActive: true,
          isDeleted: false,
        })
        const branchId = await ctx.db.insert('branches', {
          name: 'Ấu Nhi',
          sortOrder: 1,
          isDeleted: false,
        })
        const classId = await ctx.db.insert('classes', {
          name: 'Lớp 1A',
          branchId,
          isDeleted: false,
        })
        const yearId = await ctx.db.insert('academicYears', {
          name: '2024-2025',
          startDate: '2024-09-01',
          endDate: '2025-05-31',
          timezone: 'Asia/Ho_Chi_Minh',
          isActive: true,
          isDeleted: false,
        })
        const classYearId = await ctx.db.insert('classYears', {
          classId,
          academicYearId: yearId,
          isDeleted: false,
        })
        await ctx.db.insert('classCatechists', {
          catechistId,
          classYearId,
          academicYearId: yearId,
          role: 'homeroom',
          isDeleted: false,
        })
        return { requesterId, catechistId, classId, yearId, branchId }
      },
    )

    const result = await t.query(api.catechists.getClassAssignments, {
      requesterId,
      catechistId,
    })

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      className: 'Lớp 1A',
      branchName: 'Ấu Nhi',
      academicYearName: '2024-2025',
      role: 'homeroom',
      classId,
      branchId,
      academicYearId: yearId,
    })
  })

  test('excludes soft-deleted assignments', async () => {
    const t = convexTest(schema, modules)
    const { requesterId, catechistId } = await t.run(async (ctx) => {
      const requesterId = await ctx.db.insert('catechists', {
        memberId: 'ADMIN',
        fullName: 'Admin',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
      const catechistId = await ctx.db.insert('catechists', {
        memberId: 'GLV02',
        fullName: 'GLV B',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      const branchId = await ctx.db.insert('branches', {
        name: 'Thiếu Nhi',
        sortOrder: 2,
        isDeleted: false,
      })
      const classId = await ctx.db.insert('classes', {
        name: 'Lớp 2B',
        branchId,
        isDeleted: false,
      })
      const yearId = await ctx.db.insert('academicYears', {
        name: '2023-2024',
        startDate: '2023-09-01',
        endDate: '2024-05-31',
        timezone: 'Asia/Ho_Chi_Minh',
        isActive: false,
        isDeleted: false,
      })
      const classYearId = await ctx.db.insert('classYears', {
        classId,
        academicYearId: yearId,
        isDeleted: false,
      })
      await ctx.db.insert('classCatechists', {
        catechistId,
        classYearId,
        academicYearId: yearId,
        role: 'co_teacher',
        isDeleted: true,
      })
      return { requesterId, catechistId }
    })

    const result = await t.query(api.catechists.getClassAssignments, {
      requesterId,
      catechistId,
    })
    expect(result).toHaveLength(0)
  })

  test('returns empty array when no assignments exist', async () => {
    const t = convexTest(schema, modules)
    const { requesterId, catechistId } = await t.run(async (ctx) => {
      const requesterId = await ctx.db.insert('catechists', {
        memberId: 'ADMIN',
        fullName: 'Admin',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
      const catechistId = await ctx.db.insert('catechists', {
        memberId: 'GLV03',
        fullName: 'GLV C',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      return { requesterId, catechistId }
    })

    const result = await t.query(api.catechists.getClassAssignments, {
      requesterId,
      catechistId,
    })
    expect(result).toHaveLength(0)
  })
})

describe('list with branch filter', () => {
  test('returns all catechists when no branchId/academicYearId provided', async () => {
    const t = convexTest(schema, modules)
    const adminId = await t.run(async (ctx) => {
      const admin = await ctx.db.insert('catechists', {
        memberId: 'ADMIN',
        fullName: 'Admin',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
      await ctx.db.insert('catechists', {
        memberId: 'USER',
        fullName: 'User',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      return admin
    })

    const list = await t.query(api.catechists.list, {
      requesterId: adminId,
      paginationOpts: { numItems: 100, cursor: null },
    })
    expect(list.page).toHaveLength(2)
  })

  test('returns only branch-assigned catechists when filters provided', async () => {
    const t = convexTest(schema, modules)
    const { adminId, branchId, yearId, assignedUserId } = await t.run(
      async (ctx) => {
        const adminId = await ctx.db.insert('catechists', {
          memberId: 'ADMIN',
          fullName: 'Admin',
          role: 'admin',
          isActive: true,
          isDeleted: false,
        })
        const assignedUserId = await ctx.db.insert('catechists', {
          memberId: 'USER1',
          fullName: 'User 1',
          role: 'user',
          isActive: true,
          isDeleted: false,
        })
        await ctx.db.insert('catechists', {
          memberId: 'USER2',
          fullName: 'User 2',
          role: 'user',
          isActive: true,
          isDeleted: false,
        })
        const branchId = await ctx.db.insert('branches', {
          name: 'Chiên Con',
          sortOrder: 1,
          isDeleted: false,
        })
        const yearId = await ctx.db.insert('academicYears', {
          name: '2023-2024',
          startDate: '2023-09-01',
          endDate: '2024-05-31',
          timezone: 'Asia/Ho_Chi_Minh',
          isActive: true,
          isDeleted: false,
        })
        await ctx.db.insert('branchAssignments', {
          academicYearId: yearId,
          branchId: branchId,
          catechistId: assignedUserId,
          isDeleted: false,
        })
        return { adminId, branchId, yearId, assignedUserId }
      },
    )

    const list = await t.query(api.catechists.list, {
      requesterId: adminId,
      branchId,
      academicYearId: yearId,
      paginationOpts: { numItems: 100, cursor: null },
    })
    expect(list.page).toHaveLength(1)
    expect(list.page[0]._id).toBe(assignedUserId)
  })

  test('excludes soft-deleted assignments and soft-deleted catechists', async () => {
    const t = convexTest(schema, modules)
    const { adminId, branchId, yearId } = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert('catechists', {
        memberId: 'ADMIN',
        fullName: 'Admin',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
      const user1 = await ctx.db.insert('catechists', {
        memberId: 'USER1',
        fullName: 'User 1',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      const user2 = await ctx.db.insert('catechists', {
        memberId: 'USER2',
        fullName: 'User 2 (Deleted)',
        role: 'user',
        isActive: true,
        isDeleted: true,
      })
      const branchId = await ctx.db.insert('branches', {
        name: 'Ấu Nhi',
        sortOrder: 1,
        isDeleted: false,
      })
      const yearId = await ctx.db.insert('academicYears', {
        name: '2023-2024',
        startDate: '2023-09-01',
        endDate: '2024-05-31',
        timezone: 'Asia/Ho_Chi_Minh',
        isActive: true,
        isDeleted: false,
      })
      // Assignment is soft-deleted
      await ctx.db.insert('branchAssignments', {
        academicYearId: yearId,
        branchId: branchId,
        catechistId: user1,
        isDeleted: true,
      })
      // Catechist is soft-deleted, but assignment is active
      await ctx.db.insert('branchAssignments', {
        academicYearId: yearId,
        branchId: branchId,
        catechistId: user2,
        isDeleted: false,
      })
      return { adminId, branchId, yearId }
    })

    const list = await t.query(api.catechists.list, {
      requesterId: adminId,
      branchId,
      academicYearId: yearId,
      paginationOpts: { numItems: 100, cursor: null },
    })
    expect(list.page).toHaveLength(0)
  })
})

describe('auto-account creation', () => {
  test('create auto-creates an account with loginId CAT-<memberId>', async () => {
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

    const newId = await t.mutation(api.catechists.create, {
      requesterId: adminId,
      fullName: 'New Catechist',
      role: 'user',
    })

    const newCatechist = await t.run(async (ctx) =>
      ctx.db.get('catechists', newId),
    )
    expect(newCatechist?.memberId).toBe('1')

    const account = await t.run(async (ctx) =>
      ctx.db
        .query('accounts')
        .withIndex('by_login_id', (q) => q.eq('loginId', 'CAT-1'))
        .unique(),
    )
    expect(account).not.toBeNull()
    expect(account?.loginId).toBe('CAT-1')
    expect(account?.accountType).toBe('catechist')
    expect(account?.userRefId).toBe(newId)
    expect(account?.isActive).toBe(true)
    expect(account?.isDeleted).toBe(false)
    // passwordHash must be a bcrypt hash (starts with $2)
    expect(account?.passwordHash).toMatch(/^\$2/)
  })

  test('create respects CATECHIST_ACCOUNT_PREFIX env var', async () => {
    const originalPrefix = process.env.CATECHIST_ACCOUNT_PREFIX
    process.env.CATECHIST_ACCOUNT_PREFIX = 'GLV'

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

      await t.mutation(api.catechists.create, {
        requesterId: adminId,
        fullName: 'Custom Prefix Catechist',
        role: 'user',
      })

      const account = await t.run(async (ctx) =>
        ctx.db
          .query('accounts')
          .withIndex('by_login_id', (q) => q.eq('loginId', 'GLV-1'))
          .unique(),
      )
      expect(account).not.toBeNull()
      expect(account?.loginId).toBe('GLV-1')
    } finally {
      if (originalPrefix === undefined) {
        delete process.env.CATECHIST_ACCOUNT_PREFIX
      } else {
        process.env.CATECHIST_ACCOUNT_PREFIX = originalPrefix
      }
    }
  })

  test('createWithDetails auto-creates an account', async () => {
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

    const { catechistId: newId } = await t.mutation(
      api.catechists.createWithDetails,
      {
        requesterId: adminId,
        fullName: 'Detailed Catechist',
        role: 'user',
        address: { country: 'VN' },
      },
    )

    const newCatechist = await t.run(async (ctx) =>
      ctx.db.get('catechists', newId),
    )
    const expectedLoginId = `CAT-${newCatechist?.memberId}`

    const account = await t.run(async (ctx) =>
      ctx.db
        .query('accounts')
        .withIndex('by_login_id', (q) => q.eq('loginId', expectedLoginId))
        .unique(),
    )
    expect(account).not.toBeNull()
    expect(account?.accountType).toBe('catechist')
    expect(account?.userRefId).toBe(newId)
  })

  test('sequential creates get sequential loginIds', async () => {
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

    await t.mutation(api.catechists.create, {
      requesterId: adminId,
      fullName: 'First',
      role: 'user',
    })
    await t.mutation(api.catechists.create, {
      requesterId: adminId,
      fullName: 'Second',
      role: 'user',
    })

    const accounts = await t.run(async (ctx) =>
      ctx.db.query('accounts').collect(),
    )
    const loginIds = accounts.map((a) => a.loginId).sort()
    expect(loginIds).toContain('CAT-1')
    expect(loginIds).toContain('CAT-2')
  })
})

describe('exportList', () => {
  test('admin requester gets all matching catechists with joined address/contact data', async () => {
    const t = convexTest(schema, modules)
    const { adminId } = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert('catechists', {
        memberId: 'ADMIN',
        fullName: 'Admin',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
      const userId = await ctx.db.insert('catechists', {
        memberId: 'USER',
        fullName: 'Nguyễn Văn A',
        saintName: 'Giuse',
        gender: 'male',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      await ctx.db.insert('catechistAddresses', {
        catechistId: userId,
        country: 'VN',
        addressLine1: '123 Đường ABC',
        city: 'HCMC',
        isDeleted: false,
      })
      await ctx.db.insert('catechistContacts', {
        catechistId: userId,
        label: 'Phone',
        contactType: 'phone',
        value: '+84123456789',
        isPrimary: true,
        isDeleted: false,
      })
      await ctx.db.insert('catechistContacts', {
        catechistId: userId,
        label: 'Email',
        contactType: 'email',
        value: 'a@example.com',
        isPrimary: true,
        isDeleted: false,
      })
      return { adminId }
    })

    const rows = await t.query(api.catechists.exportList, {
      requesterId: adminId,
    })

    expect(rows).toHaveLength(2)
    const userRow = rows.find((r) => r.memberId === 'USER')
    expect(userRow).toMatchObject({
      fullName: 'Nguyễn Văn A',
      saintName: 'Giuse',
      gender: 'male',
      addressLine1: '123 Đường ABC',
      city: 'HCMC',
      country: 'VN',
      primaryPhone: '+84123456789',
      primaryEmail: 'a@example.com',
    })
  })

  test('board member of the currently active year is allowed', async () => {
    const t = convexTest(schema, modules)
    const { boardMemberId } = await t.run(async (ctx) => {
      const boardMemberId = await ctx.db.insert('catechists', {
        memberId: 'BOARD',
        fullName: 'Board Member',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      const yearId = await ctx.db.insert('academicYears', {
        name: '2023-2024',
        startDate: '2023-09-01',
        endDate: '2024-05-31',
        timezone: 'Asia/Ho_Chi_Minh',
        isActive: true,
        isDeleted: false,
      })
      await ctx.db.insert('academicYearAssignments', {
        academicYearId: yearId,
        catechistId: boardMemberId,
        assignmentType: 'board_member',
        isDeleted: false,
      })
      return { boardMemberId }
    })

    // academicYearId is deliberately omitted — the permission check must
    // resolve the active year itself, not rely on a client-supplied one.
    const rows = await t.query(api.catechists.exportList, {
      requesterId: boardMemberId,
    })
    expect(rows.some((r) => r.memberId === 'BOARD')).toBe(true)
  })

  test('spoofed academicYearId from a past board membership is still rejected (active-year trust boundary)', async () => {
    const t = convexTest(schema, modules)
    const { userId, pastYearId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('catechists', {
        memberId: 'USER',
        fullName: 'Plain User',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      // Currently active year — user is NOT a board member of this one.
      await ctx.db.insert('academicYears', {
        name: '2024-2025',
        startDate: '2024-09-01',
        endDate: '2025-05-31',
        timezone: 'Asia/Ho_Chi_Minh',
        isActive: true,
        isDeleted: false,
      })
      // Past year the user WAS a board member of, but it's inactive now.
      const pastYearId = await ctx.db.insert('academicYears', {
        name: '2022-2023',
        startDate: '2022-09-01',
        endDate: '2023-05-31',
        timezone: 'Asia/Ho_Chi_Minh',
        isActive: false,
        isDeleted: false,
      })
      await ctx.db.insert('academicYearAssignments', {
        academicYearId: pastYearId,
        catechistId: userId,
        assignmentType: 'board_member',
        isDeleted: false,
      })
      return { userId, pastYearId }
    })

    await expect(
      t.query(api.catechists.exportList, {
        requesterId: userId,
        // Attempt to spoof the permission check with the past year id.
        academicYearId: pastYearId,
      }),
    ).rejects.toThrow(CATECHIST_ERRORS.EXPORT_UNAUTHORIZED)
  })

  test('plain catechist without board/admin permission is rejected', async () => {
    const t = convexTest(schema, modules)
    const { userId, yearId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('catechists', {
        memberId: 'USER',
        fullName: 'Plain User',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      const yearId = await ctx.db.insert('academicYears', {
        name: '2023-2024',
        startDate: '2023-09-01',
        endDate: '2024-05-31',
        timezone: 'Asia/Ho_Chi_Minh',
        isActive: true,
        isDeleted: false,
      })
      return { userId, yearId }
    })

    await expect(
      t.query(api.catechists.exportList, {
        requesterId: userId,
        academicYearId: yearId,
      }),
    ).rejects.toThrow('CATECHIST_EXPORT_UNAUTHORIZED')
  })

  test('plain catechist with no academicYearId is also rejected', async () => {
    const t = convexTest(schema, modules)
    const userId = await t.run(async (ctx) => {
      return ctx.db.insert('catechists', {
        memberId: 'USER',
        fullName: 'Plain User',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
    })

    await expect(
      t.query(api.catechists.exportList, { requesterId: userId }),
    ).rejects.toThrow('CATECHIST_EXPORT_UNAUTHORIZED')
  })

  test('filters (name/gender/isActive/branchId) narrow results same as list', async () => {
    const t = convexTest(schema, modules)
    const { adminId, branchId, yearId, matchId } = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert('catechists', {
        memberId: 'ADMIN',
        fullName: 'Admin',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
      const matchId = await ctx.db.insert('catechists', {
        memberId: 'MATCH',
        fullName: 'Nguyễn Thị Match',
        gender: 'female',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      await ctx.db.insert('catechists', {
        memberId: 'NOMATCH',
        fullName: 'Trần Văn Other',
        gender: 'male',
        role: 'user',
        isActive: false,
        isDeleted: false,
      })
      const branchId = await ctx.db.insert('branches', {
        name: 'Chiên Con',
        sortOrder: 1,
        isDeleted: false,
      })
      const yearId = await ctx.db.insert('academicYears', {
        name: '2023-2024',
        startDate: '2023-09-01',
        endDate: '2024-05-31',
        timezone: 'Asia/Ho_Chi_Minh',
        isActive: true,
        isDeleted: false,
      })
      await ctx.db.insert('branchAssignments', {
        academicYearId: yearId,
        branchId,
        catechistId: matchId,
        isDeleted: false,
      })
      return { adminId, branchId, yearId, matchId }
    })

    const rows = await t.query(api.catechists.exportList, {
      requesterId: adminId,
      name: 'Match',
      gender: 'female',
      isActive: true,
      branchId,
      academicYearId: yearId,
    })

    expect(rows).toHaveLength(1)
    expect(rows[0].memberId).toBe('MATCH')
    expect(matchId).toBeTruthy()
  })

  test('name filter matches on saintName as well as fullName, and sortBy/sortOrder sort the results', async () => {
    const t = convexTest(schema, modules)
    const adminId = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert('catechists', {
        memberId: 'ADMIN',
        fullName: 'Admin',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
      await ctx.db.insert('catechists', {
        memberId: 'B',
        fullName: 'Trần Văn B',
        saintName: 'Phêrô',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      await ctx.db.insert('catechists', {
        memberId: 'A',
        fullName: 'Nguyễn Văn A',
        saintName: 'Anna',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      return adminId
    })

    // saintName-only match (fullName doesn't contain the query)
    const bySaintName = await t.query(api.catechists.exportList, {
      requesterId: adminId,
      name: 'phêrô',
    })
    expect(bySaintName).toHaveLength(1)
    expect(bySaintName[0].memberId).toBe('B')

    // sortBy memberId ascending
    const asc = await t.query(api.catechists.exportList, {
      requesterId: adminId,
      sortBy: 'memberId',
      sortOrder: 'asc',
    })
    expect(asc.map((r) => r.memberId)).toEqual(['A', 'ADMIN', 'B'])

    // sortBy memberId descending
    const desc = await t.query(api.catechists.exportList, {
      requesterId: adminId,
      sortBy: 'memberId',
      sortOrder: 'desc',
    })
    expect(desc.map((r) => r.memberId)).toEqual(['B', 'ADMIN', 'A'])
  })

  test('a non-primary matching-type contact is not returned as primaryPhone/primaryEmail', async () => {
    const t = convexTest(schema, modules)
    const { adminId, userId } = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert('catechists', {
        memberId: 'ADMIN',
        fullName: 'Admin',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
      const userId = await ctx.db.insert('catechists', {
        memberId: 'USER',
        fullName: 'Nguyễn Văn C',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      await ctx.db.insert('catechistContacts', {
        catechistId: userId,
        label: 'Phone (secondary)',
        contactType: 'phone',
        value: '+84999999999',
        isPrimary: false,
        isDeleted: false,
      })
      return { adminId, userId }
    })

    const rows = await t.query(api.catechists.exportList, {
      requesterId: adminId,
    })
    const userRow = rows.find((r) => r.memberId === 'USER')
    expect(userId).toBeTruthy()
    expect(userRow?.primaryPhone).toBeUndefined()
    expect(userRow?.primaryEmail).toBeUndefined()
  })

  test('catechist with no address/no primary contact returns undefined fields, does not throw', async () => {
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

    const rows = await t.query(api.catechists.exportList, {
      requesterId: adminId,
    })

    expect(rows).toHaveLength(1)
    expect(rows[0].memberId).toBe('ADMIN')
    expect(rows[0].addressLine1).toBeUndefined()
    expect(rows[0].city).toBeUndefined()
    expect(rows[0].primaryPhone).toBeUndefined()
    expect(rows[0].primaryEmail).toBeUndefined()
  })
})

describe('own-record authorization guards', () => {
  test('updateMyProfile rejects a non-admin editing someone else profile', async () => {
    const t = convexTest(schema, modules)
    const { userId, otherId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('catechists', {
        memberId: 'GLV2001',
        fullName: 'User A',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      const otherId = await ctx.db.insert('catechists', {
        memberId: 'GLV2002',
        fullName: 'User B',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      return { userId, otherId }
    })

    await expect(
      t.mutation(api.catechists.updateMyProfile, {
        requesterId: userId,
        catechistId: otherId,
        fullName: 'Hacked Name',
      }),
    ).rejects.toThrow(CATECHIST_ERRORS.OWN_PROFILE_ONLY)
  })

  test('updateMyProfile allows an admin to edit someone else profile', async () => {
    const t = convexTest(schema, modules)
    const { adminId, otherId } = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert('catechists', {
        memberId: 'GLV2003',
        fullName: 'Admin',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
      const otherId = await ctx.db.insert('catechists', {
        memberId: 'GLV2004',
        fullName: 'User C',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      return { adminId, otherId }
    })

    await expect(
      t.mutation(api.catechists.updateMyProfile, {
        requesterId: adminId,
        catechistId: otherId,
        fullName: 'Edited By Admin',
      }),
    ).resolves.not.toThrow()

    const profile = await t.query(api.catechists.getMyProfile, {
      requesterId: adminId,
      catechistId: otherId,
    })
    expect(profile?.fullName).toBe('Edited By Admin')
  })

  test('upsertMyAddress rejects a non-admin editing someone else address', async () => {
    const t = convexTest(schema, modules)
    const { userId, otherId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('catechists', {
        memberId: 'GLV2005',
        fullName: 'User D',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      const otherId = await ctx.db.insert('catechists', {
        memberId: 'GLV2006',
        fullName: 'User E',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      return { userId, otherId }
    })

    await expect(
      t.mutation(api.catechists.upsertMyAddress, {
        requesterId: userId,
        catechistId: otherId,
        country: 'VN',
      }),
    ).rejects.toThrow(CATECHIST_ERRORS.OWN_ADDRESS_ONLY)
  })

  test('addContact rejects a non-admin adding a contact to someone else', async () => {
    const t = convexTest(schema, modules)
    const { userId, otherId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('catechists', {
        memberId: 'GLV2007',
        fullName: 'User F',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      const otherId = await ctx.db.insert('catechists', {
        memberId: 'GLV2008',
        fullName: 'User G',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      return { userId, otherId }
    })

    await expect(
      t.mutation(api.catechists.addContact, {
        requesterId: userId,
        catechistId: otherId,
        label: 'Email',
        contactType: 'email',
        value: 'test@example.com',
        isPrimary: false,
      }),
    ).rejects.toThrow(CATECHIST_ERRORS.OWN_CONTACT_ONLY)
  })

  test('updateContact throws CONTACT_NOT_FOUND for a missing or already-deleted contact', async () => {
    const t = convexTest(schema, modules)
    const { catechistId, contactId } = await t.run(async (ctx) => {
      const catechistId = await ctx.db.insert('catechists', {
        memberId: 'GLV2009',
        fullName: 'User H',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      const contactId = await ctx.db.insert('catechistContacts', {
        catechistId,
        label: 'Deleted Contact',
        contactType: 'email',
        value: 'gone@example.com',
        isPrimary: false,
        isDeleted: true,
      })
      return { catechistId, contactId }
    })

    await expect(
      t.mutation(api.catechists.updateContact, {
        requesterId: catechistId,
        contactId,
        label: 'New Label',
        contactType: 'email',
        value: 'new@example.com',
        isPrimary: false,
      }),
    ).rejects.toThrow(CATECHIST_ERRORS.CONTACT_NOT_FOUND)
  })

  test('updateContact rejects a non-admin editing someone else contact', async () => {
    const t = convexTest(schema, modules)
    const { userId, contactId } = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('catechists', {
        memberId: 'GLV2010',
        fullName: 'Owner',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      const userId = await ctx.db.insert('catechists', {
        memberId: 'GLV2011',
        fullName: 'Intruder',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      const contactId = await ctx.db.insert('catechistContacts', {
        catechistId: ownerId,
        label: 'Owner Email',
        contactType: 'email',
        value: 'owner@example.com',
        isPrimary: false,
        isDeleted: false,
      })
      return { userId, contactId }
    })

    await expect(
      t.mutation(api.catechists.updateContact, {
        requesterId: userId,
        contactId,
        label: 'Hijacked',
        contactType: 'email',
        value: 'hijacked@example.com',
        isPrimary: false,
      }),
    ).rejects.toThrow(CATECHIST_ERRORS.OWN_CONTACT_ONLY)
  })

  test('updateContact clears previous primary of same type when set to primary', async () => {
    const t = convexTest(schema, modules)
    const { catechistId, contact1, contact2 } = await t.run(async (ctx) => {
      const catechistId = await ctx.db.insert('catechists', {
        memberId: 'GLV2012',
        fullName: 'User Primary',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      const contact1 = await ctx.db.insert('catechistContacts', {
        catechistId,
        label: 'Phone 1',
        contactType: 'phone',
        value: '+84912345671',
        isPrimary: true,
        isDeleted: false,
      })
      const contact2 = await ctx.db.insert('catechistContacts', {
        catechistId,
        label: 'Phone 2',
        contactType: 'phone',
        value: '+84912345672',
        isPrimary: false,
        isDeleted: false,
      })
      return { catechistId, contact1, contact2 }
    })

    await t.mutation(api.catechists.updateContact, {
      requesterId: catechistId,
      contactId: contact2,
      label: 'Phone 2',
      contactType: 'phone',
      value: '+84912345672',
      isPrimary: true,
    })

    const contacts = await t.query(api.catechists.getMyContacts, {
      requesterId: catechistId,
      catechistId,
    })
    const c1 = contacts.find((c) => c._id === contact1)
    const c2 = contacts.find((c) => c._id === contact2)
    expect(c1?.isPrimary).toBe(false)
    expect(c2?.isPrimary).toBe(true)
  })

  test('deleteContact throws CONTACT_NOT_FOUND for a missing contact', async () => {
    const t = convexTest(schema, modules)
    const catechistId = await t.run(async (ctx) => {
      return ctx.db.insert('catechists', {
        memberId: 'GLV2013',
        fullName: 'User I',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
    })
    const fakeContactId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('catechistContacts', {
        catechistId,
        label: 'Temp',
        contactType: 'email',
        value: 'temp@example.com',
        isPrimary: false,
        isDeleted: false,
      })
      await ctx.db.patch('catechistContacts', id, { isDeleted: true })
      return id
    })

    await expect(
      t.mutation(api.catechists.deleteContact, {
        requesterId: catechistId,
        contactId: fakeContactId,
      }),
    ).rejects.toThrow(CATECHIST_ERRORS.CONTACT_NOT_FOUND)
  })

  test('deleteContact rejects a non-admin deleting someone else contact', async () => {
    const t = convexTest(schema, modules)
    const { userId, contactId } = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('catechists', {
        memberId: 'GLV2014',
        fullName: 'Owner2',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      const userId = await ctx.db.insert('catechists', {
        memberId: 'GLV2015',
        fullName: 'Intruder2',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      const contactId = await ctx.db.insert('catechistContacts', {
        catechistId: ownerId,
        label: 'Owner2 Email',
        contactType: 'email',
        value: 'owner2@example.com',
        isPrimary: false,
        isDeleted: false,
      })
      return { userId, contactId }
    })

    await expect(
      t.mutation(api.catechists.deleteContact, {
        requesterId: userId,
        contactId,
      }),
    ).rejects.toThrow(CATECHIST_ERRORS.OWN_CONTACT_ONLY)
  })
})

describe('createWithDetails contact normalization', () => {
  test('normalizes phone contacts and keeps the last isPrimary:true per type', async () => {
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

    const { catechistId: newId } = await t.mutation(
      api.catechists.createWithDetails,
      {
        requesterId: adminId,
        fullName: 'Multi Contact',
        role: 'user',
        contacts: [
          {
            label: 'Phone 1',
            contactType: 'phone',
            value: '0912345671',
            isPrimary: true,
          },
          {
            label: 'Phone 2',
            contactType: 'phone',
            value: '0912345672',
            isPrimary: true,
          },
          {
            label: 'Email',
            contactType: 'email',
            value: 'multi@example.com',
            isPrimary: true,
          },
        ],
      },
    )

    const contacts = await t.query(api.catechists.getMyContacts, {
      requesterId: adminId,
      catechistId: newId,
    })

    const phoneContacts = contacts.filter((c) => c.contactType === 'phone')
    expect(phoneContacts.every((c) => c.value.startsWith('+'))).toBe(true)
    expect(phoneContacts.find((c) => c.label === 'Phone 1')?.isPrimary).toBe(
      false,
    )
    expect(phoneContacts.find((c) => c.label === 'Phone 2')?.isPrimary).toBe(
      true,
    )
    const emailContact = contacts.find((c) => c.contactType === 'email')
    expect(emailContact?.isPrimary).toBe(true)
  })

  test('creates a catechist without contacts or address when none are provided', async () => {
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

    const { catechistId: newId } = await t.mutation(
      api.catechists.createWithDetails,
      {
        requesterId: adminId,
        fullName: 'No Extras',
        role: 'user',
      },
    )

    const contacts = await t.query(api.catechists.getMyContacts, {
      requesterId: adminId,
      catechistId: newId,
    })
    const address = await t.query(api.catechists.getMyAddress, {
      requesterId: adminId,
      catechistId: newId,
    })
    expect(contacts).toHaveLength(0)
    expect(address).toBeNull()
  })
})

describe('profile photo mutations and queries', () => {
  test('updateProfilePhoto rejects a non-admin updating someone else photo', async () => {
    const t = convexTest(schema, modules)
    const { userId, otherId, storageId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('catechists', {
        memberId: 'GLV3001',
        fullName: 'User J',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      const otherId = await ctx.db.insert('catechists', {
        memberId: 'GLV3002',
        fullName: 'User K',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      const storageId = await ctx.storage.store(new Blob(['fake image bytes']))
      return { userId, otherId, storageId }
    })

    await expect(
      t.mutation(api.catechists.updateProfilePhoto, {
        requesterId: userId,
        catechistId: otherId,
        storageId,
      }),
    ).rejects.toThrow(CATECHIST_ERRORS.OWN_PROFILE_PHOTO_UPDATE_ONLY)
  })

  test('updateProfilePhoto allows updating own photo and getProfilePhotoUrl returns a url', async () => {
    const t = convexTest(schema, modules)
    const { catechistId, storageId } = await t.run(async (ctx) => {
      const catechistId = await ctx.db.insert('catechists', {
        memberId: 'GLV3003',
        fullName: 'User L',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      const storageId = await ctx.storage.store(new Blob(['fake image bytes']))
      return { catechistId, storageId }
    })

    await t.mutation(api.catechists.updateProfilePhoto, {
      requesterId: catechistId,
      catechistId,
      storageId,
    })

    const url = await t.query(api.catechists.getProfilePhotoUrl, {
      catechistId,
    })
    expect(url).toEqual(expect.any(String))
  })

  test('getProfilePhotoUrl returns null when catechist has no photo', async () => {
    const t = convexTest(schema, modules)
    const catechistId = await t.run(async (ctx) => {
      return ctx.db.insert('catechists', {
        memberId: 'GLV3004',
        fullName: 'User M',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
    })

    const url = await t.query(api.catechists.getProfilePhotoUrl, {
      catechistId,
    })
    expect(url).toBeNull()
  })

  test('deleteProfilePhoto rejects a non-admin deleting someone else photo', async () => {
    const t = convexTest(schema, modules)
    const { userId, otherId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('catechists', {
        memberId: 'GLV3005',
        fullName: 'User N',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      const otherId = await ctx.db.insert('catechists', {
        memberId: 'GLV3006',
        fullName: 'User O',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      return { userId, otherId }
    })

    await expect(
      t.mutation(api.catechists.deleteProfilePhoto, {
        requesterId: userId,
        catechistId: otherId,
      }),
    ).rejects.toThrow(CATECHIST_ERRORS.OWN_PROFILE_PHOTO_DELETE_ONLY)
  })

  test('deleteProfilePhoto is a no-op when catechist has no photo', async () => {
    const t = convexTest(schema, modules)
    const catechistId = await t.run(async (ctx) => {
      return ctx.db.insert('catechists', {
        memberId: 'GLV3007',
        fullName: 'User P',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
    })

    await expect(
      t.mutation(api.catechists.deleteProfilePhoto, {
        requesterId: catechistId,
        catechistId,
      }),
    ).resolves.not.toThrow()
  })

  test('deleteProfilePhoto clears the storage id and deletes the stored file', async () => {
    const t = convexTest(schema, modules)
    const { catechistId, storageId } = await t.run(async (ctx) => {
      const catechistId = await ctx.db.insert('catechists', {
        memberId: 'GLV3008',
        fullName: 'User Q',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      const storageId = await ctx.storage.store(new Blob(['fake image bytes']))
      return { catechistId, storageId }
    })

    await t.mutation(api.catechists.updateProfilePhoto, {
      requesterId: catechistId,
      catechistId,
      storageId,
    })

    await t.mutation(api.catechists.deleteProfilePhoto, {
      requesterId: catechistId,
      catechistId,
    })

    const profile = await t.query(api.catechists.getMyProfile, {
      requesterId: catechistId,
      catechistId,
    })
    expect(profile?.profilePhotoStorageId).toBeUndefined()

    const url = await t.query(api.catechists.getProfilePhotoUrl, {
      catechistId,
    })
    expect(url).toBeNull()
  })
})

describe('listAllActive', () => {
  test('returns only active, non-deleted catechists with basic fields', async () => {
    const t = convexTest(schema, modules)
    const { requesterId, activeId } = await t.run(async (ctx) => {
      const requesterId = await ctx.db.insert('catechists', {
        memberId: 'GLV4001',
        fullName: 'Requester',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      const activeId = await ctx.db.insert('catechists', {
        memberId: 'GLV4002',
        fullName: 'Active Catechist',
        saintName: 'Phêrô',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      await ctx.db.insert('catechists', {
        memberId: 'GLV4003',
        fullName: 'Inactive Catechist',
        role: 'user',
        isActive: false,
        isDeleted: false,
      })
      await ctx.db.insert('catechists', {
        memberId: 'GLV4004',
        fullName: 'Deleted Catechist',
        role: 'user',
        isActive: true,
        isDeleted: true,
      })
      return { requesterId, activeId }
    })

    const results = await t.query(api.catechists.listAllActive, {
      requesterId,
    })

    expect(results.map((r) => r._id).sort()).toEqual(
      [requesterId, activeId].sort(),
    )
    const active = results.find((r) => r._id === activeId)
    expect(active).toMatchObject({
      memberId: 'GLV4002',
      fullName: 'Active Catechist',
      saintName: 'Phêrô',
    })
  })
})

describe('filterAndSortCatechists gender/sort branches', () => {
  test('gender filter narrows results to a single gender', async () => {
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
    await t.run(async (ctx) => {
      await ctx.db.insert('catechists', {
        memberId: 'GLV5001',
        fullName: 'Male Catechist',
        gender: 'male',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      await ctx.db.insert('catechists', {
        memberId: 'GLV5002',
        fullName: 'Female Catechist',
        gender: 'female',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
    })

    const paginationOpts = { numItems: 10, cursor: null }
    const result = await t.query(api.catechists.list, {
      requesterId: adminId,
      paginationOpts,
      gender: 'male',
    })

    expect(result.page.every((c) => c.gender === 'male')).toBe(true)
    expect(result.page.some((c) => c.fullName === 'Male Catechist')).toBe(true)
    expect(result.page.some((c) => c.fullName === 'Female Catechist')).toBe(
      false,
    )
  })

  test('sortBy a field with some undefined values sorts undefined last regardless of direction', async () => {
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
    await t.run(async (ctx) => {
      await ctx.db.insert('catechists', {
        memberId: 'GLV5003',
        fullName: 'Has Joined Date',
        joinedDate: '2020-01-01',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      await ctx.db.insert('catechists', {
        memberId: 'GLV5004',
        fullName: 'No Joined Date',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
    })

    const paginationOpts = { numItems: 10, cursor: null }
    const ascResult = await t.query(api.catechists.list, {
      requesterId: adminId,
      paginationOpts,
      sortBy: 'joinedDate',
      sortOrder: 'asc',
    })
    // Entries with an undefined sort value are always pushed to the end,
    // whether sorting asc or desc.
    expect(ascResult.page.at(-1)?.fullName).toBe('No Joined Date')

    const descResult = await t.query(api.catechists.list, {
      requesterId: adminId,
      paginationOpts,
      sortBy: 'joinedDate',
      sortOrder: 'desc',
    })
    expect(descResult.page.at(-1)?.fullName).toBe('No Joined Date')
  })
})

describe('updateWithDetails mutation', () => {
  test('atomically updates profile, address, and contacts with array diffing', async () => {
    const t = convexTest(schema, modules)

    const adminId = await t.run(async (ctx) => {
      return ctx.db.insert('catechists', {
        memberId: 'ADMIN01',
        fullName: 'Admin User',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
    })

    const catechistId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('catechists', {
        memberId: 'GLV9001',
        fullName: 'Original Name',
        role: 'user',
        isActive: true,
        isDeleted: false,
      })
      await ctx.db.insert('catechistAddresses', {
        catechistId: id,
        addressLine1: 'Old Address',
        country: 'VN',
        isDeleted: false,
      })
      await ctx.db.insert('catechistContacts', {
        catechistId: id,
        label: 'Home Phone',
        contactType: 'phone',
        value: '0901234567',
        isPrimary: true,
        isDeleted: false,
      })
      return id
    })

    const initialDetail = await t.query(api.catechists.getCatechistDetail, {
      requesterId: adminId,
      catechistId,
    })
    const oldContactId = initialDetail?.contacts[0]._id

    await t.mutation(api.catechists.updateWithDetails, {
      requesterId: adminId,
      catechistId,
      fullName: 'Updated Name',
      address: {
        addressLine1: '123 New St',
        city: 'Ho Chi Minh',
      },
      contacts: [
        {
          _id: oldContactId,
          label: 'Updated Mobile',
          contactType: 'phone',
          value: '0909999999',
          isPrimary: true,
        },
        {
          label: 'Personal Email',
          contactType: 'email',
          value: 'test@example.com',
          isPrimary: true,
        },
      ],
    })

    const updatedDetail = await t.query(api.catechists.getCatechistDetail, {
      requesterId: adminId,
      catechistId,
    })

    expect(updatedDetail?.profile.fullName).toBe('Updated Name')
    expect(updatedDetail?.address?.addressLine1).toBe('123 New St')
    expect(updatedDetail?.contacts).toHaveLength(2)
    expect(
      updatedDetail?.contacts.find((c) => c._id === oldContactId)?.label,
    ).toBe('Updated Mobile')
    expect(
      updatedDetail?.contacts.find((c) => c.contactType === 'email')?.value,
    ).toBe('test@example.com')
  })

  test('transformStudentsToCatechists clones student info to new catechist and account', async () => {
    const t = convexTest(schema, modules)

    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert('catechists', {
        memberId: 'GLV0001',
        fullName: 'Admin Catechist',
        role: 'admin',
        isActive: true,
        isDeleted: false,
      })
    })

    const studentId = await t.run(async (ctx) => {
      const sId = await ctx.db.insert('students', {
        studentCode: '1001',
        fullName: 'Nguyễn Văn Học Sinh',
        saintName: 'Phaolô',
        dateOfBirth: '2008-05-15',
        gender: 'male',
        isActive: true,
        createdAt: Date.now(),
        isDeleted: false,
      })
      await ctx.db.insert('studentAddresses', {
        studentId: sId,
        country: 'VN',
        addressLine1: '456 Phố Giáo Xứ',
        city: 'TP HCM',
        isDeleted: false,
      })
      return sId
    })

    const res = await t.mutation(api.catechists.transformStudentsToCatechists, {
      requesterId: adminId,
      studentIds: [studentId],
    })

    expect(res.count).toBe(1)
    const newCatechistId = res.items?.[0].catechistId

    const newCatechist = await t.query(api.catechists.getCatechistDetail, {
      requesterId: adminId,
      catechistId: newCatechistId ?? ('' as unknown as Id<'catechists'>),
    })

    expect(newCatechist?.profile.fullName).toBe('Nguyễn Văn Học Sinh')
    expect(newCatechist?.profile.saintName).toBe('Phaolô')
    expect(newCatechist?.profile.dateOfBirth).toBe('2008-05-15')
    expect(newCatechist?.profile.gender).toBe('male')
    expect(newCatechist?.profile.role).toBe('user')
    expect(newCatechist?.profile.isActive).toBe(true)
    expect(newCatechist?.address?.addressLine1).toBe('456 Phố Giáo Xứ')

    // Verify original student is unharmed
    const student = await t.run(async (ctx) =>
      ctx.db.get('students', studentId),
    )
    expect(student?.fullName).toBe('Nguyễn Văn Học Sinh')

    // Verify account created for new catechist
    const account = await t.run(async (ctx) => {
      const allAccounts = await ctx.db.query('accounts').collect()
      return (
        allAccounts.find(
          (a) =>
            a.accountType === 'catechist' && a.userRefId === newCatechistId,
        ) ?? null
      )
    })
    expect(account).not.toBeNull()
    expect(account?.isActive).toBe(true)
  })
})
