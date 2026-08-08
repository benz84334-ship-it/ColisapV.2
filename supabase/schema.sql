create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.sync_member_beneficiaries_from_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  beneficiary_row jsonb;
  beneficiary_index integer := 0;
begin
  delete from public.member_beneficiaries where member_id = new.id;

  for beneficiary_row in select * from jsonb_array_elements(coalesce(new.beneficiaries, '[]'::jsonb))
  loop
    insert into public.member_beneficiaries (
      id, member_id, name, age, address, relationship, sort_order, metadata, created_at, updated_at
    )
    values (
      coalesce(
        nullif(beneficiary_row->>'id', ''),
        'BNF@' || new.id || '#' || lpad((beneficiary_index + 1)::text, 2, '0')
      ),
      new.id,
      coalesce(beneficiary_row->>'name', ''),
      nullif(beneficiary_row->>'ageYears', '')::integer,
      nullif(beneficiary_row->>'address', ''),
      coalesce(nullif(beneficiary_row->>'relationshipOther', ''), nullif(beneficiary_row->>'relationship', '')),
      beneficiary_index,
      coalesce(beneficiary_row->'metadata', '{}'::jsonb),
      now(),
      now()
    );
    beneficiary_index := beneficiary_index + 1;
  end loop;

  return new;
end;
$$;

drop trigger if exists sync_approved_request_to_member_trigger on public.requests;
drop trigger if exists set_member_id_from_request_trigger on public.members;

drop function if exists public.sync_approved_request_to_member();
drop function if exists public.set_member_id_from_request();
drop function if exists public.generate_member_row_id_safe();
drop function if exists public.generate_member_row_id();
drop function if exists public.generate_cifk_member_number_safe();
drop function if exists public.generate_cifk_member_number();

create sequence if not exists public.member_import_row_seq;
create sequence if not exists public.member_import_cif_seq;

create or replace function public.generate_cifk_member_number_safe()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_year text := to_char(current_date, 'YYYY');
  candidate text;
  suffix text;
begin
  loop
    suffix := lpad((floor(random() * 90000) + 10000)::text, 5, '0');
    candidate := 'CIFK-' || current_year || '-' || suffix;
    exit when not exists (
      select 1 from public.members where cif_number = candidate or member_id = candidate
    );
  end loop;

  while exists (
    select 1 from public.members where cif_number = candidate or member_id = candidate
  ) loop
    suffix := lpad((floor(random() * 90000) + 10000)::text, 5, '0');
    candidate := 'CIFK-' || current_year || '-' || suffix;
  end loop;

  return candidate;
end;
$$;

create or replace function public.generate_member_row_id_safe()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_year text := to_char(current_date, 'YYYY');
  next_sequence integer;
  candidate text;
begin
  select coalesce(max(nullif(regexp_replace(id, '\D', '', 'g'), '')::bigint), 0) + 1
    into next_sequence
  from public.members
  where id like 'REQ-%';

  candidate := 'REQ-' || current_year || '-' || lpad(next_sequence::text, 5, '0');
  while exists (
    select 1 from public.members where id = candidate or member_id = candidate
  ) loop
    next_sequence := next_sequence + 1;
    candidate := 'REQ-' || current_year || '-' || lpad(next_sequence::text, 5, '0');
  end loop;

  return candidate;
end;
$$;

create or replace function public.set_request_id_from_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_year text := to_char(current_date, 'YYYY');
  next_sequence bigint;
begin
  if coalesce(new.request_id, '') = '' then
    select coalesce(max(seq), 0) + 1
      into next_sequence
    from (
      select (regexp_match(request_id, '^REQ-\d{4}-(\d+)$'))[1]::bigint as seq
      from public.requests
      where request_id ~ ('^REQ-' || current_year || '-\d+$')
      union all
      select (regexp_match(id, '^REQ-\d{4}-(\d+)$'))[1]::bigint as seq
      from public.members
      where id ~ ('^REQ-' || current_year || '-\d+$')
    ) sequence_pool;

    new.request_id := 'REQ-' || current_year || '-' || lpad(next_sequence::text, 5, '0');
  end if;

  if coalesce(new.id, '') = '' then
    new.id := new.request_id;
  end if;

  return new;
end;
$$;

create index if not exists requests_request_id_idx on public.requests (request_id);
create index if not exists requests_member_id_idx on public.requests (member_id);

comment on table public.requests is 'Request IDs are text values like REQ-2026-00001. Do not cast to bigint.';

create or replace function public.approve_member_request(
  p_request_id text,
  p_approved_by text default null,
  p_approval_reason text default null
)
returns setof public.requests
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.requests
  set
    request_status = 'Approved',
    status = 'Approved',
    approved_by = coalesce(p_approved_by, approved_by),
    approval_reason = coalesce(p_approval_reason, approval_reason),
    approved_at = coalesce(approved_at, now()),
    updated_at = now()
  where request_id = p_request_id
     or id = p_request_id
  returning *;
