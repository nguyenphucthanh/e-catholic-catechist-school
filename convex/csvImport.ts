import { v } from 'convex/values'
import { action, internalMutation, query } from './_generated/server'
import { assertAdminRole } from './lib/authz'
import { CATECHIST_ERRORS, GUARDIAN_ERRORS } from './lib/errors'
import { hashPassword } from './lib/password'
import { getCatechistLoginId, getStudentLoginId } from './lib/accountPrefix'
import { normalizeToE164 } from './lib/phone'
import { createStudentWithAccount } from './students'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'

const BATCH_SIZE = 25

async function reserveCounters(
  ctx: MutationCtx,
  name: string,
  count: number,
): Promise<Array<number>> {
  if (count === 0) return []
  const counter = await ctx.db
    .query('counters')
    .withIndex('by_name', (q) => q.eq('name', name))
    .unique()
  const start = (counter?.value ?? 0) + 1
  const end = start + count - 1
  if (counter) {
    await ctx.db.patch('counters', counter._id, { value: end })
  } else {
    await ctx.db.insert('counters', { name, value: end })
  }
  return Array.from({ length: count }, (_, i) => start + i)
}

type ImportRowResult =
  | { index: number; status: 'ok'; id: Id<'students'> | Id<'catechists'> }
  | { index: number; status: 'error'; error: string }

export const internalReserveCounters = internalMutation({
  args: {
    requesterId: v.id('catechists'),
    name: v.string(),
    count: v.number(),
  },
  handler: async (ctx, args) => {
    await assertAdminRole(ctx, args.requesterId)
    return reserveCounters(ctx, args.name, args.count)
  },
})

const sacramentRecordValidator = v.object({
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
})

