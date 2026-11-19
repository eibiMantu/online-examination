'use strict';
/* ==================================================================
   Supabase relational tables for the app's collections.
   Each collection the app stores as a list gets its own table:
     id        text primary key   (the record's natural key)
     position  integer            (order of the record in the list)
     ...typed columns             (for browsing, filtering and reports)
     data      jsonb              (the full record, exactly as the app stores it)
     updated_at timestamptz
   Hydration rebuilds each list from `data` ordered by `position`, so the
   app gets back exactly what it wrote. Everything not listed here (single
   settings objects, UI state) stays in app_collections.
   The SQL migration is generated from this same definition
   (scripts/generate-supabase-tables-sql.js).
   ================================================================== */
const text = value => value == null || value === '' ? null : String(value);
const num = value => { const n = Number(value); return value === '' || value == null || !Number.isFinite(n) ? null : n; };
const int = value => { const n = num(value); return n == null ? null : Math.trunc(n); };
const bool = value => value == null ? null : Boolean(value);
const time = value => { if (!value) return null; const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };
const list = value => Array.isArray(value) ? value.map(String) : null;

// name: SQL type, value: record => column value
const TABLES = {
  users: { table: 'users', key: r => r.username, columns: { role: ['text', r => text(r.role)], first_name: ['text', r => text(r.first)], last_name: ['text', r => text(r.last)], status: ['text', r => text(r.status || r.lifecycleStatus)], college: ['text', r => text(r.college)] }, index: ['role'] },
  students: { table: 'students', key: r => r.id, columns: { first_name: ['text', r => text(r.first)], last_name: ['text', r => text(r.last)], section_ids: ['text[]', r => list(r.sections)] } },
  faculty: { table: 'faculty', key: r => r.id, columns: { first_name: ['text', r => text(r.first)], last_name: ['text', r => text(r.last)] } },
  coordinators: { table: 'coordinators', key: r => r.id || r.username, columns: { username: ['text', r => text(r.username)], first_name: ['text', r => text(r.first)], last_name: ['text', r => text(r.last)], status: ['text', r => text(r.status)], college: ['text', r => text(r.college)] } },
  subjects: { table: 'subjects', key: r => r.code, columns: { name: ['text', r => text(r.name)], units: ['numeric', r => num(r.units)], program: ['text', r => text(r.program)], year_level: ['integer', r => int(r.yearLevel)], term: ['text', r => text(r.term)] } },
  sections: { table: 'sections', key: r => r.id, columns: { name: ['text', r => text(r.name)], program: ['text', r => text(r.program)], year_level: ['integer', r => int(r.yearLevel)], section_number: ['integer', r => int(r.sectionNumber)], capacity: ['integer', r => int(r.capacity)] }, index: ['program'] },
  curricula: { table: 'curricula', key: r => [r.curriculumId, r.yearLevel, r.term, r.subjectCode].join('|'), columns: { curriculum_id: ['text', r => text(r.curriculumId)], program: ['text', r => text(r.program)], year_level: ['integer', r => int(r.yearLevel)], term: ['text', r => text(r.term)], subject_code: ['text', r => text(r.subjectCode)], subject_name: ['text', r => text(r.subjectName)], units: ['numeric', r => num(r.units)] }, index: ['program', 'subject_code'] },
  sectionSubjects: { table: 'section_offerings', key: r => r.sectionId, columns: { offering_count: ['integer', r => Array.isArray(r.assignments) ? r.assignments.length : 0] } },
  subjectAssignments: { table: 'subject_assignments', key: r => r.subjectCode, columns: { faculty_ids: ['text[]', r => list(r.facultyIds)] } },
  academicPeriods: { table: 'academic_periods', key: r => r.id, columns: { school_year: ['text', r => text(r.schoolYear)], term: ['text', r => text(r.term)], status: ['text', r => text(r.status)], start_date: ['text', r => text(r.startDate)], end_date: ['text', r => text(r.endDate)] } },
  exams: { table: 'exams', key: r => r.id, columns: { title: ['text', r => text(r.title)], subject_code: ['text', r => text(r.subjectCode)], faculty_id: ['text', r => text(r.facultyId)], status: ['text', r => text(r.status)], exam_date: ['text', r => text(r.date)], start_time: ['text', r => text(r.start)], end_time: ['text', r => text(r.end)], academic_period_id: ['text', r => text(r.academicPeriodId)] }, index: ['subject_code', 'faculty_id'] },
  questions: { table: 'questions', key: r => r.id, columns: { exam_id: ['text', r => text(r.examId)], type: ['text', r => text(r.type)], points: ['numeric', r => num(r.points)], question_text: ['text', r => text(r.text)] }, index: ['exam_id'] },
  studentSubmissions: { table: 'student_submissions', key: r => r.id, columns: { exam_id: ['text', r => text(r.examId)], student_id: ['text', r => text(r.studentId)], score: ['numeric', r => num(r.score)], total: ['numeric', r => num(r.total)], submitted_at: ['timestamptz', r => time(r.submittedAt)], academic_period_id: ['text', r => text(r.academicPeriodId)] }, index: ['exam_id', 'student_id'] },
  studentEnrollments: { table: 'student_enrollments', key: r => r.id, columns: { student_id: ['text', r => text(r.studentId)], section_id: ['text', r => text(r.sectionId)], offering_id: ['text', r => text(r.offeringId)], subject_code: ['text', r => text(r.subjectCode)] }, index: ['student_id', 'section_id', 'subject_code'] },
  applicationAuditLog: { table: 'audit_log', key: r => r.id, columns: { at: ['timestamptz', r => time(r.at)], actor_id: ['text', r => text(r.actorId)], actor_role: ['text', r => text(r.actorRole)], action: ['text', r => text(r.action)], category: ['text', r => text(r.category)], entity_type: ['text', r => text(r.entityType)], entity_id: ['text', r => text(r.entityId)], result: ['text', r => text(r.result)] }, index: ['at', 'actor_id'] },
  approvalRequests: { table: 'approval_requests', key: r => r.id, columns: { type: ['text', r => text(r.type)], status: ['text', r => text(r.status)], requester_id: ['text', r => text(r.requesterId)], target_id: ['text', r => text(r.targetId)], submitted_at: ['timestamptz', r => time(r.submittedAt || r.createdAt)] }, index: ['status'] },
  questionReports: { table: 'question_reports', key: r => r.id, columns: { exam_id: ['text', r => text(r.examId)], question_id: ['text', r => text(r.questionId)], student_id: ['text', r => text(r.studentId)], status: ['text', r => text(r.status)], category: ['text', r => text(r.category)], created_at: ['timestamptz', r => time(r.createdAt)] } },
  subjectWorkspaceContent: { table: 'lesson_content', key: r => r.id, columns: { subject_code: ['text', r => text(r.subjectCode)], week: ['integer', r => int(r.week)], type: ['text', r => text(r.type)], title: ['text', r => text(r.title)] }, index: ['subject_code'] },
  subjectContentViews: { table: 'lesson_views', key: r => `${r.studentId}|${r.blockId}`, columns: { student_id: ['text', r => text(r.studentId)], block_id: ['text', r => text(r.blockId)], viewed_at: ['timestamptz', r => time(r.viewedAt)], completed_at: ['timestamptz', r => time(r.completedAt)] }, index: ['student_id'] },
  adminAnnouncements: { table: 'announcements', key: r => r.id, columns: { title: ['text', r => text(r.title)], audience: ['text', r => text(r.audience)], created_at: ['timestamptz', r => time(r.createdAt)] } },
  studentEmails: { table: 'student_emails', key: r => r.id, columns: { student_id: ['text', r => text(r.studentId)], faculty_id: ['text', r => text(r.facultyId)], subject: ['text', r => text(r.subject)], sent_at: ['timestamptz', r => time(r.sentAt)], is_read: ['boolean', r => bool(r.read)] } },
  studentNotifications: { table: 'student_notifications', key: r => r.id, columns: { student_id: ['text', r => text(r.studentId)], is_read: ['boolean', r => bool(r.read)], created_at: ['timestamptz', r => time(r.createdAt)] } }
};

