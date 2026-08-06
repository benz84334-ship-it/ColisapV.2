drop function if exists public.approve_member_request(text, text, text);

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

comment on function public.approve_member_request(text, text, text)
  is 'Approves a request using text request IDs like REQ-2026-00001.';