export const internalBulkImportStudentsBatch = internalMutation({
  args: {
    requesterId: v.id('catechists'),
    classYearId: v.optional(v.id('classYears')),
    records: v.array(
      v.object({
        fullName: v.string(),
        saintName: v.optional(v.string()),
        dateOfBirth: v.optional(v.string()),
        gender: v.optional(v.union(v.literal('male'), v.literal('female'))),
        previousParish: v.optional(v.string()),
        previousDiocese: v.optional(v.string()),
        fullAddress: v.optional(v.string()),
        isActive: v.optional(v.boolean()),
        studentCode: v.string(),
        passwordHash: v.string(),
        guardians: v.optional(
          v.array(
            v.object({
              fullName: v.string(),
              saintName: v.optional(v.string()),
              relationship: v.string(),
              contacts: v.array(
                v.object({
                  type: v.union(
                    v.literal('phone'),
                    v.literal('email'),
                    v.literal('zalo'),
                    v.literal('other'),
                  ),
                  value: v.string(),
                }),
              ),
            }),
          ),
        ),
        sacraments: v.optional(v.array(sacramentRecordValidator)),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await assertAdminRole(ctx, args.requesterId)

    const results: Array<ImportRowResult> = []
    // Dedup guardians by phone across sibling records within this same batch.
    const guardianByPhoneInBatch = new Map<string, Id<'guardians'>>()

    for (let i = 0; i < args.records.length; i++) {
      const rec = args.records[i]
      try {
        const {
          studentCode,
          passwordHash,
          fullName,
          saintName,
          dateOfBirth,
          gender,
          previousParish,
          previousDiocese,
          fullAddress,
          isActive,
        } = rec

        const studentId = await createStudentWithAccount(ctx, {
          studentCode,
          passwordHash,
          fullName,
          saintName,
          dateOfBirth,
          gender,
          previousParish,
          previousDiocese,
          isActive,
        })

        if (fullAddress) {
          await ctx.db.insert('studentAddresses', {
            studentId,
            country: 'VN',
            fullAddress,
            isDeleted: false,
          })
        }

        if (args.classYearId) {
          const cy = await ctx.db.get('classYears', args.classYearId)
          if (cy && !cy.isDeleted) {
            await ctx.db.insert('studentClasses', {
              studentId,
              classYearId: args.classYearId,
              isPrimaryClass: true,
              enrolledDate: new Date().toISOString().split('T')[0],
              status: 'active',
              isDeleted: false,
            })
          }
        }

        if (rec.guardians) {
          for (let gi = 0; gi < rec.guardians.length; gi++) {
            const guardian = rec.guardians[gi]
            const contactPriority = gi + 1

            const normalizedContacts = guardian.contacts.map((c) =>
              c.type === 'phone'
                ? {
                    ...c,
                    value: normalizeToE164(
                      c.value,
                      GUARDIAN_ERRORS.INVALID_PHONE,
                    ),
                  }
                : c,
            )

            const phoneContact = normalizedContacts.find(
              (c) => c.type === 'phone',
            )

            let guardianId: Id<'guardians'> | undefined

            if (phoneContact) {
              guardianId = guardianByPhoneInBatch.get(phoneContact.value)

              if (!guardianId) {
                const candidates = await ctx.db
                  .query('guardianContacts')
                  .withIndex('by_value', (q) =>
                    q.eq('value', phoneContact.value),
                  )
                  .collect()
                const existingContact = candidates.find(
                  (c) => c.contactType === 'phone' && !c.isDeleted,
                )

                if (existingContact) {
                  guardianId = existingContact.guardianId
                }
              }
            }

            if (!guardianId) {
              guardianId = await ctx.db.insert('guardians', {
                fullName: guardian.fullName,
                saintName: guardian.saintName,
                isDeleted: false,
              })

              for (let ci = 0; ci < normalizedContacts.length; ci++) {
                const contact = normalizedContacts[ci]
                await ctx.db.insert('guardianContacts', {
                  guardianId,
                  contactType: contact.type,
                  value: contact.value,
                  isPrimary: ci === 0,
                  isDeleted: false,
                })
              }

              if (phoneContact) {
                guardianByPhoneInBatch.set(phoneContact.value, guardianId)
              }
            }

            await ctx.db.insert('studentGuardians', {
              studentId,
              guardianId,
              relationship: guardian.relationship,
              contactPriority,
              isDeleted: false,
            })
          }
        }

        if (rec.sacraments) {
          for (const sacrament of rec.sacraments) {
            await ctx.db.insert('studentSacraments', {
              studentId,
              ...sacrament,
              isDeleted: false,
            })
          }
        }

        results.push({ index: i, status: 'ok', id: studentId })
      } catch (e) {
        results.push({ index: i, status: 'error', error: String(e) })
      }
    }

    return results
  },
})

export const internalBulkImportCatechistsBatch = internalMutation({
  args: {
    requesterId: v.id('catechists'),
    records: v.array(
      v.object({
        fullName: v.string(),
        saintName: v.optional(v.string()),
        dateOfBirth: v.optional(v.string()),
        gender: v.optional(v.union(v.literal('male'), v.literal('female'))),
        joinedDate: v.optional(v.string()),
        title: v.optional(v.string()),
        community: v.optional(v.string()),
        level: v.optional(v.string()),
        notes: v.optional(v.string()),
        phone: v.optional(v.string()),
        email: v.optional(v.string()),
        memberId: v.string(),
        passwordHash: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await assertAdminRole(ctx, args.requesterId)

    const results: Array<ImportRowResult> = []

    for (let i = 0; i < args.records.length; i++) {
      const rec = args.records[i]
      try {
        const { phone, email, memberId, passwordHash, ...catechistFields } = rec

        const catechistId = await ctx.db.insert('catechists', {
          ...catechistFields,
          memberId,
          role: 'user',
          isActive: true,
          isDeleted: false,
        })

        const loginId = getCatechistLoginId(memberId)
        await ctx.db.insert('accounts', {
          loginId,
          passwordHash,
          accountType: 'catechist',
          userRefId: catechistId,
          mustChangePassword: true,
          isActive: true,
          createdAt: Date.now(),
          isDeleted: false,
        })

        if (phone) {
          await ctx.db.insert('catechistContacts', {
            catechistId,
            label: 'Phone',
            contactType: 'phone',
            value: normalizeToE164(phone, CATECHIST_ERRORS.INVALID_PHONE),
            isPrimary: true,
            isDeleted: false,
          })
        }

        if (email) {
          await ctx.db.insert('catechistContacts', {
            catechistId,
            label: 'Email',
            contactType: 'email',
            value: email,
            isPrimary: !phone,
            isDeleted: false,
          })
        }

        results.push({ index: i, status: 'ok', id: catechistId })
      } catch (e) {
        results.push({ index: i, status: 'error', error: String(e) })
      }
    }

    return results
  },
})

export const bulkImportStudents = action({
  args: {
    requesterId: v.id('catechists'),
    classYearId: v.optional(v.id('classYears')),
    records: v.array(
      v.object({
        fullName: v.string(),
        saintName: v.optional(v.string()),
        dateOfBirth: v.optional(v.string()),
        gender: v.optional(v.union(v.literal('male'), v.literal('female'))),
        previousParish: v.optional(v.string()),
        previousDiocese: v.optional(v.string()),
        fullAddress: v.optional(v.string()),
        isActive: v.optional(v.boolean()),
        guardians: v.optional(
          v.array(
            v.object({
              fullName: v.string(),
              saintName: v.optional(v.string()),
              relationship: v.string(),
              contacts: v.array(
                v.object({
                  type: v.union(
                    v.literal('phone'),
                    v.literal('email'),
                    v.literal('zalo'),
                    v.literal('other'),
                  ),
                  value: v.string(),
                }),
              ),
            }),
          ),
        ),
        sacraments: v.optional(v.array(sacramentRecordValidator)),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const results: Array<ImportRowResult> = []
    for (let i = 0; i < args.records.length; i += BATCH_SIZE) {
      const batch = args.records.slice(i, i + BATCH_SIZE)
      const seqs: Array<number> = await ctx.runMutation(
        internal.csvImport.internalReserveCounters,
        { requesterId: args.requesterId, name: 'student', count: batch.length },
      )
      const preparedBatch = batch.map((rec, j) => {
        const studentCode = String(seqs[j])
        return {
          ...rec,
          studentCode,
          passwordHash: hashPassword(getStudentLoginId(studentCode)),
        }
      })
      const batchResults: Array<ImportRowResult> = await ctx.runMutation(
        internal.csvImport.internalBulkImportStudentsBatch,
        {
          requesterId: args.requesterId,
          classYearId: args.classYearId,
          records: preparedBatch,
        },
      )
      for (const r of batchResults) {
        results.push({ ...r, index: i + r.index })
      }
    }
    return results
  },
})

export const bulkImportCatechists = action({
  args: {
    requesterId: v.id('catechists'),
    records: v.array(
      v.object({
        fullName: v.string(),
        saintName: v.optional(v.string()),
        dateOfBirth: v.optional(v.string()),
        gender: v.optional(v.union(v.literal('male'), v.literal('female'))),
        joinedDate: v.optional(v.string()),
        title: v.optional(v.string()),
        community: v.optional(v.string()),
        level: v.optional(v.string()),
        notes: v.optional(v.string()),
        phone: v.optional(v.string()),
        email: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const results: Array<ImportRowResult> = []
    for (let i = 0; i < args.records.length; i += BATCH_SIZE) {
      const batch = args.records.slice(i, i + BATCH_SIZE)
      const seqs: Array<number> = await ctx.runMutation(
        internal.csvImport.internalReserveCounters,
        {
          requesterId: args.requesterId,
          name: 'catechist',
          count: batch.length,
        },
      )
      const preparedBatch = batch.map((rec, j) => {
        const memberId = String(seqs[j])
        return {
          ...rec,
          memberId,
          passwordHash: hashPassword(getCatechistLoginId(memberId)),
        }
      })
      const batchResults: Array<ImportRowResult> = await ctx.runMutation(
        internal.csvImport.internalBulkImportCatechistsBatch,
        { requesterId: args.requesterId, records: preparedBatch },
      )
      for (const r of batchResults) {
        results.push({ ...r, index: i + r.index })
      }
    }
    return results
  },
})

export const checkDuplicates = query({
  args: {
    requesterId: v.id('catechists'),
    target: v.union(v.literal('students'), v.literal('catechists')),
    names: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await assertAdminRole(ctx, args.requesterId)

    const nameSet = new Set(args.names.map((n) => n.toLowerCase()))

    if (args.target === 'students') {
      const all = await ctx.db
        .query('students')
        .withIndex('by_is_deleted', (q) => q.eq('isDeleted', false))
        .collect()
      return all
        .filter((r) => nameSet.has(r.fullName.toLowerCase()))
        .map((r) => ({ id: r._id, fullName: r.fullName }))
    }

    const all = await ctx.db
      .query('catechists')
      .withIndex('by_is_deleted', (q) => q.eq('isDeleted', false))
      .collect()
    return all
      .filter((r) => nameSet.has(r.fullName.toLowerCase()))
      .map((r) => ({ id: r._id, fullName: r.fullName }))
  },
})