/* Turns a list into table rows. Keys are made unique (a repeated key gets
   "#2", "#3"…) and records without a key fall back to their position, so a
   bad record can never block the sync of the rest. */
function rowsFor(collection, items) {
  const spec = TABLES[collection], seen = new Map();
  return (Array.isArray(items) ? items : []).map((item, position) => {
    const record = item && typeof item === 'object' ? item : {};
    let id = record === item ? spec.key(record) : null;
    id = id == null || id === '' ? `#${position}` : String(id);
    const n = (seen.get(id) || 0) + 1; seen.set(id, n); if (n > 1) id = `${id}#${n}`;
    const row = { id, position };
    for (const [column, [, value]] of Object.entries(spec.columns)) { try { row[column] = value(record); } catch (_) { row[column] = null; } }
    row.data = item;
    return row;
  });
}

function createTableSql() {
  const out = ['-- Generated from server/supabase-tables.js — one table per app collection.', '-- Full records live in `data`; typed columns are for browsing and reports.', ''];
  for (const [collection, spec] of Object.entries(TABLES)) {
    const cols = Object.entries(spec.columns).map(([name, [type]]) => `  ${name} ${type},`).join('\n');
    out.push(`create table if not exists public.${spec.table} (\n  id text primary key,\n  position integer not null default 0,\n${cols}\n  data jsonb not null,\n  updated_at timestamptz not null default now()\n);`);
    out.push(`comment on table public.${spec.table} is 'App collection "${collection}". Full record in data; position keeps list order.';`);
    for (const column of spec.index || []) out.push(`create index if not exists ${spec.table}_${column}_idx on public.${spec.table} (${column});`);
    out.push(`alter table public.${spec.table} enable row level security;`);
    out.push(`revoke all on table public.${spec.table} from anon, authenticated;`);
    out.push(`grant select, insert, update, delete on table public.${spec.table} to service_role;`, '');
  }
  return out.join('\n');
}

