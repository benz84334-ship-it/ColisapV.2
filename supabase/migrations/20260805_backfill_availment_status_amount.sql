update public.availments
set
  amount = case
    when coalesce(availment_type, '') ilike '%60%' then 60000
    when coalesce(deceased_benefit_category, '') ilike '%60%' then 60000
    when coalesce(availment_type, '') ilike '%40%' then 40000
    when coalesce(deceased_benefit_category, '') ilike '%40%' then 40000
    when approved_amount in (40000, 60000) then approved_amount
    when amount = 0 and approved_amount > 0 then approved_amount
    else amount
  end,
  approved_amount = case
    when coalesce(availment_type, '') ilike '%60%' then 60000
    when coalesce(deceased_benefit_category, '') ilike '%60%' then 60000
    when coalesce(availment_type, '') ilike '%40%' then 40000
    when coalesce(deceased_benefit_category, '') ilike '%40%' then 40000
    when approved_amount > 0 then approved_amount
    when amount > 0 then amount
    else approved_amount
  end,
  status = case
    when coalesce(approved_by, '') <> '' then 'Approved'
    when date_approved is not null then 'Approved'
    when coalesce(status, '') = 'Approved' then 'Approved'
    else status
  end
where
  amount = 0
  or approved_amount = 0
  or status = 'Pending';
