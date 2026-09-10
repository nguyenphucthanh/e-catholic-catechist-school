import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import { classTypeValidator } from './lib/classTypes'

export default defineSchema({
  // ─── 7.1 Core Organization ────────────────────────────────────────────────

  /**
   * Branch (Ngành) — 6 fixed branches, seeded at setup.
   * e.g. Chiên Con, Ấu Nhi, Thiếu Nhi, Nghĩa Sĩ, Hiệp Sĩ, Dự Trưởng
   */
  branches: defineTable({
    name: v.string(),
    sortOrder: v.number(), // 1 = Chiên Con … 6 = Dự Trưởng; must be unique per application layer
    description: v.optional(v.string()),
    isDeleted: v.boolean(), // soft delete — never hard-delete, preserves relationships
  })
    .index('by_name', ['name'])
    .index('by_sort_order', ['sortOrder'])
    .index('by_is_deleted', ['isDeleted']),

  /**
   * AcademicYear (Năm Học)
   * Only one year may be active at a time (enforced at application layer).
   */
  academicYears: defineTable({
    name: v.string(), // e.g. "2024-2025"; unique per application layer
    startDate: v.string(), // ISO date string YYYY-MM-DD
    endDate: v.string(), // ISO date string YYYY-MM-DD
    timezone: v.string(), // IANA timezone, e.g. "Asia/Ho_Chi_Minh", "America/Los_Angeles"
    isActive: v.boolean(),
    isDeleted: v.boolean(), // soft delete — never hard-delete, preserves relationships
  })
    .index('by_name', ['name'])
    .index('by_is_deleted', ['isDeleted'])
    .index('by_start_date', ['startDate']),

  /**
   * Semester (Học Kỳ)
   * semester_number 1–4 allowed, set once at academic year creation, immutable (enforced at application layer).
   * Unique on (academicYearId, semesterNumber).
   */
  semesters: defineTable({
    academicYearId: v.id('academicYears'),
    semesterNumber: v.number(), // 1–4 allowed, set at academic year creation, immutable
    name: v.optional(v.string()), // e.g. "Học Kỳ 1"
    isDeleted: v.boolean(), // soft delete — never hard-delete, preserves relationships
  })
    .index('by_academic_year_id_and_semester_number', [
      'academicYearId',
      'semesterNumber',
    ])
    .index('by_is_deleted', ['isDeleted']),

  /**
   * Class (Lớp) — year-agnostic template.
   * e.g. "Ấu Nhi 1". Gets a new ClassYear each academic year.
   */
  classes: defineTable({
    branchId: v.id('branches'),
    name: v.string(), // e.g. "Ấu Nhi 1"
    description: v.optional(v.string()),
    isDeleted: v.boolean(), // soft delete — never hard-delete, preserves relationships
  })
    .index('by_is_deleted', ['isDeleted'])
    .index('by_branch_id', ['branchId']),

  /**
   * ClassYear (Lớp × Năm Học) — live instance for a given year.
   * Central anchor for attendance, enrollments, and grading.
   * Unique on (classId, academicYearId).
   */
  classYears: defineTable({
    classId: v.id('classes'),
    academicYearId: v.id('academicYears'),
    // default 'primary' applied at application layer; optional here since
    // existing rows may predate this field
    classType: v.optional(classTypeValidator),
    isDeleted: v.boolean(), // soft delete — never hard-delete, preserves relationships
  })
    .index('by_academic_year_id', ['academicYearId'])
    .index('by_class_id', ['classId'])
    .index('by_class_id_and_academic_year_id', ['classId', 'academicYearId'])
    .index('by_is_deleted', ['isDeleted']),

  // ─── 7.2 Catechists (Giáo Lý Viên) ───────────────────────────────────────

  /**
   * Catechist
   * memberId is the login identifier, derived from the document _id at the
   * UI layer (zero-padded). Unique per application layer.
   */
  catechists: defineTable({
    memberId: v.string(), // login identifier; unique per application layer
    tokenIdentifier: v.optional(v.string()), // auth provider stable ID; for enrollment eligibility checks
    fullName: v.string(),
    saintName: v.optional(v.string()), // Tên Thánh
    dateOfBirth: v.optional(v.string()), // ISO date string YYYY-MM-DD
    gender: v.optional(v.union(v.literal('male'), v.literal('female'))),
    role: v.union(v.literal('admin'), v.literal('user')),
    isActive: v.boolean(),
    joinedDate: v.optional(v.string()), // ISO date string YYYY-MM-DD
    notes: v.optional(v.string()),
    title: v.optional(v.string()),
    community: v.optional(v.string()),
    level: v.optional(v.string()),
    profilePhotoStorageId: v.optional(v.id('_storage')),
    isDeleted: v.boolean(), // soft delete — never hard-delete, preserves relationships
  })
    .index('by_member_id', ['memberId'])
    .index('by_token_identifier', ['tokenIdentifier'])
    .index('by_is_deleted', ['isDeleted'])
    .index('by_role_and_is_deleted', ['role', 'isDeleted'])
    .searchIndex('search_full_name', {
      searchField: 'fullName',
      filterFields: ['isDeleted'],
    }),

  /**
   * CatechistAddress — 1-to-1 with Catechist.
   * Supports Vietnam and overseas address formats.
   * Unique on catechistId per application layer.
   */
  catechistAddresses: defineTable({
    catechistId: v.id('catechists'),
    country: v.string(), // ISO 3166-1 alpha-2, e.g. "VN", "US", "AU", "CA"
    addressLine1: v.optional(v.string()),
    addressLine2: v.optional(v.string()),
    city: v.optional(v.string()),
    stateProvince: v.optional(v.string()), // Tỉnh (VN) / State (US, AU) / Province (CA)
    postalCode: v.optional(v.string()),
    hamlet: v.optional(v.string()), // Giáo Họ — VN context
    subHamlet: v.optional(v.string()), // Giáo Xóm — VN context
    isDeleted: v.boolean(), // soft delete — never hard-delete, preserves relationships
  })
    .index('by_catechist_id', ['catechistId'])
    .index('by_is_deleted', ['isDeleted']),

  /**
   * CatechistContact — phone / email / zalo entries per catechist.
   * Phone values must be E.164 format: +[country_code][number]
   */
  catechistContacts: defineTable({
    catechistId: v.id('catechists'),
    label: v.string(), // e.g. "Personal Phone", "Zalo"
    contactType: v.union(
      v.literal('phone'),
      v.literal('email'),
      v.literal('zalo'),
      v.literal('other'),
    ),
    value: v.string(), // E.164 for phone: +84901234567
    isPrimary: v.boolean(),
    notes: v.optional(v.string()),
    isDeleted: v.boolean(), // soft delete — never hard-delete, preserves relationships
  })
    .index('by_catechist_id', ['catechistId'])
    .index('by_is_deleted', ['isDeleted']),

  /**
   * AcademicYearAssignment — board_member per academic year.
   * Unique: (academicYearId, catechistId).
   */
  academicYearAssignments: defineTable({
    academicYearId: v.id('academicYears'),
    catechistId: v.id('catechists'),
    assignmentType: v.literal('board_member'),
    isDeleted: v.boolean(),
  })
    .index('by_academic_year_id', ['academicYearId'])
    .index('by_catechist_id', ['catechistId'])
    .index('by_academic_year_id_and_catechist_id', [
      'academicYearId',
      'catechistId',
    ])
    .index('by_is_deleted', ['isDeleted']),

  /**
   * BranchAssignment — branch_head per branch per academic year.
   * One catechist may head multiple branches in same AY.
   * Unique: (academicYearId, catechistId, branchId).
   */
  branchAssignments: defineTable({
    academicYearId: v.id('academicYears'),
    catechistId: v.id('catechists'),
    branchId: v.id('branches'),
    isDeleted: v.boolean(),
  })
    .index('by_academic_year_id', ['academicYearId'])
    .index('by_catechist_id', ['catechistId'])
    .index('by_branch_id', ['branchId'])
    .index('by_academic_year_id_and_branch_id', ['academicYearId', 'branchId'])
    .index('by_academic_year_id_and_catechist_id_and_branch_id', [
      'academicYearId',
      'catechistId',
      'branchId',
    ])
    .index('by_is_deleted', ['isDeleted']),

  /**
   * ClassCatechist — teaching assignment per class per AY.
   * Replaces catechistClasses with explicit academicYearId.
   * Unique: (catechistId, classYearId).
   */
  classCatechists: defineTable({
    catechistId: v.id('catechists'),
    classYearId: v.id('classYears'),
    academicYearId: v.id('academicYears'),
    role: v.union(v.literal('homeroom'), v.literal('co_teacher')),
    isDeleted: v.boolean(),
  })
    .index('by_catechist_id', ['catechistId'])
    .index('by_class_year_id', ['classYearId'])
    .index('by_academic_year_id', ['academicYearId'])
    .index('by_catechist_id_and_class_year_id', ['catechistId', 'classYearId'])
    .index('by_is_deleted', ['isDeleted']),

  // ─── 7.3 Students (Học Sinh) ──────────────────────────────────────────────

  /**
   * Student
   * studentCode is the parent-login identifier, derived from _id at UI layer.
   * createdAt is immutable (set once on creation, Unix ms).
   */
  students: defineTable({
    studentCode: v.string(), // login identifier for parent; unique per application layer
    tokenIdentifier: v.optional(v.string()), // auth provider stable ID; for enrollment eligibility checks
    fullName: v.string(),
    saintName: v.optional(v.string()), // Tên Thánh
    dateOfBirth: v.optional(v.string()), // ISO date string YYYY-MM-DD; also default password DDMMYYYY
    gender: v.optional(v.union(v.literal('male'), v.literal('female'))),
    previousParish: v.optional(v.string()), // Giáo xứ cũ
    previousDiocese: v.optional(v.string()), // Giáo phận cũ
    isActive: v.boolean(),
    createdAt: v.number(), // Unix ms; immutable
    profilePhotoStorageId: v.optional(v.id('_storage')),
    isDeleted: v.boolean(), // soft delete — never hard-delete, preserves relationships
  })
    .index('by_student_code', ['studentCode'])
    .index('by_token_identifier', ['tokenIdentifier'])
    .index('by_is_active', ['isActive'])
    .index('by_is_deleted', ['isDeleted'])
    .searchIndex('search_full_name', {
      searchField: 'fullName',
      filterFields: ['isDeleted'],
    }),

  /**
   * StudentAddress — 1-to-1 with Student.
   * Unique on studentId per application layer.
   */
  studentAddresses: defineTable({
    studentId: v.id('students'),
    country: v.string(), // ISO 3166-1 alpha-2
    fullAddress: v.optional(v.string()), // raw address string, used when address cannot be parsed into structured fields (e.g. CSV import)
    addressLine1: v.optional(v.string()),
    addressLine2: v.optional(v.string()),
    city: v.optional(v.string()),
    stateProvince: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    hamlet: v.optional(v.string()), // Giáo Họ
    subHamlet: v.optional(v.string()), // Giáo Xóm
    isDeleted: v.boolean(), // soft delete — never hard-delete, preserves relationships
  })
    .index('by_student_id', ['studentId'])
    .index('by_is_deleted', ['isDeleted']),

  /**
   * Guardian (Phụ Huynh / Người Bảo Hộ) — independent entity.
   * One Guardian record per adult, shared across sibling students via StudentGuardian.
   */
  guardians: defineTable({
    fullName: v.string(),
    saintName: v.optional(v.string()), // Tên Thánh
    notes: v.optional(v.string()),
    isDeleted: v.boolean(), // soft delete — never hard-delete, preserves relationships
  }).index('by_is_deleted', ['isDeleted']),

  /**
   * GuardianContact — contact entries attached to the Guardian, not the Student.
   * Updating a number here propagates to all linked children automatically.
   * Phone values must be E.164: +[country_code][number]
   * Indexed on value for phone-number lookup flow.
   */
  guardianContacts: defineTable({
    guardianId: v.id('guardians'),
    contactType: v.union(
      v.literal('phone'),
      v.literal('email'),
      v.literal('zalo'),
      v.literal('other'),
    ),
    value: v.string(), // E.164 for phone; indexed for lookup
    isPrimary: v.boolean(),
    notes: v.optional(v.string()), // e.g. "Call after 5pm"
    isDeleted: v.boolean(), // soft delete — never hard-delete, preserves relationships
  })
    .index('by_guardian_id', ['guardianId'])
    .index('by_value', ['value'])
    .index('by_is_deleted', ['isDeleted']),

  /**
   * StudentGuardian — many-to-many link between Student and Guardian.
   * Enables sibling families and ordered emergency contact lists.
   * Unique on (studentId, guardianId).
   * Unique on (studentId, contactPriority) — no duplicate priority per student.
   */
  studentGuardians: defineTable({
    studentId: v.id('students'),
    guardianId: v.id('guardians'),
    relationship: v.string(), // "father" / "mother" / "guardian" / free text
    contactPriority: v.number(), // 1 = first to contact; unique per studentId
    notes: v.optional(v.string()), // e.g. "custody: weekdays only"
    isDeleted: v.boolean(), // soft delete — never hard-delete, preserves relationships
  })
    .index('by_student_id', ['studentId'])
    .index('by_guardian_id', ['guardianId'])
    .index('by_student_id_and_guardian_id', ['studentId', 'guardianId'])
    .index('by_student_id_and_contact_priority', [
      'studentId',
      'contactPriority',
    ])
    .index('by_is_deleted', ['isDeleted']),

  /**
   * StudentSacrament — one row per sacrament per student. Max 4 rows.
   * Unique on (studentId, sacramentType).
   */
  studentSacraments: defineTable({
    studentId: v.id('students'),
    sacramentType: v.union(
      v.literal('baptism'),
      v.literal('first_confession'),
      v.literal('first_communion'),
      v.literal('confirmation'),
    ),
    receivedDate: v.optional(v.string()), // ISO date string YYYY-MM-DD
    receivedPlace: v.optional(v.string()), // free text: church name, parish
    feastName: v.optional(v.string()), // saint name chosen for sacrament (baptism, confirmation)
    sponsorName: v.optional(v.string()), // godparent/sponsor free text name (baptism, confirmation)
    notes: v.optional(v.string()),
    isDeleted: v.boolean(), // soft delete — never hard-delete, preserves relationships
  })
    .index('by_student_id', ['studentId'])
    .index('by_student_id_and_sacrament_type', ['studentId', 'sacramentType'])
    .index('by_is_deleted', ['isDeleted']),

  /**
   * StudentClass — Enrollment Record.
   * Exactly one primary class per student per academic year (enforced at application layer).
   * Unique on (studentId, classYearId).
   */
  studentClasses: defineTable({
    studentId: v.id('students'),
    classYearId: v.id('classYears'),
    isPrimaryClass: v.boolean(), // true = primary; exactly one per student per year
    enrolledDate: v.string(), // ISO date string YYYY-MM-DD
    status: v.union(
      v.literal('active'),
      v.literal('on_leave'),
      v.literal('withdrawn'),
    ),
    statusChangedDate: v.optional(v.string()), // ISO date string YYYY-MM-DD
    leftDate: v.optional(v.string()), // ISO date string; set only when status = withdrawn
    isDeleted: v.boolean(), // soft delete — never hard-delete, preserves relationships
  })
    .index('by_student_id', ['studentId'])
    .index('by_class_year_id', ['classYearId'])
    .index('by_student_id_and_class_year_id', ['studentId', 'classYearId'])
    .index('by_student_id_and_is_primary_class', [
      'studentId',
      'isPrimaryClass',
    ])
    .index('by_status', ['status'])
    .index('by_is_deleted', ['isDeleted']),

  // ─── 7.4 Attendance ───────────────────────────────────────────────────────

  /**
   * ClassSession (Buổi Học) — one scheduled meeting.
   * Cancelled sessions (isCancelled = true) are excluded from attendance counts.
   *
   * Two scopes, by sessionType:
   * - class-scoped (catechism, supplemental): classYearId + semesterId required.
   *   Attendance is displayed as raw counts per student per semester.
   * - parish-scoped (mass, extracurricular): classYearId + semesterId are null —
   *   one row per date for the whole parish, not per class. academicYearId is set
   *   instead. Tracked separately for campaign reporting (e.g. mass_attendance_count).
   */
  classSessions: defineTable({
    classYearId: v.optional(v.id('classYears')), // required for catechism/supplemental; null for mass/extracurricular
    semesterId: v.optional(v.id('semesters')), // required for catechism/supplemental; null for mass/extracurricular
    academicYearId: v.optional(v.id('academicYears')), // set for mass/extracurricular only
    sessionDate: v.string(), // ISO date string YYYY-MM-DD
    sessionType: v.union(
      v.literal('mass'),
      v.literal('catechism'),
      v.literal('supplemental'),
      v.literal('extracurricular'),
    ),
    isCancelled: v.boolean(),
    notes: v.optional(v.string()),
    isDeleted: v.boolean(), // soft delete — never hard-delete, preserves relationships
  })
    .index('by_class_year_id_and_semester_id', ['classYearId', 'semesterId'])
    .index('by_session_date', ['sessionDate'])
    .index('by_session_type_and_session_date', ['sessionType', 'sessionDate'])
    .index('by_is_deleted', ['isDeleted']),

  /**
   * AttendanceRecord (Điểm Danh) — one record per student per session.
   * studentClassId always points at the student's *primary* StudentClass for the
   * relevant academic year — for class-scoped sessions that's the obvious class;
   * for parish-scoped sessions (mass, extracurricular) the session itself has no
   * class, so the mutation resolves studentClassId via the student's primary
   * enrollment instead.
   * Two timestamps support offline-first QR scanning.
   * deviceQueuedAt: actual moment of scan on device — source of truth for presence.
   * syncedAt: server-side receipt time; null means not yet synced.
   * Unique on (sessionId, studentClassId) — first-write-wins on conflict.
   */
  attendanceRecords: defineTable({
    sessionId: v.id('classSessions'),
    studentClassId: v.id('studentClasses'),
    status: v.union(
      v.literal('present'),
      v.literal('excused_absence'),
      v.literal('unexcused_absence'),
      v.literal('late'),
    ),
    notes: v.optional(v.string()),
    recordedBy: v.id('catechists'),
    deviceQueuedAt: v.number(), // Unix ms; immutable; source of truth
    syncedAt: v.optional(v.number()), // Unix ms; null = not yet synced
    isDeleted: v.boolean(), // soft delete — never hard-delete, preserves relationships
  })
    .index('by_session_id', ['sessionId'])
    .index('by_student_class_id', ['studentClassId'])
    .index('by_session_id_and_student_class_id', [
      'sessionId',
      'studentClassId',
    ])
    .index('by_synced_at', ['syncedAt'])
    .index('by_is_deleted', ['isDeleted']),

  // ─── 7.5 Grading ──────────────────────────────────────────────────────────

  /**
   * ScoreColumn — grade column configuration per class per semester.
   * semester_exam is NOT auto-seeded — a homeroom teacher adds it (or any other
   * column) only when they actually hold that exam; a semester can end with zero,
   * one, or several semester_exam columns.
   */
  scoreColumns: defineTable({
    classYearId: v.id('classYears'),
    semesterId: v.id('semesters'),
    columnName: v.string(), // e.g. "15-min Quiz 1", "Semester Exam"
    columnType: v.string(), // e.g. 'short_quiz', 'midterm_test', 'semester_exam', or any custom label
    scaleType: v.optional(
      // default applied at application layer
      v.union(
        v.literal('scale_10'), // 0.00-10.00
        v.literal('pass_fail'),
        v.literal('letter_af'),
      ),
    ),
    weight: v.optional(v.number()), // 1-3, default 1; validated at application layer; used for weighted semester avg
    examDate: v.optional(v.string()), // ISO date string YYYY-MM-DD; date the exam was held
    sortOrder: v.number(),
    isDeleted: v.boolean(), // soft delete — never hard-delete, preserves relationships
  })
    .index('by_class_year_id_and_semester_id', ['classYearId', 'semesterId'])
    .index('by_is_deleted', ['isDeleted']),

  /**
   * ScoreEntry — one score per student per column.
   * Only for short_quiz, midterm_test, semester_exam.
   * Unique on (studentClassId, scoreColumnId).
   * Exactly one of scoreValue / scoreLabel is set, matching the parent
   * column's scaleType.
   */
  scoreEntries: defineTable({
    studentClassId: v.id('studentClasses'),
    scoreColumnId: v.id('scoreColumns'),
    scoreValue: v.optional(v.number()), // 0.00 – 10.00; set when column.scaleType = scale_10
    scoreLabel: v.optional(v.string()), // set when column.scaleType is pass_fail / letter_af; app-validated
    enteredBy: v.id('catechists'),
    enteredAt: v.number(), // Unix ms
    updatedAt: v.optional(v.number()), // Unix ms
    isDeleted: v.boolean(), // soft delete — never hard-delete, preserves relationships
  })
    .index('by_student_class_id', ['studentClassId'])
    .index('by_score_column_id', ['scoreColumnId'])
    .index('by_student_class_id_and_score_column_id', [
      'studentClassId',
      'scoreColumnId',
    ])
    .index('by_is_deleted', ['isDeleted']),

  /**
   * ScoreEntryHistory — append-only audit trail.
   * One row per modification to any ScoreEntry. Immutable after write.
   * No isDeleted — audit trail rows are never deleted, soft or hard.
   */
  scoreEntryHistories: defineTable({
    scoreEntryId: v.id('scoreEntries'),
    oldScoreValue: v.optional(v.number()), // null on initial entry or when scale is not scale_10
    newScoreValue: v.optional(v.number()),
    oldScoreLabel: v.optional(v.string()),
    newScoreLabel: v.optional(v.string()),
    changedBy: v.id('catechists'),
    changedAt: v.number(), // Unix ms; immutable
    reason: v.optional(v.string()),
  }).index('by_score_entry_id', ['scoreEntryId']),

  /**
   * SemesterResult — per-semester evaluation, one per student per class
   * enrollment per semester. Stores the homeroom teacher's qualitative
   * assessment, visible to students and parents.
   * Unique on (studentClassId, semesterId).
   */
  semesterResults: defineTable({
    studentClassId: v.id('studentClasses'),
    semesterId: v.id('semesters'),
    morality: v.optional(
      v.union(
        v.literal('excellent'),
        v.literal('good'),
        v.literal('average'),
        v.literal('below_average'),
        v.literal('poor'),
      ),
    ),
    teacherNote: v.optional(v.string()), // homeroom teacher's narrative for the semester
    isCompleted: v.optional(v.boolean()), // true = passed this semester
    recordedBy: v.optional(v.id('catechists')),
    recordedAt: v.optional(v.number()), // Unix ms
    isDeleted: v.boolean(), // soft delete — never hard-delete, preserves relationships
  })
    .index('by_student_class_id_and_semester_id', [
      'studentClassId',
      'semesterId',
    ])
    .index('by_student_class_id', ['studentClassId'])
    .index('by_semester_id', ['semesterId'])
    .index('by_is_deleted', ['isDeleted']),

  /**
   * AnnualResult — end-of-year evaluation, written once per student per class year.
   * conduct is qualitative — not a ScoreColumn.
   * Unique on studentClassId.
   */
  annualResults: defineTable({
    studentClassId: v.id('studentClasses'),
    conductGrade: v.optional(
      v.union(
        v.literal('excellent'),
        v.literal('good'),
        v.literal('average'),
        v.literal('below_average'),
        v.literal('poor'),
      ),
    ),
    remark: v.optional(v.string()), // homeroom teacher's narrative
    isCompleted: v.optional(v.boolean()), // true = passed the year
    recordedBy: v.optional(v.id('catechists')),
    recordedAt: v.optional(v.number()), // Unix ms
    isDeleted: v.boolean(), // soft delete — never hard-delete, preserves relationships
  })
    .index('by_student_class_id', ['studentClassId'])
    .index('by_is_deleted', ['isDeleted']),

  // ─── 7.6 Authentication ───────────────────────────────────────────────────

  /**
   * Account — source of truth for credentials.
   * loginId: catechist → member_id; parent → student's student_code. Unique.
   * userRefId: points to catechists._id or students._id depending on accountType.
   * createdAt is immutable.
   * No email-based reset flow — passwords reset by admin only.
   */
  accounts: defineTable({
    loginId: v.string(), // unique per application layer
    passwordHash: v.string(), // bcrypt or argon2; never plaintext
    accountType: v.union(v.literal('catechist'), v.literal('student')),
    userRefId: v.union(v.id('catechists'), v.id('students')), // polymorphic; type determined by accountType
    isActive: v.boolean(),
    mustChangePassword: v.optional(v.boolean()),
    lastLoginAt: v.optional(v.number()), // Unix ms
    createdAt: v.number(), // Unix ms; immutable
    isDeleted: v.boolean(), // soft delete — never hard-delete, preserves relationships
  })
    .index('by_login_id', ['loginId'])
    .index('by_is_deleted', ['isDeleted']),

  /**
   * ImpersonationLog — append-only audit trail for admin "login as" actions.
   * One row per impersonation start. Immutable after write.
   */
  impersonationLogs: defineTable({
    adminId: v.id('catechists'),
    targetCatechistId: v.id('catechists'),
    at: v.number(), // Unix ms; immutable
  }).index('by_admin_id', ['adminId']),

  /**
   * BreakGlassRecovery — append-only audit log for admin password recovery
   * attempts via the resetAdminPassword mutation (dashboard/ops use only).
   * One row per attempt, success or failure. Never deleted, except a human
   * manually clearing a success row via the dashboard to re-arm recovery.
   */
  breakGlassRecovery: defineTable({
    at: v.number(), // Unix ms
    loginId: v.string(), // the loginId that was attempted
    success: v.boolean(),
  }).index('by_success', ['success']),

  // ─── 7.9 Calendar ─────────────────────────────────────────────────────────

  /**
   * CalendarEvent (Sự Kiện) — board/branch/class-scoped schedule entry.
   * scope determines which of branchId/classYearId is set:
   *   - 'board'  → both null (visible to everyone)
   *   - 'branch' → branchId required, classYearId null
   *   - 'class'  → classYearId required, branchId null
   * description stores serialized Tiptap/ProseMirror JSON, re-parsed client-side.
   */
  calendarEvents: defineTable({
    academicYearId: v.id('academicYears'),
    date: v.string(), // ISO date string YYYY-MM-DD
    endDate: v.optional(v.string()), // inclusive last day; absent = single-day (same as date)
    startTime: v.optional(v.string()), // "HH:mm"; absent = all-day event
    endTime: v.optional(v.string()), // "HH:mm"; set iff startTime set
    liturgicalDate: v.optional(v.string()), // free text, e.g. "Chúa Nhật XVII TN"
    description: v.string(), // serialized Tiptap JSON
    severity: v.union(v.literal('high'), v.literal('medium'), v.literal('low')),
    scope: v.union(v.literal('board'), v.literal('branch'), v.literal('class')),
    branchId: v.optional(v.id('branches')), // required iff scope = 'branch'
    classYearId: v.optional(v.id('classYears')), // required iff scope = 'class'
    createdBy: v.id('catechists'),
    createdAt: v.number(), // Unix ms
    updatedBy: v.optional(v.id('catechists')),
    updatedAt: v.optional(v.number()), // Unix ms
    isDeleted: v.boolean(), // soft delete — never hard-delete, preserves relationships
  })
    .index('by_academic_year_id_and_date', ['academicYearId', 'date'])
    .index('by_branch_id', ['branchId'])
    .index('by_class_year_id', ['classYearId'])
    .index('by_is_deleted', ['isDeleted']),

  // counters — internal sequence generator, not user data. No isDeleted.
  counters: defineTable({
    name: v.string(),
    value: v.number(),
  }).index('by_name', ['name']),

  // appConfig — singleton global application configuration. No isDeleted.
  appConfig: defineTable({
    troopName: v.optional(v.string()), // Tên Đoàn TNTT
    parishName: v.string(),
    dioceseName: v.string(),
    logoStorageId: v.optional(v.id('_storage')),
    nameFormat: v.union(
      v.literal('firstName_lastName'),
      v.literal('lastName_firstName'),
    ),
    // RomCal (Liturgical calendar) options — passed to Romcal constructor
    // optional for backward compat with existing rows; default true applied at query time
    epiphanyOnSunday: v.optional(v.boolean()),
    corpusChristiOnSunday: v.optional(v.boolean()),
    ascensionOnSunday: v.optional(v.boolean()),
  }),

  // ─── 7.10 Extracurricular Programs ────────────────────────────────────────

  /**
   * ExtracurricularProgram — enrichment program tied to academic year.
   * target: 'catechist' (admins/catechists), 'student' (students), 'all' (both)
   * branches: array of branch IDs eligible to enroll
   * fee_required: boolean indicating if program has a fee
   * fee_amount: optional fee amount (required if fee_required = true)
   * max_capacity: optional enrollment limit (null = unlimited)
   * Soft delete enforcement via is_deleted flag.
   */
  extracurricularPrograms: defineTable({
    academicYearId: v.id('academicYears'),
    title: v.string(),
    details: v.string(), // serialized Tiptap JSON
    target: v.union(
      v.literal('catechist'),
      v.literal('student'),
      v.literal('all'),
    ),
    branches: v.array(v.id('branches')), // eligible branches
    inChargeCatechists: v.optional(v.array(v.id('catechists'))), // assigned peer managers
    dateStart: v.string(), // ISO date string YYYY-MM-DD
    dateEnd: v.string(), // ISO date string YYYY-MM-DD
    enrollmentExpireDate: v.string(), // ISO date string YYYY-MM-DD
    feeRequired: v.boolean(),
    feeAmount: v.optional(v.number()), // required if feeRequired = true
    maxCapacity: v.optional(v.number()), // null = unlimited
    links: v.optional(
      v.array(
        v.object({
          type: v.union(v.literal('social'), v.literal('im')),
          label: v.string(),
          url: v.string(),
          forEnrolledOnly: v.boolean(), // true = only shown to userEnrolled=true viewers
        }),
      ),
    ),
    createdBy: v.id('catechists'),
    createdAt: v.number(), // Unix ms
    calendarEventId: v.optional(v.id('calendarEvents')),
    isDeleted: v.boolean(),
  })
    .index('by_academic_year_id', ['academicYearId'])
    .index('by_is_deleted', ['isDeleted'])
    .index('by_date_start', ['dateStart']),

  /**
   * ExtracurricularEnrollment — user enrollment in a program.
   * tokenIdentifier used as stable user key (derived server-side via ctx.auth).
   * Unique constraint on (programId, tokenIdentifier) at application layer.
   * Soft delete via is_deleted flag.
   */
  extracurricularEnrollments: defineTable({
    programId: v.id('extracurricularPrograms'),
    tokenIdentifier: v.string(), // stable user identifier from auth
    createdAt: v.number(), // Unix ms
    isPaid: v.optional(v.boolean()),
    isDeleted: v.boolean(),
  })
    .index('by_program_id', ['programId'])
    .index('by_token_identifier', ['tokenIdentifier'])
    .index('by_program_id_and_token_identifier', [
      'programId',
      'tokenIdentifier',
    ]),
})