/* Change tracking for running several server instances: every insert, update
   or delete on a collection table (or a row of app_collections) bumps that
   collection's version. Each instance polls sync_versions and reloads only the
   collections another instance changed. */
function createSyncSql() {
  const out = ['-- Generated from server/supabase-tables.js — change versions for multi-instance sync.', '',
    'create table if not exists public.sync_versions (\n  collection_key text primary key,\n  version bigint not null default 0,\n  updated_at timestamptz not null default now()\n);',
    'alter table public.sync_versions enable row level security;',
    'revoke all on table public.sync_versions from anon, authenticated;',
    'grant select, insert, update, delete on table public.sync_versions to service_role;', '',
    'create or replace function public.bump_sync_version(key text) returns void language sql security definer set search_path = public as $$\n  insert into public.sync_versions (collection_key, version, updated_at) values (key, 1, now())\n  on conflict (collection_key) do update set version = public.sync_versions.version + 1, updated_at = now();\n$$;',
    'create or replace function public.sync_version_table_trigger() returns trigger language plpgsql security definer set search_path = public as $$\nbegin\n  perform public.bump_sync_version(tg_argv[0]);\n  return null;\nend $$;',
    'create or replace function public.sync_version_collection_trigger() returns trigger language plpgsql security definer set search_path = public as $$\nbegin\n  perform public.bump_sync_version(coalesce(new.collection_key, old.collection_key));\n  return null;\nend $$;', ''];
  for (const [collection, { table }] of Object.entries(TABLES)) {
    out.push(`drop trigger if exists ${table}_sync_version on public.${table};`);
    out.push(`create trigger ${table}_sync_version after insert or update or delete on public.${table} for each statement execute function public.sync_version_table_trigger('${collection}');`);
  }
  out.push('drop trigger if exists app_collections_sync_version on public.app_collections;');
  out.push('create trigger app_collections_sync_version after insert or update or delete on public.app_collections for each row execute function public.sync_version_collection_trigger();', '');
  return out.join('\n');
}

module.exports = { TABLES, rowsFor, createTableSql, createSyncSql };
