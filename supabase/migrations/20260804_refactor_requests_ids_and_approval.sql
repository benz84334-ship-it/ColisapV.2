-- Consolidated refactor for request/member IDs and approval flow.
-- This keeps all request identifiers as text and rebuilds the approval path
-- so REQ-2026-00001 style IDs are never treated as bigint.

alter table public.requests
  drop constraint if exists requests_member_id_fkey;

alter table public.requests
  alter column id type text using id::text,
  alter column request_id type text using request_id::text,
  alter column member_id type text using member_id::text;

drop trigger if exists set_request_id_from_request_trigger on public.requests;
drop trigger if exists sync_approved_request_to_member_trigger on public.requests;
drop function if exists public.set_request_id_from_request();
drop function if exists public.sync_approved_request_to_member();
drop function if exists public.approve_member_request(text, text, text);
drop function if exists public.approve_member_request(bigint, text, text);

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
    approved_by = coalesce(p_approved_by, approved_by),
    approval_reason = coalesce(p_approval_reason, approval_reason),
    approved_at = coalesce(approved_at, now()),
    updated_at = now()
  where request_id = p_request_id
     or id = p_request_id
  returning *;
end;
$$;

create or replace function public.sync_approved_request_to_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.request_kind, '') = 'claimant'
     or coalesce(new.approval_queue, '') = 'claimant'
     or coalesce(new.request_type, '') = 'Claimant Application' then
    return new;
  end if;

  if coalesce(new.request_status, '') <> 'Approved' then
    return new;
  end if;

  insert into public.members (
    id, member_id, cif_number, application_status, first_name, middle_name, last_name, suffix_name, full_name,
    address, barangay, birthdate, age_years, age_months, gender, civil_status, contact_number,
    occupation, employer, office_address, religion, religion_other, dependents, savings_account_no, membership_date,
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
    new.savings_account_no, coalesce(new.membership_date, current_date), coalesce(new.signed_date, current_date), new.witness_staff,
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
    membership_date = excluded.membership_date,
    signed_date = excluded.signed_date,
    witness_staff = excluded.witness_staff,
    action_taken = excluded.action_taken,
    approving_authority = excluded.approving_authority,
    approval_date = excluded.approval_date,
    findings = excluded.findings,
    status = excluded.status,
    status_override = excluded.status_override,
    branch = excluded.branch,
    share_capital = excluded.share_capital,
    last_share_capital_deposit_date = excluded.last_share_capital_deposit_date,
    benefit_category = excluded.benefit_category,
    beneficiaries = excluded.beneficiaries,
    photo = excluded.photo,
    metadata = excluded.metadata,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists set_request_id_from_request_trigger on public.requests;
create trigger set_request_id_from_request_trigger
before insert on public.requests
for each row execute function public.set_request_id_from_request();

drop trigger if exists sync_approved_request_to_member_trigger on public.requests;
create trigger sync_approved_request_to_member_trigger
after update on public.requests
for each row
when (new.request_status = 'Approved')
execute function public.sync_approved_request_to_member();

create index if not exists requests_request_id_idx on public.requests (request_id);
create index if not exists requests_member_id_idx on public.requests (member_id);

comment on table public.requests is 'Request IDs are text values like REQ-2026-00001. Do not cast to bigint.';
