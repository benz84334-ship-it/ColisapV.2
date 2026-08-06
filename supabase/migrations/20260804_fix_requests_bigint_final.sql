alter table public.requests
  drop constraint if exists requests_member_id_fkey;

alter table public.requests
  alter column id type text using id::text,
  alter column request_id type text using request_id::text,
  alter column member_id type text using member_id::text;

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

comment on table public.requests is 'Request IDs are text values like REQ-2026-00001. Do not cast to bigint.';
