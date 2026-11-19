-- Generated from server/supabase-tables.js — change versions for multi-instance sync.

create table if not exists public.sync_versions (
  collection_key text primary key,
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.sync_versions enable row level security;
revoke all on table public.sync_versions from anon, authenticated;
grant select, insert, update, delete on table public.sync_versions to service_role;

create or replace function public.bump_sync_version(key text) returns void language sql security definer set search_path = public as $$
  insert into public.sync_versions (collection_key, version, updated_at) values (key, 1, now())
  on conflict (collection_key) do update set version = public.sync_versions.version + 1, updated_at = now();
$$;
create or replace function public.sync_version_table_trigger() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.bump_sync_version(tg_argv[0]);
  return null;
end $$;
create or replace function public.sync_version_collection_trigger() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.bump_sync_version(coalesce(new.collection_key, old.collection_key));
  return null;
end $$;

drop trigger if exists users_sync_version on public.users;
create trigger users_sync_version after insert or update or delete on public.users for each statement execute function public.sync_version_table_trigger('users');
drop trigger if exists students_sync_version on public.students;
create trigger students_sync_version after insert or update or delete on public.students for each statement execute function public.sync_version_table_trigger('students');
drop trigger if exists faculty_sync_version on public.faculty;
create trigger faculty_sync_version after insert or update or delete on public.faculty for each statement execute function public.sync_version_table_trigger('faculty');
drop trigger if exists coordinators_sync_version on public.coordinators;
create trigger coordinators_sync_version after insert or update or delete on public.coordinators for each statement execute function public.sync_version_table_trigger('coordinators');
drop trigger if exists subjects_sync_version on public.subjects;
create trigger subjects_sync_version after insert or update or delete on public.subjects for each statement execute function public.sync_version_table_trigger('subjects');
drop trigger if exists sections_sync_version on public.sections;
create trigger sections_sync_version after insert or update or delete on public.sections for each statement execute function public.sync_version_table_trigger('sections');
drop trigger if exists curricula_sync_version on public.curricula;
create trigger curricula_sync_version after insert or update or delete on public.curricula for each statement execute function public.sync_version_table_trigger('curricula');
drop trigger if exists section_offerings_sync_version on public.section_offerings;
create trigger section_offerings_sync_version after insert or update or delete on public.section_offerings for each statement execute function public.sync_version_table_trigger('sectionSubjects');
drop trigger if exists subject_assignments_sync_version on public.subject_assignments;
create trigger subject_assignments_sync_version after insert or update or delete on public.subject_assignments for each statement execute function public.sync_version_table_trigger('subjectAssignments');
drop trigger if exists academic_periods_sync_version on public.academic_periods;
create trigger academic_periods_sync_version after insert or update or delete on public.academic_periods for each statement execute function public.sync_version_table_trigger('academicPeriods');
drop trigger if exists exams_sync_version on public.exams;
create trigger exams_sync_version after insert or update or delete on public.exams for each statement execute function public.sync_version_table_trigger('exams');
drop trigger if exists questions_sync_version on public.questions;
create trigger questions_sync_version after insert or update or delete on public.questions for each statement execute function public.sync_version_table_trigger('questions');
drop trigger if exists student_submissions_sync_version on public.student_submissions;
create trigger student_submissions_sync_version after insert or update or delete on public.student_submissions for each statement execute function public.sync_version_table_trigger('studentSubmissions');
drop trigger if exists student_enrollments_sync_version on public.student_enrollments;
create trigger student_enrollments_sync_version after insert or update or delete on public.student_enrollments for each statement execute function public.sync_version_table_trigger('studentEnrollments');
drop trigger if exists audit_log_sync_version on public.audit_log;
create trigger audit_log_sync_version after insert or update or delete on public.audit_log for each statement execute function public.sync_version_table_trigger('applicationAuditLog');
drop trigger if exists approval_requests_sync_version on public.approval_requests;
create trigger approval_requests_sync_version after insert or update or delete on public.approval_requests for each statement execute function public.sync_version_table_trigger('approvalRequests');
drop trigger if exists question_reports_sync_version on public.question_reports;
create trigger question_reports_sync_version after insert or update or delete on public.question_reports for each statement execute function public.sync_version_table_trigger('questionReports');
drop trigger if exists lesson_content_sync_version on public.lesson_content;
create trigger lesson_content_sync_version after insert or update or delete on public.lesson_content for each statement execute function public.sync_version_table_trigger('subjectWorkspaceContent');
drop trigger if exists lesson_views_sync_version on public.lesson_views;
create trigger lesson_views_sync_version after insert or update or delete on public.lesson_views for each statement execute function public.sync_version_table_trigger('subjectContentViews');
drop trigger if exists announcements_sync_version on public.announcements;
create trigger announcements_sync_version after insert or update or delete on public.announcements for each statement execute function public.sync_version_table_trigger('adminAnnouncements');
drop trigger if exists student_emails_sync_version on public.student_emails;
create trigger student_emails_sync_version after insert or update or delete on public.student_emails for each statement execute function public.sync_version_table_trigger('studentEmails');
drop trigger if exists student_notifications_sync_version on public.student_notifications;
create trigger student_notifications_sync_version after insert or update or delete on public.student_notifications for each statement execute function public.sync_version_table_trigger('studentNotifications');
drop trigger if exists app_collections_sync_version on public.app_collections;
create trigger app_collections_sync_version after insert or update or delete on public.app_collections for each row execute function public.sync_version_collection_trigger();
