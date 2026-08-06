alter table public.requests
  drop constraint if exists requests_member_id_fkey;

alter table public.requests
  alter column id type text using coalesce(id::text, ''),
  alter column request_id type text using coalesce(request_id::text, ''),
  alter column member_id type text using coalesce(member_id::text, '');

drop trigger if exists set_request_id_from_request_trigger on public.requests;
drop function if exists public.set_request_id_from_request();

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

  return candidate;
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
