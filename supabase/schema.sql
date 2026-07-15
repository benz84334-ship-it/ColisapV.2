create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  full_name text,
  email text,
  role text not null default 'Manager',
  branch text,
  contact_number text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.users (
  id text primary key,
  username text not null unique,
  password text,
  full_name text not null,
  role text not null default 'Manager',
  status text not null default 'Active',
  branch text,
  email text,
  contact_number text,
  created_at timestamptz not null default now(),
  last_login timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.members (
  id text primary key,
  member_id text unique,
  cif_number text unique,
  full_name text not null,
  address text,
  barangay text,
  birthdate date,
  gender text,
  contact_number text,
  membership_date date,
  status text not null default 'Active',
  status_override text,
  branch text,
  share_capital numeric(12,2) not null default 0,
  last_share_capital_deposit_date date,
  benefit_category text,
  beneficiaries jsonb not null default '[]'::jsonb,
  photo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loans (
  id text primary key,
  loan_number text unique,
  member_id text references public.members(id) on delete set null,
  member_name text,
  branch text,
  loan_type text,
  collection_schedule text,
  principal_amount numeric(12,2) not null default 0,
  interest_amount numeric(12,2) not null default 0,
  interest numeric(5,2) not null default 0,
  total_payable numeric(12,2) not null default 0,
  penalty_rate numeric(5,2) not null default 0,
  penalty numeric(12,2) not null default 0,
  release_date date,
  due_date date,
  paid_amount numeric(12,2) not null default 0,
  status text not null default 'Pending',
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id text primary key,
  loan_id text references public.loans(id) on delete cascade,
  member_id text references public.members(id) on delete set null,
  member_name text,
  branch text,
  payment_date date,
  payment_type text,
  amount numeric(12,2) not null default 0,
  penalty numeric(12,2) not null default 0,
  balance numeric(12,2) not null default 0,
  reference_number text,
  status text not null default 'Completed',
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collections (
  id text primary key,
  loan_id text references public.loans(id) on delete cascade,
  member_id text references public.members(id) on delete set null,
  member_name text,
  branch text,
  collection_date date,
  amount numeric(12,2) not null default 0,
  penalty numeric(12,2) not null default 0,
  status text not null default 'Pending',
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.availments (
  id text primary key,
  member_id text references public.members(id) on delete set null,
  member_name text,
  monitoring_reference text,
  reference text,
  availment_type text,
  branch text,
  amount numeric(12,2) not null default 0,
  status text not null default 'Active',
  availment_date date,
  policy_number text,
  remarks text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reports (
  id text primary key,
  title text not null,
  report_type text,
  generated_by text,
  branch text,
  period_start date,
  period_end date,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.settings (
  id text primary key default 'main',
  theme text not null default 'light',
  penalty_rate numeric(5,2) not null default 0,
  loan_types jsonb not null default '[]'::jsonb,
  branch_options jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id text primary key,
  action text not null,
  detail text,
  user_name text,
  branch text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id text primary key,
  title text not null,
  message text,
  type text not null default 'info',
  read boolean not null default false,
  branch text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_data (
  key text primary key,
  value jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.users enable row level security;
alter table public.members enable row level security;
alter table public.loans enable row level security;
alter table public.payments enable row level security;
alter table public.collections enable row level security;
alter table public.availments enable row level security;
alter table public.reports enable row level security;
alter table public.settings enable row level security;
alter table public.activity_logs enable row level security;
alter table public.notifications enable row level security;
alter table public.app_data enable row level security;

create or replace trigger set_updated_at_profiles
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace trigger set_updated_at_users
before update on public.users
for each row execute function public.set_updated_at();

create or replace trigger set_updated_at_members
before update on public.members
for each row execute function public.set_updated_at();

create or replace trigger set_updated_at_loans
before update on public.loans
for each row execute function public.set_updated_at();

create or replace trigger set_updated_at_payments
before update on public.payments
for each row execute function public.set_updated_at();

create or replace trigger set_updated_at_collections
before update on public.collections
for each row execute function public.set_updated_at();

create or replace trigger set_updated_at_availments
before update on public.availments
for each row execute function public.set_updated_at();

create or replace trigger set_updated_at_reports
before update on public.reports
for each row execute function public.set_updated_at();

create or replace trigger set_updated_at_settings
before update on public.settings
for each row execute function public.set_updated_at();

create or replace trigger set_updated_at_activity_logs
before update on public.activity_logs
for each row execute function public.set_updated_at();

create or replace trigger set_updated_at_notifications
before update on public.notifications
for each row execute function public.set_updated_at();

create index if not exists idx_members_branch on public.members(branch);
create index if not exists idx_members_status on public.members(status);
create index if not exists idx_loans_member_id on public.loans(member_id);
create index if not exists idx_loans_status on public.loans(status);
create index if not exists idx_payments_loan_id on public.payments(loan_id);
create index if not exists idx_collections_loan_id on public.collections(loan_id);
create index if not exists idx_availments_member_id on public.availments(member_id);
create index if not exists idx_activity_logs_created_at on public.activity_logs(created_at desc);
create index if not exists idx_notifications_read on public.notifications(read);

drop policy if exists "allow authenticated read access to profiles" on public.profiles;
drop policy if exists "allow authenticated write access to profiles" on public.profiles;
drop policy if exists "allow anon read access to profiles" on public.profiles;
drop policy if exists "allow anon write access to profiles" on public.profiles;
create policy "allow authenticated read access to profiles"
  on public.profiles for select
  to authenticated
  using (true);
create policy "allow authenticated write access to profiles"
  on public.profiles for insert
  to authenticated
  with check (true);
create policy "allow anon read access to profiles"
  on public.profiles for select
  to anon
  using (true);
create policy "allow anon write access to profiles"
  on public.profiles for insert
  to anon
  with check (true);

drop policy if exists "allow authenticated read access to users" on public.users;
drop policy if exists "allow authenticated write access to users" on public.users;
drop policy if exists "allow anon read access to users" on public.users;
drop policy if exists "allow anon write access to users" on public.users;
create policy "allow authenticated read access to users"
  on public.users for select
  to authenticated
  using (true);
create policy "allow authenticated write access to users"
  on public.users for insert
  to authenticated
  with check (true);
create policy "allow anon read access to users"
  on public.users for select
  to anon
  using (true);
create policy "allow anon write access to users"
  on public.users for insert
  to anon
  with check (true);

drop policy if exists "allow authenticated read access to members" on public.members;
drop policy if exists "allow authenticated write access to members" on public.members;
drop policy if exists "allow anon read access to members" on public.members;
drop policy if exists "allow anon write access to members" on public.members;
create policy "allow authenticated read access to members"
  on public.members for select
  to authenticated
  using (true);
create policy "allow authenticated write access to members"
  on public.members for insert
  to authenticated
  with check (true);
create policy "allow anon read access to members"
  on public.members for select
  to anon
  using (true);
create policy "allow anon write access to members"
  on public.members for insert
  to anon
  with check (true);

drop policy if exists "allow authenticated read access to loans" on public.loans;
drop policy if exists "allow authenticated write access to loans" on public.loans;
drop policy if exists "allow anon read access to loans" on public.loans;
drop policy if exists "allow anon write access to loans" on public.loans;
create policy "allow authenticated read access to loans"
  on public.loans for select
  to authenticated
  using (true);
create policy "allow authenticated write access to loans"
  on public.loans for insert
  to authenticated
  with check (true);
create policy "allow anon read access to loans"
  on public.loans for select
  to anon
  using (true);
create policy "allow anon write access to loans"
  on public.loans for insert
  to anon
  with check (true);

drop policy if exists "allow authenticated read access to payments" on public.payments;
drop policy if exists "allow authenticated write access to payments" on public.payments;
drop policy if exists "allow anon read access to payments" on public.payments;
drop policy if exists "allow anon write access to payments" on public.payments;
create policy "allow authenticated read access to payments"
  on public.payments for select
  to authenticated
  using (true);
create policy "allow authenticated write access to payments"
  on public.payments for insert
  to authenticated
  with check (true);
create policy "allow anon read access to payments"
  on public.payments for select
  to anon
  using (true);
create policy "allow anon write access to payments"
  on public.payments for insert
  to anon
  with check (true);

drop policy if exists "allow authenticated read access to collections" on public.collections;
drop policy if exists "allow authenticated write access to collections" on public.collections;
drop policy if exists "allow anon read access to collections" on public.collections;
drop policy if exists "allow anon write access to collections" on public.collections;
create policy "allow authenticated read access to collections"
  on public.collections for select
  to authenticated
  using (true);
create policy "allow authenticated write access to collections"
  on public.collections for insert
  to authenticated
  with check (true);
create policy "allow anon read access to collections"
  on public.collections for select
  to anon
  using (true);
create policy "allow anon write access to collections"
  on public.collections for insert
  to anon
  with check (true);

drop policy if exists "allow authenticated read access to availments" on public.availments;
drop policy if exists "allow authenticated write access to availments" on public.availments;
drop policy if exists "allow anon read access to availments" on public.availments;
drop policy if exists "allow anon write access to availments" on public.availments;
create policy "allow authenticated read access to availments"
  on public.availments for select
  to authenticated
  using (true);
create policy "allow authenticated write access to availments"
  on public.availments for insert
  to authenticated
  with check (true);
create policy "allow anon read access to availments"
  on public.availments for select
  to anon
  using (true);
create policy "allow anon write access to availments"
  on public.availments for insert
  to anon
  with check (true);

drop policy if exists "allow authenticated read access to reports" on public.reports;
drop policy if exists "allow authenticated write access to reports" on public.reports;
drop policy if exists "allow anon read access to reports" on public.reports;
drop policy if exists "allow anon write access to reports" on public.reports;
create policy "allow authenticated read access to reports"
  on public.reports for select
  to authenticated
  using (true);
create policy "allow authenticated write access to reports"
  on public.reports for insert
  to authenticated
  with check (true);
create policy "allow anon read access to reports"
  on public.reports for select
  to anon
  using (true);
create policy "allow anon write access to reports"
  on public.reports for insert
  to anon
  with check (true);

drop policy if exists "allow authenticated read access to settings" on public.settings;
drop policy if exists "allow authenticated write access to settings" on public.settings;
drop policy if exists "allow anon read access to settings" on public.settings;
drop policy if exists "allow anon write access to settings" on public.settings;
create policy "allow authenticated read access to settings"
  on public.settings for select
  to authenticated
  using (true);
create policy "allow authenticated write access to settings"
  on public.settings for insert
  to authenticated
  with check (true);
create policy "allow anon read access to settings"
  on public.settings for select
  to anon
  using (true);
create policy "allow anon write access to settings"
  on public.settings for insert
  to anon
  with check (true);

drop policy if exists "allow authenticated read access to activity logs" on public.activity_logs;
drop policy if exists "allow authenticated write access to activity logs" on public.activity_logs;
drop policy if exists "allow anon read access to activity logs" on public.activity_logs;
drop policy if exists "allow anon write access to activity logs" on public.activity_logs;
create policy "allow authenticated read access to activity logs"
  on public.activity_logs for select
  to authenticated
  using (true);
create policy "allow authenticated write access to activity logs"
  on public.activity_logs for insert
  to authenticated
  with check (true);
create policy "allow anon read access to activity logs"
  on public.activity_logs for select
  to anon
  using (true);
create policy "allow anon write access to activity logs"
  on public.activity_logs for insert
  to anon
  with check (true);

drop policy if exists "allow authenticated read access to notifications" on public.notifications;
drop policy if exists "allow authenticated write access to notifications" on public.notifications;
drop policy if exists "allow anon read access to notifications" on public.notifications;
drop policy if exists "allow anon write access to notifications" on public.notifications;
create policy "allow authenticated read access to notifications"
  on public.notifications for select
  to authenticated
  using (true);
create policy "allow authenticated write access to notifications"
  on public.notifications for insert
  to authenticated
  with check (true);
create policy "allow anon read access to notifications"
  on public.notifications for select
  to anon
  using (true);
create policy "allow anon write access to notifications"
  on public.notifications for insert
  to anon
  with check (true);

drop policy if exists "authenticated users can read app data" on public.app_data;
drop policy if exists "authenticated users can insert app data" on public.app_data;
drop policy if exists "authenticated users can update app data" on public.app_data;
drop policy if exists "anon users can read app data" on public.app_data;
drop policy if exists "anon users can insert app data" on public.app_data;
drop policy if exists "anon users can update app data" on public.app_data;
create policy "authenticated users can read app data"
  on public.app_data for select
  to authenticated
  using (true);
create policy "authenticated users can insert app data"
  on public.app_data for insert
  to authenticated
  with check (true);
create policy "authenticated users can update app data"
  on public.app_data for update
  to authenticated
  using (true)
  with check (true);

create policy "anon users can read app data"
  on public.app_data for select
  to anon
  using (true);
create policy "anon users can insert app data"
  on public.app_data for insert
  to anon
  with check (true);
create policy "anon users can update app data"
  on public.app_data for update
  to anon
  using (true)
  with check (true);

grant select, insert, update, delete on public.profiles to authenticated, anon;
grant select, insert, update, delete on public.users to authenticated, anon;
grant select, insert, update, delete on public.members to authenticated, anon;
grant select, insert, update, delete on public.loans to authenticated, anon;
grant select, insert, update, delete on public.payments to authenticated, anon;
grant select, insert, update, delete on public.collections to authenticated, anon;
grant select, insert, update, delete on public.availments to authenticated, anon;
grant select, insert, update, delete on public.reports to authenticated, anon;
grant select, insert, update, delete on public.settings to authenticated, anon;
grant select, insert, update, delete on public.activity_logs to authenticated, anon;
grant select, insert, update, delete on public.notifications to authenticated, anon;
grant select, insert, update, delete on public.app_data to authenticated, anon;

do $$
begin
  alter publication supabase_realtime add table public.app_data;
exception
  when duplicate_object then null;
end $$;