end;
$$;

create or replace function public.sync_request_status_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.request_status, '') <> coalesce(old.request_status, '') then
    new.status := new.request_status;
  elsif coalesce(new.status, '') <> coalesce(old.status, '') then
    new.request_status := new.status;
  end if;

  if coalesce(new.request_status, '') = 'Approved' then
    new.status := 'Approved';
  end if;

  return new;
end;
$$;

comment on function public.approve_member_request(text, text, text)
  is 'Approves request rows using text request IDs like REQ-2026-00001.';

create or replace function public.set_member_id_from_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_year text := to_char(current_date, 'YYYY');
  next_row_seq bigint;
  next_cif_seq bigint;
begin
  if coalesce(new.id, '') = '' or exists (
    select 1 from public.members where id = new.id
  ) then
    next_row_seq := nextval('public.member_import_row_seq');
    new.id := 'MEM-' || current_year || '-' || lpad(next_row_seq::text, 5, '0');
  end if;

  if coalesce(new.member_id, '') = '' or exists (
    select 1 from public.members where id = new.member_id or member_id = new.member_id
  ) then
    next_row_seq := nextval('public.member_import_row_seq');
    new.member_id := 'M-' || current_year || '-' || lpad(next_row_seq::text, 5, '0');
  end if;

  if coalesce(new.cif_number, '') = '' then
    next_cif_seq := nextval('public.member_import_cif_seq');
    new.cif_number := 'CIFK-' || current_year || '-' || lpad(next_cif_seq::text, 5, '0');
  elsif exists (
    select 1 from public.members where cif_number = new.cif_number or member_id = new.cif_number
  ) then
    next_cif_seq := nextval('public.member_import_cif_seq');
    new.cif_number := 'CIFK-' || current_year || '-' || lpad(next_cif_seq::text, 5, '0');
  end if;

  return new;
end;
$$;

create or replace function public.sync_approved_request_to_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.request_kind, '') = 'claimant' or coalesce(new.approval_queue, '') = 'claimant' or coalesce(new.request_type, '') = 'Claimant Application' then
    return new;
  end if;

  if coalesce(new.request_status, '') <> 'Approved' then
    return new;
  end if;

  insert into public.members (
    id, member_id, cif_number, application_status, first_name, middle_name, last_name, suffix_name, full_name,
    address, barangay, birthdate, age_years, age_months, gender, civil_status, contact_number,
    occupation, employer, office_address, religion, religion_other, dependents, savings_account_no, last_contribution_date,
    signed_date, witness_staff, action_taken, approving_authority, approval_date, findings, status,
    status_override, branch, share_capital, last_share_capital_deposit_date, benefit_category,
    beneficiaries, photo, metadata, created_at, updated_at
  )
  values (
    case
      when coalesce(nullif(new.id, ''), '') = coalesce(nullif(new.member_id, ''), '') then public.generate_member_row_id_safe()
      else coalesce(nullif(new.id, ''), public.generate_member_row_id_safe())
    end,
    case
      when coalesce(nullif(new.member_id, ''), '') = '' then public.generate_member_row_id_safe()
      when exists (
        select 1 from public.members where id = new.member_id or member_id = new.member_id
      ) then public.generate_member_row_id_safe()
      else new.member_id
    end,
    case
      when coalesce(nullif(new.cif_number, ''), '') = '' then public.generate_cifk_member_number_safe()
      when exists (
        select 1 from public.members where cif_number = new.cif_number or member_id = new.cif_number
      ) then public.generate_cifk_member_number_safe()
      else new.cif_number
    end,
    coalesce(new.application_status, 'New'),
    new.first_name, new.middle_name, new.last_name, new.suffix_name, new.full_name,
    new.address, new.barangay, new.birthdate, new.age_years, new.age_months, new.gender, new.civil_status, new.contact_number,
    new.occupation, new.employer, new.office_address, coalesce(new.religion_other, new.religion), new.religion_other, new.dependents,
    new.savings_account_no, coalesce(new.last_contribution_date, current_date), coalesce(new.signed_date, current_date), new.witness_staff,
    coalesce(new.action_taken, 'Approved'), coalesce(new.approving_authority, new.requested_by, 'System'),
    coalesce(new.approval_date, current_date), new.findings, coalesce(new.status, 'Active'), null,
    coalesce(new.branch, 'Main Office'), coalesce(new.share_capital, 0), new.last_share_capital_deposit_date,
    new.benefit_category, coalesce(new.beneficiaries, '[]'::jsonb), new.photo, coalesce(new.metadata, '{}'::jsonb), now(), now()
  )
  on conflict (id) do update set
    member_id = excluded.member_id,
    cif_number = excluded.cif_number,
    application_status = excluded.application_status,
    first_name = excluded.first_name,
    middle_name = excluded.middle_name,
    last_name = excluded.last_name,
    full_name = excluded.full_name,
    address = excluded.address,
    barangay = excluded.barangay,
    birthdate = excluded.birthdate,
    age_years = excluded.age_years,
    age_months = excluded.age_months,
    gender = excluded.gender,
    civil_status = excluded.civil_status,
    contact_number = excluded.contact_number,
    occupation = excluded.occupation,
    employer = excluded.employer,
    office_address = excluded.office_address,
    religion = excluded.religion,
    dependents = excluded.dependents,
    savings_account_no = excluded.savings_account_no,
    last_contribution_date = excluded.last_contribution_date,
    signed_date = excluded.signed_date,
    witness_staff = excluded.witness_staff,
    action_taken = excluded.action_taken,
    approving_authority = excluded.approving_authority,
    approval_date = excluded.approval_date,
    findings = excluded.findings,
    status = excluded.status,
    status_override = excluded.status_override,
    branch = excluded.branch,
    share_capital = coalesce(nullif(excluded.share_capital, 0), public.members.share_capital),
    last_share_capital_deposit_date = excluded.last_share_capital_deposit_date,
    benefit_category = excluded.benefit_category,
    beneficiaries = excluded.beneficiaries,
    photo = excluded.photo,
    metadata = excluded.metadata,
    updated_at = now();

  return new;
