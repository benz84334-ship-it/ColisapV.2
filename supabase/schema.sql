create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.allow_app_access(table_name text)
returns void
language plpgsql
as $$
begin
  execute format('drop policy if exists "app read access" on public.%I', table_name);
  execute format('drop policy if exists "app insert access" on public.%I', table_name);
  execute format('drop policy if exists "app update access" on public.%I', table_name);
  execute format('drop policy if exists "app delete access" on public.%I', table_name);

  execute format('create policy "app read access" on public.%I for select to authenticated, anon using (true)', table_name);
  execute format('create policy "app insert access" on public.%I for insert to authenticated, anon with check (true)', table_name);
  execute format('create policy "app update access" on public.%I for update to authenticated, anon using (true) with check (true)', table_name);
  execute format('create policy "app delete access" on public.%I for delete to authenticated, anon using (true)', table_name);
end;
$$;

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
  branch text not null default 'Main Office',
  email text,
  contact_number text,
  created_at timestamptz not null default now(),
  last_login timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.branches (
  id text primary key,
  name text not null unique,
  address text,
  contact_number text,
  status text not null default 'Active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loan_types (
  id text primary key,
  name text not null unique,
  default_interest_rate numeric(7,2) not null default 5,
  default_penalty_rate numeric(7,2) not null default 2,
  status text not null default 'Active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_methods (
  id text primary key,
  name text not null unique,
  status text not null default 'Active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.members (
  id text primary key,
  member_id text not null unique,
  cif_number text unique,
  application_status text not null default 'New',
  first_name text,
  middle_name text,
  last_name text,
  full_name text not null,
  address text,
  barangay text,
  birthdate date,
  age_years integer,
  age_months integer,
  gender text,
  civil_status text,
  contact_number text,
  occupation text,
  employer text,
  office_address text,
  religion text,
  dependents integer not null default 0,
  savings_account_no text,
  membership_date date,
  signed_date date,
  witness_staff text,
  action_taken text,
  approving_authority text,
  approval_date date,
  findings text,
  status text not null default 'Active',
  status_override text,
  branch text not null default 'Main Office',
  share_capital numeric(14,2) not null default 0,
  last_share_capital_deposit_date date,
  benefit_category text,
  beneficiaries jsonb not null default '[]'::jsonb,
  photo text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.member_beneficiaries (
  id text primary key,
  member_id text not null references public.members(id) on delete cascade,
  name text not null,
  age integer,
  address text,
  relationship text,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.share_capital_transactions (
  id text primary key,
  member_id text not null references public.members(id) on delete cascade,
  transaction_date date not null default current_date,
  transaction_type text not null default 'Deposit',
  amount numeric(14,2) not null default 0,
  running_balance numeric(14,2) not null default 0,
  reference_number text,
  encoded_by text,
  remarks text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loans (
  id text primary key,
  loan_number text not null unique,
  member_id text references public.members(id) on delete set null,
  member_name text,
  branch text not null default 'Main Office',
  loan_type text,
  collection_schedule text,
  contract_period text,
  contract_months integer,
  principal_amount numeric(14,2) not null default 0,
  interest numeric(7,2) not null default 0,
  interest_amount numeric(14,2) not null default 0,
  total_payable numeric(14,2) not null default 0,
  paid_amount numeric(14,2) not null default 0,
  penalty_rate numeric(7,2) not null default 0,
  penalty numeric(14,2) not null default 0,
  release_date date,
  due_date date,
  status text not null default 'Pending',
  remarks text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collections (
  id text primary key,
  collection_id text not null unique,
  loan_id text references public.loans(id) on delete cascade,
  loan_number text,
  member_id text references public.members(id) on delete set null,
  member_name text,
  collector text,
  branch text not null default 'Main Office',
  collection_date date,
  amount_due numeric(14,2) not null default 0,
  amount_paid numeric(14,2) not null default 0,
  balance numeric(14,2) not null default 0,
  penalty numeric(14,2) not null default 0,
  status text not null default 'Pending',
  remarks text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id text primary key,
  receipt_number text not null unique,
  loan_id text references public.loans(id) on delete cascade,
  loan_number text,
  member_id text references public.members(id) on delete set null,
  member_name text,
  branch text not null default 'Main Office',
  payment_date date,
  payment_type text,
  method text,
  collected_by text,
  encoded_by text,
  amount numeric(14,2) not null default 0,
  penalty numeric(14,2) not null default 0,
  balance numeric(14,2) not null default 0,
  reference_number text,
  status text not null default 'Completed',
  remarks text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.availments (
  id text primary key,
  member_id text references public.members(id) on delete set null,
  member_name text,
  reference text,
  monitoring_reference text unique,
  availment_type text,
  branch text not null default 'Main Office',
  amount numeric(14,2) not null default 0,
  status text not null default 'Pending',
  availment_date date,
  policy_number text,
  created_by text,
  supporting_documents text,
  remarks text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.availments
  add column if not exists supporting_documents text;

alter table public.availments
  alter column status set default 'Pending';

create table if not exists public.reports (
  id text primary key,
  title text not null,
  report_type text,
  type text,
  period text,
  generated_by text,
  generated_at timestamptz,
  branch text,
  period_start date,
  period_end date,
  total_collection numeric(14,2) not null default 0,
  total_members integer not null default 0,
  active_loans integer not null default 0,
  outstanding numeric(14,2) not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.settings (
  id text primary key default 'main',
  cooperative_name text not null default 'Barbaza Multi-Purpose Cooperative',
  short_name text not null default 'Barbaza MPC',
  address text,
  telephone text,
  email text,
  logo_text text,
  theme text not null default 'light',
  penalty_rate numeric(7,2) not null default 2,
  interest_rate numeric(7,2) not null default 5,
  collection_grace_days integer not null default 3,
  backup_reminder_days integer not null default 7,
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
  "user" text,
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

-- Current frontend sync table. Each key stores one app slice such as members,
-- loans, payments, collections, settings, and notifications.
create table if not exists public.app_data (
  key text primary key,
  value jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.users enable row level security;
alter table public.branches enable row level security;
alter table public.loan_types enable row level security;
alter table public.payment_methods enable row level security;
alter table public.members enable row level security;
alter table public.member_beneficiaries enable row level security;
alter table public.share_capital_transactions enable row level security;
alter table public.loans enable row level security;
alter table public.collections enable row level security;
alter table public.payments enable row level security;
alter table public.availments enable row level security;
alter table public.reports enable row level security;
alter table public.settings enable row level security;
alter table public.activity_logs enable row level security;
alter table public.notifications enable row level security;
alter table public.app_data enable row level security;

create or replace trigger set_updated_at_profiles before update on public.profiles for each row execute function public.set_updated_at();
create or replace trigger set_updated_at_users before update on public.users for each row execute function public.set_updated_at();
create or replace trigger set_updated_at_branches before update on public.branches for each row execute function public.set_updated_at();
create or replace trigger set_updated_at_loan_types before update on public.loan_types for each row execute function public.set_updated_at();
create or replace trigger set_updated_at_payment_methods before update on public.payment_methods for each row execute function public.set_updated_at();
create or replace trigger set_updated_at_members before update on public.members for each row execute function public.set_updated_at();
create or replace trigger set_updated_at_member_beneficiaries before update on public.member_beneficiaries for each row execute function public.set_updated_at();
create or replace trigger set_updated_at_share_capital_transactions before update on public.share_capital_transactions for each row execute function public.set_updated_at();
create or replace trigger set_updated_at_loans before update on public.loans for each row execute function public.set_updated_at();
create or replace trigger set_updated_at_collections before update on public.collections for each row execute function public.set_updated_at();
create or replace trigger set_updated_at_payments before update on public.payments for each row execute function public.set_updated_at();
create or replace trigger set_updated_at_availments before update on public.availments for each row execute function public.set_updated_at();
create or replace trigger set_updated_at_reports before update on public.reports for each row execute function public.set_updated_at();
create or replace trigger set_updated_at_settings before update on public.settings for each row execute function public.set_updated_at();
create or replace trigger set_updated_at_activity_logs before update on public.activity_logs for each row execute function public.set_updated_at();
create or replace trigger set_updated_at_notifications before update on public.notifications for each row execute function public.set_updated_at();

create index if not exists idx_users_branch on public.users(branch);
create index if not exists idx_users_status on public.users(status);
create index if not exists idx_branches_status on public.branches(status);
create index if not exists idx_loan_types_status on public.loan_types(status);
create index if not exists idx_payment_methods_status on public.payment_methods(status);
create index if not exists idx_members_branch on public.members(branch);
create index if not exists idx_members_status on public.members(status);
create index if not exists idx_members_barangay on public.members(barangay);
create index if not exists idx_members_full_name on public.members(full_name);
create index if not exists idx_member_beneficiaries_member_id on public.member_beneficiaries(member_id);
create index if not exists idx_share_capital_transactions_member_id on public.share_capital_transactions(member_id);
create index if not exists idx_share_capital_transactions_date on public.share_capital_transactions(transaction_date desc);
create index if not exists idx_loans_member_id on public.loans(member_id);
create index if not exists idx_loans_status on public.loans(status);
create index if not exists idx_loans_due_date on public.loans(due_date);
create index if not exists idx_collections_loan_id on public.collections(loan_id);
create index if not exists idx_collections_member_id on public.collections(member_id);
create index if not exists idx_collections_collection_date on public.collections(collection_date);
create index if not exists idx_payments_loan_id on public.payments(loan_id);
create index if not exists idx_payments_member_id on public.payments(member_id);
create index if not exists idx_payments_payment_date on public.payments(payment_date);
create index if not exists idx_availments_member_id on public.availments(member_id);
create index if not exists idx_reports_generated_at on public.reports(generated_at desc);
create index if not exists idx_activity_logs_created_at on public.activity_logs(created_at desc);
create index if not exists idx_notifications_read on public.notifications(read);

do $$
begin
  perform public.allow_app_access('profiles');
  perform public.allow_app_access('users');
  perform public.allow_app_access('branches');
  perform public.allow_app_access('loan_types');
  perform public.allow_app_access('payment_methods');
  perform public.allow_app_access('members');
  perform public.allow_app_access('member_beneficiaries');
  perform public.allow_app_access('share_capital_transactions');
  perform public.allow_app_access('loans');
  perform public.allow_app_access('collections');
  perform public.allow_app_access('payments');
  perform public.allow_app_access('availments');
  perform public.allow_app_access('reports');
  perform public.allow_app_access('settings');
  perform public.allow_app_access('activity_logs');
  perform public.allow_app_access('notifications');
  perform public.allow_app_access('app_data');
end $$;

grant select, insert, update, delete on public.profiles to authenticated, anon;
grant select, insert, update, delete on public.users to authenticated, anon;
grant select, insert, update, delete on public.branches to authenticated, anon;
grant select, insert, update, delete on public.loan_types to authenticated, anon;
grant select, insert, update, delete on public.payment_methods to authenticated, anon;
grant select, insert, update, delete on public.members to authenticated, anon;
grant select, insert, update, delete on public.member_beneficiaries to authenticated, anon;
grant select, insert, update, delete on public.share_capital_transactions to authenticated, anon;
grant select, insert, update, delete on public.loans to authenticated, anon;
grant select, insert, update, delete on public.collections to authenticated, anon;
grant select, insert, update, delete on public.payments to authenticated, anon;
grant select, insert, update, delete on public.availments to authenticated, anon;
grant select, insert, update, delete on public.reports to authenticated, anon;
grant select, insert, update, delete on public.settings to authenticated, anon;
grant select, insert, update, delete on public.activity_logs to authenticated, anon;
grant select, insert, update, delete on public.notifications to authenticated, anon;
grant select, insert, update, delete on public.app_data to authenticated, anon;

insert into public.settings (
  id,
  cooperative_name,
  short_name,
  address,
  telephone,
  email,
  logo_text,
  penalty_rate,
  interest_rate,
  collection_grace_days,
  backup_reminder_days,
  loan_types,
  branch_options
) values (
  'main',
  'Barbaza Multi-Purpose Cooperative',
  'Barbaza MPC',
  'Poblacion, Barbaza, Antique',
  '(036) 540-0000',
  'office@barbazampc.coop',
  'CM',
  2,
  5,
  3,
  7,
  '["Regular Loan","Emergency Loan","Business Loan","Agricultural Loan","Salary Loan"]'::jsonb,
  '["Main Office","Barbaza","Tibiao","Culasi","San Jose"]'::jsonb
) on conflict (id) do nothing;

insert into public.branches (id, name)
values
  ('BR-0001', 'Main Office'),
  ('BR-0002', 'Barbaza'),
  ('BR-0003', 'Tibiao'),
  ('BR-0004', 'Culasi'),
  ('BR-0005', 'San Jose')
on conflict (id) do nothing;

insert into public.loan_types (id, name, default_interest_rate, default_penalty_rate)
values
  ('LT-0001', 'Regular Loan', 5, 2),
  ('LT-0002', 'Emergency Loan', 5, 2),
  ('LT-0003', 'Business Loan', 5, 2),
  ('LT-0004', 'Agricultural Loan', 5, 2),
  ('LT-0005', 'Salary Loan', 5, 2)
on conflict (id) do nothing;

insert into public.payment_methods (id, name)
values
  ('PM-0001', 'Cash'),
  ('PM-0002', 'GCash'),
  ('PM-0003', 'Bank Transfer')
on conflict (id) do nothing;

insert into public.app_data (key, value)
values
  ('users', '[]'::jsonb),
  ('members', '[]'::jsonb),
  ('loans', '[]'::jsonb),
  ('collections', '[]'::jsonb),
  ('payments', '[]'::jsonb),
  ('reports', '[]'::jsonb),
  ('availments', '[]'::jsonb),
  ('settings', '{}'::jsonb),
  ('activityLogs', '[]'::jsonb),
  ('notifications', '[]'::jsonb),
  ('dashboard', '{}'::jsonb)
on conflict (key) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'member-photos',
  'member-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "member photos public read" on storage.objects;
drop policy if exists "member photos public insert" on storage.objects;
drop policy if exists "member photos public update" on storage.objects;
drop policy if exists "member photos public delete" on storage.objects;

create policy "member photos public read"
on storage.objects for select
to authenticated, anon
using (bucket_id = 'member-photos');

create policy "member photos public insert"
on storage.objects for insert
to authenticated, anon
with check (bucket_id = 'member-photos');

create policy "member photos public update"
on storage.objects for update
to authenticated, anon
using (bucket_id = 'member-photos')
with check (bucket_id = 'member-photos');

create policy "member photos public delete"
on storage.objects for delete
to authenticated, anon
using (bucket_id = 'member-photos');

do $$
begin
  alter publication supabase_realtime add table public.app_data;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
