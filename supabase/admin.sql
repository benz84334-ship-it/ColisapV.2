do $$
begin
  alter table public.users drop constraint if exists users_id_fkey;

  insert into public.users (
    id,
    username,
    password,
    full_name,
    role,
    status,
    branch,
    email,
    contact_number,
    created_at,
    last_login,
    updated_at
  )
  values (
    '00000000-0000-0000-0000-000000000001'::uuid,
    'admin',
    'Admin1245',
    'Admin',
    'Admin',
    'Active',
    'Main Office',
    'admin@admin.com',
    null,
    now(),
    null,
    now()
  )
  on conflict (username) do update set
    password = excluded.password,
    full_name = excluded.full_name,
    role = excluded.role,
    status = excluded.status,
    branch = excluded.branch,
    email = excluded.email,
    contact_number = excluded.contact_number,
    updated_at = now();
end $$;
