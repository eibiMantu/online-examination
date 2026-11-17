create table if not exists public.app_collections (
  collection_key text primary key,
  value_json jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_collections enable row level security;

comment on table public.app_collections is
  'Server-only durable collection storage for the NEU examination application.';

revoke all on table public.app_collections from anon, authenticated;
grant select, insert, update, delete on table public.app_collections to service_role;
