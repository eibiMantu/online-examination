-- Generated from server/supabase-tables.js — one table per app collection.
-- Full records live in `data`; typed columns are for browsing and reports.

create table if not exists public.users (
  id text primary key,
  position integer not null default 0,
  role text,
  first_name text,
  last_name text,
  status text,
  college text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
comment on table public.users is 'App collection "users". Full record in data; position keeps list order.';
create index if not exists users_role_idx on public.users (role);
alter table public.users enable row level security;
revoke all on table public.users from anon, authenticated;
grant select, insert, update, delete on table public.users to service_role;

create table if not exists public.students (
  id text primary key,
  position integer not null default 0,
  first_name text,
  last_name text,
  section_ids text[],
  data jsonb not null,
  updated_at timestamptz not null default now()
);
comment on table public.students is 'App collection "students". Full record in data; position keeps list order.';
alter table public.students enable row level security;
revoke all on table public.students from anon, authenticated;
grant select, insert, update, delete on table public.students to service_role;

create table if not exists public.faculty (
  id text primary key,
  position integer not null default 0,
  first_name text,
  last_name text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
comment on table public.faculty is 'App collection "faculty". Full record in data; position keeps list order.';
alter table public.faculty enable row level security;
revoke all on table public.faculty from anon, authenticated;
grant select, insert, update, delete on table public.faculty to service_role;

create table if not exists public.coordinators (
  id text primary key,
  position integer not null default 0,
  username text,
  first_name text,
  last_name text,
  status text,
  college text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
comment on table public.coordinators is 'App collection "coordinators". Full record in data; position keeps list order.';
alter table public.coordinators enable row level security;
revoke all on table public.coordinators from anon, authenticated;
grant select, insert, update, delete on table public.coordinators to service_role;

create table if not exists public.subjects (
  id text primary key,
  position integer not null default 0,
  name text,
  units numeric,
  program text,
  year_level integer,
  term text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
comment on table public.subjects is 'App collection "subjects". Full record in data; position keeps list order.';
alter table public.subjects enable row level security;
revoke all on table public.subjects from anon, authenticated;
grant select, insert, update, delete on table public.subjects to service_role;

create table if not exists public.sections (
  id text primary key,
  position integer not null default 0,
  name text,
  program text,
  year_level integer,
  section_number integer,
  capacity integer,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
comment on table public.sections is 'App collection "sections". Full record in data; position keeps list order.';
create index if not exists sections_program_idx on public.sections (program);
alter table public.sections enable row level security;
revoke all on table public.sections from anon, authenticated;
grant select, insert, update, delete on table public.sections to service_role;

create table if not exists public.curricula (
  id text primary key,
  position integer not null default 0,
  curriculum_id text,
  program text,
  year_level integer,
  term text,
  subject_code text,
  subject_name text,
  units numeric,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
comment on table public.curricula is 'App collection "curricula". Full record in data; position keeps list order.';
create index if not exists curricula_program_idx on public.curricula (program);
create index if not exists curricula_subject_code_idx on public.curricula (subject_code);
alter table public.curricula enable row level security;
revoke all on table public.curricula from anon, authenticated;
grant select, insert, update, delete on table public.curricula to service_role;

create table if not exists public.section_offerings (
  id text primary key,
  position integer not null default 0,
  offering_count integer,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
comment on table public.section_offerings is 'App collection "sectionSubjects". Full record in data; position keeps list order.';
alter table public.section_offerings enable row level security;
revoke all on table public.section_offerings from anon, authenticated;
grant select, insert, update, delete on table public.section_offerings to service_role;

create table if not exists public.subject_assignments (
  id text primary key,
  position integer not null default 0,
  faculty_ids text[],
  data jsonb not null,
  updated_at timestamptz not null default now()
);
comment on table public.subject_assignments is 'App collection "subjectAssignments". Full record in data; position keeps list order.';
alter table public.subject_assignments enable row level security;
revoke all on table public.subject_assignments from anon, authenticated;
grant select, insert, update, delete on table public.subject_assignments to service_role;

create table if not exists public.academic_periods (
  id text primary key,
  position integer not null default 0,
  school_year text,
  term text,
  status text,
  start_date text,
  end_date text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
comment on table public.academic_periods is 'App collection "academicPeriods". Full record in data; position keeps list order.';
alter table public.academic_periods enable row level security;
revoke all on table public.academic_periods from anon, authenticated;
grant select, insert, update, delete on table public.academic_periods to service_role;

create table if not exists public.exams (
  id text primary key,
  position integer not null default 0,
  title text,
  subject_code text,
  faculty_id text,
  status text,
  exam_date text,
  start_time text,
  end_time text,
  academic_period_id text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
comment on table public.exams is 'App collection "exams". Full record in data; position keeps list order.';
create index if not exists exams_subject_code_idx on public.exams (subject_code);
create index if not exists exams_faculty_id_idx on public.exams (faculty_id);
alter table public.exams enable row level security;
revoke all on table public.exams from anon, authenticated;
grant select, insert, update, delete on table public.exams to service_role;

create table if not exists public.questions (
  id text primary key,
  position integer not null default 0,
  exam_id text,
  type text,
  points numeric,
  question_text text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
comment on table public.questions is 'App collection "questions". Full record in data; position keeps list order.';
create index if not exists questions_exam_id_idx on public.questions (exam_id);
alter table public.questions enable row level security;
revoke all on table public.questions from anon, authenticated;
grant select, insert, update, delete on table public.questions to service_role;

create table if not exists public.student_submissions (
  id text primary key,
  position integer not null default 0,
  exam_id text,
  student_id text,
  score numeric,
  total numeric,
  submitted_at timestamptz,
  academic_period_id text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
comment on table public.student_submissions is 'App collection "studentSubmissions". Full record in data; position keeps list order.';
create index if not exists student_submissions_exam_id_idx on public.student_submissions (exam_id);
create index if not exists student_submissions_student_id_idx on public.student_submissions (student_id);
alter table public.student_submissions enable row level security;
revoke all on table public.student_submissions from anon, authenticated;
grant select, insert, update, delete on table public.student_submissions to service_role;

create table if not exists public.student_enrollments (
  id text primary key,
  position integer not null default 0,
  student_id text,
  section_id text,
  offering_id text,
  subject_code text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
comment on table public.student_enrollments is 'App collection "studentEnrollments". Full record in data; position keeps list order.';
create index if not exists student_enrollments_student_id_idx on public.student_enrollments (student_id);
create index if not exists student_enrollments_section_id_idx on public.student_enrollments (section_id);
create index if not exists student_enrollments_subject_code_idx on public.student_enrollments (subject_code);
alter table public.student_enrollments enable row level security;
revoke all on table public.student_enrollments from anon, authenticated;
grant select, insert, update, delete on table public.student_enrollments to service_role;

create table if not exists public.audit_log (
  id text primary key,
  position integer not null default 0,
  at timestamptz,
  actor_id text,
  actor_role text,
  action text,
  category text,
  entity_type text,
  entity_id text,
  result text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
comment on table public.audit_log is 'App collection "applicationAuditLog". Full record in data; position keeps list order.';
create index if not exists audit_log_at_idx on public.audit_log (at);
create index if not exists audit_log_actor_id_idx on public.audit_log (actor_id);
alter table public.audit_log enable row level security;
revoke all on table public.audit_log from anon, authenticated;
grant select, insert, update, delete on table public.audit_log to service_role;

create table if not exists public.approval_requests (
  id text primary key,
  position integer not null default 0,
  type text,
  status text,
  requester_id text,
  target_id text,
  submitted_at timestamptz,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
comment on table public.approval_requests is 'App collection "approvalRequests". Full record in data; position keeps list order.';
create index if not exists approval_requests_status_idx on public.approval_requests (status);
alter table public.approval_requests enable row level security;
revoke all on table public.approval_requests from anon, authenticated;
grant select, insert, update, delete on table public.approval_requests to service_role;

create table if not exists public.question_reports (
  id text primary key,
  position integer not null default 0,
  exam_id text,
  question_id text,
  student_id text,
  status text,
  category text,
  created_at timestamptz,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
comment on table public.question_reports is 'App collection "questionReports". Full record in data; position keeps list order.';
alter table public.question_reports enable row level security;
revoke all on table public.question_reports from anon, authenticated;
grant select, insert, update, delete on table public.question_reports to service_role;

create table if not exists public.lesson_content (
  id text primary key,
  position integer not null default 0,
  subject_code text,
  week integer,
  type text,
  title text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
comment on table public.lesson_content is 'App collection "subjectWorkspaceContent". Full record in data; position keeps list order.';
create index if not exists lesson_content_subject_code_idx on public.lesson_content (subject_code);
alter table public.lesson_content enable row level security;
revoke all on table public.lesson_content from anon, authenticated;
grant select, insert, update, delete on table public.lesson_content to service_role;

create table if not exists public.lesson_views (
  id text primary key,
  position integer not null default 0,
  student_id text,
  block_id text,
  viewed_at timestamptz,
  completed_at timestamptz,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
comment on table public.lesson_views is 'App collection "subjectContentViews". Full record in data; position keeps list order.';
create index if not exists lesson_views_student_id_idx on public.lesson_views (student_id);
alter table public.lesson_views enable row level security;
revoke all on table public.lesson_views from anon, authenticated;
grant select, insert, update, delete on table public.lesson_views to service_role;

create table if not exists public.announcements (
  id text primary key,
  position integer not null default 0,
  title text,
  audience text,
  created_at timestamptz,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
comment on table public.announcements is 'App collection "adminAnnouncements". Full record in data; position keeps list order.';
alter table public.announcements enable row level security;
revoke all on table public.announcements from anon, authenticated;
grant select, insert, update, delete on table public.announcements to service_role;

create table if not exists public.student_emails (
  id text primary key,
  position integer not null default 0,
  student_id text,
  faculty_id text,
  subject text,
  sent_at timestamptz,
  is_read boolean,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
comment on table public.student_emails is 'App collection "studentEmails". Full record in data; position keeps list order.';
alter table public.student_emails enable row level security;
revoke all on table public.student_emails from anon, authenticated;
grant select, insert, update, delete on table public.student_emails to service_role;

create table if not exists public.student_notifications (
  id text primary key,
  position integer not null default 0,
  student_id text,
  is_read boolean,
  created_at timestamptz,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
comment on table public.student_notifications is 'App collection "studentNotifications". Full record in data; position keeps list order.';
alter table public.student_notifications enable row level security;
revoke all on table public.student_notifications from anon, authenticated;
grant select, insert, update, delete on table public.student_notifications to service_role;