end;
$$;

create or replace function public.sync_member_share_capital_from_transactions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_member_id text;
  recalculated_share_capital numeric(14,2);
  recalculated_last_deposit date;
begin
  if tg_op = 'DELETE' then
    target_member_id := old.member_id;
  else
    target_member_id := new.member_id;
  end if;

  if coalesce(target_member_id, '') = '' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select
    coalesce(sum(coalesce(t.amount, 0)), 0),
    max(t.transaction_date)
  into recalculated_share_capital, recalculated_last_deposit
  from public.share_capital_transactions t
  where t.member_id = target_member_id;

  update public.members m
  set
    share_capital = coalesce(recalculated_share_capital, 0),
    last_share_capital_deposit_date = coalesce(recalculated_last_deposit, m.last_share_capital_deposit_date),
    updated_at = now()
  where m.id = target_member_id;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password text,
  full_name text not null,
  role text not null default 'Staff',
  status text not null default 'Active',
  branch text not null default 'Main Office',
  email text unique,
  contact_number text,
  created_at timestamptz not null default now(),
  last_login timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.users drop constraint if exists users_id_fkey;

create or replace function public.normalize_imported_member_payload(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized jsonb;
  first_name text;
  last_name text;
  full_name text;
  sheet_member_name text;
  source_identity text;
  middle_name text;
  address_text text;
  barangay_text text;
  contact_text text;
  last_contribution_date_value date;
  birthdate_value date;
  signed_date_value date;
  approval_date_value date;
  share_capital_value numeric(14,2);
begin
  source_identity := coalesce(
    nullif(trim(payload->>'id'), ''),
    nullif(trim(payload->>'rowId'), ''),
    nullif(trim(payload->>'row_id'), ''),
    nullif(trim(payload->>'__rowNumber'), ''),
    nullif(trim(payload->>'__sourceRow'), ''),
    nullif(trim(payload->>'CIFK Number'), ''),
    nullif(trim(payload->>'CIFK No.'), ''),
    nullif(trim(payload->>'CIFK No'), ''),
    nullif(trim(payload->>'CIFK'), ''),
    nullif(trim(payload->>'memberId'), ''),
    nullif(trim(payload->>'member_id'), ''),
    nullif(trim(payload->>'fullName'), ''),
    nullif(trim(payload->>'full_name'), ''),
    nullif(trim(payload->>'Member Name'), ''),
    nullif(trim(payload->>'Member'), ''),
    nullif(trim(payload->>'Name'), ''),
    nullif(trim(payload->>'name'), '')
  );
  sheet_member_name := coalesce(
    nullif(trim(payload->>'fullName'), ''),
    nullif(trim(payload->>'full_name'), ''),
    nullif(trim(payload->>'Member Name'), ''),
    nullif(trim(payload->>'member name'), ''),
    nullif(trim(payload->>'Member'), ''),
    nullif(trim(payload->>'Name'), ''),
    nullif(trim(payload->>'name'), '')
  );
  first_name := coalesce(nullif(trim(payload->>'firstName'), ''), nullif(trim(payload->>'first_name'), ''), nullif(trim(payload->>'First Name'), ''), nullif(trim(payload->>'First name'), ''));
  last_name := coalesce(nullif(trim(payload->>'lastName'), ''), nullif(trim(payload->>'last_name'), ''), nullif(trim(payload->>'Last Name'), ''), nullif(trim(payload->>'Last name'), ''));
  full_name := coalesce(sheet_member_name, nullif(trim(payload->>'full_name'), ''));
  middle_name := coalesce(nullif(trim(payload->>'middleName'), ''), nullif(trim(payload->>'middle_name'), ''), nullif(trim(payload->>'Middle Name'), ''), nullif(trim(payload->>'Middle name'), ''));
  address_text := coalesce(nullif(trim(payload->>'address'), ''), nullif(trim(payload->>'Address'), ''), nullif(trim(payload->>'Home Address'), ''));
  barangay_text := coalesce(
    nullif(trim(payload->>'barangay'), ''),
    nullif(trim(payload->>'Barangay'), ''),
    nullif(trim(payload->>'Barangay / Municipality'), ''),
    nullif(trim(payload->>'Barangay / Municipality '), ''),
    nullif(trim(payload->>'Municipality'), ''),
    nullif(trim(payload->>'Municipality / Barangay'), ''),
    nullif(trim(payload->>'Brgy / Municipality'), '')
  );
  contact_text := coalesce(
    nullif(trim(payload->>'contactNumber'), ''),
    nullif(trim(payload->>'contact_number'), ''),
    nullif(trim(payload->>'Contact'), ''),
    nullif(trim(payload->>'Contact Number'), ''),
    nullif(trim(payload->>'Contact No.'), ''),
    nullif(trim(payload->>'Contact No'), ''),
    nullif(trim(payload->>'Mobile Number'), ''),
    nullif(trim(payload->>'Mobile No.'), ''),
    nullif(trim(payload->>'Phone Number'), ''),
    nullif(trim(payload->>'Phone No.'), '')
  );
  last_contribution_date_value := case
    when nullif(trim(payload->>'lastContributionDate'), '') is null then
      case
        when nullif(trim(payload->>'membershipDate'), '') is null then null
        else (trim(payload->>'membershipDate'))::date
      end
    else (trim(payload->>'lastContributionDate'))::date
  end;
  birthdate_value := case
    when nullif(trim(payload->>'birthdate'), '') is null then null
    when trim(payload->>'birthdate') ~ '^\d+(\.\d+)?$' then (date '1899-12-30' + (trim(payload->>'birthdate'))::numeric::integer)
    else (trim(payload->>'birthdate'))::date
  end;
  signed_date_value := case
    when nullif(trim(payload->>'signedDate'), '') is null then null
    when trim(payload->>'signedDate') ~ '^\d+(\.\d+)?$' then (date '1899-12-30' + (trim(payload->>'signedDate'))::numeric::integer)
    else (trim(payload->>'signedDate'))::date
  end;
  approval_date_value := case
    when nullif(trim(payload->>'approvalDate'), '') is null then null
    when trim(payload->>'approvalDate') ~ '^\d+(\.\d+)?$' then (date '1899-12-30' + (trim(payload->>'approvalDate'))::numeric::integer)
    else (trim(payload->>'approvalDate'))::date
  end;
  share_capital_value := case
    when nullif(trim(coalesce(payload->>'shareCapital', payload->>'Savings', payload->>'Saving', payload->>'Savings Amount', payload->>'Amount Saved', payload->>'share_capital')), '') is null then 0
    else (trim(coalesce(payload->>'shareCapital', payload->>'Savings', payload->>'Saving', payload->>'Savings Amount', payload->>'Amount Saved', payload->>'share_capital')))::numeric(14,2)
  end;

  normalized := jsonb_build_object(
    'member_id', coalesce(
      nullif(trim(payload->>'memberId'), ''),
      nullif(trim(payload->>'member_id'), ''),
      nullif(trim(payload->>'cifNumber'), ''),
      nullif(trim(payload->>'cif_number'), ''),
      nullif(trim(payload->>'CIFK Number'), ''),
      nullif(trim(payload->>'CIFK No.'), ''),
      nullif(trim(payload->>'CIFK No'), ''),
      nullif(trim(payload->>'CIFK'), ''),
      case when coalesce(source_identity, '') <> '' then 'M-' || left(md5(source_identity), 12) end
    ),
    'cif_number', coalesce(
      nullif(trim(payload->>'cifNumber'), ''),
      nullif(trim(payload->>'cif_number'), ''),
      nullif(trim(payload->>'CIFK Number'), ''),
      nullif(trim(payload->>'CIFK No.'), ''),
      nullif(trim(payload->>'CIFK No'), ''),
      nullif(trim(payload->>'CIFK'), ''),
      nullif(trim(payload->>'memberId'), ''),
      nullif(trim(payload->>'member_id'), ''),
      case when coalesce(source_identity, '') <> '' then 'CIFK-' || to_char(current_date, 'YYYY') || '-' || upper(right(md5(source_identity), 5)) end
    ),
    'application_status', coalesce(nullif(trim(payload->>'applicationStatus'), ''), 'New'),
    'first_name', first_name,
    'middle_name', middle_name,
    'last_name', last_name,
    'suffix_name', coalesce(nullif(trim(payload->>'suffixName'), ''), nullif(trim(payload->>'suffix_name'), '')),
    'full_name', coalesce(full_name, concat_ws(' ', first_name, middle_name, last_name), concat_ws(' ', first_name, last_name), 'Imported Member'),
    'address', address_text,
    'barangay', barangay_text,
    'birthdate', birthdate_value,
    'age_years', case when nullif(trim(payload->>'ageYears'), '') is null then null else (trim(payload->>'ageYears'))::integer end,
    'age_months', case when nullif(trim(payload->>'ageMonths'), '') is null then null else (trim(payload->>'ageMonths'))::integer end,
    'gender', coalesce(nullif(trim(payload->>'gender'), ''), nullif(trim(payload->>'Gender'), '')),
    'civil_status', coalesce(nullif(trim(payload->>'civilStatus'), ''), nullif(trim(payload->>'civil_status'), '')),
    'contact_number', contact_text,
    'occupation', coalesce(nullif(trim(payload->>'occupation'), ''), nullif(trim(payload->>'Occupation'), '')),
    'employer', coalesce(nullif(trim(payload->>'employer'), ''), nullif(trim(payload->>'Employer'), '')),
    'office_address', coalesce(nullif(trim(payload->>'officeAddress'), ''), nullif(trim(payload->>'office_address'), '')),
    'religion', coalesce(nullif(trim(payload->>'religion'), ''), nullif(trim(payload->>'Religion'), '')),
    'religion_other', coalesce(nullif(trim(payload->>'religionOther'), ''), nullif(trim(payload->>'religion_other'), '')),
    'dependents', case when nullif(trim(payload->>'dependents'), '') is null then 0 else (trim(payload->>'dependents'))::integer end,
    'savings_account_no', coalesce(nullif(trim(payload->>'savingsAccountNo'), ''), nullif(trim(payload->>'savings_account_no'), '')),
    'last_contribution_date', last_contribution_date_value,
    'signed_date', signed_date_value,
    'witness_staff', coalesce(nullif(trim(payload->>'witnessStaff'), ''), nullif(trim(payload->>'witness_staff'), '')),
    'action_taken', coalesce(nullif(trim(payload->>'actionTaken'), ''), 'Pending'),
    'approving_authority', coalesce(nullif(trim(payload->>'approvingAuthority'), ''), nullif(trim(payload->>'approving_authority'), '')),
    'approval_date', approval_date_value,
    'findings', coalesce(nullif(trim(payload->>'findings'), ''), nullif(trim(payload->>'Findings'), '')),
    'status', coalesce(nullif(trim(payload->>'status'), ''), 'Pending'),
    'branch', coalesce(nullif(trim(payload->>'branch'), ''), 'Main Office'),
    'share_capital', share_capital_value,
    'last_share_capital_deposit_date', case
      when nullif(trim(coalesce(payload->>'lastShareCapitalDepositDate', payload->>'Last Share Capital Deposit Date', payload->>'Last Contribution Date', payload->>'lastContributionDate', payload->>'Membership Date', payload->>'membershipDate')), '') is null then null
      else (trim(coalesce(payload->>'lastShareCapitalDepositDate', payload->>'Last Share Capital Deposit Date', payload->>'Last Contribution Date', payload->>'lastContributionDate', payload->>'Membership Date', payload->>'membershipDate')))::date
    end,
    'benefit_category', coalesce(nullif(trim(payload->>'benefitCategory'), ''), nullif(trim(payload->>'benefit_category'), ''), nullif(trim(payload->>'Benefit Category'), '')),
    'beneficiaries', coalesce(payload->'beneficiaries', '[]'::jsonb),
    'photo', coalesce(nullif(trim(payload->>'photo'), ''), nullif(trim(payload->>'Photo'), '')),
    'metadata', coalesce(payload->'metadata', '{}'::jsonb)
  );

  return normalized;
end;
$$;

create table if not exists public.members (
  id text primary key,
  member_id text not null unique,
  cif_number text unique,
  application_status text not null default 'New',
  first_name text,
  middle_name text,
  last_name text,
  suffix_name text,
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
  religion_other text,
  dependents integer not null default 0,
  savings_account_no text,
  last_contribution_date date,
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

alter table public.members add column if not exists suffix_name text;
alter table public.members add column if not exists religion_other text;
alter table public.members add column if not exists share_capital numeric(14,2) not null default 0;
alter table public.members add column if not exists last_share_capital_deposit_date date;
alter table public.members add column if not exists benefit_category text;

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

create table if not exists public.requests (
  id text primary key,
  request_id text not null unique,
  request_type text not null default 'Member Request',
  request_kind text,
  approval_queue text,
  member_id text,
  cif_number text,
  request_status text not null default 'Pending',
  approved_by text,
  requested_by text,
  requested_by_name text,
  submitted_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  returned_at timestamptz,
  resubmitted_at timestamptz,
  return_reason text,
  rejection_reason text,
  approval_reason text,
  branch text not null default 'Main Office',
  application_status text not null default 'New',
  benefit_category text,
  first_name text,
  middle_name text,
  last_name text,
  suffix_name text,
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
  religion_other text,
  dependents integer not null default 0,
  savings_account_no text,
  last_contribution_date date,
  signed_date date,
  witness_staff text,
  action_taken text,
  approving_authority text,
  approval_date date,
  findings text,
  status text not null default 'Pending',
  share_capital numeric(14,2) not null default 0,
  last_share_capital_deposit_date date,
  beneficiaries jsonb not null default '[]'::jsonb,
  photo text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.requests
  drop constraint if exists requests_member_id_fkey;

alter table public.requests
  alter column id type text using coalesce(id::text, ''),
  alter column request_id type text using coalesce(request_id::text, ''),
  alter column member_id type text using coalesce(member_id::text, '');

alter table public.requests add column if not exists request_type text not null default 'Member Request';
alter table public.requests add column if not exists request_kind text;
alter table public.requests add column if not exists approval_queue text;

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

create table if not exists public.member_status_history (
  id text primary key,
  member_id text not null references public.members(id) on delete cascade,
  member_reference text,
  previous_status text not null,
  new_status text not null,
  last_contribution_date date,
  status_change_date date not null default current_date,
  reason text not null,
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
  claim_number text,
  date_filed date,
  claimant_first_name text,
  claimant_middle_name text,
  claimant_last_name text,
  claimant_suffix text,
  claimant_name text,
  relationship_to_deceased text,
  contact_number text,
  claimant_address text,
  valid_id_type text,
  valid_id_number text,
  registered_beneficiary text,
  claimant_signature text,
  date_signed date,
  verified_by text,
  recommendation text,
  approved_amount numeric(14,2) not null default 0,
  approved_by text,
  date_approved date,
  availment_type text,
  branch text not null default 'Main Office',
  amount numeric(14,2) not null default 0,
  status text not null default 'Pending',
  availment_date date,
  deceased_member_id text,
  deceased_cif_number text,
  deceased_first_name text,
  deceased_middle_name text,
  deceased_last_name text,
  deceased_suffix text,
  deceased_full_name text,
  deceased_date_of_birth date,
  deceased_date_of_death date,
  deceased_civil_status text,
  deceased_membership_date date,
  deceased_coverage_status text,
  deceased_benefit_category text,
  place_of_death text,
  cause_of_death text,
  date_of_burial date,
  place_of_burial text,
  funeral_home text,
  total_funeral_expenses numeric(14,2) not null default 0,
  policy_number text,
  created_by text,
  supporting_documents text,
  remarks text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.availments add column if not exists approved_amount numeric(14,2) not null default 0;
alter table public.availments add column if not exists approved_by text;
alter table public.availments add column if not exists claim_number text;
alter table public.availments add column if not exists date_filed date;
alter table public.availments add column if not exists claimant_first_name text;
alter table public.availments add column if not exists claimant_middle_name text;
alter table public.availments add column if not exists claimant_last_name text;
alter table public.availments add column if not exists claimant_suffix text;
alter table public.availments add column if not exists claimant_name text;
alter table public.availments add column if not exists relationship_to_deceased text;
alter table public.availments add column if not exists contact_number text;
alter table public.availments add column if not exists claimant_address text;
alter table public.availments add column if not exists valid_id_type text;
alter table public.availments add column if not exists valid_id_number text;
alter table public.availments add column if not exists registered_beneficiary text;
alter table public.availments add column if not exists claimant_signature text;
alter table public.availments add column if not exists date_signed date;
alter table public.availments add column if not exists verified_by text;
alter table public.availments add column if not exists recommendation text;
alter table public.availments add column if not exists date_approved date;
alter table public.availments add column if not exists availment_type text;
alter table public.availments add column if not exists availment_date date;
alter table public.availments add column if not exists created_by text;
alter table public.availments add column if not exists deceased_member_id text;
alter table public.availments add column if not exists deceased_cif_number text;
alter table public.availments add column if not exists deceased_first_name text;
alter table public.availments add column if not exists deceased_middle_name text;
alter table public.availments add column if not exists deceased_last_name text;
alter table public.availments add column if not exists deceased_suffix text;
alter table public.availments add column if not exists deceased_full_name text;
alter table public.availments add column if not exists deceased_date_of_birth date;
alter table public.availments add column if not exists deceased_date_of_death date;
alter table public.availments add column if not exists deceased_civil_status text;
alter table public.availments add column if not exists deceased_membership_date date;
alter table public.availments add column if not exists deceased_coverage_status text;
alter table public.availments add column if not exists deceased_benefit_category text;
alter table public.availments add column if not exists place_of_death text;
alter table public.availments add column if not exists cause_of_death text;
alter table public.availments add column if not exists date_of_burial date;
alter table public.availments add column if not exists place_of_burial text;
alter table public.availments add column if not exists funeral_home text;
alter table public.availments add column if not exists total_funeral_expenses numeric(14,2) not null default 0;
alter table public.availments add column if not exists supporting_documents text;
alter table public.availments add column if not exists remarks text;

update public.members m
set
  share_capital = coalesce((
    select sum(coalesce(t.amount, 0))
    from public.share_capital_transactions t
    where t.member_id = m.id
  ), 0),
  last_share_capital_deposit_date = coalesce((
    select max(t.transaction_date)
    from public.share_capital_transactions t
    where t.member_id = m.id
  ), m.last_share_capital_deposit_date)
where exists (
  select 1
  from public.share_capital_transactions t
  where t.member_id = m.id
);

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
  cooperative_name text not null default 'Barbaza MPC',
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

create table if not exists public.app_data (
  id text primary key default 'main',
  key text not null unique default 'main',
  data jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_data add column if not exists key text;
update public.app_data
set key = coalesce(key, id, 'main')
where key is null;
alter table public.app_data alter column key set default 'main';
alter table public.app_data alter column key set not null;
alter table public.app_data drop constraint if exists app_data_key_unique;
alter table public.app_data add constraint app_data_key_unique unique (key);

insert into public.app_data (id, key)
values ('main', 'main')
on conflict (id) do update set key = excluded.key;

alter table public.users enable row level security;
alter table public.members enable row level security;
alter table public.member_beneficiaries enable row level security;
alter table public.requests enable row level security;
alter table public.share_capital_transactions enable row level security;
alter table public.member_status_history enable row level security;
alter table public.loans enable row level security;
alter table public.collections enable row level security;
alter table public.payments enable row level security;
alter table public.availments enable row level security;
alter table public.reports enable row level security;
alter table public.settings enable row level security;
alter table public.activity_logs enable row level security;
alter table public.notifications enable row level security;
alter table public.app_data enable row level security;

drop policy if exists "public read requests" on public.requests;
drop policy if exists "public insert requests" on public.requests;
drop policy if exists "public update requests" on public.requests;
drop policy if exists "public delete requests" on public.requests;
create policy "public read requests" on public.requests for select to authenticated, anon using (true);
create policy "public insert requests" on public.requests for insert to authenticated, anon with check (true);
create policy "public update requests" on public.requests for update to authenticated, anon using (true) with check (true);
create policy "public delete requests" on public.requests for delete to authenticated, anon using (true);

drop policy if exists "public read members" on public.members;
drop policy if exists "public insert members" on public.members;
drop policy if exists "public update members" on public.members;
drop policy if exists "public delete members" on public.members;
create policy "public read members" on public.members for select to authenticated, anon using (true);
create policy "public insert members" on public.members for insert to authenticated, anon with check (true);
create policy "public update members" on public.members for update to authenticated, anon using (true) with check (true);
create policy "public delete members" on public.members for delete to authenticated, anon using (true);

drop policy if exists "public read share capital transactions" on public.share_capital_transactions;
drop policy if exists "public insert share capital transactions" on public.share_capital_transactions;
drop policy if exists "public update share capital transactions" on public.share_capital_transactions;
drop policy if exists "public delete share capital transactions" on public.share_capital_transactions;
create policy "public read share capital transactions" on public.share_capital_transactions for select to authenticated, anon using (true);
create policy "public insert share capital transactions" on public.share_capital_transactions for insert to authenticated, anon with check (true);
create policy "public update share capital transactions" on public.share_capital_transactions for update to authenticated, anon using (true) with check (true);
create policy "public delete share capital transactions" on public.share_capital_transactions for delete to authenticated, anon using (true);

drop policy if exists "public read member status history" on public.member_status_history;
drop policy if exists "public insert member status history" on public.member_status_history;
drop policy if exists "public update member status history" on public.member_status_history;
drop policy if exists "public delete member status history" on public.member_status_history;
create policy "public read member status history" on public.member_status_history for select to authenticated, anon using (true);
create policy "public insert member status history" on public.member_status_history for insert to authenticated, anon with check (true);
create policy "public update member status history" on public.member_status_history for update to authenticated, anon using (true) with check (true);
create policy "public delete member status history" on public.member_status_history for delete to authenticated, anon using (true);

drop policy if exists "public read app_data" on public.app_data;
drop policy if exists "public insert app_data" on public.app_data;
drop policy if exists "public update app_data" on public.app_data;
drop policy if exists "public delete app_data" on public.app_data;
create policy "public read app_data" on public.app_data for select to authenticated, anon using (true);
create policy "public insert app_data" on public.app_data for insert to authenticated, anon with check (true);
create policy "public update app_data" on public.app_data for update to authenticated, anon using (true) with check (true);
create policy "public delete app_data" on public.app_data for delete to authenticated, anon using (true);

drop trigger if exists set_updated_at_users on public.users;
create trigger set_updated_at_users before update on public.users for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_members on public.members;
create trigger set_updated_at_members before update on public.members for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_member_beneficiaries on public.member_beneficiaries;
create trigger set_updated_at_member_beneficiaries before update on public.member_beneficiaries for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_requests on public.requests;
create trigger set_updated_at_requests before update on public.requests for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_share_capital_transactions on public.share_capital_transactions;
create trigger set_updated_at_share_capital_transactions before update on public.share_capital_transactions for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_member_status_history on public.member_status_history;
create trigger set_updated_at_member_status_history before update on public.member_status_history for each row execute function public.set_updated_at();
drop trigger if exists sync_member_share_capital_from_transactions_on_insert on public.share_capital_transactions;
create trigger sync_member_share_capital_from_transactions_on_insert
after insert on public.share_capital_transactions
for each row execute function public.sync_member_share_capital_from_transactions();
drop trigger if exists sync_member_share_capital_from_transactions_on_update on public.share_capital_transactions;
create trigger sync_member_share_capital_from_transactions_on_update
after update on public.share_capital_transactions
for each row execute function public.sync_member_share_capital_from_transactions();
drop trigger if exists sync_member_share_capital_from_transactions_on_delete on public.share_capital_transactions;
create trigger sync_member_share_capital_from_transactions_on_delete
after delete on public.share_capital_transactions
for each row execute function public.sync_member_share_capital_from_transactions();
update public.members m
set
  share_capital = coalesce((
    select sum(coalesce(t.amount, 0))
    from public.share_capital_transactions t
    where t.member_id = m.id
  ), 0),
  last_share_capital_deposit_date = coalesce((
    select max(t.transaction_date)
    from public.share_capital_transactions t
    where t.member_id = m.id
  ), m.last_share_capital_deposit_date);
drop trigger if exists set_updated_at_loans on public.loans;
create trigger set_updated_at_loans before update on public.loans for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_collections on public.collections;
create trigger set_updated_at_collections before update on public.collections for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_payments on public.payments;
create trigger set_updated_at_payments before update on public.payments for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_availments on public.availments;
create trigger set_updated_at_availments before update on public.availments for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_reports on public.reports;
create trigger set_updated_at_reports before update on public.reports for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_settings on public.settings;
create trigger set_updated_at_settings before update on public.settings for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_activity_logs on public.activity_logs;
create trigger set_updated_at_activity_logs before update on public.activity_logs for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_notifications on public.notifications;
create trigger set_updated_at_notifications before update on public.notifications for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_app_data on public.app_data;
create trigger set_updated_at_app_data before update on public.app_data for each row execute function public.set_updated_at();

drop trigger if exists sync_member_beneficiaries_from_member_trigger on public.members;
create trigger sync_member_beneficiaries_from_member_trigger
after insert or update on public.members
for each row execute function public.sync_member_beneficiaries_from_member();

drop trigger if exists set_member_id_from_request_trigger on public.members;
create trigger set_member_id_from_request_trigger before insert on public.members
for each row execute function public.set_member_id_from_request();

drop trigger if exists set_request_id_from_request_trigger on public.requests;
create trigger set_request_id_from_request_trigger before insert on public.requests
for each row execute function public.set_request_id_from_request();

drop trigger if exists sync_request_status_fields_trigger on public.requests;
create trigger sync_request_status_fields_trigger
before insert or update on public.requests
for each row execute function public.sync_request_status_fields();

drop trigger if exists sync_approved_request_to_member_trigger on public.requests;
create trigger sync_approved_request_to_member_trigger
after update on public.requests
for each row
when (new.request_status = 'Approved')
execute function public.sync_approved_request_to_member();

update public.requests
set status = request_status
where coalesce(status, '') <> coalesce(request_status, '');
