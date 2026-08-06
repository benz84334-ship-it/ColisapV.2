update public.availments
set
  amount = case
    when coalesce(availment_type, '') ilike '%60%' then 60000
    when coalesce(benefit_category, '') ilike '%60%' then 60000
    when coalesce(deceased_benefit_category, '') ilike '%60%' then 60000
    when coalesce(availment_type, '') ilike '%40%' then 40000
    when coalesce(benefit_category, '') ilike '%40%' then 40000
    when coalesce(deceased_benefit_category, '') ilike '%40%' then 40000
    when amount in (0, 35000) and coalesce(approved_amount, 0) in (40000, 60000) then approved_amount
    when amount = 35000 then 40000
    else amount
  end,
  approved_amount = case
    when coalesce(availment_type, '') ilike '%60%' then 60000
    when coalesce(benefit_category, '') ilike '%60%' then 60000
    when coalesce(deceased_benefit_category, '') ilike '%60%' then 60000
    when coalesce(availment_type, '') ilike '%40%' then 40000
    when coalesce(benefit_category, '') ilike '%40%' then 40000
    when coalesce(deceased_benefit_category, '') ilike '%40%' then 40000
    when approved_amount in (0, 35000) and amount in (40000, 60000) then amount
    when approved_amount = 35000 then 40000
    else approved_amount
  end
where amount in (0, 35000)
   or approved_amount in (0, 35000);
